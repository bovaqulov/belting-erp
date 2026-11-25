"""orginfo.uz — tashkilotlar reyestridan yuridik manzil (joyi noma'lum yoki taxminiy mijozlar uchun).

Qidiruv sahifasi (`/uz/search/organizations/?q=…`) har natijada STIR, to'liq nom va manzilni (2 qator: "viloyat,
tuman" va "ko'cha, uy") beradi — bitta mijozga bitta so'rov. robots.txt tashkilot va qidiruv sahifalariga ruxsat
beradi; baribir sekin so'raymiz (har ~1.5 s) va natijani keshlaymiz (geomap.orginfo_cache).

Moslash qat'iy (taxmin qilinmaydi):
  - STIR bo'yicha — natijadagi STIR aynan teng bo'lsa;
  - STIR yo'q bo'lsa nom bo'yicha — tashkiliy shaklsiz nom kaliti aynan teng VA bunday natija yagona bo'lsa
    ("SARRUNA TEXTILE" ≠ "SARRUNA TEXTILES"); viloyat ma'lum bo'lsa — manzil shu viloyatda bo'lishi shart.
"""

from __future__ import annotations

import asyncio
import html
import logging
import os
import re
import time

import httpx
from asgiref.sync import sync_to_async

log = logging.getLogger(__name__)

BASE = os.environ.get("GEOMAP_ORGINFO", "https://orginfo.uz")
DELAY = float(os.environ.get("GEOMAP_ORGINFO_DELAY", "1.5"))
UA = os.environ.get("GEOMAP_USER_AGENT", "GeoMap-Belting/0.1 (internal CRM map)")
_lock = asyncio.Lock()
_last = 0.0

_CARD = re.compile(
    r'<a href="(/uz/organization/[^"]+)"[^>]*og-card.*?rounded-5">\s*(\d+)\s*</span>.*?'
    r'<h6 class="card-title">(.*?)</h6>.*?alt="location">(.*?)</p>',
    re.S,
)


class OrginfoError(Exception):
    pass


def parse_cards(page: str) -> list[dict]:
    out = []
    for url, inn, name, loc in _CARD.findall(page):
        lines = [x.strip() for x in html.unescape(re.sub(r"<[^>]+>", "\n", loc)).split("\n") if x.strip()]
        out.append(
            {
                "url": BASE + url,
                "inn": inn,
                "name": " ".join(html.unescape(name).split()),
                "locality": lines[0] if lines else "",
                "street": " ".join(lines[1:]),
            }
        )
    return out


async def search(q: str) -> list[dict]:
    global _last
    async with _lock:
        wait = DELAY - (time.monotonic() - _last)
        if wait > 0:
            await asyncio.sleep(wait)
        _last = time.monotonic()
        async with httpx.AsyncClient(
            timeout=25, headers={"User-Agent": UA, "Accept-Language": "uz"}, follow_redirects=True
        ) as c:
            r = await c.get(f"{BASE}/uz/search/organizations/", params={"q": q})
    if r.status_code == 429:
        raise OrginfoError("429 — juda ko'p so'rov")
    if r.status_code != 200:
        raise OrginfoError(f"HTTP {r.status_code}")
    cards = parse_cards(r.text)
    if not cards and "og-card" in r.text:
        # sahifada natija kartochkalari bor, lekin andoza mos kelmadi — sayt verstkasi o'zgargan: "topilmadi" deb
        # keshga yozilmasin (aks holda hamma mijoz abadiy "reyestrda yo'q" bo'lib qoladi)
        raise OrginfoError("sahifa tuzilishi o'zgargan — _CARD andozasini yangilang")
    return cards


def _cached(key: str) -> dict | None:
    """Kesh yozuvi; "topilmadi" yozuvi NEG_TTL_DAYS dan eski bo'lsa — yo'q deb hisoblanadi (reyestr to'lib boradi)."""
    from datetime import timedelta

    from django.utils import timezone

    from ..models import OrginfoCache
    from .geocode import NEG_TTL_DAYS

    hit = OrginfoCache.objects.filter(key=key[:300]).first()
    if hit is None or (not hit.found and hit.ts < timezone.now() - timedelta(days=NEG_TTL_DAYS)):
        return None
    return {
        "found": hit.found,
        "inn": hit.inn or None,
        "name": hit.name,
        "locality": hit.locality,
        "street": hit.street,
        "url": hit.url,
    }


def _remember(key: str, card: dict | None, note: str = "") -> None:
    from ..models import OrginfoCache

    c = card or {}
    OrginfoCache.objects.update_or_create(
        key=key[:300],
        defaults={
            "found": bool(card),
            "inn": c.get("inn") or "",
            "name": (c.get("name") or "")[:300],
            "locality": (c.get("locality") or "")[:300],
            "street": (c.get("street") or "")[:300],
            "url": (c.get("url") or "")[:300],
            "note": note[:200],
        },
    )


async def by_inn(inn: str) -> dict | None:
    key = f"inn:{inn}"
    if (hit := await sync_to_async(_cached)(key)) is not None:
        return hit if hit["found"] else None
    cards = [c for c in await search(inn) if c["inn"] == inn]
    await sync_to_async(_remember)(key, cards[0] if cards else None, "" if cards else "STIR topilmadi")
    return cards[0] if cards else None


async def by_name(name: str, region: str | None) -> dict | None:
    from .geo import region_from_text
    from .names import name_key

    nk = name_key(name)
    if len(nk.replace(" ", "")) < 4:
        return None
    key = f"name:{nk}" + (f"@{region}" if region else "")
    if (hit := await sync_to_async(_cached)(key)) is not None:
        return hit if hit["found"] else None
    q = re.sub(r"[\"'«»“”`‘’]", " ", name)
    q = re.sub(r"(?i)\b(mchj|mch|ooo|ооо|xk|qk|aj|ok|ип|yatt)\b", " ", q)
    cards = [c for c in await search(" ".join(q.split())) if name_key(c["name"]) == nk]
    if region and not region.startswith("xorij:"):
        cards = [c for c in cards if region_from_text(c["locality"]) == region]
    card = cards[0] if len(cards) == 1 else None
    await sync_to_async(_remember)(key, card, "" if card else ("bir nechta mos" if cards else "aniq mos nom yo'q"))
    return card

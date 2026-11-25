"""GeoMaps yozuvlari — CRM mijozlaridan (Jarvis geomap/sync.py qoidalari, manbasi belting CRM'i).

- `run()` — CRM mijozlari → Record (har 3 soatda va CRM o'zgarganda qo'lda): nomi, STIR, manzil, mas'ul, xaridlar
  (12 oy), ochiq bitimlar, holat (faol / sust / yo'qotilgan / yangi / xaridsiz). Joy — tarmoqsiz (matndagi tuman yoki
  viloyat markazi); qo'lda qo'yilgan (manual) va aniq (exact/street) nuqta manzil o'zgarmasa saqlanadi.
- `geocode_pass()` — taxminiy nuqtali yozuvlarni Nominatim bilan aniqlashtirish (fon, 1 so'rov/s).
- `enrich_pass()` — joyi noma'lum/taxminiy mijozning yuridik manzili orginfo.uz dan (STIR yoki aniq nom).
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from asgiref.sync import async_to_sync, sync_to_async
from django.db import transaction
from django.utils import timezone

from config.apps.erp.crm import services as crm
from config.apps.staff import services as staff

from .geo.geocode import NEG_TTL_DAYS, locate
from .models import Record

log = logging.getLogger(__name__)

QUALITY_KEEP = {"exact", "street", "manual"}  # bu nuqtalar manzil o'zgarmasa qayta hisoblanmaydi
RANK = {"none": 0, "region": 1, "district": 2, "street": 4, "exact": 5, "manual": 6}
KIND_LABEL = {
    "company": "Firma",
    "employee": "Firma xodimi",
    "trader": "Savdogar",
    "ip": "YaTT",
    "person": "Jismoniy shaxs",
    "state": "Davlat tashkiloti",
}


def status_of(last_sale: date | None, deals_open: int) -> str:
    if not last_sale:
        return "yangi" if deals_open else "xaridsiz"
    days = (timezone.localdate() - last_sale).days
    return "faol" if days <= 90 else "sust" if days <= 365 else "yo'qotilgan"


def run() -> dict[str, int]:
    rows = crm.map_customers()
    names = staff.user_names({r["owner_tg"] for r in rows if r["owner_tg"]})
    existing = {r.pk: r for r in Record.objects.all()}
    stats = {"customers": len(rows), "located": 0, "deleted": 0}
    seen: set[str] = set()
    now = timezone.now()
    for c in rows:
        rid = f"crm:{c['id']}"
        seen.add(rid)
        old = existing.get(rid)
        address = (c["address"] or "").strip()
        same_addr = bool(old) and (old.address or "") == address
        kept = (
            {"lat": old.lat, "lng": old.lng, "quality": old.geo_quality, "region": old.region, "district": old.district}
            if old
            else None
        )
        if old and kept and (old.geo_quality == "manual" or (old.geo_quality in QUALITY_KEEP and same_addr)):
            loc = kept  # qo'lda qo'yilgan nuqta manzil o'zgarsa ham saqlanadi (faqat foydalanuvchi o'zgartiradi)
        else:
            text = old.addr_org if old and old.addr_org else address
            loc = async_to_sync(locate)(rid, text, None, use_network=False, name=c["name"])
            # shu manzil Nominatim'dan o'tgan (geo_try) va tarmoqsiz hisobdan yomon emas — eski nuqta qoladi
            if (
                old
                and kept
                and same_addr
                and old.lat is not None
                and (old.fields or {}).get("geo_try") == (old.addr_org or old.address)
                and RANK.get(old.geo_quality, 0) >= RANK.get(loc["quality"], 0)
                and loc["region"] in (None, "", old.region)
            ):
                loc = kept
        stats["located"] += loc["lat"] is not None
        vals: dict[str, Any] = {
            "source": "crm",
            "name": (c["name"] or f"Mijoz #{c['id']}").strip()[:255],
            "inn": (c["inn"] or "")[:20],
            "address": address[:300],
            "region": loc["region"] or "",
            "district": loc["district"] or "",
            "lat": loc["lat"],
            "lng": loc["lng"],
            "geo_quality": loc["quality"],
            "owner_tg": c["owner_tg"],
            "owner_name": names.get(c["owner_tg"], "") if c["owner_tg"] else "",
            "status": status_of(c["last_sale"], c["deals_open"]),
            "sales_12m": round(c["sales_12m"]),
            "sales_count": c["sales_count"],
            "last_sale": c["last_sale"].isoformat() if c["last_sale"] else "",
            "deals_open": c["deals_open"],
            "updated": now,
        }
        fields = {**((old.fields or {}) if old else {}), "turi": KIND_LABEL.get(c["kind"]) or None}
        Record.objects.update_or_create(pk=rid, defaults={**vals, "fields": fields})
    gone = [rid for rid in existing if rid not in seen]
    if gone:
        stats["deleted"] = Record.objects.filter(pk__in=gone).delete()[0]
    log.info("GeoMaps sinxron: %s", stats)
    return stats


def _ttl_cutoff() -> str:
    return (timezone.now() - timedelta(days=NEG_TTL_DAYS)).isoformat(timespec="seconds")


@sync_to_async
def _todo_geocode(limit: int) -> list[Record]:
    cutoff = _ttl_cutoff()
    out = []
    qs = Record.objects.filter(geo_quality__in=("district", "region", "none")).order_by("-sales_12m")
    for r in qs.iterator():
        txt = r.addr_org or r.address
        f = r.fields or {}
        if txt and (f.get("geo_try") != txt or str(f.get("geo_try_at") or "") < cutoff):
            out.append(r)
            if len(out) >= limit:
                break
    return out


@sync_to_async
def _save_loc(rid: str, loc: dict[str, Any], tried: str | None, extra: dict[str, Any] | None = None) -> None:
    with transaction.atomic():
        r = Record.objects.select_for_update().filter(pk=rid).first()
        if r is None:
            return
        for k, v in (extra or {}).items():
            setattr(r, k, v)
        if loc:
            r.lat, r.lng, r.geo_quality = loc["lat"], loc["lng"], loc["quality"]
            r.region = loc["region"] or r.region
            r.district = loc["district"] or r.district
        if tried is not None:
            r.fields = {
                **(r.fields or {}),
                "geo_try": tried,
                "geo_try_at": timezone.now().isoformat(timespec="seconds"),
            }
        r.save()


async def geocode_pass(limit: int = 300) -> dict[str, int]:
    """Taxminiy (tuman/viloyat/yo'q) nuqtali, manzili bor yozuvlarni Nominatim bilan aniqlashtirish. Har yozuv bir
    marta uriniladi (fields.geo_try = manzil); manzil o'zgarsa yoki NEG_TTL_DAYS o'tsa — qayta."""
    todo = await _todo_geocode(limit)
    upgraded = 0
    for r in todo:
        txt = r.addr_org or r.address
        try:
            loc = await locate(r.pk, txt, None if r.addr_org else (r.region or None), use_network=True, name=r.name)
        except Exception:
            log.warning("Geokod to'xtadi (tarmoq)", exc_info=True)
            break
        upgraded += loc["quality"] in ("exact", "street")
        await _save_loc(r.pk, loc, txt)
    res = {"tried": len(todo), "upgraded": upgraded}
    if todo:
        log.info("GeoMaps geokod: %s", res)
    return res


@sync_to_async
def _todo_enrich(limit: int) -> list[Record]:
    cutoff = _ttl_cutoff()
    out = []
    qs = Record.objects.filter(geo_quality__in=("none", "region", "district")).order_by("-sales_12m")
    for r in sorted(qs, key=lambda x: (not x.inn, -x.sales_12m)):
        f = r.fields or {}
        if "org_try" not in f or (f.get("org_try") == "-" and str(f.get("org_try_at") or "") < cutoff):
            out.append(r)
            if len(out) >= limit:
                break
    return out


@sync_to_async
def _mark_org(rid: str, val: str) -> None:
    r = Record.objects.filter(pk=rid).first()
    if r:
        r.fields = {**(r.fields or {}), "org_try": val, "org_try_at": timezone.now().isoformat(timespec="seconds")}
        r.save(update_fields=["fields"])


async def enrich_pass(limit: int = 100) -> dict[str, int]:
    """Joyi noma'lum/taxminiy yozuvlar: orginfo.uz dan yuridik manzil (STIR, bo'lmasa aniq nom) → qayta joylashtirish.
    Joy faqat yaxshilansa o'zgaradi, reyestr manzili (addr_org) va sahifasi baribir saqlanadi."""
    from .geo import orginfo

    todo = await _todo_enrich(limit)
    stats = {"tried": 0, "found": 0, "improved": 0}
    for r in todo:
        try:
            card = (
                await orginfo.by_inn(r.inn)
                if r.inn
                else await orginfo.by_name(r.name, r.region if r.geo_quality != "none" and r.region else None)
            )
        except Exception as exc:  # tarmoq/429: keyingi siklda davom
            log.warning("orginfo to'xtadi: %s", exc)
            break
        stats["tried"] += 1
        if not card:
            await _mark_org(r.pk, "-")
            continue
        stats["found"] += 1
        addr = ", ".join(x for x in (card["locality"], card["street"]) if x)
        tried: str | None = addr
        try:
            loc = await locate(r.pk, addr, None, use_network=True)
        except Exception:  # Nominatim ishlamadi: tarmoqsiz joy; geo_try yozilmaydi (geocode_pass qayta urinadi)
            loc = await locate(r.pk, addr, None, use_network=False)
            tried = None
        better = RANK.get(loc["quality"], 0) > RANK.get(r.geo_quality, 0)
        stats["improved"] += better
        extra = {"addr_org": addr[:300], "org_url": (card.get("url") or "")[:300], "org_inn": card.get("inn") or ""}
        await _save_loc(r.pk, loc if better else {}, tried, extra)
        await _mark_org(r.pk, "1")
    if stats["tried"]:
        log.info("GeoMaps orginfo: %s", stats)
    return stats

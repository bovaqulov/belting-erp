"""Geokodlash: manzil -> (lat, lng, aniqlik).

Bosqichlar (eng aniqidan):
  1. Nominatim (OpenStreetMap) — natija manzildagi viloyat ichida bo'lsagina qabul qilinadi (O'zbekiston manzillarida
     ko'cha nomi boshqa shahardagi bir xil ko'chaga tushib qolishi ko'p);
  2. matndan tuman topilsa — tuman markazi (`district`);
  3. viloyat ma'lum bo'lsa — viloyat markazi (`region`);
  4. aks holda — nuqtasiz (`none`), xaritada "joylashuvi noma'lum" ro'yxatida.
Taxminiy nuqtalar id bo'yicha barqaror siljitiladi (bir nuqtaga yig'ilmasin), aniqlik maydoni saqlanadi.

Nominatim qoidasi: ≤1 so'rov/s, haqiqiy User-Agent, natijalar keshlanadi (GeocodeCache modeli).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from datetime import timedelta

import httpx

from .geo import REGION_LABEL, bounds, jitter, translit

log = logging.getLogger(__name__)

NOMINATIM = os.environ.get("GEOMAP_NOMINATIM", "https://nominatim.openstreetmap.org/search")
UA = os.environ.get("GEOMAP_USER_AGENT", "GeoMap-Belting/0.1 (internal CRM map)")
_last_call = 0.0
_lock = asyncio.Lock()

# OSM natija turi -> aniqlik
_EXACT = {"house", "building", "office", "shop", "amenity", "industrial", "commercial", "retail", "craft", "yes"}
_STREET = {"highway", "street", "road", "residential", "primary", "secondary", "tertiary", "unclassified", "service"}


def _clean(addr: str) -> str:
    """Rekvizit manzilidan geokoderga xalaqit beradigan qismlarni olib tashlash (indeks, xonadon, 'uy' raqami belgisi)."""
    a = re.sub(r"\b\d{6}\b", " ", addr)  # pochta indeksi
    a = re.sub(r"(?i)\b\d+\s*-?\s*(xonadon|kvartira|кв\.?|квартира|xona)\b", " ", a)
    a = re.sub(r"(?i)\b(xonadon|kvartira|кв\.?|квартира)\s*-?\s*\d+\b", " ", a)
    a = re.sub(r"(?i)(\d+)\s*-?\s*(uy|dom|дом|д\.)\b", r"\1", a)
    a = re.sub(r"[`’‘ʻʼ]", "'", a)
    return re.sub(r"\s+", " ", re.sub(r"\s*,\s*", ", ", a)).strip(" ,")


def _quality(hit: dict) -> str:
    cls, typ = hit.get("class", ""), hit.get("type", "")
    if cls == "building" or typ in _EXACT or hit.get("addresstype") in ("house", "building"):
        return "exact"
    if cls == "highway" or typ in _STREET or hit.get("addresstype") in ("road", "street"):
        return "street"
    return "district"


class GeocodeError(Exception):
    """Vaqtinchalik nosozlik (tarmoq, 429, 5xx) — natija keshlanmaydi, yozuv "urinildi" deb belgilanmaydi."""


NEG_TTL_DAYS = 30  # "topilmadi" keshi shuncha kundan keyin qayta so'raladi (OSM to'lib boradi)


async def _nominatim(q: str, cc: str = "uz") -> list[dict]:
    global _last_call
    async with _lock:
        wait = 1.1 - (time.monotonic() - _last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_call = time.monotonic()
        async with httpx.AsyncClient(timeout=20, headers={"User-Agent": UA, "Accept-Language": "uz,ru"}) as c:
            r = await c.get(
                NOMINATIM, params={"q": q, "countrycodes": cc, "format": "jsonv2", "limit": 3, "addressdetails": 0}
            )
            if r.status_code == 429:
                # bo'sh ro'yxat qaytarilsa "topilmadi" deb keshga abadiy yozilardi — xato sifatida ko'tariladi
                _last_call = time.monotonic() + 60  # keyingi so'rov kamida 60 s dan keyin
                raise GeocodeError("Nominatim 429 — juda ko'p so'rov")
            r.raise_for_status()
            res = r.json()
            if not isinstance(res, list):
                raise GeocodeError("Nominatim: kutilmagan javob")
            return res


async def lookup(q: str, cc: str = "uz") -> dict | None:
    """Kesh orqali Nominatim: {lat, lng, quality} yoki None (topilmadi — bu ham keshlanadi)."""
    key = q.lower() if cc == "uz" else f"{cc}|{q.lower()}"
    from asgiref.sync import sync_to_async
    from django.utils import timezone

    from ..models import GeocodeCache

    hit = await sync_to_async(GeocodeCache.objects.filter(q=key[:400]).first)()
    if hit and hit.lat is not None:
        return {"lat": hit.lat, "lng": hit.lng, "quality": hit.quality}
    if hit and hit.ts >= timezone.now() - timedelta(days=NEG_TTL_DAYS):
        return None
    try:
        res = await _nominatim(q, cc)
    except Exception as exc:
        log.warning("Nominatim xatosi (%s): %s", q[:60], exc)
        raise
    out = None
    for h in res:
        out = {"lat": float(h["lat"]), "lng": float(h["lon"]), "quality": _quality(h)}
        break
    await sync_to_async(GeocodeCache.objects.update_or_create)(
        q=key[:400],
        defaults={
            "lat": out and out["lat"],
            "lng": out and out["lng"],
            "quality": (out and out["quality"]) or "",
            "raw": json.dumps(res[:3])[:4000],
        },
    )
    return out


async def _locate_foreign(record_id: str, text: str, region: str, name: str | None, use_network: bool) -> dict:
    """Xorijiy mijoz: manzil (shu davlat ichida Nominatim) > nom/manzildagi shahar > poytaxt (taxminiy)."""
    from .geo import FOREIGN, foreign_city

    cc = region.split(":", 1)[1]
    if use_network and cc in FOREIGN and len(re.sub(r"[^\w]", "", text)) >= 6:
        hit = await lookup(_clean(text), cc)  # tarmoq xatosi yuqoriga chiqadi (locate izohiga qarang)
        if hit:
            return {"lat": hit["lat"], "lng": hit["lng"], "quality": hit["quality"], "region": region, "district": None}
    city = foreign_city(cc, text, name)
    if city:
        lat, lng = jitter(record_id, city[0], city[1], 2500)
        return {"lat": lat, "lng": lng, "quality": "district", "region": region, "district": None}
    if cc in FOREIGN:
        c = FOREIGN[cc]["center"]
        lat, lng = jitter(record_id, c[0], c[1], 8000)
        return {"lat": lat, "lng": lng, "quality": "region", "region": region, "district": None}
    return {"lat": None, "lng": None, "quality": "none", "region": region, "district": None}


async def locate(
    record_id: str, address: str | None, region: str | None, use_network: bool = True, name: str | None = None
) -> dict:
    """Yozuv joylashuvi: {lat, lng, quality, region, district}. name — xorijiy mijozda shahar nomda bo'lishi mumkin.
    use_network=True da tarmoq/429 xatosi YUTILMAYDI (ko'tariladi): chaqiruvchi yozuvni "urinildi" deb belgilamasligi
    kerak — aks holda Nominatim bir soat ishlamasa hamma manzillar abadiy taxminiy bo'lib qolardi."""
    b = bounds()
    text = address or ""
    from .geo import foreign_from_text, region_from_text

    region = region or region_from_text(text) or foreign_from_text(text) or foreign_from_text(name, cities=False)
    if region and region.startswith("xorij:"):
        return await _locate_foreign(record_id, text, region, name, use_network)
    district = b.district_from_text(text, region)
    if district and not region:
        region = b.districts[district]["region"]

    if use_network and text and len(re.sub(r"[^\w]", "", text)) >= 6:
        cleaned = _clean(text)
        queries = []
        # viloyat nomini qo'shish — shu nomdagi ko'cha boshqa shaharda bo'lsa ham to'g'ri joy topilsin
        if region and region in REGION_LABEL and REGION_LABEL[region].split()[0].lower() not in translit(cleaned):
            queries.append(f"{cleaned}, {REGION_LABEL[region]}")
        queries.append(cleaned)
        for q in queries:
            hit = await lookup(q)
            if not hit:
                continue
            got_region = b.region_at(hit["lat"], hit["lng"])
            if region and got_region != region:
                continue  # boshqa viloyatga tushdi — ishonchsiz
            got_district = b.district_at(hit["lat"], hit["lng"])
            if district and got_district and got_district != district and hit["quality"] != "exact":
                continue  # ko'cha boshqa tumanda — manzildagi tuman ustun
            return {
                "lat": hit["lat"],
                "lng": hit["lng"],
                "quality": hit["quality"],
                "region": got_region or region,
                "district": got_district or district,
            }

    if district:
        c = b.districts[district]["center"]
        lat, lng = jitter(record_id, c.y, c.x, 1500)
        return {"lat": lat, "lng": lng, "quality": "district", "region": region, "district": district}
    if region and region in b.regions:
        c = b.regions[region]["center"]
        lat, lng = jitter(record_id, c.y, c.x, 6000)
        return {"lat": lat, "lng": lng, "quality": "region", "region": region, "district": None}
    return {"lat": None, "lng": None, "quality": "none", "region": region, "district": None}

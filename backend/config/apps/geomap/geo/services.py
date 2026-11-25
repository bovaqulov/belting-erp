"""Tashqi xarita xizmatlari: marshrut (OSRM), mashinada N daqiqa zonasi (Valhalla), yangi mijozlar (Overpass/OSM).
Hammasi ochiq va kalitsiz; manzillar .env orqali o'zgartiriladi (o'z serverimizga o'tish uchun)."""

from __future__ import annotations

import asyncio
import logging
import os

import httpx

from .geo import haversine

log = logging.getLogger(__name__)

OSRM = os.environ.get("GEOMAP_OSRM", "https://router.project-osrm.org")
VALHALLA = os.environ.get("GEOMAP_VALHALLA", "https://valhalla1.openstreetmap.de")
OVERPASS = [
    u.strip()
    for u in os.environ.get(
        "GEOMAP_OVERPASS",
        "https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter,"
        "https://overpass.private.coffee/api/interpreter",
    ).split(",")
    if u.strip()
]
UA = {"User-Agent": os.environ.get("GEOMAP_USER_AGENT", "GeoMap-Belting/0.1 (internal CRM map)")}
MAX_STOPS = 100


class ServiceError(Exception):
    pass


# ------------------------------------------------------------------ marshrut
def _two_opt(pts: list[tuple[float, float]], order: list[int], fixed_start: bool, roundtrip: bool) -> list[int]:
    def d(a, b):
        return haversine(pts[a], pts[b])

    improved = True
    lo = 1 if fixed_start else 0
    while improved:
        improved = False
        for i in range(lo, len(order) - 1):
            for j in range(i + 1, len(order) - (0 if roundtrip else 0)):
                a, b = order[i - 1] if i > 0 else None, order[i]
                c, e = order[j], order[j + 1] if j + 1 < len(order) else (order[0] if roundtrip else None)
                before = (d(a, b) if a is not None else 0) + (d(c, e) if e is not None else 0)
                after = (d(a, c) if a is not None else 0) + (d(b, e) if e is not None else 0)
                if after + 1e-6 < before:
                    order[i : j + 1] = reversed(order[i : j + 1])
                    improved = True
    return order


def _local_route(pts: list[tuple[float, float]], roundtrip: bool) -> dict:
    """Tarmoqsiz zaxira: eng yaqin qo'shni + 2-opt, to'g'ri chiziq masofasi (×1.3 yo'l koeffitsienti)."""
    order, left = [0], set(range(1, len(pts)))
    while left:
        nxt = min(left, key=lambda j: haversine(pts[order[-1]], pts[j]))
        order.append(nxt)
        left.discard(nxt)
    order = _two_opt(pts, order, fixed_start=True, roundtrip=roundtrip)
    seq = order + ([order[0]] if roundtrip else [])
    dist = sum(haversine(pts[a], pts[b]) for a, b in zip(seq, seq[1:])) * 1.3
    return {
        "order": order,
        "distance_m": dist,
        "duration_s": dist / (35_000 / 3600),
        "geometry": {"type": "LineString", "coordinates": [[pts[i][1], pts[i][0]] for i in seq]},
        "engine": "taxminiy",
    }


async def optimize_route(pts: list[tuple[float, float]], roundtrip: bool = True) -> dict:
    """pts[0] — boshlanish nuqtasi. Natija: {order, distance_m, duration_s, geometry, engine}."""
    if len(pts) < 2:
        raise ServiceError("Kamida 2 nuqta kerak")
    if len(pts) > MAX_STOPS:
        raise ServiceError(f"Ko'pi bilan {MAX_STOPS} ta nuqta")
    coords = ";".join(f"{lng:.6f},{lat:.6f}" for lat, lng in pts)
    params = {"source": "first", "roundtrip": str(roundtrip).lower(), "geometries": "geojson", "overview": "full"}
    if not roundtrip:
        params["destination"] = "any"
    try:
        async with httpx.AsyncClient(timeout=30, headers=UA) as c:
            r = await c.get(f"{OSRM}/trip/v1/driving/{coords}", params=params)
            data = r.json()
        if data.get("code") != "Ok":
            raise ServiceError(data.get("message") or data.get("code"))
        wps = data["waypoints"]
        order = [i for i, _ in sorted(enumerate(wps), key=lambda x: x[1]["waypoint_index"])]
        trip = data["trips"][0]
        return {
            "order": order,
            "distance_m": trip["distance"],
            "duration_s": trip["duration"],
            "geometry": trip["geometry"],
            "engine": "osrm",
        }
    except Exception as exc:
        log.warning("OSRM ishlamadi (%s) — taxminiy marshrut", exc)
        return await asyncio.to_thread(_local_route, pts, roundtrip)  # 2-opt (100 nuqta) — event loop'da emas


# ------------------------------------------------------------------ isochrone
async def isochrone(lat: float, lng: float, minutes: list[int]) -> dict:
    mins = sorted({max(1, min(int(m), 120)) for m in minutes})[:4]
    body = {
        "locations": [{"lat": lat, "lon": lng}],
        "costing": "auto",
        "contours": [{"time": m} for m in mins],
        "polygons": True,
        "denoise": 0.3,
        "generalize": 50,
    }
    try:
        async with httpx.AsyncClient(timeout=40, headers=UA) as c:
            r = await c.post(f"{VALHALLA}/isochrone", json=body)
            r.raise_for_status()
            return r.json()
    except Exception as exc:
        raise ServiceError(f"Vaqt zonasi xizmati ishlamadi: {exc}") from exc


# ------------------------------------------------------------------ yangi mijozlar (OSM)
PROSPECT_TAGS = [
    '["man_made"="works"]',
    '["industrial"]["name"]',
    '["landuse"="industrial"]["name"]',
    '["craft"]["name"]',
    '["shop"="hardware"]["name"]',
    '["shop"="trade"]["name"]',
    '["office"="company"]["name"]',
]


async def prospects(lat: float, lng: float, radius_m: int) -> list[dict]:
    r_ = max(500, min(int(radius_m), 30_000))
    q = (
        "[out:json][timeout:25];("
        + "".join(f"nwr(around:{r_},{lat},{lng}){t};" for t in PROSPECT_TAGS)
        + ");out center tags 300;"
    )
    last = None
    async with httpx.AsyncClient(timeout=40, headers=UA) as c:
        for url in OVERPASS:
            try:
                r = await c.post(url, data={"data": q})
                if r.status_code != 200:
                    last = f"{url}: HTTP {r.status_code}"
                    continue
                els = r.json().get("elements", [])
                break
            except Exception as exc:
                last = f"{url}: {exc}"
        else:
            raise ServiceError(f"OSM (Overpass) band yoki ishlamayapti — keyinroq urinib ko'ring ({last})")
    out = []
    for e in els:
        t = e.get("tags", {})
        la, lo = (
            (e.get("lat"), e.get("lon"))
            if "lat" in e
            else ((e.get("center") or {}).get("lat"), (e.get("center") or {}).get("lon"))
        )
        if la is None or not t.get("name"):
            continue
        kind = (
            t.get("industrial") or t.get("craft") or t.get("shop") or t.get("office") or t.get("man_made") or "korxona"
        )
        out.append(
            {
                "osm": f"{e['type']}/{e['id']}",
                "name": t["name"],
                "lat": la,
                "lng": lo,
                "kind": kind,
                "phone": t.get("phone") or t.get("contact:phone"),
                "website": t.get("website"),
                "address": ", ".join(
                    x for x in (t.get("addr:street"), t.get("addr:housenumber"), t.get("addr:city")) if x
                ),
            }
        )
    return out

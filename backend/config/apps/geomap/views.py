"""GeoMaps — mijozlar xaritasi API (Jarvis web/geomap_api.py; manba — CRM mijozlari).

Ruxsat (`can_use`): ega/admin yoki Rahbariyat, Sotuv B2B, Marketing a'zosi.
  - `full` — ega, admin, Rahbariyat (sees_all): hamma yozuvlar, hududlar, mas'ulni almashtirish (CRM'da);
  - boshqa xodim — faqat CRM'da o'zi mas'ul mijozlar.
Filtr, issiqlik xaritasi, bo'yash va vidjetlar brauzerda hisoblanadi — server ko'rinadigan yozuvlarni bir marta beradi.
Ulashilgan havola (/app/geo/share) — kirishsiz; pul, qarz, STIR va mas'ul berilmaydi.
"""

from __future__ import annotations

import hashlib
import math
import secrets
import time
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any

from asgiref.sync import async_to_sync
from django.db import transaction
from django.db.models import Count, Q, QuerySet, Sum
from django.http import HttpRequest, HttpResponse
from django.utils import timezone

from config.apps.audit import services as audit
from config.apps.core.http import ApiError, api, json_body, ok
from config.apps.erp.crm import services as crm
from config.apps.staff import services as staff

from .models import Checkin, Record, Route, Share, Territory, View

if TYPE_CHECKING:
    from config.apps.staff.models import User

GEO_DEPTS = ("rahbariyat", "sotuv_b2b", "marketing")
DENY = "Kechirasiz, mijozlar xaritasi faqat Rahbariyat, Sotuv B2B va Marketing uchun."
PUBLIC_COLS = ("id", "name", "lat", "lng", "region", "district", "status", "address")
COLORS = [
    "#3a8dff",
    "#e5484d",
    "#30a46c",
    "#f5a524",
    "#8e4ec6",
    "#12a594",
    "#e54666",
    "#978365",
    "#0090ff",
    "#ff801f",
    "#5bb98c",
    "#d6409f",
]


# ------------------------------------------------------------------ ruxsat
def can_use(u: User | None) -> bool:
    if u is None:
        return False
    if u.role in ("owner", "admin"):
        return True
    return u.role == "employee" and any(d in GEO_DEPTS for d in u.dept_keys())


def is_full(u: User) -> bool:
    return u.role in ("owner", "admin") or (u.role == "employee" and u.in_lead_dept())


def _need_full(u: User) -> None:
    if not is_full(u):
        raise ApiError(403, "Faqat rahbariyat va adminlar uchun")


def _scope(u: User) -> QuerySet[Record]:
    """Xodim faqat o'zi mas'ul yozuvlarni ko'radi."""
    return Record.objects.all() if is_full(u) else Record.objects.filter(owner_tg=u.tg_id)


def _num(v: Any, lo: float, hi: float, what: str = "Qiymat") -> float:
    """Mijozdan kelgan son: chekli va [lo, hi] ichida, aks holda 422 (NaN/inf tashqi xizmat manziliga tushmasin)."""
    try:
        x = float(v)
    except (TypeError, ValueError):
        raise ApiError(422, f"{what} noto'g'ri") from None
    if not (math.isfinite(x) and lo <= x <= hi):
        raise ApiError(422, f"{what} noto'g'ri")
    return x


def _opt_num(v: Any) -> float | None:
    return None if v is None else _num(v, 0, 1e12)


def _latlng(d: Any) -> tuple[float, float]:
    if not isinstance(d, dict):
        raise ApiError(422, "Nuqta noto'g'ri")
    return _num(d.get("lat"), -90, 90, "Kenglik"), _num(d.get("lng"), -180, 180, "Uzunlik")


def _visible(u: User, rid: str) -> Record:
    r = _scope(u).filter(pk=rid).first()
    if r is None:
        raise ApiError(404, "Topilmadi")
    return r


def _pack(r: Record) -> dict[str, Any]:
    f = r.fields or {}
    return {
        "id": r.pk,
        "name": r.name,
        "lat": r.lat,
        "lng": r.lng,
        "q": r.geo_quality,
        "region": r.region or None,
        "district": r.district or None,
        "owner": str(r.owner_tg) if r.owner_tg else None,
        "ownerName": r.owner_name or None,
        "status": r.status,
        "sales": r.sales_12m or 0,
        "salesCount": r.sales_count or 0,
        "lastSale": r.last_sale or None,
        "debt": r.debt or 0,
        "overdue": r.overdue_days or 0,
        "deals": r.deals_open or 0,
        "territory": r.territory_id,
        "address": r.address or None,
        "type": f.get("turi"),
        "industry": f.get("soha"),
        "tag": f.get("teg"),
        "orgAddress": r.addr_org or None,
    }


def _ts(dt: datetime | None) -> str | None:
    return dt.isoformat(timespec="seconds") if dt else None


# ------------------------------------------------------------------ asosiy
@api(check=can_use, deny=DENY)
def me(request: HttpRequest, user: User) -> HttpResponse:
    return ok(
        {"tgId": user.tg_id, "name": user.name, "role": user.role, "full": is_full(user), "ownerId": str(user.tg_id)}
    )


@api(check=can_use, deny=DENY)
def records(request: HttpRequest, user: User) -> HttpResponse:
    rows = list(_scope(user).order_by("-sales_12m", "name"))
    synced = Record.objects.order_by("-updated").values_list("updated", flat=True).first()
    note = None
    if synced is None:  # hali sinxron bo'lmagan — fonda boshlanadi (keyingisi jadval bo'yicha, har 3 soat)
        from .tasks import refresh

        refresh.delay()
    if not rows and is_full(user):
        note = "Xarita hali to'ldirilmagan — CRM mijozlari bir necha daqiqada joylashadi (manzili bor mijozlar)."
    elif not rows:
        note = "Sizga biriktirilgan mijoz yo'q — CRM'da mijozlar mas'uli sifatida ko'rinasiz."
    return ok({"records": [_pack(r) for r in rows], "synced": _ts(synced), "note": note})


@api(check=can_use, deny=DENY)
def totals(request: HttpRequest, user: User) -> HttpResponse:
    """Umumiy savdo (CRM, 12 oy) — vidjetda «xaritadagi mijozlar» yig'indisi yonida. Faqat rahbariyat/admin."""
    _need_full(user)
    a = Record.objects.aggregate(s=Sum("sales_12m"), n=Sum("sales_count"), d=Sum("debt"))
    debtors = Record.objects.filter(debt__gt=0).count()
    return ok(
        {
            "sales_12m": a["s"] or 0,
            "sales_docs": a["n"] or 0,
            "debt": a["d"] or 0,
            "debtors": debtors,
            "debt_as_of": None,
        }
    )


@api(check=can_use, deny=DENY)
def record(request: HttpRequest, user: User, rid: str) -> HttpResponse:
    r = _visible(user, rid)
    checks = list(Checkin.objects.filter(record_id=rid).order_by("-ts")[:30])
    names = staff.user_names({c.tg_id for c in checks})
    out = _pack(r)
    out["inn"] = r.inn or r.org_inn or None
    out["orgUrl"] = r.org_url or None
    out["crmUrl"] = f"/app/erp/crm/?customer={rid.split(':', 1)[1]}" if rid.startswith("crm:") else None
    out["checkins"] = [
        {"id": c.pk, "note": c.note, "ts": c.ts, "tg_id": c.tg_id, "name": names.get(c.tg_id)} for c in checks
    ]
    return ok(out)


@api(("POST",), check=can_use, deny=DENY)
def record_location(request: HttpRequest, user: User, rid: str) -> HttpResponse:
    from .geo.geo import bounds

    r = _visible(user, rid)
    lat, lng = _latlng(json_body(request))
    if not (30 <= lat <= 60 and 25 <= lng <= 90):  # Markaziy Osiyo va qo'shnilar (xorijiy mijozlar ham)
        raise ApiError(422, "Nuqta xizmat hududidan tashqarida")
    b = bounds()
    r.lat, r.lng, r.geo_quality = lat, lng, "manual"
    r.region = b.region_at(lat, lng) or r.region
    r.district = b.district_at(lat, lng) or ""
    r.save()
    recompute_territories()
    return ok({"ok": True})


@api(check=can_use, deny=DENY)
def boundaries(request: HttpRequest, user: User, level: str) -> HttpResponse:
    from .geo.geo import bounds

    if level not in ("region", "district"):
        raise ApiError(404, "Topilmadi")
    resp = HttpResponse(bounds().geojson(level), content_type="application/json")
    resp["Cache-Control"] = "private, max-age=86400"
    return resp


@api(check=can_use, deny=DENY)
def meta(request: HttpRequest, user: User) -> HttpResponse:
    from .geo.geo import FOREIGN, REGION_LABEL, bounds

    b = bounds()
    return ok(
        {
            "regions": [{"id": k, "name": v} for k, v in REGION_LABEL.items()]
            + [{"id": f"xorij:{cc}", "name": f["name"]} for cc, f in FOREIGN.items()],
            "districts": [{"id": d["id"], "name": d["name"], "region": d["region"]} for d in b.districts.values()],
            "colors": COLORS,
        }
    )


# ------------------------------------------------------------------ ommaviy amallar
@api(("POST",), check=can_use, deny=DENY)
def bulk(request: HttpRequest, user: User) -> HttpResponse:
    data = json_body(request)
    ids = [str(i) for i in (data.get("ids") or [])][:500]
    action, value = data.get("action"), data.get("value")
    if not ids:
        raise ApiError(422, "Yozuvlar tanlanmagan")
    recs = list(_scope(user).filter(pk__in=ids))
    if action == "tag":
        tag = str(value or "")[:60] or None
        with transaction.atomic():
            for r in recs:
                r.fields = {**(r.fields or {}), "teg": tag}
                r.save(update_fields=["fields"])
        return ok({"ok": True, "updated": len(recs)})
    if action == "owner":
        _need_full(user)
        owner = _owner(value)
        u = staff.user_by_tg(owner) if owner else None
        if owner is None or u is None:
            raise ApiError(422, "Xodim topilmadi")
        cids = [int(r.pk.split(":", 1)[1]) for r in recs if r.pk.startswith("crm:")]
        done = crm.set_customers_owner(cids, owner)  # asosiy manba — CRM; keyin xarita
        Record.objects.filter(pk__in=[f"crm:{c}" for c in cids]).update(owner_tg=owner, owner_name=u.name)
        audit.log("geomap_owner", user.tg_id, detail={"to": owner, "done": done})
        return ok({"ok": True, "updated": done, "failed": []})
    raise ApiError(422, "Noma'lum amal")


@api(check=can_use, deny=DENY)
def owners(request: HttpRequest, user: User) -> HttpResponse:
    """Mas'ul bo'la oladigan xodimlar (savdo bo'limlari) va har birining yozuvlar soni (xodim — faqat o'ziniki)."""
    counts = dict(_scope(user).exclude(owner_tg=None).values_list("owner_tg").annotate(n=Count("id")))
    people = {u.tg_id: u.name for u in staff.users_in_departments(GEO_DEPTS)}
    people.update(staff.user_names(set(counts) - set(people)))
    return ok(
        sorted(
            ({"id": str(t), "name": n or str(t), "records": counts.get(t, 0)} for t, n in people.items()),
            key=lambda o: (-int(o["records"]), str(o["name"])),
        )
    )


# ------------------------------------------------------------------ saqlangan ko'rinishlar
def _view(v: View) -> dict[str, Any]:
    return {"id": v.pk, "name": v.name, "owner_tg": v.owner_tg, "shared": v.shared, "state": v.state, "ts": _ts(v.ts)}


@api(("GET", "POST"), check=can_use, deny=DENY)
def views(request: HttpRequest, user: User) -> HttpResponse:
    if request.method == "POST":
        data = json_body(request)
        name = str(data.get("name") or "").strip()[:80]
        if not name:
            raise ApiError(422, "Nom kerak")
        v = View.objects.create(
            name=name, owner_tg=user.tg_id, shared=bool(data.get("shared")), state=data.get("state") or {}
        )
        return ok({"id": v.pk})
    return ok([_view(v) for v in View.objects.filter(Q(owner_tg=user.tg_id) | Q(shared=True)).order_by("name")])


@api(("DELETE",), check=can_use, deny=DENY)
def view_delete(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    qs = View.objects.filter(pk=pk)
    if not is_full(user):
        qs = qs.filter(owner_tg=user.tg_id)
    return ok({"ok": qs.delete()[0] > 0})


# ------------------------------------------------------------------ hududlar
def _circle(lat: float, lng: float, radius_m: float, n: int = 64) -> dict[str, Any]:
    pts = []
    for i in range(n + 1):
        a = 2 * math.pi * i / n
        pts.append(
            [
                lng + radius_m * math.sin(a) / (111_320 * math.cos(math.radians(lat))),
                lat + radius_m * math.cos(a) / 111_320,
            ]
        )
    return {"type": "Polygon", "coordinates": [pts]}


def _valid_geom(geom: Any) -> dict[str, Any]:
    from shapely.geometry import shape

    try:
        if (
            not isinstance(geom, dict)
            or geom.get("type") not in ("Polygon", "MultiPolygon")
            or shape(geom).buffer(0).is_empty
        ):
            raise ValueError
    except Exception as exc:
        raise ApiError(422, "Geometriya noto'g'ri") from exc
    return geom


def recompute_territories() -> None:
    """Har yozuvga birinchi mos hudud (avtomatik hududlar ustun, keyin id tartibi). Viloyat markaziga taxminiy
    qo'yilgan nuqta tasodifiy hududga tushmasin — ular hududsiz qoladi."""
    from shapely import STRtree
    from shapely.geometry import Point, shape

    terrs = sorted(Territory.objects.all(), key=lambda t: (t.kind != "auto", t.pk))
    Record.objects.exclude(territory=None).update(territory=None)
    if not terrs:
        return
    geoms = []
    for t in terrs:
        try:
            geoms.append(shape(t.geometry).buffer(0))
        except Exception:
            geoms.append(Point(0, 0))
    tree = STRtree(geoms)
    by_t: dict[int, list[str]] = {}
    for rid, lat, lng in Record.objects.exclude(lat=None).exclude(geo_quality="region").values_list("id", "lat", "lng"):
        hits = sorted(int(i) for i in tree.query(Point(lng, lat), predicate="intersects"))
        if hits:
            by_t.setdefault(terrs[hits[0]].pk, []).append(rid)
    for tid, ids in by_t.items():
        Record.objects.filter(pk__in=ids).update(territory_id=tid)


def _terr(t: Territory, n: int, sales: float) -> dict[str, Any]:
    return {
        "id": t.pk,
        "name": t.name,
        "kind": t.kind,
        "color": t.color,
        "geometry": t.geometry,
        "owner": str(t.owner_tg) if t.owner_tg else None,
        "grp": t.grp or None,
        "meta": t.meta,
        "n": n,
        "sales": sales,
    }


@api(("GET", "POST"), check=can_use, deny=DENY)
def territories(request: HttpRequest, user: User) -> HttpResponse:
    if request.method == "POST":
        _need_full(user)
        data = json_body(request)
        kind = data.get("kind") if data.get("kind") in ("draw", "radius") else "draw"
        if kind == "radius":
            lat, lng = _latlng(data.get("center"))
            radius = _num(data.get("radius"), 50, 2_000_000, "Radius")
            geom, meta_ = _circle(lat, lng, radius), {"center": {"lat": lat, "lng": lng}, "radius": radius}
        else:
            geom, meta_ = _valid_geom(data.get("geometry")), data.get("meta") or {}
        n = Territory.objects.count()
        t = Territory.objects.create(
            name=str(data.get("name") or f"Hudud {n + 1}")[:80],
            kind=kind,
            color=data.get("color") or COLORS[n % len(COLORS)],
            geometry=geom,
            owner_tg=_owner(data.get("owner")),
            grp=str(data.get("group") or "")[:60],
            meta=meta_,
            created_by=user.tg_id,
        )
        recompute_territories()
        return ok({"id": t.pk})
    stats = {
        r["territory_id"]: (r["n"], r["s"] or 0)
        for r in Record.objects.exclude(territory=None)
        .values("territory_id")
        .annotate(n=Count("id"), s=Sum("sales_12m"))
    }
    terrs = sorted(Territory.objects.all(), key=lambda t: (not t.grp, t.grp, t.pk))
    if is_full(user):
        return ok([_terr(t, *stats.get(t.pk, (0, 0))) for t in terrs])
    # xodim — faqat o'ziga biriktirilgan hududlar, o'z yozuvlari soni bilan (summasiz)
    mine = dict(
        Record.objects.filter(owner_tg=user.tg_id)
        .exclude(territory=None)
        .values_list("territory_id")
        .annotate(n=Count("id"))
    )
    return ok([_terr(t, mine.get(t.pk, 0), 0) for t in terrs if t.owner_tg == user.tg_id])


def _owner(v: Any) -> int | None:
    try:
        return int(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        raise ApiError(422, "Xodim noto'g'ri") from None


@api(("POST", "DELETE"), check=can_use, deny=DENY)
def territory(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    _need_full(user)
    if request.method == "DELETE":
        Territory.objects.filter(pk=pk).delete()
        recompute_territories()
        return ok({"ok": True})
    data = json_body(request)
    t = Territory.objects.filter(pk=pk).first()
    if t is None:
        raise ApiError(404, "Hudud topilmadi")
    if "name" in data:
        t.name = str(data["name"] or "")[:80]
    if "color" in data:
        t.color = str(data["color"] or "")[:16]
    if "owner" in data:
        t.owner_tg = _owner(data["owner"])
    if "geometry" in data:
        t.geometry = _valid_geom(data["geometry"])
    t.save()
    if "geometry" in data:
        recompute_territories()
    return ok({"ok": True})


@api(("POST",), check=can_use, deny=DENY)
def territories_auto_preview(request: HttpRequest, user: User) -> HttpResponse:
    """{count, balance: count|sales, base: hex|district, ids?, regions?} → hududlar (saqlanmaydi)."""
    from .geo import territory as T
    from .geo.geo import bounds

    _need_full(user)
    data = json_body(request)
    k = max(2, min(int(_num(data.get("count") or 4, 2, 30, "Soni")), 30))
    by_sales = data.get("balance") == "sales"
    base = "hex" if data.get("base") == "hex" else "district"
    regions = {str(x) for x in (data.get("regions") or [])}
    qs = Record.objects.all()
    if data.get("ids"):
        qs = qs.filter(pk__in=[str(i) for i in data["ids"]])
    if regions:
        qs = qs.filter(region__in=regions)
    if base == "hex":
        # viloyat markaziga taxminiy qo'yilgan nuqtalar (region/none) qatnashmaydi — joyi aniq emas
        pts = list(
            qs.exclude(lat=None).exclude(geo_quality__in=("region", "none")).values_list("lat", "lng", "sales_12m")
        )
        res = T.auto_hex([(la, ln, float(s or 0) if by_sales else 1.0) for la, ln, s in pts], k)
        used = len(pts)
    else:
        rows = list(qs.exclude(district="").values("district").annotate(n=Count("id"), s=Sum("sales_12m")))
        scope = [d for d, x in bounds().districts.items() if x["region"] in regions] if regions else None
        res = T.auto({r["district"]: float(r["s"] or 0) if by_sales else float(r["n"]) for r in rows}, k, scope)
        used = sum(int(r["n"]) for r in rows)
    skipped = qs.count() - used
    for i, t in enumerate(res):
        t["name"] = f"Hudud {i + 1}"
        t["color"] = COLORS[i % len(COLORS)]
    return ok(
        {
            "territories": res,
            "balance": "sales" if by_sales else "count",
            "base": base,
            "used": used,
            "skipped": skipped,
        }
    )


@api(("POST",), check=can_use, deny=DENY)
def territories_auto_save(request: HttpRequest, user: User) -> HttpResponse:
    _need_full(user)
    data = json_body(request)
    grp = str(data.get("group") or f"Avto {timezone.localtime():%d.%m %H:%M}")[:60]
    terrs = data.get("territories")
    if not isinstance(terrs, list) or not terrs or len(terrs) > 60 or not all(isinstance(t, dict) for t in terrs):
        raise ApiError(422, "Hududlar yo'q")
    for t in terrs:  # hammasi yaroqli bo'lsagina eskilari o'chiriladi (yarim yo'lda xato — hududlar yo'qolmasin)
        _valid_geom(t.get("geometry"))
    with transaction.atomic():
        if data.get("replace"):
            Territory.objects.filter(kind="auto").delete()
        for t in terrs:
            Territory.objects.create(
                name=str(t.get("name") or "Hudud")[:80],
                kind="auto",
                color=str(t.get("color") or "")[:16],
                geometry=t["geometry"],
                owner_tg=_owner(t.get("owner")),
                grp=grp,
                meta={
                    "districts": t.get("districts"),
                    "cells": t.get("cells"),
                    "balance": data.get("balance"),
                    "base": data.get("base"),
                },
                created_by=user.tg_id,
            )
    recompute_territories()
    return ok({"ok": True, "group": grp})


@api(("POST",), check=can_use, deny=DENY)
def import_geojson(request: HttpRequest, user: User) -> HttpResponse:
    """GeoJSON (KML/GPX/Shapefile brauzerda GeoJSON'ga aylantiriladi) → hududlar (faqat poligonlar)."""
    _need_full(user)
    data = json_body(request)
    fc = data.get("geojson") or {}
    feats = fc.get("features") if fc.get("type") == "FeatureCollection" else [fc]
    made = 0
    for f in (feats or [])[:200]:
        g = (f or {}).get("geometry") or {}
        if g.get("type") not in ("Polygon", "MultiPolygon"):
            continue
        name = (f.get("properties") or {}).get("name") or f"{data.get('name') or 'Import'} {made + 1}"
        Territory.objects.create(
            name=str(name)[:80],
            kind="import",
            color=COLORS[made % len(COLORS)],
            geometry=g,
            grp=str(data.get("name") or "Import")[:60],
            created_by=user.tg_id,
        )
        made += 1
    if made:
        recompute_territories()
    return ok({"ok": True, "created": made})


# ------------------------------------------------------------------ marshrut, zona, yangi mijozlar
@api(("POST",), check=can_use, deny=DENY)
def route_optimize(request: HttpRequest, user: User) -> HttpResponse:
    from .geo import services as S

    data = json_body(request)
    stops = data.get("stops") or []
    start = data.get("start")
    if not isinstance(stops, list) or len(stops) > S.MAX_STOPS:
        raise ApiError(422, f"Ko'pi bilan {S.MAX_STOPS} ta nuqta")
    pts = ([_latlng(start)] if start else []) + [_latlng(x) for x in stops]
    try:
        res = async_to_sync(S.optimize_route)(pts, roundtrip=bool(data.get("roundtrip", True)))
    except S.ServiceError as exc:
        raise ApiError(422, str(exc)) from exc
    off = 1 if start else 0
    res["stops"] = [stops[i - off] for i in res["order"] if i >= off]
    return ok(res)


def _route(r: Route) -> dict[str, Any]:
    return {
        "id": r.pk,
        "name": r.name,
        "stops": r.stops,
        "geometry": r.geometry,
        "distance_m": r.distance_m,
        "duration_s": r.duration_s,
        "ts": _ts(r.ts),
    }


@api(("GET", "POST"), check=can_use, deny=DENY)
def routes(request: HttpRequest, user: User) -> HttpResponse:
    if request.method == "POST":
        import json

        data = json_body(request)
        stops, geom = data.get("stops") or [], data.get("geometry")
        if len(json.dumps(stops)) + len(json.dumps(geom)) > 2_000_000:
            raise ApiError(422, "Marshrut juda katta")
        r = Route.objects.create(
            name=str(data.get("name") or f"Marshrut {timezone.localtime():%d.%m}")[:80],
            owner_tg=user.tg_id,
            stops=stops,
            geometry=geom,
            distance_m=_opt_num(data.get("distance_m")),
            duration_s=_opt_num(data.get("duration_s")),
        )
        return ok({"id": r.pk})
    return ok([_route(r) for r in Route.objects.filter(owner_tg=user.tg_id).order_by("-id")[:30]])


@api(("DELETE",), check=can_use, deny=DENY)
def route_delete(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    Route.objects.filter(pk=pk, owner_tg=user.tg_id).delete()
    return ok({"ok": True})


@api(("POST",), check=can_use, deny=DENY)
def isochrone(request: HttpRequest, user: User) -> HttpResponse:
    from .geo import services as S

    data = json_body(request)
    lat, lng = _latlng(data)
    mins = data.get("minutes") or [15]
    mins = mins if isinstance(mins, list) else [mins]
    try:
        return ok(async_to_sync(S.isochrone)(lat, lng, [int(_num(m, 1, 120, "Daqiqa")) for m in mins[:8]]))
    except S.ServiceError as exc:
        raise ApiError(502, str(exc)) from exc


@api(("POST",), check=can_use, deny=DENY)
def prospects(request: HttpRequest, user: User) -> HttpResponse:
    from .geo import services as S
    from .geo.names import name_key

    data = json_body(request)
    lat, lng = _latlng(data)
    try:
        found = async_to_sync(S.prospects)(lat, lng, int(_num(data.get("radius") or 5000, 1, 1e6, "Radius")))
    except S.ServiceError as exc:
        raise ApiError(502, str(exc)) from exc
    # bizda bormi — nomi bo'yicha (hamma yozuvlar: xodim ko'rmaydigan mijoz ham "yangi" bo'lib chiqmasin)
    known = {name_key(n) for n in Record.objects.values_list("name", flat=True)}
    for p in found:
        p["known"] = name_key(p["name"]) in known
    return ok({"prospects": found})


# ------------------------------------------------------------------ tashriflar
@api(("POST",), check=can_use, deny=DENY)
def checkins(request: HttpRequest, user: User) -> HttpResponse:
    data = json_body(request)
    rid = str(data.get("record_id") or "")
    _visible(user, rid)
    c = Checkin.objects.create(
        record_id=rid,
        tg_id=user.tg_id,
        note=str(data.get("note") or "")[:1000],
        lat=None if data.get("lat") is None else _num(data.get("lat"), -90, 90, "Kenglik"),
        lng=None if data.get("lng") is None else _num(data.get("lng"), -180, 180, "Uzunlik"),
        ts=str(data.get("ts") or timezone.localtime().isoformat(timespec="seconds"))[:19],
    )
    return ok({"id": c.pk})


# ------------------------------------------------------------------ ulashish
def pw_hash(pw: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(8)
    return f"{salt}${hashlib.pbkdf2_hmac('sha256', pw.encode(), salt.encode(), 120_000).hex()}"


@api(("GET", "POST"), check=can_use, deny=DENY)
def shares(request: HttpRequest, user: User) -> HttpResponse:
    if request.method == "POST":
        # tanlangan yozuvlar (ruxsat doirasida) — jonli: nuqta/holat yangilanadi; pul, qarz, STIR, mas'ul ulashilmaydi
        data = json_body(request)
        ids = list(
            _scope(user).filter(pk__in=[str(i) for i in (data.get("ids") or [])][:10000]).values_list("pk", flat=True)
        )
        if not ids:
            raise ApiError(422, "Ulashish uchun yozuv yo'q")
        token = secrets.token_urlsafe(12)
        pw = str(data.get("password") or "").strip()
        days = int(_num(data.get("days") or 30, 1, 365, "Muddat"))
        Share.objects.create(
            token=token,
            name=str(data.get("name") or "Xarita")[:80],
            state={"ids": ids, "style": data.get("style") or {}},
            pw_hash=pw_hash(pw) if pw else "",
            created_by=user.tg_id,
            expires=timezone.now() + timedelta(days=days),
        )
        return ok({"token": token, "path": f"/app/geo/share?t={token}"})
    return ok(
        [
            {
                "token": s.token,
                "name": s.name,
                "protected": bool(s.pw_hash),
                "expires": _ts(s.expires),
                "ts": _ts(s.ts),
                "n": len((s.state or {}).get("ids") or []),
            }
            for s in Share.objects.filter(created_by=user.tg_id).order_by("-ts")
        ]
    )


@api(("DELETE",), check=can_use, deny=DENY)
def share_delete(request: HttpRequest, user: User, token: str) -> HttpResponse:
    qs = Share.objects.filter(token=token)
    if not is_full(user):
        qs = qs.filter(created_by=user.tg_id)
    qs.delete()
    return ok({"ok": True})


def _share(token: str) -> Share:
    s = Share.objects.filter(token=token).first()
    if s is None or (s.expires and s.expires < timezone.now()):
        raise ApiError(404, "Havola topilmadi yoki muddati o'tgan")
    return s


_fails: dict[str, list[float]] = {}
_FAIL_IP, _FAIL_IP_WIN = 8, 600  # bir IP'dan: 10 daqiqada 8 xato
_FAIL_TOKEN, _FAIL_TOKEN_WIN = 50, 3600  # bitta havolaga barcha IP'lardan: soatiga 50 xato (IP almashtirib terish)


def _recent(key: str, window: float) -> list[float]:
    now = time.time()
    return [t for t in _fails.get(key, []) if now - t < window]


def _prune_fails() -> None:
    """Eskirgan kalitlar — lug'at cheksiz o'smasin (ko'p IP/havola)."""
    if len(_fails) > 5000:
        now = time.time()
        for k in [k for k, v in _fails.items() if not v or now - v[-1] > _FAIL_TOKEN_WIN]:
            _fails.pop(k, None)


@api(("GET", "POST"), auth=False)
def public(request: HttpRequest, user: User | None, token: str) -> HttpResponse:
    """Ochiq havola: GET — {name, protected}; POST {password?} — yozuvlar (faqat PUBLIC_COLS)."""
    s = _share(token)
    if request.method == "GET":
        return ok({"name": s.name, "protected": bool(s.pw_hash)})
    data = json_body(request)
    if s.pw_hash:
        key = f"{token}:{request.META.get('REMOTE_ADDR') or '-'}"
        tkey = f"{token}:*"
        recent, trecent = _recent(key, _FAIL_IP_WIN), _recent(tkey, _FAIL_TOKEN_WIN)
        if len(recent) >= _FAIL_IP or len(trecent) >= _FAIL_TOKEN:
            raise ApiError(429, "Ko'p urinish — birozdan keyin urinib ko'ring")
        salt = s.pw_hash.split("$", 1)[0]
        if not secrets.compare_digest(pw_hash(str(data.get("password") or "").strip(), salt), s.pw_hash):
            now = time.time()
            _fails[key], _fails[tkey] = [*recent, now], [*trecent, now]
            _prune_fails()
            raise ApiError(401, "Parol noto'g'ri")
    rows = Record.objects.filter(pk__in=(s.state or {}).get("ids") or []).exclude(lat=None).values(*PUBLIC_COLS)
    return ok({"name": s.name, "style": (s.state or {}).get("style") or {}, "records": list(rows)})

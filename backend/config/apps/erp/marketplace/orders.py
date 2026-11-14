"""FBS buyurtmalari: kanaldan sinxron, bosqichlar taxtasi, skaner bilan yig'ish, kanal amallari, stikerlar.

Jarvis office/erp/market/orders.py dan. Muddat: Uzum — acceptUntil (tasdiqlanmasa bekor + jarima), keyin deliverUntil;
Ozon — shipment_date; WB — yo'q (postavka orqali). Yig'ishda har qadoq skanerlanadi va KUTILGAN shtrixkod bilan
solishtiriladi (peresort oldini olish). Bosqich manbasi — kanal: sinxron har safar yangilaydi.
"""

from __future__ import annotations

import base64
import time
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from typing import Any

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from . import channels as C
from .channels import ChannelError
from .models import ACTIVE, Card, Channel, Log, Order, Stage

CHANNELS = tuple(Channel.values)
STAGES = tuple(Stage.values)


def _ms(v: Any) -> datetime | None:
    try:
        return datetime.fromtimestamp(float(v) / 1000, tz=UTC) if v else None
    except (TypeError, ValueError):
        return None


def _iso(v: Any) -> datetime | None:
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")) if v else None
    except ValueError:
        return None


def _dt(v: datetime | None) -> str | None:
    return v.isoformat() if v else None


def log(actor: Any, ch: str, ref: str, action: str, detail: dict | None = None) -> None:
    Log.objects.create(
        actor=actor if getattr(actor, "pk", None) else None,
        channel=ch,
        ref=str(ref)[:64],
        action=action,
        detail=detail or {},
    )


# ================================================================== kanal holati → bosqich
def stage_of(ch: str, st: dict | str | None) -> str:
    if ch == "wb":
        # WB kabineti: Yangilari | Yig'ilmoqda | Yetkazib berishda | Yakunlanganlar | Bekor qilinganlar
        d = st if isinstance(st, dict) else {}
        sup, wb = d.get("supplierStatus"), d.get("wbStatus") or ""
        if sup == "cancel" or (sup == "new" and wb.startswith(("canceled", "declined"))):
            return Stage.CANCELLED
        if sup == "new":
            return Stage.NEW
        if sup == "confirm":
            return Stage.ASSEMBLY
        if sup == "complete" and wb == "waiting":
            return Stage.TRANSIT
        return Stage.DONE
    s = str(st or "").lower()
    if ch == "ozon":
        if s in ("awaiting_registration", "acceptance_in_progress", "awaiting_approve", "awaiting_packaging"):
            return Stage.NEW
        if s in ("awaiting_deliver", "sent_by_seller"):
            return Stage.ASSEMBLY
        if s == "delivered":
            return Stage.DONE
        return Stage.CANCELLED if s in ("cancelled", "not_accepted") else Stage.TRANSIT
    if ch == "uzum":
        if s == "created":
            return Stage.NEW
        if s == "packing":
            return Stage.ASSEMBLY
        if s in ("pending_delivery", "delivering", "accepted_at_dp", "delivered_to_customer_delivery_point"):
            return Stage.TRANSIT
        if s in ("delivered", "completed"):
            return Stage.DONE
        return Stage.CANCELLED
    return Stage.TRANSIT


def derive(ch: str, p: dict) -> dict:
    """Kanal javobidan: muddat va xom qatorlar (kalit — kartochka bilan bog'lash uchun, `codes` — javobdagi shtrixkodlar)."""
    if ch == "uzum":
        st = p.get("status")
        dl = _ms(p.get("acceptUntil")) if st == "CREATED" else _ms(p.get("deliverUntil"))
        lines = [
            {
                "key": str(x.get("skuId") or ""),
                "title": x.get("skuTitle") or x.get("title"),
                "qty": x.get("amount") or 1,
                "codes": [str(x["barcode"])] if x.get("barcode") else [],
            }
            for x in p.get("orderItems") or []
        ]
        return {"deadline": dl, "lines": lines}
    if ch == "ozon":
        lines = [
            {"key": x.get("offer_id") or "", "title": x.get("name"), "qty": x.get("quantity") or 1, "codes": []}
            for x in p.get("products") or []
        ]
        return {"deadline": _iso(p.get("shipment_date")), "lines": lines}
    return {
        "deadline": None,
        "lines": [
            {
                "key": str(p.get("nmId") or ""),
                "title": p.get("article"),
                "qty": 1,
                "codes": [str(x) for x in p.get("skus") or []],
            }
        ],
    }


def _card_for(ch: str, key: str) -> Card | None:
    if not key:
        return None
    if ch == "ozon":
        return Card.objects.filter(channel="ozon").filter(Q(ext__offer_id=key) | Q(vendor_code=key)).first()
    return Card.objects.filter(channel=ch, ext_id=key).first()


def fill_lines(o: Order) -> list[dict]:
    """Qatorlar: kartochka nomi, artikul, kenglik va shtrixkodlari (kanal javobidagilar bilan birga)."""
    out = []
    for ln in derive(o.channel, o.payload or {})["lines"]:
        c = _card_for(o.channel, ln["key"])
        codes = list(dict.fromkeys([*ln["codes"], *((c.codes or []) if c else [])]))
        out.append(
            {
                "key": ln["key"],
                "title": (c and c.title) or ln.get("title"),
                "qty": int(ln.get("qty") or 1),
                "codes": codes,
                "vendor_code": (c and c.vendor_code) or None,
                "width_mm": float(c.width_mm) if c and c.width_mm else None,
                "mode": (c and c.mode) or None,
            }
        )
    return out


def refresh(qs: Iterable[Order]) -> None:
    """Qatorlari hisoblanmagan buyurtmalarga qatorlarni to'ldiradi."""
    for o in qs:
        if o.lines is None:
            o.lines = fill_lines(o)
            o.save(update_fields=["lines", "updated"])


def _article(o: Order) -> str | None:
    p = o.payload or {}
    if o.channel == "wb":
        return p.get("article")
    if o.channel == "ozon":
        return ((p.get("products") or [{}])[0]).get("offer_id")
    return ((p.get("orderItems") or [{}])[0]).get("skuTitle")


def _price(o: Order) -> float | None:
    p = o.payload or {}
    if o.channel == "wb" and p.get("convertedPrice") is not None:
        return float(p["convertedPrice"]) / 100  # tiyin → so'm (kanal o'girgan)
    if o.channel == "uzum" and isinstance(p.get("price"), int | float):
        return float(p["price"])
    return None


def row(o: Order, now: datetime | None = None) -> dict:
    now = now or timezone.now()
    lines = o.lines or []
    return {
        "channel": o.channel,
        "ext_id": o.ext_id,
        "stage": o.stage,
        "ext_status": o.ext_status or None,
        "ordered": _dt(o.ordered),
        "deadline": _dt(o.deadline),
        "supply_id": o.supply_id or None,
        "lines": lines,
        "picked": o.picked or [],
        "assembled_at": _dt(o.assembled_at),
        "number": o.number or None,
        "article": _article(o),
        "price_uzs": _price(o),
        "need": sum(int(ln.get("qty") or 1) for ln in lines),
        "left_min": int((o.deadline - now).total_seconds() // 60) if o.deadline else None,
        "age_min": int((now - o.ordered).total_seconds() // 60) if o.ordered else None,
    }


# ================================================================== taxta va hisoblar
def board(ch: str, stage: str = "active", limit: int = 400) -> dict:
    counts = {r["stage"]: r["n"] for r in Order.objects.filter(channel=ch).values("stage").annotate(n=Count("id"))}
    qs = Order.objects.filter(channel=ch)
    qs = qs.filter(stage__in=ACTIVE) if stage == "active" else qs.filter(stage=stage)
    rs = list(qs[:5000])
    refresh(rs)
    far = datetime.max.replace(tzinfo=UTC)
    rs.sort(key=lambda o: (o.deadline or far, -(o.ordered or o.created).timestamp()))
    now = timezone.now()
    return {"counts": counts, "orders": [row(o, now) for o in rs[:limit]]}


def counts() -> dict:
    out = {ch: {"new": 0, "assembly": 0} for ch in CHANNELS}
    for r in Order.objects.filter(stage__in=ACTIVE).values("channel", "stage").annotate(n=Count("id")):
        out.setdefault(r["channel"], {"new": 0, "assembly": 0})[r["stage"]] = r["n"]
    return out


def summary() -> dict:
    """Overview uchun: faol buyurtmalar va 3 soat ichida muddati tugaydiganlar."""
    act = Order.objects.filter(stage__in=ACTIVE)
    return {"n": act.count(), "soon": act.filter(deadline__lt=timezone.now() + timedelta(hours=3)).count()}


# ================================================================== yig'ish (faqat ERP ichida — kanalga yozmaydi)
def scan(ch: str, ext_id: str, code: str, actor: Any) -> dict:
    code = (code or "").strip()
    if not code:
        raise ChannelError("Shtrixkod bo'sh", 400)
    with transaction.atomic():
        o = Order.objects.select_for_update().filter(channel=ch, ext_id=ext_id).first()
        if o is None:
            raise ChannelError("Buyurtma topilmadi", 404)
        if o.assembled_at:
            raise ChannelError("Buyurtma allaqachon yig'ilgan", 400)
        lines: list[dict] = o.lines if o.lines is not None else fill_lines(o)
        o.lines = lines
        picked = list(o.picked or [])
        need = sum(int(x.get("qty") or 1) for x in lines)
        for i, ln in enumerate(lines):
            if code not in (ln.get("codes") or []):
                continue
            done = sum(1 for p in picked if p.get("line") == i)
            if done >= int(ln.get("qty") or 1):
                raise ChannelError(f"Bu tovar yetarli skanerlangan ({done} ta) — ortiqchasini qo'ymang", 400)
            picked.append(
                {"line": i, "code": code, "by": getattr(actor, "tg_id", None), "ts": timezone.now().isoformat()}
            )
            full = len(picked) >= need
            o.picked = picked
            o.assembled_at = timezone.now() if full else None
            o.assembled_by = getattr(actor, "tg_id", None) if full else None
            o.save(update_fields=["lines", "picked", "assembled_at", "assembled_by", "updated"])
            return {"ok": True, "line": i, "title": ln.get("title"), "picked": len(picked), "need": need, "done": full}
        expected = "; ".join(
            f"{ln.get('title')} ({', '.join(ln.get('codes') or []) or 'shtrixkod yo‘q'})" for ln in lines
        )
        raise ChannelError(f"NOTO'G'RI TOVAR: {code} bu buyurtmada yo'q. Kutilgan: {expected[:300]}", 400)


def reset(ch: str, ext_id: str, actor: Any) -> dict:
    n = Order.objects.filter(channel=ch, ext_id=ext_id).update(
        picked=[], assembled_at=None, assembled_by=None, updated=timezone.now()
    )
    if not n:
        raise ChannelError("Buyurtma topilmadi", 404)
    log(actor, ch, ext_id, "reset")
    return {"ok": True}


# ================================================================== kanaldan sinxron
def _fetch_wb(days: int) -> list[tuple[str, dict, str, datetime | None]]:
    since = int((datetime.now(UTC) - timedelta(days=days)).timestamp())
    orders: list[dict] = []
    nxt = 0
    for _ in range(20):
        j = (
            C.must(
                "wb",
                C.wb("GET", "/api/v3/orders", params={"limit": 1000, "next": nxt, "dateFrom": since}),
                "WB buyurtmalar",
            )
            or {}
        )
        page = j.get("orders") or []
        orders += page
        nxt = j.get("next") or 0
        if len(page) < 1000 or not nxt:
            break
    r = C.wb("GET", "/api/v3/orders/new")
    new = {o["id"]: o for o in ((r.json() or {}).get("orders") or [])} if r.ok else {}
    allo = list({**{o["id"]: o for o in orders}, **new}.values())
    st: dict[int, dict] = {}
    for i in range(0, len(allo), 1000):
        r = C.wb("POST", "/api/v3/orders/status", json={"orders": [o["id"] for o in allo[i : i + 1000]]})
        if r.ok:
            st |= {x["id"]: x for x in (r.json() or {}).get("orders") or []}
    out = []
    for o in allo:
        s = st.get(o["id"]) or {"supplierStatus": "new" if o["id"] in new else None}
        out.append((str(o["id"]), {**o, "_status": s}, stage_of("wb", s), _iso(o.get("createdAt"))))
    return out


def _ozon_iso(d: datetime) -> str:
    return d.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _fetch_ozon(days: int) -> list[tuple[str, dict, str, datetime | None]]:
    now = datetime.now(UTC)
    seen: dict[str, dict] = {}
    for path, flt, direction in (
        ("/v4/posting/fbs/list", {"since": _ozon_iso(now - timedelta(days=days)), "to": _ozon_iso(now)}, "DESC"),
        (
            "/v4/posting/fbs/unfulfilled/list",
            {"cutoff_from": _ozon_iso(now - timedelta(days=60)), "cutoff_to": _ozon_iso(now + timedelta(days=30))},
            "ASC",
        ),
    ):
        cursor = ""
        for _ in range(20):
            j = C.ozon(
                path,
                {
                    "dir": direction,
                    "limit": 100,
                    "cursor": cursor,
                    "filter": flt,
                    "with": {"analytics_data": False, "financial_data": False},
                },
            )
            for p in j.get("postings") or []:
                seen[p["posting_number"]] = p
            cursor = j.get("cursor") or ""
            if not j.get("has_next") or not cursor:
                break
    return [(e, p, stage_of("ozon", p.get("status")), _iso(p.get("in_process_at"))) for e, p in seen.items()]


UZUM_STATUSES = (
    "CREATED",
    "PACKING",
    "PENDING_DELIVERY",
    "DELIVERING",
    "ACCEPTED_AT_DP",
    "DELIVERED_TO_CUSTOMER_DELIVERY_POINT",
    "DELIVERED",
    "COMPLETED",
    "CANCELED",
    "PENDING_CANCELLATION",
    "RETURNED",
)


def _fetch_uzum(days: int) -> list[tuple[str, dict, str, datetime | None]]:
    shops = C.uzum_shops()
    if not shops:
        raise ChannelError("Uzum: kalitga ochiq do'kon yo'q")
    since = int((datetime.now(UTC) - timedelta(days=days)).timestamp())  # Uzum: soniya (javobdagi sanalar — ms)
    out = []
    for s in UZUM_STATUSES:
        for page in range(20):
            r = C.uzum(
                "GET",
                "/v2/fbs/orders",
                params={"shopIds": shops, "status": s, "dateFrom": since, "page": page, "size": 50},
            )
            p = C.uzum_payload(r) if r.ok else C.must("uzum", r, "Uzum buyurtmalar")
            lst = (p.get("orders") if isinstance(p, dict) else p) or []
            out.extend(
                (str(o["id"]), o, stage_of("uzum", o.get("status") or s), _ms(o.get("dateCreated"))) for o in lst
            )
            if len(lst) < 50:
                break
    return out


FETCH = {"wb": _fetch_wb, "ozon": _fetch_ozon, "uzum": _fetch_uzum}


def sync(ch: str, days: int = 30) -> dict:
    """Kanal buyurtmalari → Order. Bosqich/holat har safar kanaldan; skaner natijasi (picked) saqlanadi."""
    # bitta buyurtma ikki holat ro'yxatida bo'lishi mumkin (o'tish paytida) — oxirgisi qoladi
    rows = list({r[0]: r for r in FETCH[ch](days)}.values())
    n = {"new": 0, "updated": 0, "imported": 0}
    with transaction.atomic():
        have = {o.ext_id: o for o in Order.objects.filter(channel=ch, ext_id__in=[r[0] for r in rows])}
        for ext, p, stg, ordered in rows:
            ext_st = (p.get("_status") or {}).get("wbStatus") if ch == "wb" else p.get("status")
            dl = derive(ch, p)["deadline"]
            o = have.get(ext)
            if o is None:
                Order.objects.create(
                    channel=ch,
                    ext_id=ext,
                    stage=stg,
                    ext_status=ext_st or "",
                    ordered=ordered,
                    deadline=dl,
                    supply_id=str(p.get("supplyId") or ""),
                    payload=p,
                )
                n["new"] += 1
                n["imported"] += stg in ACTIVE
                continue
            o.stage, o.ext_status, o.payload, o.deadline = stg, ext_st or "", p, dl
            o.ordered = o.ordered or ordered
            if ch == "wb" and p.get("supplyId"):
                o.supply_id = str(p["supplyId"])
            if stg in ACTIVE:
                o.lines = None  # kartochka o'zgargan bo'lishi mumkin — qayta hisoblanadi
            o.save()
            n["updated"] += 1
    return n


# ================================================================== kanal amallari (yozuvchi — MP_WRITE)
def _set_stage(ch: str, ext: str, stage: str, **extra: Any) -> None:
    Order.objects.filter(channel=ch, ext_id=ext).update(stage=stage, updated=timezone.now(), **extra)


def _need_order(ch: str, ext: str) -> Order:
    o = Order.objects.filter(channel=ch, ext_id=ext).first()
    if o is None:
        raise ChannelError("Buyurtma topilmadi", 404)
    return o


CANCEL_OZON = 352  # «товар закончился у продавца»


def cancel(ch: str, ext: str, actor: Any, reason: str = "") -> dict:
    o = _need_order(ch, ext)
    if o.stage not in ACTIVE:
        raise ChannelError("Kanal bekor qilmadi: buyurtma allaqachon jo'natilgan yoki yopilgan", 400)
    if ch == "wb":
        r = C.wb("PATCH", f"/api/v3/orders/{int(ext)}/cancel", write=True)
        C.must("wb", r, "Kanal bekor qilmadi")
    elif ch == "ozon":
        C.ozon(
            "/v2/posting/fbs/cancel",
            {"posting_number": ext, "cancel_reason_id": CANCEL_OZON, "cancel_reason_message": reason[:200]},
            write=True,
        )
    else:
        r = C.uzum(
            "POST",
            f"/v1/fbs/order/{int(ext)}/cancel",
            json={"reason": "OUT_OF_STOCK", "comment": reason[:200]},
            write=True,
        )
        C.must("uzum", r, "Kanal bekor qilmadi")
    _set_stage(ch, ext, Stage.CANCELLED)
    log(actor, ch, ext, "cancel", {"reason": reason})
    return {"ok": True}


def uzum_confirm(ext: str, actor: Any) -> dict:
    o = _need_order("uzum", ext)
    if o.ext_status != "CREATED":
        raise ChannelError("Uzum tasdiqlamadi: buyurtma CREATED holatida emas", 400)
    C.must("uzum", C.uzum("POST", f"/v1/fbs/order/{int(ext)}/confirm", write=True), "Uzum tasdiqlamadi")
    _set_stage("uzum", ext, Stage.ASSEMBLY, ext_status="PACKING", lines=None)
    log(actor, "uzum", ext, "confirm")
    return {"ok": True}


def ozon_ship(posting: str, actor: Any) -> dict:
    o = _need_order("ozon", posting)
    if o.stage != Stage.NEW:
        raise ChannelError("Ozon: jo'natma yig'ishga tayyor holatda emas", 400)
    prods = [
        {"product_id": int(x["sku"]), "quantity": int(x.get("quantity") or 1)}
        for x in (o.payload or {}).get("products") or []
        if x.get("sku")
    ]
    C.ozon("/v4/posting/fbs/ship", {"posting_number": posting, "packages": [{"products": prods}]}, write=True)
    _set_stage("ozon", posting, Stage.ASSEMBLY, ext_status="awaiting_deliver")
    log(actor, "ozon", posting, "ship", {"products": prods})
    return {"ok": True, "note": "Etiketka 45–60 soniyadan keyin tayyor bo'ladi"}


# ================================================================== stiker (o'qish)
def label(ch: str, ext: str) -> tuple[bytes, str]:
    """(fayl, content-type) — 58×40 stiker."""
    if ch == "wb":
        r = C.wb(
            "POST",
            "/api/v3/orders/stickers",
            params={"type": "png", "width": 58, "height": 40},
            json={"orders": [int(ext)]},
        )
        st = ((r.json() or {}).get("stickers") or [{}])[0] if r.ok else {}
        if not st.get("file"):
            raise ChannelError("WB stiker bermadi — buyurtma avval postavkaga qo'shilishi kerak", 400)
        return base64.b64decode(st["file"]), "image/png"
    if ch == "ozon":
        j = C.ozon("/v3/posting/fbs/package-label/create", {"posting_number": [ext]})
        res = j.get("result") or {}
        tasks = res.get("tasks") or [res]
        tid = next((t.get("task_id") for t in tasks if t.get("task_id")), None)
        if not tid:
            raise ChannelError("Ozon etiketka vazifasini yaratmadi", 400)
        for _ in range(6):  # Ozon: yig'ishdan 45–60 s keyin tayyor
            time.sleep(5)
            g = C.ozon("/v2/posting/fbs/package-label/get", {"task_id": tid}).get("result") or {}
            if g.get("status") == "completed" and g.get("file_url"):
                import httpx

                return httpx.get(g["file_url"], timeout=60).content, "application/pdf"
            if g.get("status") == "error":
                raise ChannelError(f"Ozon etiketka xatosi: {g.get('error')}", 400)
        raise ChannelError("Ozon etiketkasi hali tayyor emas — 1 daqiqadan keyin qayta urining", 400)
    r = C.uzum("GET", f"/v1/fbs/order/{int(ext)}/labels/print", params={"size": "LARGE"})
    if not r.ok:
        raise ChannelError(f"Uzum etiketka bermadi: {C.error_text('uzum', r)}")
    if "pdf" in r.ctype:
        return r.content, "application/pdf"
    doc = (C.uzum_payload(r) or {}).get("document")
    if not doc:
        raise ChannelError("Uzum etiketka bo'sh")
    return base64.b64decode(doc), "application/pdf"


# ================================================================== tanlanma ro'yxati
def picking(rows: list[dict]) -> list[dict]:
    """Bir xil tovar bitta qatorga (omborchi bir yurishda oladi) — frontend lib/orders.lib.ts picking bilan bir xil."""
    agg: dict[str, dict] = {}
    for r in rows:
        for ln in r.get("lines") or []:
            k = ln.get("vendor_code") or ln.get("key") or ln.get("title") or ""
            a = agg.setdefault(
                k,
                {
                    "title": ln.get("title"),
                    "vendor_code": ln.get("vendor_code"),
                    "width_mm": ln.get("width_mm"),
                    "mode": ln.get("mode"),
                    "qty": 0,
                    "orders": [],
                    "sum": 0,
                    "prices": [],
                },
            )
            q = int(ln.get("qty") or 1)
            a["qty"] += q
            a["orders"].append(r["ext_id"])
            if r.get("price_uzs") is not None:
                a["sum"] += float(r["price_uzs"])
                a["prices"].append(float(r["price_uzs"]) / q)
    return sorted(agg.values(), key=lambda x: x["title"] or "")

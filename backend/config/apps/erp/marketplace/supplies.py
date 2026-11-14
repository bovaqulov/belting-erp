"""WB postavkalari (FBS): ro'yxat, yaratish, buyurtma qo'shish, yuk joylari, topshirish, QR va stikerlar.

Kabinetdagi tartib: 1 yig'ish → 2 yuk joylari (QR qutiga) → 3 yetkazib berishga topshirish. Jarvis
office/erp/market/orders.py (wb_*) dan. Yaratish/qo'shish/topshirish/yuk joyi — kanalga yozadi (MP_WRITE).
"""

from __future__ import annotations

import base64
from typing import Any

from django.db.models import Q
from django.utils import timezone

from . import channels as C
from .channels import ChannelError
from .models import Order, Stage
from .orders import log, picking, refresh, row


def _sid(sid: str) -> str:
    sid = (sid or "").strip()
    if not sid or "/" in sid:
        raise ChannelError("Postavka raqami noto'g'ri", 400)
    return sid


def supplies() -> list[dict]:
    """Ochiq (topshirilmagan) postavkalar."""
    out: list[dict] = []
    nxt = 0
    for _ in range(10):
        j = C.must("wb", C.wb("GET", "/api/v3/supplies", params={"limit": 1000, "next": nxt}), "WB postavkalar") or {}
        page = j.get("supplies") or []
        out += page
        nxt = j.get("next") or 0
        if len(page) < 1000 or not nxt:
            break
    return [_supply(s) for s in out if not s.get("done")]


def _supply(s: dict) -> dict:
    return {
        "id": s.get("id"),
        "name": s.get("name") or "",
        "createdAt": s.get("createdAt"),
        "closedAt": s.get("closedAt"),
        "done": bool(s.get("done")),
    }


def create(name: str, actor: Any) -> dict:
    r = C.wb("POST", "/api/v3/supplies", json={"name": (name or "ERP")[:128]}, write=True)
    sid = (C.must("wb", r, "WB postavka yaratilmadi") or {}).get("id")
    log(actor, "wb", sid or "", "supply_create", {"name": name})
    return {"id": sid}


def add(sid: str, order_ids: list[str], actor: Any) -> dict:
    sid = _sid(sid)
    ids = [str(x) for x in order_ids][:100]
    if not ids:
        raise ChannelError("Buyurtma tanlanmagan", 400)
    r = C.wb("PATCH", f"/api/marketplace/v3/supplies/{sid}/orders", json={"orders": [int(x) for x in ids]}, write=True)
    C.must("wb", r, "WB postavkaga qo'shmadi")
    Order.objects.filter(channel="wb", ext_id__in=ids).update(
        supply_id=sid, stage=Stage.ASSEMBLY, updated=timezone.now()
    )
    log(actor, "wb", sid, "supply_add", {"orders": ids})
    return {"ok": True}


def deliver(sid: str, actor: Any) -> dict:
    sid = _sid(sid)
    C.must("wb", C.wb("PATCH", f"/api/v3/supplies/{sid}/deliver", write=True), "WB topshirishga o'tkazmadi")
    Order.objects.filter(channel="wb", supply_id=sid, stage=Stage.ASSEMBLY).update(
        stage=Stage.TRANSIT, updated=timezone.now()
    )
    log(actor, "wb", sid, "supply_deliver")
    return {"ok": True}


def qr(sid: str) -> tuple[bytes, str]:
    r = C.wb("GET", f"/api/v3/supplies/{_sid(sid)}/barcode", params={"type": "png"})
    f = (r.json() or {}).get("file") if r.ok else None
    if not f:
        raise ChannelError("WB QR bermadi — postavka avval topshirishga o'tkazilishi kerak", 400)
    return base64.b64decode(f), "image/png"


def detail(sid: str) -> dict:
    """Postavka: ma'lumot, buyurtmalar, yuk joylari, tanlanma, bosqich."""
    sid = _sid(sid)
    info = C.wb("GET", f"/api/v3/supplies/{sid}")
    if info.status == 404:
        raise ChannelError("Postavka topilmadi", 404)
    sup = C.must("wb", info, "WB postavka") or {}
    ids_r = C.wb("GET", f"/api/marketplace/v3/supplies/{sid}/order-ids")
    order_ids = [str(x) for x in ((ids_r.json() or {}).get("orderIds") or [])] if ids_r.ok else []
    tb = C.wb("GET", f"/api/v3/supplies/{sid}/trbx")
    boxes = [
        {"id": b.get("id"), "orders": [str(x) for x in b.get("orders") or []]}
        for b in ((tb.json() or {}).get("trbxes") or [] if tb.ok else [])
    ]
    qs = list(Order.objects.filter(channel="wb").filter(Q(ext_id__in=order_ids) | Q(supply_id=sid)))
    refresh(qs)
    qs.sort(key=lambda o: o.ordered or o.created)
    now = timezone.now()
    rows = [row(o, now) for o in qs]
    picked_all = bool(qs) and all(o.assembled_at for o in qs)
    closed = bool(sup.get("closedAt") or sup.get("done"))
    step = 3 if closed else (2 if picked_all or boxes else 1)
    return {
        "supply": _supply(sup),
        "orders": rows,
        "boxes": boxes,
        "picking": picking(rows),
        "picked_all": picked_all,
        "step": step,
    }


def boxes_add(sid: str, amount: int, actor: Any) -> dict:
    sid = _sid(sid)
    n = max(1, min(int(amount or 1), 1000))
    r = C.wb("POST", f"/api/v3/supplies/{sid}/trbx", json={"amount": n}, write=True)
    j = C.must("wb", r, "WB yuk joyi yaratmadi") or {}
    log(actor, "wb", sid, "trbx_add", {"amount": n})
    return {"trbxIds": j.get("trbxIds") or []}


def boxes_delete(sid: str, ids: list[str], actor: Any) -> dict:
    sid = _sid(sid)
    r = C.wb("DELETE", f"/api/v3/supplies/{sid}/trbx", json={"trbxIds": [str(x) for x in ids]}, write=True)
    C.must("wb", r, "WB yuk joyini o'chirmadi")
    log(actor, "wb", sid, "trbx_delete", {"ids": ids})
    return {"ok": True}


def box_stickers(sid: str, ids: list[str]) -> dict:
    r = C.wb(
        "POST",
        f"/api/v3/supplies/{_sid(sid)}/trbx/stickers",
        params={"type": "png"},
        json={"trbxIds": [str(x) for x in ids]},
    )
    j = C.must("wb", r, "WB yuk joyi stikerini bermadi") or {}
    return {"files": [x.get("file") for x in j.get("stickers") or [] if x.get("file")]}


def order_stickers(order_ids: list[str]) -> dict:
    """Buyurtma stikerlari 58×40 png (WB: 100 tadan)."""
    out = []
    ids = [str(x) for x in order_ids]
    for i in range(0, len(ids), 100):
        r = C.wb(
            "POST",
            "/api/v3/orders/stickers",
            params={"type": "png", "width": 58, "height": 40},
            json={"orders": [int(x) for x in ids[i : i + 100]]},
        )
        j = C.must("wb", r, "WB stiker bermadi") or {}
        out += [
            {"id": str(x.get("orderId")), "file": x.get("file"), "partA": x.get("partA"), "partB": x.get("partB")}
            for x in j.get("stickers") or []
        ]
    return {"stickers": out}

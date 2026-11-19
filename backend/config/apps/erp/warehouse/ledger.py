"""Harakatlar jurnali (stock movement ledger): birlik (Unit) qayerda va qaysi koddan o'zgarmasin — signal o'zgarishni
o'chmaydigan StockMove yozuviga aylantiradi. Amal nomi, hujjat, sabab va muallif — kontekstdan (`op()`):

    with ledger.op("place", author=user.tg_id, author_name=user.name):   # API so'rovi (views.wh) — avtomatik
        ...
    ledger.bind(op=d.kind, doc=d)                                         # hujjat o'tkazilganda (doc_post)

Kontekstsiz o'zgarish (import, demo, boshqa app servisi) — `op="system"`. Qoldiq: sanashda kutilayotgan (`pending`)
birlik hisobda emas — uning miqdori 0 deb olinadi; shuning uchun har birlik uchun Σ delta = joriy qoldiq."""

from __future__ import annotations

import contextvars
from collections.abc import Callable, Generator
from contextlib import contextmanager
from decimal import Decimal
from functools import wraps
from typing import Any

from django.db.models.signals import post_delete, post_save, pre_save
from django.utils import timezone

from .models import Cell, Doc, StockMove, Unit

ZERO = Decimal(0)
_ctx: contextvars.ContextVar[dict[str, Any] | None] = contextvars.ContextVar("wh_ledger", default=None)

#: amal nomlari (UI): op → o'zbekcha
OPS: dict[str, str] = {
    "opening": "Boshlang'ich holat",
    "initial": "Boshlang'ich qoldiq",
    "place": "Joylashtirish",
    "place_undo": "Joylashtirishni bekor qilish",
    "units_loc": "Joyni o'zgartirish",
    "units": "Sanashda topildi",
    "unit_drop": "Kutilayotgan birlik o'chirildi",
    "acceptance": "Qabul",
    "inventory": "Inventarizatsiya",
    "cut": "Kesish",
    "transfer": "Ko'chirish (yo'lga chiqdi)",
    "transfer_receive": "Ko'chirish — qabul qilindi",
    "writeoff": "Hisobdan chiqarish",
    "sale": "Jo'natish",
    "pick_ship": "Yig'ish — jo'natish",
    "return": "Mijozdan qaytarish",
    "produce": "Ishlab chiqarish",
    "consume": "Sexga sarf",
    "unconsume": "Sexdan qaytarish",
    "set_qty": "Qoldiqni o'rnatish (import)",
    "drop": "Tovar o'chirildi",
    "system": "Tizim",
}


@contextmanager
def op(
    name: str, *, author: int | None = None, author_name: str = "", doc: Doc | None = None, reason: str = ""
) -> Generator[dict[str, Any]]:
    """Amal konteksti; ichma-ich bo'lsa — muallif tashqaridan meros olinadi."""
    cur = _ctx.get() or {}
    new = {
        "op": name,
        "author": author if author is not None else cur.get("author"),
        "author_name": author_name or cur.get("author_name", ""),
        "doc": doc,
        "reason": reason,
    }
    token = _ctx.set(new)
    try:
        yield new
    finally:
        _ctx.reset(token)


def bind(**kw: Any) -> None:
    """Joriy kontekstni aniqlashtirish (masalan hujjat o'tkazilganda: op=d.kind, doc=d)."""
    cur = _ctx.get()
    if cur is not None:
        cur.update(kw)


def tracked(name: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Servis funksiyasi (boshqa app'lar chaqiradi) — o'z amal nomi bilan."""

    def deco(fn: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(fn)
        def inner(*a: Any, **kw: Any) -> Any:
            with op(name):
                return fn(*a, **kw)

        return inner

    return deco


# ---------------------------------------------------------------- signallar
def _eff(qty: Any, pending: bool) -> Decimal:
    return ZERO if pending else Decimal(qty or 0)


def _code(loc_id: int | None) -> str:
    return (Cell.objects.filter(pk=loc_id).values_list("code", flat=True).first() or "") if loc_id else ""


def _write(u: Unit, before: dict[str, Any] | None, after: dict[str, Any] | None) -> None:
    b = before or {"qty": ZERO, "pending": True, "warehouse_id": None, "loc_id": None}
    a = after or {"qty": ZERO, "pending": True, "warehouse_id": b["warehouse_id"], "loc_id": None}
    q0, q1 = _eff(b["qty"], b["pending"]), _eff(a["qty"], a["pending"])
    if q0 == q1 and b["warehouse_id"] == a["warehouse_id"] and b["loc_id"] == a["loc_id"]:
        return  # qoldiq va joy o'zgarmagan (masalan kesish tarixi, izoh)
    ctx = _ctx.get() or {}
    doc = ctx.get("doc")
    StockMove.objects.create(
        at=timezone.now(),
        op=ctx.get("op") or "system",
        unit=u if after is not None else None,
        unit_code=u.code or "",
        item_id=u.item_id,
        char_id=u.char_id,
        firm=u.firm,
        delta=q1 - q0,
        qty_after=q1,
        wh_from_id=b["warehouse_id"],
        wh_to_id=a["warehouse_id"],
        loc_from_id=b["loc_id"],
        loc_to_id=a["loc_id"],
        loc_from_code=_code(b["loc_id"]),
        loc_to_code=_code(a["loc_id"]),
        doc=doc if isinstance(doc, Doc) and doc.pk else None,
        doc_number=(doc.number or "") if isinstance(doc, Doc) else "",
        reason=str(ctx.get("reason") or "")[:255],
        author=ctx.get("author"),
        author_name=str(ctx.get("author_name") or "")[:120],
    )


FIELDS = ("qty", "pending", "warehouse_id", "loc_id")


def _state(u: Unit) -> dict[str, Any]:
    return {f: getattr(u, f) for f in FIELDS}


def _pre_save(sender: type[Unit], instance: Unit, **kw: Any) -> None:
    before = Unit.objects.filter(pk=instance.pk).values(*FIELDS).first() if instance.pk else None
    instance.__dict__["_ledger_before"] = before  # post_save — oldingi holat


def _post_save(sender: type[Unit], instance: Unit, created: bool, **kw: Any) -> None:
    if kw.get("raw"):
        return  # fixture yuklash
    _write(instance, instance.__dict__.pop("_ledger_before", None), _state(instance))


def _post_delete(sender: type[Unit], instance: Unit, **kw: Any) -> None:
    _write(instance, _state(instance), None)


def connect() -> None:
    pre_save.connect(_pre_save, sender=Unit, dispatch_uid="wh_ledger_pre")
    post_save.connect(_post_save, sender=Unit, dispatch_uid="wh_ledger_post")
    post_delete.connect(_post_delete, sender=Unit, dispatch_uid="wh_ledger_del")


# ---------------------------------------------------------------- o'qish
def moves(
    *,
    unit_id: int | None = None,
    item_id: int | None = None,
    loc_id: int | None = None,
    doc_id: int | None = None,
    warehouse_id: int | None = None,
    op_name: str | None = None,
    before_id: int | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    from django.db.models import Q

    qs = StockMove.objects.select_related("wh_from", "wh_to")
    if unit_id:
        qs = qs.filter(unit_id=unit_id)
    if item_id:
        qs = qs.filter(item_id=item_id)
    if loc_id:
        qs = qs.filter(Q(loc_from_id=loc_id) | Q(loc_to_id=loc_id))
    if doc_id:
        qs = qs.filter(doc_id=doc_id)
    if warehouse_id:
        qs = qs.filter(Q(wh_from_id=warehouse_id) | Q(wh_to_id=warehouse_id))
    if op_name:
        qs = qs.filter(op=op_name)
    if before_id:
        qs = qs.filter(id__lt=before_id)
    return [
        {
            "id": m.pk,
            "at": m.at.isoformat(),
            "op": m.op,
            "op_title": OPS.get(m.op, m.op),
            "unit_id": m.unit_id,
            "unit_code": m.unit_code or None,
            "item_id": m.item_id,
            "char_id": m.char_id,
            "firm": m.firm,
            "delta": float(m.delta),
            "qty_after": float(m.qty_after),
            "wh_from": m.wh_from.name if m.wh_from else None,
            "wh_to": m.wh_to.name if m.wh_to else None,
            "loc_from": m.loc_from_code or None,
            "loc_to": m.loc_to_code or None,
            "doc_id": m.doc_id,
            "doc_number": m.doc_number or None,
            "reason": m.reason,
            "author_name": m.author_name,
        }
        for m in qs[: max(1, min(limit, 200))]
    ]

"""CRM ↔ sex ↔ ombor (bitim hayotining ishlab chiqarish va jo'natish qismi; har app faqat `services` orqali):

- «Ishlab chiqarishda» ga kirdi → sexda tayyorlanadigan qatorlar uchun zakazlar (`workshop.open_jobs`); sex kerak
  bo'lmasa (hammasi tayyor tovar) — bitim darhol «Tayyor» ga;
- sex manbaning barcha zakazlarini tayyorladi → «Tayyor» (mijozga avtomatik xabar — sales.notify_ready);
- «Tayyor» ga kirdi → ombor yig'ish navbati (`warehouse.open_pick`) — omborchi skaner bilan yig'ib jo'natadi;
- ombor to'liq jo'natdi → «Jo'natildi / hujjatlar» (qolgan to'lov tushmagan bo'lsa — o'tmaydi, izoh qoladi);
- bitim yo'qotildi → boshlanmagan zakazlar va yig'ish navbati bekor.
Manba kaliti — `crm:<bitim id>`.
"""

from __future__ import annotations

import logging
from datetime import datetime, time
from decimal import Decimal

from django.utils import timezone

from config.apps.erp.warehouse import services as warehouse
from config.apps.erp.workshop import services as workshop
from config.apps.staff.services import user_names

from .models import Activity, Deal, StageKind

log = logging.getLogger(__name__)
PFX = "crm:"


def source(d: Deal) -> str:
    return f"{PFX}{d.pk}"


def _deal(src: str) -> Deal | None:
    if not src.startswith(PFX) or not src[len(PFX) :].isdigit():
        return None
    return Deal.objects.select_related("stage", "customer").filter(pk=int(src[len(PFX) :])).first()


def _note(d: Deal, text: str, now: datetime) -> None:
    Activity.objects.create(deal=d, kind="comment", ts=now, actor=None, text=text)


def _order_no(d: Deal) -> str:
    return d.buyer_order or f"#{d.pk}"


def _customer(d: Deal) -> str:
    return (d.customer.company or d.customer.name) if d.customer else (d.contact or d.title)


def to_production(d: Deal, now: datetime) -> None:
    """«Ishlab chiqarishda» ga kirganda: sex zakazlari; sex kerak bo'lmasa — «Tayyor» ga."""
    from . import sales

    lines = [x for x in d.items or [] if x.get("item_id")]
    try:
        made = workshop.open_jobs(
            source=source(d),
            order_number=_order_no(d),
            customer=_customer(d),
            lines=lines,
            due=timezone.make_aware(datetime.combine(d.close_date, time(18))) if d.close_date else None,
            seller_name=user_names([d.owner_tg]).get(d.owner_tg, "") if d.owner_tg else "",
            note=d.need[:500],
            firm={"novobelt": "NVB", "belting": "BLT"}.get(d.division, ""),
        )
    except workshop.Bad as e:
        _note(d, f"Sex zakazi ochilmadi: {e} — bitim tovarlarini tekshiring.", now)
        return
    if made:
        _note(d, f"Sexga {len(made)} ta zakaz berildi — tayyor bo'lgach bitim avtomatik «Tayyor» ga o'tadi.", now)
        return
    if workshop.status(source(d)):
        return  # zakazlar avval ochilgan (bitim qaytib kirgan)
    if not lines:
        return
    free = warehouse.free({int(x["item_id"]) for x in lines})
    short = [
        x.get("name") or f"#{x['item_id']}"
        for x in lines
        if free.get((int(x["item_id"]), x.get("char_id") or None), Decimal(0)) < Decimal(str(x.get("qty") or 0))
    ]
    if short:
        _note(
            d,
            "Sex kerak emas, lekin omborda yetarli emas: " + ", ".join(short[:5]) + " — kelgach «Tayyor» ga o'tkazing.",
            now,
        )
        return
    sales.advance(sales.ROBOT, d, "ready", now, "sexda tayyorlanadigan tovar yo'q, hammasi omborda bor")


def to_ready(d: Deal, now: datetime) -> None:
    """«Tayyor» ga kirganda: ombor yig'ish navbati (bitim tovarlari)."""
    lines = [
        {"item_id": x["item_id"], "char_id": x.get("char_id"), "qty": x.get("qty")}
        for x in d.items or []
        if x.get("item_id")
    ]
    try:
        pid = warehouse.open_pick(
            source=source(d),
            number=_order_no(d),
            customer=_customer(d),
            lines=lines,
            firm={"novobelt": "NVB", "belting": "BLT"}.get(d.division) or None,
        )
    except warehouse.Bad as e:
        _note(d, f"Ombor yig'ish navbatiga qo'shilmadi: {e}", now)
        return
    if pid:
        _note(d, "Omborga yig'ish uchun berildi — jo'natilgach bitim avtomatik «Jo'natildi» ga o'tadi.", now)


def closed(d: Deal) -> None:
    """Bitim yo'qotildi: boshlanmagan sex zakazlari va yig'ish navbati bekor."""
    src = source(d)
    n = workshop.cancel(src)
    m = warehouse.close_pick(src)
    if n or m:
        _note(d, f"Bitim yopildi: {n} ta sex zakazi va {m} ta yig'ish buyurtmasi bekor qilindi.", timezone.now())


def on_enter(d: Deal, now: datetime) -> None:
    """sales.on_enter dan: bosqichga kirgandagi ishlab chiqarish/ombor amallari."""
    if d.stage_id == "production":
        to_production(d, now)
    elif d.stage_id == "ready":
        to_ready(d, now)
    elif d.stage.kind == StageKind.LOST:
        closed(d)


# ---------------------------------------------------------------- sex va ombor hodisalari
def shop_ready(src: str) -> None:
    from . import sales

    d = _deal(src)
    if d is None:
        return
    now = timezone.now()
    if not sales.advance(sales.ROBOT, d, "ready", now, "sex barcha zakazlarni tayyorladi"):
        _note(d, "Sex barcha zakazlarni tayyorladi.", now)


def shipped(src: str, number: str) -> None:
    from . import sales

    d = _deal(src)
    if d is None:
        return
    now = timezone.now()
    if not sales.advance(sales.ROBOT, d, "shipping", now, f"ombor jo'natdi ({number})"):
        _note(d, f"Ombor jo'natdi ({number}). Bitim «Jo'natildi» ga o'tmadi — qolgan to'lovni tekshiring.", now)


def register() -> None:
    workshop.on_ready(shop_ready)
    warehouse.on_shipped(shipped)

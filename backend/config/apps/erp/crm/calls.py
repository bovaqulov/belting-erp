"""Telefon qo'ng'iroqlari: mijoz bo'yicha tarix, qo'lda yozish va IP-telefoniya webhook'i (umumiy format).

Webhook (`POST erp/crm/calls/webhook`, sarlavha `X-Calls-Token` = CRM_CALLS_TOKEN) — har qanday ATS (OnlinePBX, Sipuni,
Zadarma, Asterisk …) qo'ng'iroq tugaganda shu formatda yuboradi (yoki oraliq skript moslab):
    {id, phone, direction: in|out, status: answered|missed|busy, duration (soniya), started_at (ISO), recording_url?,
     operator? (sotuvchi Telegram ID yoki ichki raqam — CRM_CALLS_OPERATORS da)}
Raqam bo'yicha mijoz topiladi (oxirgi 9 raqam), ochiq bitim bo'lsa — bitim tarixiga «Qo'ng'iroq» yoziladi. `id` takrorlansa —
yangilanadi (ikki marta yozilmaydi).
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from config.apps.core.http import ApiError

from .access import Me
from .deals import digits, get_customer, int_or_none, iso, s
from .models import Activity, Call, Customer, Deal, StageKind

DIRS = ("in", "out")
STATUSES = ("answered", "missed", "busy")


def call_json(c: Call) -> dict[str, Any]:
    return {
        "id": c.pk,
        "phone": c.phone,
        "direction": c.direction,
        "status": c.status,
        "started": iso(c.started),
        "duration": c.duration,
        "recording_url": c.recording_url or None,
        "owner_tg": c.owner_tg,
        "note": c.note or None,
        "source": c.source,
        "deal_id": c.deal_id,
    }


def history(me: Me, customer_id: int) -> list[dict[str, Any]]:
    """Mijoz qo'ng'iroqlari (oxirgi 50): rahbar — hammasi, sotuvchi — o'zi gaplashgani va o'z mijozlari."""
    c = get_customer(me, customer_id)
    qs = Call.objects.filter(customer=c)
    if not me.is_head and c.owner_tg != me.tg_id:
        qs = qs.filter(owner_tg=me.tg_id)
    return [call_json(x) for x in qs[:50]]


def _norm_phone(v: Any) -> str:
    p = digits(v)
    return ("998" + p if len(p) == 9 else p)[:20]


def _open_deal(c: Customer | None) -> Deal | None:
    if c is None:
        return None
    return Deal.objects.filter(customer=c, stage__kind=StageKind.OPEN).order_by("-updated").first()


def _activity(call: Call, actor: int | None) -> None:
    if call.deal is None:
        return
    mins = f"{call.duration // 60}:{call.duration % 60:02d}"
    what = {"in": "Kiruvchi", "out": "Chiquvchi"}[call.direction]
    res = {"answered": f"gaplashildi {mins}", "missed": "javob berilmadi", "busy": "band"}[call.status]
    Activity.objects.create(
        deal=call.deal,
        kind="call",
        ts=call.started,
        actor=actor,
        text=f"{what} qo'ng'iroq +{call.phone}: {res}" + (f" — {call.note}" if call.note else ""),
        data={"call_id": call.pk, "recording": call.recording_url or None},
    )


@transaction.atomic
def log_manual(me: Me, b: dict[str, Any], now: datetime) -> dict[str, Any]:
    """Qo'lda yozish: {customer_id, deal_id?, phone?, direction, status, duration (soniya), note, started?}."""
    c = get_customer(me, b.get("customer_id"))
    phone = _norm_phone(b.get("phone")) or (c.phones[0] if c.phones else "")
    if not phone:
        raise ApiError(400, "Telefon raqami yo'q — mijozga telefon qo'shing yoki raqamni yozing.")
    direction, status = s(b.get("direction")) or "out", s(b.get("status")) or "answered"
    if direction not in DIRS or status not in STATUSES:
        raise ApiError(400, "Qo'ng'iroq turi yoki natijasi noto'g'ri.")
    started = parse_datetime(s(b.get("started"))) if b.get("started") else None
    deal = Deal.objects.filter(pk=int_or_none(b.get("deal_id")) or 0, customer=c).first() or _open_deal(c)
    call = Call.objects.create(
        customer=c,
        deal=deal,
        phone=phone,
        direction=direction,
        status=status,
        started=started or now,
        duration=max(0, int_or_none(b.get("duration")) or 0) if status == "answered" else 0,
        owner_tg=me.tg_id,
        note=s(b.get("note")).strip()[:2000],
        source="manual",
    )
    _activity(call, me.tg_id)
    return call_json(call)


def _operator(v: Any) -> int | None:
    """Operator: Telegram ID yoki ichki raqam (CRM_CALLS_OPERATORS: {"101": 5574861580})."""
    raw = s(v).strip()
    if not raw:
        return None
    try:
        mapping = json.loads(settings.CRM_CALLS_OPERATORS or "{}")
    except ValueError:
        mapping = {}
    if raw in mapping:
        return int_or_none(mapping[raw])
    n = int_or_none(raw)
    return n if n and n > 100000 else None


@transaction.atomic
def from_pbx(b: dict[str, Any], now: datetime) -> dict[str, Any]:
    """IP-telefoniya webhook'i (umumiy format, moduldagi izohga qarang)."""
    from .sales import find_customer

    phone = _norm_phone(b.get("phone"))
    if len(phone) < 9:
        raise ApiError(400, "phone — telefon raqami kerak.")
    direction = s(b.get("direction")) if s(b.get("direction")) in DIRS else "in"
    status = s(b.get("status")) if s(b.get("status")) in STATUSES else "answered"
    started = parse_datetime(s(b.get("started_at"))) or now
    if timezone.is_naive(started):
        started = timezone.make_aware(started)
    c = find_customer(phone, "")
    deal = _open_deal(c)
    owner = _operator(b.get("operator")) or (deal.owner_tg if deal else None) or (c.owner_tg if c else None)
    ext = s(b.get("id"))[:80]
    fields = {
        "customer": c,
        "deal": deal,
        "phone": phone,
        "direction": direction,
        "status": status,
        "started": started,
        "duration": max(0, int_or_none(b.get("duration")) or 0),
        "recording_url": s(b.get("recording_url"))[:500] if s(b.get("recording_url")).startswith("https://") else "",
        "owner_tg": owner,
        "source": (s(b.get("provider")) or "pbx")[:20],
    }
    old = Call.objects.filter(ext_id=ext).first() if ext else None
    if old is not None:
        for k, v in fields.items():
            setattr(old, k, v)
        old.save()
        return call_json(old)
    call = Call.objects.create(ext_id=ext, **fields)
    _activity(call, owner)
    return call_json(call)

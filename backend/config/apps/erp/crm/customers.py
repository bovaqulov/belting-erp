"""Mijozlar: jadval (xaridlar soni/summasi, oxirgi va keyingi kutilgan xarid, ochiq bitimlar) va kartochka (rekvizit,
kontakt shaxslar, izoh, statistika, bitimlar, Telegram chatlari). Xarid — Savdo voronkasida «Tovar jo'natildi» yoki
«Bitim muvaffaqiyatli» (tunnel nusxalari emas). Keyingi xarid — xaridlar oralig'i medianasi (robots.repeat_sales bilan bir xil).
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from itertools import pairwise
from typing import Any

from django.db.models import Count, Q, QuerySet, Sum
from django.utils import timezone

from config.apps.core.http import ApiError

from .access import Me
from .deals import digits, int_or_none, iso, money, s
from .models import Customer, Deal, StageKind, TgChat

BOUGHT = ("shipping", "won")  # Savdo voronkasi: tovar olingan
REPEAT_DEFAULT = 60  # kun — bitta xarid bo'lsa
REPEAT_RANGE = (60, 90)  # takroriy buyurtma eslatmasi — 60–90 kun (egasi qoidasi)
PAGE = 100


def repeat_cycle(dates: list[date]) -> int:
    """Xaridlar oralig'i (kun): medianasi, 60–90 kun oralig'ida; bitta xarid — REPEAT_DEFAULT (60)."""
    ds = sorted(dates)
    gaps = [(b - a).days for a, b in pairwise(ds) if (b - a).days > 0]
    if not gaps:
        return REPEAT_DEFAULT
    return max(REPEAT_RANGE[0], min(REPEAT_RANGE[1], int(statistics.median(gaps))))


def bought_q(prefix: str = "") -> Q:
    return Q(**{f"{prefix}stage_id__in": BOUGHT, f"{prefix}parent__isnull": True})


def buy_date(d: Deal) -> date:
    return timezone.localdate(d.closed or d.stage_since)


def _purchases(ids: list[int]) -> dict[int, list[date]]:
    out: dict[int, list[date]] = defaultdict(list)
    for d in Deal.objects.filter(bought_q(), customer_id__in=ids).only("customer_id", "closed", "stage_since"):
        out[d.customer_id or 0].append(buy_date(d))
    return out


def _next(dates: list[date]) -> tuple[int | None, date | None]:
    if not dates:
        return None, None
    cycle = repeat_cycle(dates)
    return cycle, max(dates) + timedelta(days=cycle)


def _scope(me: Me) -> QuerySet[Customer]:
    return me.customers(Customer.objects.all())


def get(me: Me, pk: int) -> Customer:
    c = _scope(me).filter(pk=pk).first()
    if c is None:
        raise ApiError(404, "Mijoz topilmadi")
    return c


def table(me: Me, q: dict[str, str], now: datetime) -> dict[str, Any]:
    qs = _scope(me)
    if t := (q.get("q") or "").strip():
        cond = Q(name__icontains=t) | Q(inn__icontains=t) | Q(contacts__icontains=t)
        if len(dg := digits(t)) >= 4:
            cond |= Q(phones__icontains=dg)
        qs = qs.filter(cond)
    if owner := q.get("owner"):
        qs = qs.filter(owner_tg=int(owner)) if owner.isdigit() else qs.none()
    qs = qs.annotate(
        bought_n=Count("deals", filter=bought_q("deals__"), distinct=True),
        bought_sum=Sum("deals__amount", filter=bought_q("deals__")),
        open_n=Count(
            "deals",
            filter=Q(deals__stage__kind=StageKind.OPEN, deals__stage__pipeline_id="main")
            & ~Q(deals__stage_id__in=BOUGHT),
            distinct=True,
        ),
    )
    rows = list(qs)
    buys = _purchases([c.pk for c in rows])
    today = timezone.localdate(now)
    out: list[dict[str, Any]] = []
    for c in rows:
        dates = buys.get(c.pk, [])
        cycle, nxt = _next(dates)
        out.append(
            {
                "id": c.pk,
                "name": c.name,
                "inn": c.inn or None,
                "phones": list(c.phones or []),
                "owner_tg": c.owner_tg,
                "bought_n": c.bought_n,
                "bought_sum": money(c.bought_sum or Decimal(0)),
                "last_buy": max(dates).isoformat() if dates else None,
                "cycle": cycle,
                "next_buy": nxt.isoformat() if nxt else None,
                "overdue": bool(nxt and nxt < today and not c.open_n),
                "open_n": c.open_n,
            }
        )
    sort = q.get("sort") or "next"
    if sort == "name":
        out.sort(key=lambda r: r["name"].lower())
    elif sort == "sum":
        out.sort(key=lambda r: -Decimal(r["bought_sum"]))
    elif sort == "last":
        out.sort(key=lambda r: r["last_buy"] or "", reverse=True)
    else:  # keyingi xarid yaqinlari tepada (kutilmaganlar — oxirida)
        out.sort(key=lambda r: (r["next_buy"] is None, r["next_buy"] or "", r["name"].lower()))
    off = int_or_none(q.get("offset")) or 0
    return {"rows": out[off : off + PAGE], "total": len(out), "overdue": sum(1 for r in out if r["overdue"])}


def card(me: Me, pk: int, now: datetime) -> dict[str, Any]:
    c = get(me, pk)
    deals = list(me.deals(Deal.objects.filter(customer=c).select_related("stage")).order_by("-created"))
    dates = [buy_date(d) for d in Deal.objects.filter(bought_q(), customer=c)]
    cycle, nxt = _next(dates)
    total = sum((d.amount for d in Deal.objects.filter(bought_q(), customer=c)), Decimal(0))
    return {
        "id": c.pk,
        "name": c.name,
        "inn": c.inn or None,
        "phones": list(c.phones or []),
        "owner_tg": c.owner_tg,
        "contacts": list(c.contacts or []),
        "note": c.note or "",
        "created": iso(c.created),
        "stats": {
            "bought_n": len(dates),
            "bought_sum": money(total),
            "last_buy": max(dates).isoformat() if dates else None,
            "cycle": cycle,
            "next_buy": nxt.isoformat() if nxt else None,
        },
        "deals": [
            {
                "id": d.pk,
                "title": d.title,
                "stage": d.stage_id,
                "pipeline": d.stage.pipeline_id,
                "kind": d.stage.kind,
                "amount": money(d.amount),
                "created": iso(d.created),
                "owner_tg": d.owner_tg,
                "repeat": d.repeat,
            }
            for d in deals
        ],
        # Telegram — faqat o'z chatlari (yozishmalar shaxsiy)
        "tg": [
            {"id": x.pk, "title": x.title, "username": x.username or None, "unread": x.unread}
            for x in TgChat.objects.people().filter(customer=c, connection__user_tg=me.tg_id)
        ],
    }


def _contacts(raw: Any) -> list[dict[str, str]]:
    if not isinstance(raw, list):
        raise ApiError(400, "Kontaktlar ro'yxat ko'rinishida bo'lsin.")
    out: list[dict[str, Any]] = []
    for x in raw[:30]:
        if not isinstance(x, dict):
            continue
        name = s(x.get("name")).strip()[:120]
        phone = digits(x.get("phone"))
        if not name and not phone:
            continue
        out.append(
            {
                "name": name,
                "role": s(x.get("role")).strip()[:80],
                "phone": ("998" + phone if len(phone) == 9 else phone)[:20],
            }
        )
    return out


def update(me: Me, pk: int, b: dict[str, Any]) -> None:
    c = get(me, pk)
    fields: list[str] = []
    if "name" in b:
        name = s(b["name"]).strip()[:255]
        if not name:
            raise ApiError(400, "Mijoz nomi bo'sh bo'lmasin.")
        c.name = name
        fields.append("name")
    if "inn" in b:
        inn = digits(b["inn"])
        if inn and len(inn) not in (9, 14):
            raise ApiError(400, "STIR 9 xonali (yuridik) yoki JSHSHIR 14 xonali bo'lsin.")
        c.inn = inn
        fields.append("inn")
    if "phones" in b:
        if not isinstance(b["phones"], list):
            raise ApiError(400, "Telefonlar ro'yxat ko'rinishida bo'lsin.")
        c.phones = [("998" + p if len(p) == 9 else p)[:20] for p in (digits(x) for x in b["phones"]) if p]
        fields.append("phones")
    if "contacts" in b:
        c.contacts = _contacts(b["contacts"])
        fields.append("contacts")
    if "note" in b:
        c.note = s(b["note"])
        fields.append("note")
    if "owner_tg" in b and int_or_none(b["owner_tg"]) != c.owner_tg:
        if not me.is_head:
            raise ApiError(403, "Mijoz mas'ulini faqat sotuv bo'limi rahbari o'zgartiradi")
        c.owner_tg = int_or_none(b["owner_tg"])
        fields.append("owner_tg")
    if fields:
        c.save(update_fields=fields)

"""CRM appining ochiq interfeysi (boshqa applar faqat shu orqali): Telegram Business ulanishi; mijozlar xaritasi (GeoMaps)
uchun mijozlar va xaridlari, mas'ulni ommaviy almashtirish."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any

from django.db.models import Q
from django.utils import timezone

from .models import Channel, Customer, Deal, StageKind, TgConnection


def business_connection(user_tg: int) -> dict[str, Any] | None:
    """Xodimning Telegram Business ulanishi (BUSINESS_CONNECTION_BOT_TOKEN boti): {id, can_reply, enabled}.
    TG CRM AI yordamchisi egasi nomidan shu ulanish orqali javob yozadi (Bot API `business_connection_id`)."""
    c = (
        TgConnection.objects.filter(user_tg=user_tg, channel=Channel.TG, is_enabled=True)
        .order_by("-updated_at")
        .first()
    )
    if c is None:
        return None
    return {"id": c.pk, "can_reply": c.can_reply, "enabled": c.is_enabled}


# ---------------------------------------------------------------- mijozlar xaritasi (GeoMaps)
def map_customers() -> list[dict[str, Any]]:
    """Har mijoz: {id, name, kind, inn, address, owner_tg, sales_12m, sales_count, last_sale (date|None), deals_open}.
    Xarid — «Jo'natishga»/«Yutildi» bosqichidagi asosiy bitim (customers.bought_q); 12 oy — xarid sanasi bo'yicha."""
    from .customers import bought_q, buy_date

    since = timezone.localdate() - timedelta(days=365)
    stats: dict[int, dict[str, Any]] = {}
    for d in Deal.objects.filter(bought_q(), customer__isnull=False).only(
        "customer_id", "amount", "closed", "stage_since"
    ):
        s = stats.setdefault(d.customer_id or 0, {"sum": Decimal(0), "n": 0, "last": None})
        day = buy_date(d)
        if day >= since:
            s["sum"] += d.amount
            s["n"] += 1
        s["last"] = max(s["last"], day) if s["last"] else day
    open_n: dict[int, int] = {}
    for cid in Deal.objects.filter(
        Q(stage__kind=StageKind.OPEN), customer__isnull=False, parent__isnull=True
    ).values_list("customer_id", flat=True):
        open_n[cid] = open_n.get(cid, 0) + 1
    out = []
    for c in Customer.objects.all().only("id", "name", "kind", "inn", "company_inn", "address", "owner_tg"):
        s = stats.get(c.pk, {})
        out.append(
            {
                "id": c.pk,
                "name": c.name,
                "kind": c.kind,
                "inn": c.inn or c.company_inn or "",
                "address": c.address,
                "owner_tg": c.owner_tg,
                "sales_12m": float(s.get("sum") or 0),
                "sales_count": int(s.get("n") or 0),
                "last_sale": s.get("last"),
                "deals_open": open_n.get(c.pk, 0),
            }
        )
    return out


def set_customers_owner(ids: Iterable[int], owner_tg: int) -> int:
    """Mijozlar mas'ulini almashtirish (xaritadagi ommaviy amal) → nechta yangilandi."""
    return Customer.objects.filter(pk__in=list(ids)).update(owner_tg=owner_tg)


# ---------------------------------------------------------------- analitika
def sales_summary(d1: date, d2: date) -> dict[str, Any]:
    """Davr [d1, d2] bo'yicha savdo (CRM «Hisobot» ta'riflari bilan bir xil: asosiy voronka, bosh bitim, xarid —
    «Jo'natishga»/«Yutildi», sana — buy_date): sotuv summasi va soni, kunlar bo'yicha, sotuvchilar, lidlar va
    konversiya, yangi bitimlar, yo'qotilganlar, ochiq voronka (hozir)."""
    from .customers import BOUGHT, buy_date
    from .models import Lead, LeadStatus

    tz = timezone.get_current_timezone()
    t1 = timezone.make_aware(datetime.combine(d1, time.min), tz)
    t2 = timezone.make_aware(datetime.combine(d2 + timedelta(days=1), time.min), tz)
    main = Deal.objects.filter(stage__pipeline_id="main", parent__isnull=True)
    bought = [d for d in main.filter(stage_id__in=BOUGHT) if d1 <= buy_date(d) <= d2]
    by_day: dict[date, Decimal] = {}
    sellers: dict[int | None, list[Decimal]] = {}
    for d in bought:
        day = buy_date(d)
        by_day[day] = by_day.get(day, Decimal(0)) + d.amount
        sellers.setdefault(d.owner_tg, []).append(d.amount)
    leads = list(Lead.objects.filter(created__gte=t1, created__lt=t2).values_list("status", "source"))
    sources: dict[str, int] = {}
    for _st, src in leads:
        sources[src or "manual"] = sources.get(src or "manual", 0) + 1
    open_q = main.filter(stage__kind=StageKind.OPEN).exclude(stage_id__in=BOUGHT)
    days = (d2 - d1).days + 1
    return {
        "won_sum": float(sum((d.amount for d in bought), Decimal(0))),
        "won_n": len(bought),
        "by_day": [
            {"date": (d1 + timedelta(days=i)).isoformat(), "sum": float(by_day.get(d1 + timedelta(days=i), 0))}
            for i in range(days)
        ],
        "sellers": [
            {"tg_id": tg, "sum": float(sum(xs, Decimal(0))), "n": len(xs)}
            for tg, xs in sorted(sellers.items(), key=lambda kv: -sum(kv[1], Decimal(0)))
        ],
        "leads_n": len(leads),
        "leads_converted": sum(1 for st, _ in leads if st == LeadStatus.CONVERTED),
        "lead_sources": sources,
        "deals_new": main.filter(created__gte=t1, created__lt=t2).count(),
        "deals_lost": main.filter(stage__kind=StageKind.LOST, closed__gte=t1, closed__lt=t2).count(),
        "open_n": open_q.count(),
        "open_sum": float(sum(open_q.values_list("amount", flat=True), Decimal(0))),
        "customers_new": Customer.objects.filter(created__gte=t1, created__lt=t2).count(),
    }


# ------------------------------------------------------------------ savdo hujjatlari uchun (erp/sales)
def sales_role(user: Any) -> tuple[bool, bool]:
    """(rahbariyat, sotuv bo'limi rahbari) — narx siyosati chegirmasi va hujjatlar ko'rinishi uchun."""
    from .access import is_sales_head

    return bool(user.is_panel or user.in_lead_dept()), is_sales_head(user)


def _cust_json(c: Customer) -> dict[str, Any]:
    return {
        "id": c.pk,
        "name": c.name,
        "inn": c.inn or c.company_inn or None,
        "company": c.company or None,
        "phones": list(c.phones or []),
        "address": c.address or None,
        "contacts": list(c.contacts or []),
        "owner_tg": c.owner_tg,
    }


def customers_for(user: Any, q: str = "", limit: int = 20) -> list[dict[str, Any]]:
    """Mijoz qidiruvi foydalanuvchi huquqi bilan (sotuvchi — o'z mijozlari, rahbar — hammasi): nom, STIR, telefon."""
    from .access import Me

    qs = Me.of(user).customers(Customer.objects.all())
    s = q.strip()
    if s:
        digits = "".join(ch for ch in s if ch.isdigit())
        cond = Q(name__icontains=s) | Q(company__icontains=s)
        if digits:
            cond |= Q(inn__startswith=digits) | Q(phones__icontains=digits)
        qs = qs.filter(cond)
    return [_cust_json(c) for c in qs.order_by("name")[:limit]]


def customer_card(customer_id: int) -> dict[str, Any] | None:
    c = Customer.objects.filter(pk=customer_id).first()
    return _cust_json(c) if c else None


def deal_brief(deal_id: int) -> dict[str, Any] | None:
    """Bitim: mijoz, tovar qatorlari, mas'ul, bosqich (savdo hujjatini bitimdan to'ldirish va jo'natish holati)."""
    d = Deal.objects.select_related("stage", "customer").filter(pk=deal_id).first()
    if d is None:
        return None
    return {
        "id": d.pk,
        "title": d.title,
        "customer_id": d.customer_id,
        "owner_tg": d.owner_tg,
        "stage": d.stage.code,
        "stage_name": d.stage.name,
        "items": list(d.items or []),
        "discount": str(d.discount),
        "shipped": d.stage.code in ("shipping", "won") or d.stage.kind == StageKind.WON,
    }

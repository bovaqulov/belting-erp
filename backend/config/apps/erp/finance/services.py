"""Moliya appining ochiq interfeysi (boshqa applar faqat shu orqali): mijoz shartnomalari (savdo hujjatlari)."""

from __future__ import annotations

from typing import Any

from .models import CKind, Contract


def contracts_for(inn: str, firm_id: int | None = None) -> list[dict[str, Any]]:
    """Kontragent STIRi bo'yicha faol sotuv/xizmat shartnomalari (firma berilsa — shu firmaniki): [{id, number, label}]."""
    inn = (inn or "").strip()
    if not inn:
        return []
    qs = Contract.objects.filter(active=True, counterparty__inn=inn, kind__in=(CKind.SALE, CKind.SERVICE))
    if firm_id:
        qs = qs.filter(firm_id=firm_id)
    return [
        {
            "id": c.pk,
            "number": c.number,
            "label": f"№ {c.number} от {c.date:%d.%m.%Y} ({c.currency})",
            "firm_id": c.firm_id,
            "pay_days": c.pay_days,
            "credit_limit": float(c.credit_limit) if c.credit_limit is not None else None,
        }
        for c in qs.order_by("-date")
    ]


def contract_label(contract_id: int) -> str:
    c = Contract.objects.filter(pk=contract_id).first()
    return f"№ {c.number} от {c.date:%d.%m.%Y} ({c.currency})" if c else ""


def suppliers(q: str = "", limit: int = 20) -> list[dict[str, Any]]:
    """Yetkazib beruvchilar (kontragent turi — yetkazib beruvchi yoki ikkalasi): [{id, name, inn}]."""
    from django.db.models import Q

    from .models import Counterparty, CpKind

    qs = Counterparty.objects.filter(kind__in=(CpKind.SUPPLIER, CpKind.BOTH))
    s = q.strip()
    if s:
        qs = qs.filter(Q(name__icontains=s) | Q(inn__startswith=s))
    return [{"id": c.pk, "name": c.name, "inn": c.inn or None} for c in qs.order_by("name")[:limit]]


def employees(q: str = "", limit: int = 20) -> list[dict[str, Any]]:
    """Maosh hisobidagi faol xodimlar: [{id, name, position}]."""
    from .models import Employee

    qs = Employee.objects.filter(active=True)
    if q.strip():
        qs = qs.filter(name__icontains=q.strip())
    return [{"id": e.pk, "name": e.name, "position": e.position or None} for e in qs.order_by("name")[:limit]]

"""Agent uchun faktlar: firma + agent bo'limi + suhbatdosh xodim (faqat faol)."""

from __future__ import annotations

from django.db.models import Q

from .models import Fact

LIMIT = 40


def facts_for(dept_key: str | None, tg_id: int | None) -> list[str]:
    q = Q(scope=Fact.Scope.FIRM)
    if dept_key:
        q |= Q(scope=Fact.Scope.DEPT, scope_key=dept_key)
    if tg_id:
        q |= Q(scope=Fact.Scope.STAFF, scope_key=str(tg_id))
    return list(Fact.objects.filter(q, status=Fact.Status.ACTIVE).values_list("text", flat=True)[:LIMIT])

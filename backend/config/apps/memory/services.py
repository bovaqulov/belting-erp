"""memory — ochiq interfeys (boshqa applar faqat shu orqali): agent uchun faktlar, faktlarni o'qish/qo'shish.

`prompt_context` jarvis'ga «memory» vositasi sifatida apps.ready() da ro'yxatdan o'tadi."""

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


def prompt_context(dept_key: str | None, tg_id: int | None, query: str) -> str | None:
    """jarvis system prompt bo'lagi («memory» vositasi)."""
    facts = facts_for(dept_key, tg_id)
    return "Firma xotirasi (ishonchli faktlar):\n" + "\n".join(f"- {f}" for f in facts) if facts else None


def active_fact_texts() -> list[str]:
    return list(Fact.objects.filter(status=Fact.Status.ACTIVE).order_by("pk").values_list("text", flat=True))


def fact_exists(text: str) -> bool:
    return Fact.objects.filter(text=text).exists()


def add_pending_fact(text: str, scope: str, scope_key: str, source: str) -> None:
    """Tasdiq kutadigan fakt (scope: firma | bolim | xodim)."""
    Fact.objects.create(text=text[:2000], scope=scope, scope_key=scope_key, status=Fact.Status.PENDING, source=source)

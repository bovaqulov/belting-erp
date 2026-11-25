"""staff — ochiq interfeys. Boshqa applar xodim va bo'limlarga faqat shu modul orqali murojaat qiladi
(`models`, `manage` — ichki). Mikroservisga ajratilganda shu funksiyalar HTTP/token bilan almashtiriladi.

`User`, `Role` — joriy foydalanuvchi (principal) turi: `@api` ko'rinishlariga keladi, uning metodlari
(`can_module`, `dept_keys`, `is_panel` …) ham ochiq interfeys qismi.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from django.db import transaction
from django.db.models import Count, QuerySet

from .manage import accept_invite, apply_pending_heads
from .models import Department, Role, User

__all__ = [
    "Role",
    "User",
    "accept_invite",
    "active_users",
    "apply_pending_heads",
    "department_keys",
    "department_name",
    "departments_info",
    "has_reports",
    "member_counts",
    "pending_count",
    "set_departments",
    "sync_departments",
    "user_by_tg",
    "user_names",
    "users_by_tg",
    "users_in_departments",
]

ACTIVE_ROLES = (Role.OWNER, Role.ADMIN, Role.EMPLOYEE)


# ---------------------------------------------------------------- xodimlar
def active_users() -> QuerySet[User]:
    return User.objects.filter(role__in=ACTIVE_ROLES)


def users_in_departments(keys: Iterable[str]) -> QuerySet[User]:
    """Shu bo'limlardagi faol xodimlar."""
    return active_users().filter(departments__key__in=list(keys)).distinct()


def user_by_tg(tg_id: int) -> User | None:
    return User.objects.filter(tg_id=tg_id).first()


def users_by_tg(ids: Iterable[int]) -> dict[int, User]:
    return {u.tg_id: u for u in User.objects.filter(tg_id__in=list(ids))}


def user_names(ids: Iterable[int]) -> dict[int, str]:
    return dict(User.objects.filter(tg_id__in=list(ids)).values_list("tg_id", "name"))


def has_reports(u: User) -> bool:
    """Xodimning qo'l ostidagilari bormi (rahbari shu odam bo'lgan xodim)."""
    return User.objects.filter(manager=u).exists()


def pending_count() -> int:
    return User.objects.filter(role=Role.PENDING).count()


def set_departments(u: User, keys: Iterable[str]) -> None:
    u.departments.set(Department.objects.filter(key__in=list(keys)))


# ---------------------------------------------------------------- bo'limlar
def department_keys() -> set[str]:
    return set(Department.objects.values_list("key", flat=True))


def department_name(key: str) -> str | None:
    return Department.objects.filter(key=key).values_list("name", flat=True).first()


def departments_info() -> dict[str, dict[str, Any]]:
    """Bo'lim kaliti → {key, name, name_ru, icon, color} (tartib bilan)."""
    return {
        d["key"]: d
        for d in Department.objects.order_by("position", "id").values("key", "name", "name_ru", "icon", "color")
    }


def member_counts() -> dict[str, int]:
    """Bo'lim kaliti → a'zolar soni."""
    return dict(Department.objects.annotate(n=Count("members")).values_list("key", "n"))


@transaction.atomic
def sync_departments(rows: list[dict[str, Any]]) -> None:
    """Bo'limlar ro'yxatini to'liq almashtiradi (jarvis bo'lim agentlaridan). Qator:
    {key, name, name_ru, icon, color, sees_all, position, parent (kalit yoki None)}. Ro'yxatda yo'q bo'lim o'chadi
    (a'zoligi bilan — avvalgi «bo'lim agenti o'chsa, a'zolik uziladi» xatti-harakati)."""
    keys = [r["key"] for r in rows]
    Department.objects.exclude(key__in=keys).delete()
    fields = ("name", "name_ru", "icon", "color", "sees_all", "position")
    made = {}
    for r in rows:
        made[r["key"]], _ = Department.objects.update_or_create(
            key=r["key"], defaults={f: r[f] for f in fields if f in r}
        )
    for r in rows:
        d, parent = made[r["key"]], made.get(r.get("parent") or "")
        if d.parent_id != (parent.pk if parent else None):
            d.parent = parent
            d.save(update_fields=["parent"])

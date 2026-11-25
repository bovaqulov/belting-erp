"""TelegramCRM huquqlari (docs/tgcrm/PLAN.md §4, 6-bosqich).

Modul — staff.MODULE_DEPTS["tgcrm"]. Akkauntdagi rol (`role_of`):
- firma raqami: sotuv rahbari — admin; a'zolar ro'yxatidagi — o'z roli; ro'yxat BO'SH bo'lsa — modulning hamma
  xodimi operator (oldingi xulq); ro'yxat bor, xodim unda yo'q — kirish yo'q;
- shaxsiy raqam: egasi — admin; ro'yxatdagi (yordamchi) — o'z roli; sotuv rahbari — faqat kuzatuvchi (sotuvchi nomidan
  yozmaydi — egasi qarori 2026-11-19).
Ko'rinmaydigan akkaunt — 404.
"""

from __future__ import annotations

from django.db.models import Exists, OuterRef, Q, QuerySet

from config.apps.staff import services as staff
from config.apps.staff.services import User

from .models import Account, AccountMember, Kind, Role

MODULE = "tgcrm"
SALES_DEPTS = ("sotuv_b2b", "sotuv")
RANK = {Role.VIEWER: 1, Role.OPERATOR: 2, Role.ADMIN: 3}


def can_use(u: User) -> bool:
    return u.can_module(MODULE)


def is_head(u: User) -> bool:
    return u.is_panel or u.in_lead_dept() or (bool(set(u.dept_keys()) & set(SALES_DEPTS)) and staff.has_reports(u))


def role_of(u: User, a: Account, head: bool | None = None) -> str | None:
    head = is_head(u) if head is None else head
    member = AccountMember.objects.filter(account=a, staff_tg=u.tg_id).values_list("role", flat=True).first()
    if a.kind == Kind.PERSONAL:
        if a.owner_tg == u.tg_id:
            return Role.ADMIN
        if member:
            return member
        return Role.VIEWER if head else None
    if head:
        return Role.ADMIN
    if member:
        return member
    if not AccountMember.objects.filter(account=a).exists():
        return Role.OPERATOR
    return None


def visible(u: User, qs: QuerySet[Account]) -> QuerySet[Account]:
    if is_head(u):
        return qs
    mine = AccountMember.objects.filter(account=OuterRef("pk"), staff_tg=u.tg_id)
    any_member = AccountMember.objects.filter(account=OuterRef("pk"))
    return qs.filter(
        Q(owner_tg=u.tg_id, kind=Kind.PERSONAL) | Exists(mine) | (Q(kind=Kind.COMPANY) & ~Exists(any_member))
    )


def at_least(u: User, a: Account, need: str) -> bool:
    r = role_of(u, a)
    return r is not None and RANK[Role(r)] >= RANK[Role(need)]


def can_write(u: User, a: Account) -> bool:
    return at_least(u, a, Role.OPERATOR)


def can_manage(u: User, a: Account) -> bool:
    """Ulash/uzish/o'chirish/a'zolar: admin; shaxsiy raqamda — egasi va rahbar (xodim ketsa, rahbar uza oladi, lekin yozmaydi)."""
    return at_least(u, a, Role.ADMIN) or (a.kind == Kind.PERSONAL and is_head(u))

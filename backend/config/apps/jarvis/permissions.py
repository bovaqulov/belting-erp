"""Kim nima qila oladi: boshqarish (owner/admin, IT, Rahbariyat) va agentdan foydalanish (chat, topshiriq)."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from config.apps.staff.models import User

    from .models import Agent


def can_manage(user: User | None) -> bool:
    return bool(user and user.can_manage_agents())


def home_dept(agent: Agent) -> Agent | None:
    """Agentning bo'limi: o'zi (dept) yoki eng yaqin yuqori bo'lim agenti."""
    cur: Agent | None = agent
    seen: set[int] = set()
    while cur is not None and cur.pk not in seen:
        if cur.kind == "dept":
            return cur
        seen.add(cur.pk)
        cur = cur.parent
    return None


def can_use(user: User | None, agent: Agent) -> bool:
    """Yozishish va topshiriq berish: boshqaruvchilar, mas'ul/biriktirilgan xodim, «Kim foydalanadi» ro'yxati;
    ro'yxat bo'sh bo'lsa — agent bo'limi a'zolari."""
    if user is None:
        return False
    if can_manage(user) or agent.owner_id == user.pk or user.tg_id in agent.audience_users:
        return True
    mine = set(user.dept_keys())
    if agent.audience_depts or agent.audience_users:
        return bool(mine & set(agent.audience_depts))
    dept = home_dept(agent)
    return dept is not None and dept.key in mine

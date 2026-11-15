"""jarvis — ichki yozish amallari va ochiq interfeys.

Ichki (ko'rinishlar va Celery): agent saqlash/o'chirish, jadval vaqti, topshiriqni navbatga qo'yish.
Ochiq (boshqa applar faqat shular orqali): `register_context` — agent system prompt'iga kontekst qo'shuvchi
(memory, knowledge o'z `apps.ready()` da ro'yxatdan o'tadi; jarvis ularni import qilmaydi), `chat_lines_after` —
veb chat xabarlari (bilim ajratish uchun). Bo'limlar — staff.Department; bo'lim agenti saqlanganda
`sync_departments` uni yangilaydi (signals.py).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from django.db import transaction
from django.utils import timezone

from config.apps.staff import services as staff

from .models import Agent, AgentSchedule, AgentTask, ChatMessage
from .permissions import home_dept
from .schedule import next_run

# ---------------------------------------------------------------- ochiq interfeys
# (vosita kaliti, bo'lim kaliti, suhbatdosh tg_id, savol) → system prompt bo'lagi yoki None
ContextProvider = Callable[[str | None, int | None, str], str | None]
CONTEXT_PROVIDERS: dict[str, ContextProvider] = {}


def register_context(tool: str, provider: ContextProvider) -> None:
    """Agentda `tool` vositasi yoqilgan bo'lsa, `provider` natijasi system prompt'ga qo'shiladi."""
    CONTEXT_PROVIDERS[tool] = provider


@dataclass(frozen=True)
class ChatLine:
    pk: int
    dept: str  # agent bo'limi kaliti (bo'limsiz — agent kaliti)
    agent_name: str
    role: str  # user | agent
    user_tg: int
    text: str


def chat_lines_after(last_id: int, limit: int = 400) -> list[ChatLine]:
    """Veb chat xabarlari (bo'shlari tashlab), pk o'sish tartibida."""
    msgs = (
        ChatMessage.objects.filter(pk__gt=last_id)
        .exclude(text="")
        .select_related("session__agent__parent", "session__user")
        .order_by("pk")[:limit]
    )
    out = []
    for m in msgs:
        agent = m.session.agent
        dept = home_dept(agent)
        out.append(ChatLine(m.pk, dept.key if dept else agent.key, agent.name, m.role, m.session.user.tg_id, m.text))
    return out


def sync_departments() -> None:
    """Bo'lim agentlari → staff.Department (kalit, nom, daraxt, sees_all)."""
    staff.sync_departments(
        [
            {
                "key": a.key, "name": a.name, "name_ru": a.name_ru, "icon": a.icon, "color": a.color,
                "sees_all": a.sees_all, "position": a.position, "parent": a.parent.key if a.parent else None,
            }
            for a in Agent.objects.filter(kind=Agent.Kind.DEPT).select_related("parent")
        ]
    )  # fmt: skip


# ---------------------------------------------------------------- ichki


def apply(obj: Any, fields: dict[str, Any]) -> None:
    for k, v in fields.items():
        setattr(obj, k, v)


def refresh_next_run(s: AgentSchedule) -> None:
    s.next_run_at = next_run(
        repeat=s.repeat, at=s.time, days=s.days, day=s.day, on=s.date, enabled=s.enabled, now=timezone.now()
    )


@transaction.atomic
def delete_agent(a: Agent) -> None:
    """Sub-agentlar bir daraja yuqoriga ko'chadi; jadval va topshiriqlar o'chadi; bo'lim agenti bo'lsa —
    staff.Department ham (a'zoligi bilan) o'chadi (signals.py → sync_departments)."""
    Agent.objects.filter(parent=a).update(parent=a.parent)
    a.delete()


def enqueue_task(t: AgentTask) -> None:
    from .tasks import run_task

    transaction.on_commit(lambda: run_task.delay(t.pk))

"""Yozish amallari (ko'rinishlar va Celery umumiy): agent saqlash/o'chirish, jadval vaqti, topshiriqni navbatga qo'yish."""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone

from .models import Agent, AgentSchedule, AgentTask
from .schedule import next_run


def apply(obj: Any, fields: dict[str, Any]) -> None:
    for k, v in fields.items():
        setattr(obj, k, v)


def refresh_next_run(s: AgentSchedule) -> None:
    s.next_run_at = next_run(
        repeat=s.repeat, at=s.time, days=s.days, day=s.day, on=s.date, enabled=s.enabled, now=timezone.now()
    )


@transaction.atomic
def delete_agent(a: Agent) -> None:
    """Sub-agentlar bir daraja yuqoriga ko'chadi; jadval va topshiriqlar o'chadi; bo'lim a'zoligi (M2M) uziladi."""
    Agent.objects.filter(parent=a).update(parent=a.parent)
    a.delete()


def enqueue_task(t: AgentTask) -> None:
    from .tasks import run_task

    transaction.on_commit(lambda: run_task.delay(t.pk))

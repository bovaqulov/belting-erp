"""Celery: jadval (beat har daqiqa — tick) va topshiriqlarni agent bajaradi; natija mas'ulga Telegram orqali."""

from __future__ import annotations

import logging

from celery import shared_task
from django.utils import timezone

from config.apps.core.telegram import send_message

from . import runtime
from .models import AgentRun, AgentSchedule, AgentTask
from .services import refresh_next_run

log = logging.getLogger(__name__)


@shared_task
def tick() -> int:
    """Vaqti kelgan jadvallarni navbatga qo'yadi va keyingi vaqtini hisoblaydi (ikki marta ishlamasin)."""
    now = timezone.now()
    n = 0
    for s in AgentSchedule.objects.filter(enabled=True, next_run_at__lte=now):
        refresh_next_run(s)  # endi > now
        s.save(update_fields=["next_run_at"])
        run_schedule.delay(s.pk)
        n += 1
    return n


def _deliver(s: AgentSchedule, text: str) -> None:
    head = f"🗓 {s.agent.name} — {s.title}\n\n"
    if s.deliver == "owner":
        who = s.agent.owner or s.created_by
        if who:
            send_message(who.tg_id, head + text)
        return
    ch = next((c for c in s.agent.channels if c.get("id") == s.deliver), None)
    if ch and ch["type"] == "telegram_group" and str(ch["ref"]).lstrip("-").isdigit():
        send_message(ch["ref"], head + text)
    else:
        log.info("jadval %s: %s kanaliga yuborish hali ulanmagan", s.uid, s.deliver)


@shared_task
def run_schedule(schedule_id: int) -> None:
    s = (
        AgentSchedule.objects.select_related("agent", "agent__owner", "agent__parent", "created_by")
        .filter(pk=schedule_id)
        .first()
    )
    if s is None:
        return
    run = AgentRun.objects.create(agent=s.agent, source=AgentRun.Source.SCHEDULE, schedule=s)
    try:
        text, tools = runtime.collect(s.agent, f"Jadval bo'yicha vazifa «{s.title}»:\n{s.instruction}")
        run.output, run.tools = text, tools
        _deliver(s, text or "(bo'sh javob)")
    except Exception as e:
        log.exception("jadval %s bajarilmadi", s.uid)
        run.ok, run.error = False, str(e)[:2000]
    run.finished_at = s.last_run_at = timezone.now()
    run.save()
    s.save(update_fields=["last_run_at"])


@shared_task
def run_task(task_id: int) -> None:
    t = AgentTask.objects.select_related("agent", "agent__parent", "created_by").filter(pk=task_id).first()
    if t is None or t.status not in ("new",):
        return
    t.status, t.started_at = AgentTask.Status.DOING, timezone.now()
    t.save(update_fields=["status", "started_at"])
    run = AgentRun.objects.create(agent=t.agent, source=AgentRun.Source.TASK, task=t, user=t.created_by)
    due = f"\nMuddat: {t.due:%d.%m.%Y}" if t.due else ""
    try:
        text, tools = runtime.collect(t.agent, f"Topshiriq «{t.title}»:{due}\n{t.instruction}\n\nNatijani to'liq yoz.")
        t.result, t.status = text, AgentTask.Status.DONE
        run.output, run.tools = text, tools
    except Exception as e:
        log.exception("topshiriq %s bajarilmadi", t.uid)
        t.result, t.status = f"Bajarilmadi: {e}"[:2000], AgentTask.Status.FAILED
        run.ok, run.error = False, str(e)[:2000]
    t.finished_at = run.finished_at = timezone.now()
    t.save(update_fields=["result", "status", "finished_at"])
    run.save()
    if t.created_by:
        send_message(t.created_by.tg_id, f"✅ {t.agent.name}: «{t.title}» — {t.get_status_display()}\n\n{t.result}")

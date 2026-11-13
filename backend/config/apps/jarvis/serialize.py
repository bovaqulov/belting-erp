"""Model → JSON (frontend src/ai/agents/model.ts `Agent`, `Schedule`, `AgentTask`; AdminContext `Dept`)."""

from __future__ import annotations

from typing import Any

from .models import Agent, AgentSchedule, AgentTask


def schedule_dict(s: AgentSchedule) -> dict[str, Any]:
    return {
        "id": s.uid,
        "title": s.title,
        "instruction": s.instruction,
        "repeat": s.repeat,
        "time": s.time,
        "days": s.days,
        "day": s.day,
        "date": s.date.isoformat() if s.date else "",
        "deliver": s.deliver,
        "enabled": s.enabled,
        "next_run_at": s.next_run_at.isoformat() if s.next_run_at else None,
        "last_run_at": s.last_run_at.isoformat() if s.last_run_at else None,
    }


def task_dict(t: AgentTask) -> dict[str, Any]:
    return {
        "id": t.uid,
        "title": t.title,
        "instruction": t.instruction,
        "due": t.due.isoformat() if t.due else "",
        "status": t.status,
        "result": t.result,
        "created_by": t.created_by.tg_id if t.created_by else None,
        "created_at": t.created_at.isoformat(),
    }


def agent_dict(a: Agent, members: int = 0) -> dict[str, Any]:
    return {
        "key": a.key,
        "kind": a.kind,
        "name": a.name,
        "name_ru": a.name_ru,
        "title": a.name,
        "parent": a.parent.key if a.parent else None,
        "owner_tg": a.owner.tg_id if a.owner else None,
        "icon": a.icon,
        "color": a.color,
        "model": a.model,
        "effort": a.effort,
        "persona": a.persona,
        "tools": a.tools,
        "sees_all": a.sees_all,
        "scopes": a.scopes,
        "audience": {"depts": a.audience_depts, "users": a.audience_users},
        "channels": a.channels,
        "schedules": [schedule_dict(s) for s in a.schedules.all()],
        "tasks": [task_dict(t) for t in a.tasks.all()],
        "members": members,
        "chats": [
            {"chat_id": c["ref"], "title": c["ref"], "dept": a.key}
            for c in a.channels
            if c.get("type") == "telegram_group"
        ],
    }

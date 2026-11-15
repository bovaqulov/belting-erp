"""Jarvis API (sinxron): /app/api/overview, /app/api/agents[/{key}[/schedules|/tasks[/{id}]]]. Chat — chat.py (asinxron)."""

from __future__ import annotations

from datetime import timedelta

from django.db.models import Count, Prefetch
from django.http import HttpRequest, JsonResponse
from django.utils import timezone

from config.apps.core.http import ApiError, api, json_body, ok
from config.apps.staff import services as staff
from config.apps.staff.services import User

from .models import Agent, AgentRun, AgentSchedule, AgentTask
from .permissions import can_manage, can_use
from .serialize import agent_dict, schedule_dict, task_dict
from .services import apply, delete_agent, enqueue_task, refresh_next_run
from .validation import clean_agent, clean_schedule, clean_task

VIEW_DENY = "Jarvis paneli faqat rahbariyat, IT va adminlar uchun."
MANAGE_DENY = "Agentlarni faqat IT bo'limi, Rahbariyat va adminlar boshqaradi."


def _agents_qs():
    return Agent.objects.select_related("parent", "owner").prefetch_related(
        Prefetch("schedules", queryset=AgentSchedule.objects.order_by("time", "id")),
        Prefetch("tasks", queryset=AgentTask.objects.select_related("created_by").order_by("-created_at")),
    )


def _members(a: Agent, counts: dict[str, int] | None = None) -> int:
    """Bo'lim agenti a'zolari — staff.Department(key) bo'yicha; boshqa agentlarda 0."""
    if a.kind != Agent.Kind.DEPT:
        return 0
    return (counts if counts is not None else staff.member_counts()).get(a.key, 0)


def _get(key: str) -> Agent:
    a = _agents_qs().filter(key=key).first()
    if a is None:
        raise ApiError(404, f"Agent topilmadi: {key}")
    return a


@api(("GET",), check=lambda u: u.can_view(), deny=VIEW_DENY)
def overview(request: HttpRequest, user: User) -> JsonResponse:
    agents = list(_agents_qs())
    week = timezone.now() - timedelta(days=7)
    stats = (
        AgentRun.objects.filter(source=AgentRun.Source.CHAT, started_at__gte=week)
        .values("agent__key")
        .annotate(n=Count("id"))
    )
    counts = staff.member_counts()
    data = [agent_dict(a, _members(a, counts)) for a in agents]
    return ok(
        {
            "departments": [d for d in data if d["kind"] == "dept"],
            "agents": data,
            "pending_users": staff.pending_count(),
            "pending_memory": 0,
            "stats_week": [{"dept": s["agent__key"], "requests": s["n"]} for s in stats],
        }
    )


@api(("GET", "POST"), check=lambda u: u.can_view(), deny=VIEW_DENY)
def agents(request: HttpRequest, user: User) -> JsonResponse:
    if request.method == "GET":
        counts = staff.member_counts()
        return ok({"agents": [agent_dict(a, _members(a, counts)) for a in _agents_qs()]})
    if not can_manage(user):
        raise ApiError(403, MANAGE_DENY)
    fields = clean_agent(json_body(request), None)
    a = Agent(**fields)
    a.position = Agent.objects.filter(parent=a.parent).count()
    a.save()
    return ok({"key": a.key}, status=201)


@api(("GET", "PATCH", "DELETE"), check=lambda u: u.can_view(), deny=VIEW_DENY)
def agent(request: HttpRequest, user: User, key: str) -> JsonResponse:
    a = _get(key)
    if request.method == "GET":
        return ok(agent_dict(a, _members(a)))
    if not can_manage(user):
        raise ApiError(403, MANAGE_DENY)
    if request.method == "DELETE":
        delete_agent(a)
        return ok()
    apply(a, clean_agent(json_body(request), a))
    a.save()
    return ok()


@api(("POST",))
def schedules(request: HttpRequest, user: User, key: str) -> JsonResponse:
    if not can_manage(user):
        raise ApiError(403, MANAGE_DENY)
    a = _get(key)
    data = json_body(request)
    s = AgentSchedule(agent=a, created_by=user, **clean_schedule(data, partial=False))
    uid = str(data.get("id") or "")
    if uid and len(uid) <= 40 and not AgentSchedule.objects.filter(uid=uid).exists():
        s.uid = uid
    refresh_next_run(s)
    s.save()
    return ok({"id": s.uid, **schedule_dict(s)}, status=201)


@api(("PATCH", "DELETE"))
def schedule(request: HttpRequest, user: User, key: str, uid: str) -> JsonResponse:
    if not can_manage(user):
        raise ApiError(403, MANAGE_DENY)
    s = AgentSchedule.objects.filter(agent__key=key, uid=uid).first()
    if s is None:
        raise ApiError(404, "Jadval topilmadi")
    if request.method == "DELETE":
        s.delete()
        return ok()
    apply(s, clean_schedule(json_body(request), partial=True))
    refresh_next_run(s)
    s.save()
    return ok(schedule_dict(s))


@api(("POST",))
def tasks(request: HttpRequest, user: User, key: str) -> JsonResponse:
    a = _get(key)
    if not can_use(user, a):
        raise ApiError(403, "Bu agentga topshiriq berish huquqingiz yo'q.")
    data = json_body(request)
    fields = clean_task(data, partial=False)
    fields.pop("status", None)
    t = AgentTask.objects.create(agent=a, created_by=user, **fields)
    enqueue_task(t)
    return ok({"id": t.uid, **task_dict(t)}, status=201)


@api(("PATCH", "DELETE"))
def task(request: HttpRequest, user: User, key: str, uid: str) -> JsonResponse:
    t = AgentTask.objects.select_related("agent", "agent__parent", "created_by").filter(agent__key=key, uid=uid).first()
    if t is None:
        raise ApiError(404, "Topshiriq topilmadi")
    mine = t.created_by_id == user.pk
    if request.method == "DELETE":
        if not (can_manage(user) or mine):
            raise ApiError(403, "Topshiriqni beruvchi yoki boshqaruvchi o'chira oladi.")
        t.delete()
        return ok()
    if not can_use(user, t.agent):
        raise ApiError(403, "Bu agentning topshirig'ini o'zgartira olmaysiz.")
    fields = clean_task(json_body(request), partial=True)
    rerun = fields.get("status") == "new" and t.status in ("done", "failed")
    apply(t, fields)
    t.save()
    if rerun:  # qayta bajarish
        enqueue_task(t)
    return ok(task_dict(t))

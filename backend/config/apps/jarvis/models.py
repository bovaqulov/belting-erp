"""Jarvis agentlari: Agent (bitta daraxt), jadval, topshiriq, ishga tushirishlar jurnali, veb chat."""

from __future__ import annotations

import secrets
import uuid
from typing import TYPE_CHECKING

from django.conf import settings
from django.db import models

from .constants import DEFAULT_MODEL, DEFAULT_TOOLS

if TYPE_CHECKING:
    from django.db.models.manager import RelatedManager


def _uid() -> str:
    return secrets.token_urlsafe(9)


def _default_tools() -> list[str]:
    return list(DEFAULT_TOOLS)


class Agent(models.Model):
    class Kind(models.TextChoices):
        DEPT = "dept", "Bo'lim agenti"
        STAFF = "staff", "Xodim agenti"
        FREE = "free", "Mustaqil agent"

    key = models.CharField(max_length=32, unique=True)
    kind = models.CharField(max_length=8, choices=Kind.choices, default=Kind.FREE)
    name = models.CharField(max_length=120)
    name_ru = models.CharField(max_length=120, blank=True)
    # daraxt: null — eng yuqori. O'chirishda bolalar services.delete_agent bilan yuqoriga ko'chadi.
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="children")
    # staff — biriktirilgan xodim (majburiy); boshqalarida — mas'ul
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="owned_agents"
    )
    icon = models.CharField(max_length=40, default="bot")
    color = models.CharField(max_length=9, default="#3e88f7")
    model = models.CharField(max_length=40, default=DEFAULT_MODEL)
    effort = models.CharField(max_length=8, default="low")
    persona = models.TextField()
    tools = models.JSONField(default=_default_tools)
    sees_all = models.BooleanField(default=False)
    scopes = models.JSONField(default=dict, blank=True)  # {area: all|team|own|none}; yo'q — rol bo'yicha
    audience_depts = models.JSONField(default=list, blank=True)  # bo'lim kalitlari
    audience_users = models.JSONField(default=list, blank=True)  # tg_id lar
    channels = models.JSONField(default=list, blank=True)  # [{id, type, ref, mode}]
    position = models.PositiveIntegerField(default=0)  # aka-ukalar tartibi
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    if TYPE_CHECKING:  # teskari bog'lanishlar (tip tekshiruvi uchun)
        schedules: RelatedManager[AgentSchedule]
        tasks: RelatedManager[AgentTask]
        children: RelatedManager[Agent]

    class Meta:
        ordering = ["position", "id"]

    def __str__(self) -> str:
        return f"{self.name} ({self.key})"


class AgentSchedule(models.Model):
    uid = models.CharField(max_length=40, unique=True, default=_uid)
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="schedules")
    title = models.CharField(max_length=200)
    instruction = models.TextField()
    repeat = models.CharField(max_length=8, default="daily")
    time = models.CharField(max_length=5, default="09:00")  # HH:MM, Toshkent
    days = models.JSONField(default=list, blank=True)  # weekly: 1=Du … 7=Ya
    day = models.PositiveSmallIntegerField(default=1)  # monthly: 1–28
    date = models.DateField(null=True, blank=True)  # once
    deliver = models.CharField(max_length=40, default="owner")  # owner | kanal id
    enabled = models.BooleanField(default=True)
    next_run_at = models.DateTimeField(null=True, blank=True, db_index=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["time", "id"]

    def __str__(self) -> str:
        return self.title


class AgentTask(models.Model):
    class Status(models.TextChoices):
        NEW = "new", "Yangi"
        DOING = "doing", "Bajarilmoqda"
        DONE = "done", "Bajarildi"
        FAILED = "failed", "Bajarilmadi"

    uid = models.CharField(max_length=40, unique=True, default=_uid)
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="tasks")
    title = models.CharField(max_length=200)
    instruction = models.TextField()
    due = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.NEW)
    result = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title


class AgentRun(models.Model):
    """Agent bajargan har ish (chat javobi, jadval, topshiriq) — audit va statistika."""

    class Source(models.TextChoices):
        CHAT = "chat", "Chat"
        SCHEDULE = "schedule", "Jadval"
        TASK = "task", "Topshiriq"

    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="runs")
    source = models.CharField(max_length=10, choices=Source.choices)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    schedule = models.ForeignKey(AgentSchedule, null=True, blank=True, on_delete=models.SET_NULL)
    task = models.ForeignKey(AgentTask, null=True, blank=True, on_delete=models.SET_NULL)
    ok = models.BooleanField(default=True)
    output = models.TextField(blank=True)
    error = models.TextField(blank=True)
    tools = models.JSONField(default=list, blank=True)
    started_at = models.DateTimeField(auto_now_add=True, db_index=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self) -> str:
        return f"{self.agent_id}:{self.source}:{self.started_at:%Y-%m-%d %H:%M}"


class ChatSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_sessions")
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="chat_sessions")
    sdk_session_id = models.CharField(max_length=80, blank=True)  # Claude Agent SDK resume
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.user_id} ↔ {self.agent_id}"


class ChatMessage(models.Model):
    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=8)  # user | agent
    text = models.TextField(blank=True)
    tools = models.JSONField(default=list, blank=True)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"{self.role}: {self.text[:40]}"

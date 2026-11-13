"""«Chatlardan yangilash»: oxirgi ko'rilgandan keyingi veb chat xabarlaridan LLM foydali faktlar va bilim hujjatlarini
ajratadi — hammasi tasdiq kutadi (pending), IT/Rahbariyat Xotira va Bilimlarda tasdiqlaydi."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from django.db import transaction

from config.apps.core import llm
from config.apps.jarvis.models import Agent, ChatMessage
from config.apps.jarvis.permissions import home_dept
from config.apps.memory.models import Fact

from .models import Doc, ExtractState

MAX_CHARS = 14000
SYSTEM = (
    "Sen Belting rezina firmasi xodimlari va AI agentlari yozishmalarini ko'rib, keyin ham kerak bo'ladigan bilimlarni "
    "ajratasan. Faqat barqaror, tekshirsa bo'ladigan narsalar: qoidalar, narx siyosati, mijoz talablari, jarayonlar, "
    "atamalar. Salomlashish, bir martalik savol, taxmin — kerak emas. Har biri o'zbek tilida, qisqa.\n"
    'JSON: {"facts":[{"text":"...","scope":"firma|bolim|xodim","dept":"bo\'lim kaliti","tg_id":123}],'
    '"docs":[{"dept":"bo\'lim kaliti yoki umumiy","path":"Mavzu › Kichik mavzu","title":"...","body":"..."}]}'
)


def _transcripts(msgs: list[ChatMessage]) -> tuple[str, set[str]]:
    by: dict[str, list[str]] = defaultdict(list)
    keys: set[str] = set()
    for m in msgs:
        agent = m.session.agent
        dept = home_dept(agent)
        k = dept.key if dept else agent.key
        keys.add(k)
        who = f"xodim {m.session.user.tg_id}" if m.role == "user" else f"agent {agent.name}"
        by[k].append(f"{who}: {m.text[:800]}")
    text = "\n\n".join(f"## Bo'lim: {k}\n" + "\n".join(lines) for k, lines in by.items())
    return text[:MAX_CHARS], keys


def extract_from_chats() -> dict[str, dict[str, Any]]:
    state, _ = ExtractState.objects.get_or_create(key="chat")
    msgs = list(
        ChatMessage.objects.filter(pk__gt=state.last_id)
        .exclude(text="")
        .select_related("session__agent__parent", "session__user")
        .order_by("pk")[:400]
    )
    if not msgs:
        return {}
    text, keys = _transcripts(msgs)
    data = llm.complete_json(SYSTEM, text)
    depts = set(Agent.objects.filter(kind="dept").values_list("key", flat=True))
    result: dict[str, dict[str, Any]] = defaultdict(lambda: {"add": 0})
    with transaction.atomic():
        for f in (data or {}).get("facts") or []:
            t = str(f.get("text") or "").strip()
            if not t or Fact.objects.filter(text=t).exists():
                continue
            scope = f.get("scope") if f.get("scope") in ("firma", "bolim", "xodim") else "firma"
            key = (
                str(f.get("dept") or "") if scope == "bolim" else str(f.get("tg_id") or "") if scope == "xodim" else ""
            )
            if scope == "bolim" and key not in depts:
                scope, key = "firma", ""
            Fact.objects.create(text=t[:2000], scope=scope, scope_key=key, status=Fact.Status.PENDING, source="chat")
            result[key or "umumiy"]["add"] += 1
        for d in (data or {}).get("docs") or []:
            title, body = str(d.get("title") or "").strip(), str(d.get("body") or "").strip()
            if not title or not body:
                continue
            dept = str(d.get("dept") or "umumiy")
            dept = dept if dept in depts else "umumiy"
            Doc.objects.create(
                dept=dept, path=str(d.get("path") or "")[:300], title=title[:300], body=body,
                status=Doc.Status.PENDING, source="chat",
            )  # fmt: skip
            result[dept]["add"] += 1
        state.last_id = msgs[-1].pk
        state.save(update_fields=["last_id"])
    return dict(result) or {k: {"add": 0} for k in keys}

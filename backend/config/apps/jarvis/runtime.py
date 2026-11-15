"""Agentni ishga tushirish (LLM). JARVIS_LLM=claude — Claude Agent SDK (Claude Max, API kalitsiz; eski brain.py bilan bir xil
usul); echo — sinov/dev (LLM'siz, aniq javob).

Hodisalar: {"type": "text", "delta"}, {"type": "tool", "name"}, {"type": "session", "id"}. Ulangan vositalar:
«memory» (xotira faktlari) va «kb» (mos hujjatlar) — system prompt'ga kontekst sifatida. Qolganlari (CRM, 1C, ERP …) —
TOOL_REGISTRY: applar o'z MCP vositalarini ulaganda qo'shiladi; agent ulanmaganlarini biladi.

system_prompt() bazadan o'qiydi — faqat sinxron joyda chaqiriladi (chat._prepare, collect), stream() ga tayyor matn beriladi.
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator
from datetime import datetime
from typing import TYPE_CHECKING, Any, Literal, cast

from django.conf import settings

from .constants import SCOPE_AREAS
from .schedule import TZ

if TYPE_CHECKING:
    from config.apps.staff.models import User

    from .models import Agent

# vosita kaliti → MCP server (keyingi bosqich: erp, crm, onec … applari ro'yxatdan o'tkazadi)
TOOL_REGISTRY: dict[str, Any] = {}
KIND_UZ = {"dept": "bo'lim agenti", "staff": "xodim agenti", "free": "mustaqil agent"}
SCOPE_UZ = {"all": "butun firma", "team": "jamoa", "own": "faqat o'zi", "none": "yo'q"}
MAX_TURNS = 6


def system_prompt(agent: Agent, user: User | None = None, query: str = "") -> str:
    now = datetime.now(TZ)
    lines = [
        f"Sen {settings.JARVIS_COMPANY} firmasining «{agent.name}» agentisan ({KIND_UZ.get(agent.kind, agent.kind)}). "
        "Jarvis — firmaning AI agentlari tizimi; sen xodim kabi ishlaysan, qila olgan darajangda.",
        agent.persona.strip(),
        f"Bugun: {now:%d.%m.%Y}, soat {now:%H:%M} (Toshkent).",
    ]
    if user is not None:
        lines.append(f"Hozir sen bilan {user.name or user.tg_id} ({user.role}) yozishmoqda.")
    scoped = [f"{a}: {SCOPE_UZ[agent.scopes[a]]}" for a in SCOPE_AREAS if agent.scopes.get(a) in SCOPE_UZ]
    if scoped:
        lines.append("Ma'lumot doirang: " + "; ".join(scoped) + ". Doirangdan tashqari ma'lumot berma.")
    from .permissions import home_dept
    from .services import CONTEXT_PROVIDERS

    dept = home_dept(agent)
    for tool, provider in CONTEXT_PROVIDERS.items():  # memory, kb … — o'z applari ro'yxatdan o'tkazadi
        if tool in agent.tools:
            lines.append(provider(dept.key if dept else None, user.tg_id if user else None, query) or "")
    live = [t for t in agent.tools if t in TOOL_REGISTRY]
    if live:
        lines.append("Ulangan vositalaring: " + ", ".join(live) + ".")
    from .services import CONTEXT_PROVIDERS

    if any(t not in TOOL_REGISTRY and t not in CONTEXT_PROVIDERS for t in agent.tools):
        lines.append(
            "Tizim vositalaring (CRM, 1C, ERP, qo'ng'iroqlar) hali ulanmagan: jonli firma ma'lumotini ko'ra olmaysan. "
            "Bunday savolda buni ochiq ayt, raqam o'ylab topma."
        )
    lines.append("Javob tili — savol tilida (o'zbek yoki rus). Qisqa, aniq, keraksiz kirishsiz.")
    return "\n\n".join(x for x in lines if x)


async def stream(agent: Agent, prompt: str, *, system: str, resume: str | None = None) -> AsyncIterator[dict]:
    if settings.JARVIS_LLM == "echo":
        yield {"type": "text", "delta": f"[{agent.name}] {prompt}"}
        yield {"type": "session", "id": resume or f"echo-{agent.key}"}
        return

    from claude_agent_sdk import AssistantMessage, ClaudeAgentOptions, ResultMessage, TextBlock, ToolUseBlock, query

    os.environ.pop("ANTHROPIC_API_KEY", None)  # Claude Max obunasi (CLI login) — kalit bo'lsa ustun keladi
    opts = ClaudeAgentOptions(
        model=agent.model,
        effort=cast(Literal["low", "medium", "high", "xhigh", "max"], agent.effort),
        system_prompt=system,
        tools=[],  # ichki (fayl, terminal) vositalar yo'q
        allowed_tools=[],
        setting_sources=[],
        strict_mcp_config=True,
        resume=resume,
        max_turns=MAX_TURNS,
        cwd=str(settings.BASE_DIR / "data"),
        env={"ENABLE_CLAUDEAI_MCP_SERVERS": "false"},
    )
    started = False
    async for msg in query(prompt=prompt, options=opts):
        if isinstance(msg, AssistantMessage):
            for b in msg.content:
                if isinstance(b, TextBlock) and b.text.strip():
                    yield {"type": "text", "delta": ("\n\n" if started else "") + b.text}
                    started = True
                elif isinstance(b, ToolUseBlock):
                    yield {"type": "tool", "name": b.name}
        elif isinstance(msg, ResultMessage):
            if msg.is_error:
                raise RuntimeError(msg.result or "Agent javob bera olmadi")
            if not started and msg.result:
                yield {"type": "text", "delta": msg.result}
            yield {"type": "session", "id": msg.session_id}


async def _collect(agent: Agent, prompt: str, system: str) -> tuple[str, list[str]]:
    text, tools = "", []
    async for ev in stream(agent, prompt, system=system):
        if ev["type"] == "text":
            text += ev["delta"]
        elif ev["type"] == "tool":
            tools.append(ev["name"])
    return text.strip(), tools


def collect(agent: Agent, prompt: str) -> tuple[str, list[str]]:
    """Celery uchun sinxron: to'liq javob matni va ishlatilgan vositalar."""
    return asyncio.run(_collect(agent, prompt, system_prompt(agent, None, prompt)))

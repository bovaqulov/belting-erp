"""Umumiy LLM chaqiruvi (agentsiz): graf ajratish, chatlardan bilim ajratish kabi xizmat ishlari uchun.

JARVIS_LLM=claude — Claude Agent SDK (Claude Max, API kalitsiz), echo — testlar (bo'sh javob; testlar `complete` ni
almashtiradi). Agentning o'z javoblari — jarvis.runtime."""

from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Any

from django.conf import settings

SERVICE_MODEL = "claude-sonnet-5-5"


async def _complete(system: str, prompt: str, model: str) -> str:
    from claude_agent_sdk import AssistantMessage, ClaudeAgentOptions, ResultMessage, TextBlock, query

    os.environ.pop("ANTHROPIC_API_KEY", None)
    opts = ClaudeAgentOptions(
        model=model,
        system_prompt=system,
        tools=[],
        allowed_tools=[],
        setting_sources=[],
        strict_mcp_config=True,
        max_turns=1,
        cwd=str(settings.BASE_DIR / "data"),
        env={"ENABLE_CLAUDEAI_MCP_SERVERS": "false"},
    )
    parts: list[str] = []
    async for msg in query(prompt=prompt, options=opts):
        if isinstance(msg, AssistantMessage):
            parts += [b.text for b in msg.content if isinstance(b, TextBlock)]
        elif isinstance(msg, ResultMessage):
            if msg.is_error:
                raise RuntimeError(msg.result or "LLM javob bermadi")
            if not parts and msg.result:
                parts.append(msg.result)
    return "".join(parts).strip()


def complete(system: str, prompt: str, model: str = SERVICE_MODEL) -> str:
    if settings.JARVIS_LLM == "echo":
        return ""
    return asyncio.run(_complete(system, prompt, model))


def parse_json(text: str) -> Any:
    """LLM javobidagi JSON (```json … ``` o'rami bo'lsa ham). Topilmasa — ValueError."""
    t = text.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", t, re.S)
    if m:
        t = m.group(1).strip()
    start = min((i for i in (t.find("{"), t.find("[")) if i >= 0), default=-1)
    if start < 0:
        raise ValueError("JSON topilmadi")
    return json.loads(t[start:])


def complete_json(system: str, prompt: str, model: str = SERVICE_MODEL) -> Any:
    return parse_json(complete(system + "\n\nFaqat JSON qaytar, izohsiz.", prompt, model) or "{}")

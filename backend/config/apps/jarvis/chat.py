"""POST /app/api/chat — agent bilan veb chat, javob SSE oqimida (docs/api/chat.md). ASGI (uvicorn) da asinxron ishlaydi.

Hodisalar: text{delta}, tool{name}, done{session_id}, error{detail}. session_id — bizning ChatSession (UUID); Claude
SDK sessiyasi (resume) ichida saqlanadi. Ulanish uzilsa (To'xtatish) — generator bekor qilinadi.
"""

from __future__ import annotations

import json
import logging
import uuid
from collections.abc import AsyncIterator

from asgiref.sync import sync_to_async
from django.http import HttpRequest, JsonResponse, StreamingHttpResponse
from django.http.response import HttpResponseBase
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from config.apps.audit import services as audit
from config.apps.core.auth import resolve_user
from config.apps.core.http import ApiError, json_body

from . import runtime
from .models import Agent, AgentRun, ChatMessage, ChatSession
from .permissions import can_use

log = logging.getLogger(__name__)
MAX_MESSAGE = 8000


def _sse(ev: dict) -> bytes:
    return f"data: {json.dumps(ev, ensure_ascii=False)}\n\n".encode()


@sync_to_async
def _prepare(request: HttpRequest) -> tuple[ChatSession, Agent, str, str]:
    user = resolve_user(request)
    if user is None:
        raise ApiError(401, "Kirish talab qilinadi")
    data = json_body(request)
    key = str(data.get("agent") or data.get("dept") or "")
    msg = str(data.get("message") or "").strip()
    if not msg:
        raise ApiError(400, "Xabar bo'sh.")
    if len(msg) > MAX_MESSAGE:
        raise ApiError(400, f"Xabar juda uzun (ko'pi {MAX_MESSAGE} belgi).")
    agent = Agent.objects.select_related("parent").filter(key=key).first()
    if agent is None:
        raise ApiError(404, f"Agent topilmadi: {key}")
    if not can_use(user, agent):
        raise ApiError(403, f"«{agent.name}» agenti bilan yozishish huquqingiz yo'q.")
    session = None
    sid = data.get("session_id")
    if sid:
        try:
            session = ChatSession.objects.filter(id=uuid.UUID(str(sid)), user=user, agent=agent).first()
        except ValueError:
            session = None
    if session is None:
        session = ChatSession.objects.create(user=user, agent=agent)
    ChatMessage.objects.create(session=session, role="user", text=msg)
    session.user = user
    # xotira va mos hujjatlar bazadan — shu sinxron joyda; oqim ichida faqat LLM
    return session, agent, msg, runtime.system_prompt(agent, user, msg)


@sync_to_async
def _finish(session: ChatSession, agent: Agent, text: str, tools: list[str], error: str, sdk_id: str | None) -> None:
    ChatMessage.objects.create(session=session, role="agent", text=text, tools=tools, error=error)
    if sdk_id:
        session.sdk_session_id = sdk_id
    session.save(update_fields=["sdk_session_id", "updated_at"])
    AgentRun.objects.create(
        agent=agent, source=AgentRun.Source.CHAT, user=session.user, ok=not error, output=text[:20000], error=error,
        tools=tools, finished_at=timezone.now(),
    )  # fmt: skip
    audit.log(
        "answer", tg_id=getattr(session.user, "tg_id", None), dept=agent.key,
        detail={"source": "chat", "tools": tools, "ok": not error, "error": error[:300], "chars": len(text)},
    )  # fmt: skip


@csrf_exempt
async def chat(request: HttpRequest) -> HttpResponseBase:
    if request.method != "POST":
        return JsonResponse({"detail": "Faqat POST."}, status=405)
    try:
        session, agent, msg, system = await _prepare(request)
    except ApiError as e:
        return JsonResponse({"detail": e.detail}, status=e.status)

    async def events() -> AsyncIterator[bytes]:
        text, tools, error, sdk_id = "", [], "", None
        try:
            async for ev in runtime.stream(agent, msg, system=system, resume=session.sdk_session_id or None):
                if ev["type"] == "session":
                    sdk_id = ev["id"]
                    continue
                if ev["type"] == "text":
                    text += ev["delta"]
                elif ev["type"] == "tool":
                    tools.append(ev["name"])
                yield _sse(ev)
            yield _sse({"type": "done", "session_id": str(session.id)})
        except Exception as e:  # LLM/SDK xatosi — foydalanuvchiga matn, logga to'liq
            log.exception("chat: %s agenti javob bermadi", agent.key)
            error = f"Agent javob bera olmadi: {e}"[:500]
            yield _sse({"type": "error", "detail": error})
        finally:
            await _finish(session, agent, text, tools, error, sdk_id)

    resp = StreamingHttpResponse(events(), content_type="text/event-stream; charset=utf-8")
    resp["Cache-Control"] = "no-cache"
    resp["X-Accel-Buffering"] = "no"
    return resp

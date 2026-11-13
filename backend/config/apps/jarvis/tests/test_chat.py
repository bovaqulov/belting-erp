import json

import pytest
from asgiref.sync import sync_to_async
from django.test.client import AsyncClient

from config.apps.jarvis.models import AgentRun, ChatMessage

pytestmark = pytest.mark.django_db(transaction=True)


async def _events(resp) -> list[dict]:
    body = b"".join([chunk async for chunk in resp.streaming_content]).decode()
    return [json.loads(line[6:]) for line in body.split("\n") if line.startswith("data: ")]


async def test_chat_stream_and_session(depts, make_user):
    user = await sync_to_async(make_user)(10, "employee", depts["sotuv"])
    c = AsyncClient()
    await sync_to_async(c.force_login)(user)
    r = await c.post("/app/api/chat", {"agent": "sotuv", "message": "Salom"}, content_type="application/json")
    assert r.status_code == 200 and r["Content-Type"].startswith("text/event-stream")
    ev = await _events(r)
    assert ev[0] == {"type": "text", "delta": "[Sotuv] Salom"}
    assert ev[-1]["type"] == "done"
    sid = ev[-1]["session_id"]
    r2 = await c.post(
        "/app/api/chat", {"agent": "sotuv", "message": "Yana", "session_id": sid}, content_type="application/json"
    )
    assert (await _events(r2))[-1]["session_id"] == sid  # bitta suhbat davom etadi
    assert await ChatMessage.objects.filter(session_id=sid).acount() == 4
    assert await AgentRun.objects.filter(source="chat").acount() == 2


async def test_chat_denied_and_errors(depts, make_user):
    c = AsyncClient()
    r = await c.post("/app/api/chat", {"agent": "sotuv", "message": "x"}, content_type="application/json")
    assert r.status_code == 401
    await sync_to_async(c.force_login)(await sync_to_async(make_user)(11, "employee", depts["sotuv"]))
    r = await c.post("/app/api/chat", {"agent": "it", "message": "x"}, content_type="application/json")
    assert r.status_code == 403  # boshqa bo'lim agenti
    r = await c.post("/app/api/chat", {"agent": "yoq", "message": "x"}, content_type="application/json")
    assert r.status_code == 404
    r = await c.post("/app/api/chat", {"agent": "sotuv", "message": " "}, content_type="application/json")
    assert r.status_code == 400

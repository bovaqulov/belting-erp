"""AI javobi faqat Business bot orqali: ulanish (CRM ochiq interfeysi), yuborish, xato sabablari; shlyuz bot xabarini AI deb belgilaydi."""

import pytest
from telethon.tl import types

from config.apps.erp.crm.models import TgConnection
from config.apps.tgcrm import bizbot
from config.apps.tgcrm.gateway import convert

pytestmark = pytest.mark.django_db
OWNER = 201


@pytest.fixture
def conn(settings):
    settings.BUSINESS_CONNECTION_BOT_TOKEN = "222:business"
    return TgConnection.objects.create(id="bc1", user_tg=OWNER, user_name="Muhammadali", can_reply=True)


class Resp:
    def __init__(self, data):
        self.data = data

    def json(self):
        return self.data


def test_status(conn, settings):
    assert bizbot.status(OWNER)["ok"] is True
    assert "ulanmagan" in bizbot.status(999)["detail"]
    TgConnection.objects.filter(pk="bc1").update(can_reply=False)
    assert "huquqi" in bizbot.status(OWNER)["detail"]
    settings.BUSINESS_CONNECTION_BOT_TOKEN = ""
    assert bizbot.status(OWNER)["ok"] is False


def test_send(conn, monkeypatch):
    got = []
    monkeypatch.setattr(
        bizbot.httpx,
        "post",
        lambda url, json, timeout: got.append((url, json)) or Resp({"ok": True, "result": {"message_id": 77}}),
    )
    assert bizbot.send(OWNER, 5, "Salom") == 77
    url, body = got[0]
    assert url.endswith("/bot222:business/sendMessage")
    assert body == {"business_connection_id": "bc1", "chat_id": 5, "text": "Salom"}


@pytest.mark.parametrize(
    "desc,reason",
    [
        ("Bad Request: BUSINESS_PEER_INVALID", "ro'yxatida emas"),
        ("Bad Request: BUSINESS_PEER_USAGE_MISSING", "24 soat"),
        ("Too Many Requests: retry after 5", "cheklovi"),
    ],
)
def test_send_errors(conn, monkeypatch, desc, reason):
    monkeypatch.setattr(bizbot.httpx, "post", lambda *a, **k: Resp({"ok": False, "description": desc}))
    with pytest.raises(bizbot.NotSent, match=reason):
        bizbot.send(OWNER, 5, "Salom")


def test_send_without_connection(conn):
    with pytest.raises(bizbot.NotSent, match="ulanmagan"):
        bizbot.send(999, 5, "Salom")


def _msg(out: bool, via: int | None = None) -> types.Message:
    return types.Message(id=9, peer_id=types.PeerUser(5), date=None, message="Salom", out=out, via_business_bot_id=via)


def test_gateway_marks_business_bot_messages():
    assert (convert.message_fields(_msg(True, 123)) or {})["by_ai"] is True
    assert (convert.message_fields(_msg(True)) or {})["by_ai"] is False
    assert (convert.message_fields(_msg(False, 123)) or {})["by_ai"] is False

import json

import pytest

from config.apps.core.models import LoginToken
from config.apps.core.telegram import get_bot
from config.apps.staff.models import User

pytestmark = pytest.mark.django_db
URL = "/app/api/bots/telegram/"
SECRET = "test-secret"


@pytest.fixture
def sent(settings, monkeypatch):
    settings.TELEGRAM_BOT_TOKEN, settings.TELEGRAM_WEBHOOK_SECRET = "123456:TEST", SECRET
    out: list[tuple] = []
    monkeypatch.setattr(get_bot(), "send_message", lambda chat_id, text, **kw: out.append((chat_id, text)))
    return out


def update(text, uid=7):
    return {
        "update_id": 1,
        "message": {
            "message_id": 1, "date": 0, "text": text,
            "chat": {"id": uid, "type": "private"},
            "from": {"id": uid, "is_bot": False, "first_name": "Akmal"},
            "entities": [{"type": "bot_command", "offset": 0, "length": 6}],
        },
    }  # fmt: skip


def post(client, body, secret=SECRET):
    return client.post(
        URL, json.dumps(body), content_type="application/json", HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN=secret
    )


def test_secret_required(client, sent):
    assert post(client, update("/start"), secret="yolgon").status_code == 403
    assert client.get(URL).status_code == 405


def test_start_login_confirms(client, sent):
    User.objects.create_user(7, "Akmal", "employee")
    t = LoginToken.objects.create()
    assert post(client, update(f"/start login_{t.token}")).status_code == 200
    assert sent and "tasdiqlandi" in sent[-1][1] and sent[-1][0] == 7
    assert client.get(f"/app/api/login/poll?token={t.token}").json() == {"ok": True}


def test_plain_start_greets(client, sent):
    post(client, update("/start"))
    assert "Belting Agent" in sent[-1][1]

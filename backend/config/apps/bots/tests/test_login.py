import pytest

from config.apps.bots.login import confirm_login
from config.apps.core.models import LoginToken
from config.apps.staff.models import User

pytestmark = pytest.mark.django_db


def test_confirm_known_user_then_poll(client):
    User.objects.create_user(7, "Akmal", "employee")
    t = LoginToken.objects.create()
    assert "tasdiqlandi" in confirm_login(t.token, {"id": 7, "first_name": "Akmal"})
    assert client.get(f"/app/api/login/poll?token={t.token}").json() == {"ok": True}


def test_unknown_user_becomes_pending():
    t = LoginToken.objects.create()
    assert "administrator" in confirm_login(t.token, {"id": 99, "first_name": "Yangi"})
    assert User.objects.get(tg_id=99).role == "pending"
    t.refresh_from_db()
    assert t.confirmed_at is None


def test_bad_token():
    assert "eskirgan" in confirm_login("yoq", {"id": 1})


def test_start_without_bot_is_clear_error(client, settings):
    settings.TELEGRAM_BOT_USERNAME = ""
    r = client.post("/app/api/login/start")
    assert r.status_code == 503 and "sozlanmagan" in r.json()["detail"]

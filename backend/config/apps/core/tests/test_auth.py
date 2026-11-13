import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

from config.apps.core.auth import verify_init_data
from config.apps.core.models import LoginToken
from config.apps.core.views import magic_link
from config.apps.staff.models import User

TOKEN = "123:abc"


def _init_data(user_id=7, age=0, token=TOKEN):
    pairs = {"auth_date": str(int(time.time()) - age), "user": json.dumps({"id": user_id, "first_name": "A"})}
    check = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    pairs["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(pairs)


def test_verify_init_data():
    good = verify_init_data(_init_data(), TOKEN)
    assert good is not None and good["id"] == 7
    assert verify_init_data(_init_data(token="boshqa"), TOKEN) is None
    assert verify_init_data(_init_data(age=2 * 86400), TOKEN) is None
    assert verify_init_data("", TOKEN) is None


def test_me_initdata_and_session(client, settings, db):
    settings.TELEGRAM_BOT_TOKEN = TOKEN
    assert client.get("/app/api/me").status_code == 401
    User.objects.create_user(7, "Akmal", "employee")
    r = client.get("/app/api/me/", HTTP_X_INIT_DATA=_init_data())  # oxirgi slash bilan ham
    assert r.status_code == 200 and r.json()["user"]["name"] == "Akmal"
    assert client.get("/app/api/me", HTTP_X_INIT_DATA=_init_data(token="x")).status_code == 401


def test_blocked_user_denied(client, settings, db):
    settings.TELEGRAM_BOT_TOKEN = TOKEN
    User.objects.create_user(7, "B", "blocked")
    assert client.get("/app/api/me", HTTP_X_INIT_DATA=_init_data()).status_code == 401


def test_magic_login(client, db):
    User.objects.create_user(9, "Ega", "owner")
    r = client.get(magic_link(9))
    assert r.status_code == 302
    assert client.get("/app/api/me").json()["can_admin"] is True
    assert client.get("/app/api/login/magic?t=yolgon").status_code == 410


def test_login_start_poll(client, db, settings):
    settings.TELEGRAM_BOT_USERNAME, settings.TELEGRAM_BOT_TOKEN = "belting_test_bot", "1:x"
    u = User.objects.create_user(9, "Ega", "owner")
    tok = client.post("/app/api/login/start").json()["token"]
    assert client.get(f"/app/api/login/poll?token={tok}").json() == {"ok": False}
    LoginToken.objects.filter(token=tok).update(user=u, confirmed_at=time.strftime("%Y-%m-%dT%H:%M:%SZ"))
    assert client.get(f"/app/api/login/poll?token={tok}").json() == {"ok": True}
    assert client.get("/app/api/me").status_code == 200
    assert client.get(f"/app/api/login/poll?token={tok}").status_code == 410  # bir martalik


def test_unknown_api_is_json(client, db):
    r = client.get("/app/api/erp/me")
    assert r.status_code == 404 and "detail" in r.json()

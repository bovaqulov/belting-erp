"""Mini App kirishi: initData login boti yoki Business bot (TG CRM menyu tugmasi) tokeni bilan imzolangan bo'lishi mumkin."""

import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest

from config.apps.core.auth import verify_any

pytestmark = pytest.mark.django_db


def sign(token: str, user_id: int = 5) -> str:
    pairs = {"auth_date": str(int(time.time())), "user": json.dumps({"id": user_id, "first_name": "A"})}
    check = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    pairs["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(pairs)


def test_both_bots_accepted_foreign_rejected(settings, client, depts):
    settings.TELEGRAM_BOT_TOKEN, settings.BUSINESS_CONNECTION_BOT_TOKEN = "111:login", "222:business"
    assert (verify_any(sign("111:login")) or {}).get("id") == 5
    assert (verify_any(sign("222:business")) or {}).get("id") == 5
    assert verify_any(sign("333:begona")) is None  # boshqa bot imzosi — yo'q
    from config.apps.staff.models import User

    User.objects.create_user(5, "Ali", "admin")
    assert client.get("/app/api/me", headers={"X-Init-Data": sign("222:business")}).status_code == 200
    assert client.get("/app/api/me", headers={"X-Init-Data": sign("333:begona")}).status_code == 401

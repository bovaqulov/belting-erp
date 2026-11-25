"""Kirish: Telegram Mini App ichida — `X-Init-Data` (WebApp initData, bot tokeni bilan HMAC); brauzerda — sessiya cookie.

initData tekshiruvi (core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
secret = HMAC_SHA256(key="WebAppData", msg=bot_token); hash = hex(HMAC_SHA256(key=secret, msg=data_check_string)).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import TYPE_CHECKING, Any, cast
from urllib.parse import parse_qsl

from django.conf import settings
from django.http import HttpRequest

if TYPE_CHECKING:
    from config.apps.staff.models import User

INIT_DATA_MAX_AGE = 24 * 3600
ACTIVE_ROLES = ("owner", "admin", "employee")


def verify_init_data(init_data: str, bot_token: str, max_age: int = INIT_DATA_MAX_AGE) -> dict[str, Any] | None:
    """To'g'ri va eskirmagan bo'lsa — Telegram foydalanuvchisi (dict), aks holda None."""
    if not init_data or not bot_token:
        return None
    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    got = pairs.pop("hash", "")
    if not got:
        return None
    check = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    want = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(want, got):
        return None
    try:
        if time.time() - int(pairs.get("auth_date", "0")) > max_age:
            return None
        user = json.loads(pairs.get("user", "{}"))
    except ValueError:
        return None
    return user if isinstance(user, dict) and user.get("id") else None


def miniapp_tokens() -> list[str]:
    """Mini App ochiladigan botlarimiz: login boti va CRM Business boti (TG CRM menyu tugmasi). initData — ochgan bot
    tokeni bilan imzolanadi, shuning uchun ikkalasi ham tekshiriladi (ikkalasi ham bizniki)."""
    return [t for t in (settings.TELEGRAM_BOT_TOKEN, settings.BUSINESS_CONNECTION_BOT_TOKEN) if t]


def verify_any(init_data: str) -> dict[str, Any] | None:
    for token in miniapp_tokens():
        if user := verify_init_data(init_data, token):
            return user
    return None


def resolve_user(request: HttpRequest) -> User | None:
    """So'rov egasi: avval initData (Telegram), keyin sessiya. Faqat faol rol (owner/admin/employee)."""
    from django.contrib.auth import get_user_model

    User = cast("type[User]", get_user_model())  # core domen applarini import qilmaydi
    raw = request.headers.get("X-Init-Data", "")
    if raw:
        tg = verify_any(raw)
        if not tg:
            return None
        u = User.objects.filter(tg_id=int(tg["id"])).first()
        return u if u and u.role in ACTIVE_ROLES else None
    u = getattr(request, "user", None)
    if u is not None and u.is_authenticated and getattr(u, "role", "") in ACTIVE_ROLES:
        return u  # type: ignore[return-value]
    return None

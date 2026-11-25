"""Django ↔ gateway buyruq shinasi (Redis).

- Buyruq: `tgcrm:cmd` ro'yxatiga JSON {id, op, account, args, actor}; javob — `tgcrm:reply:<id>` (gateway LPUSH, 60 s).
- Gateway tirikligi: `tgcrm:gateway:lock` (bitta nusxa qulfi, TTL 30 s, har 10 s yangilanadi) — kalit bor = ishlayapti.
- Hodisalar: `tgcrm:events` kanali (akkaunt holati; 2-bosqichdan — chat/xabar) → brauzerga real vaqt.

Telegram bilan faqat gateway gaplashadi; Django faqat buyruq yuboradi va bazadan o'qiydi.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

import redis
from django.conf import settings

from config.apps.core.http import ApiError

log = logging.getLogger(__name__)
CMD = "tgcrm:cmd"
LOCK = "tgcrm:gateway:lock"
INFO = "tgcrm:gateway:info"  # holat: ishga tushgan vaqt, akkauntlar (sog'liq paneli)
EVENTS = "tgcrm:events"
REPLY_TTL = 60


def reply_key(cmd_id: str) -> str:
    return f"tgcrm:reply:{cmd_id}"


_r: redis.Redis | None = None


def _redis() -> redis.Redis:
    global _r
    _r = _r or redis.Redis.from_url(settings.REDIS_URL, socket_timeout=5, socket_connect_timeout=2)
    return _r


def alive() -> bool:
    try:
        return bool(_redis().exists(LOCK))
    except redis.RedisError:
        return False


def gateway_info() -> dict[str, Any] | None:
    try:
        raw = _redis().get(INFO)
    except redis.RedisError:
        return None
    return json.loads(raw) if raw else None


def redis_ok() -> bool:
    try:
        return bool(_redis().ping())
    except redis.RedisError:
        return False


def call(
    op: str,
    account: int | None = None,
    args: dict[str, Any] | None = None,
    *,
    actor: int | None = None,
    timeout: int = 30,
) -> dict[str, Any]:
    """Gateway'ga buyruq va javobni kutish. Xato → ApiError (status/detail gateway'dan)."""
    if not alive():
        raise ApiError(503, "Telegram shlyuzi ishlamayapti. Administrator: `manage.py tg_gateway` ni ishga tushiring.")
    cmd_id = uuid.uuid4().hex
    body = {"id": cmd_id, "op": op, "account": account, "args": args or {}, "actor": actor}
    r = _redis()
    try:
        r.rpush(CMD, json.dumps(body))
        got = r.blpop([reply_key(cmd_id)], timeout=timeout)
    except redis.RedisError as e:
        log.warning("tgcrm bus: %s", e)
        raise ApiError(503, "Redis bilan aloqa yo'q.") from e
    if got is None:
        raise ApiError(504, "Telegram shlyuzi vaqtida javob bermadi. Birozdan keyin qayta urinib ko'ring.")
    res = json.loads(got[1])
    if not res.get("ok"):
        raise ApiError(int(res.get("status") or 500), str(res.get("detail") or "Shlyuz xatosi"))
    return res.get("data") or {}


def publish(event: dict[str, Any]) -> None:
    try:
        _redis().publish(EVENTS, json.dumps(event))
    except redis.RedisError as e:
        log.warning("tgcrm publish: %s", e)

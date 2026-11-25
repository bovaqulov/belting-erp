"""TelegramCRM real vaqt (WebSocket `/app/api/tgcrm/ws/`): gateway hodisalari (Redis `tgcrm:events`) → brauzer.

Kirish — sessiya cookie yoki `?init_data=` (Telegram Mini App), Origin — shu sayt yoki CSRF_TRUSTED_ORIGINS.
Har kim faqat o'ziga ko'rinadigan akkauntlar hodisalarini oladi (access.visible; ro'yxat 30 s da yangilanadi).
Hodisada xabar matni yo'q — faqat "nima o'zgardi"; ma'lumot API'dan huquq tekshiruvi bilan olinadi.
Mavjud CRM WebSocket'iga (erp/crm/live) tegilmaydi: ASGI zanjirida shu yo'l birinchi tekshiriladi.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
from http.cookies import SimpleCookie
from importlib import import_module
from typing import Any
from urllib.parse import parse_qs, urlsplit

import redis.asyncio as aredis
from asgiref.sync import sync_to_async
from django.conf import settings
from django.http import HttpRequest

from . import bus

log = logging.getLogger(__name__)
PATHS = ("/app/api/tgcrm/ws", "/app/api/tgcrm/ws/")
PING = 25
REFRESH = 30


def _headers(scope: dict[str, Any]) -> dict[str, str]:
    return {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}


def origin_ok(h: dict[str, str]) -> bool:
    origin = h.get("origin", "")
    if not origin:
        return True
    netloc = urlsplit(origin).netloc
    return netloc in {h.get("host", ""), h.get("x-forwarded-host", "")} or origin.rstrip("/") in {
        o.rstrip("/") for o in settings.CSRF_TRUSTED_ORIGINS
    }


def _user_tg(cookie: str, init_data: str) -> int | None:
    from django.contrib.auth import get_user

    from config.apps.core.auth import ACTIVE_ROLES, verify_any
    from config.apps.staff.services import User, user_by_tg

    from .access import can_use

    u = None
    if init_data:
        tg = verify_any(init_data)
        u = user_by_tg(int(tg["id"])) if tg else None
    else:
        c = SimpleCookie()
        c.load(cookie)
        key = c[settings.SESSION_COOKIE_NAME].value if settings.SESSION_COOKIE_NAME in c else ""
        if key:
            req = HttpRequest()
            req.session = import_module(settings.SESSION_ENGINE).SessionStore(key)
            got = get_user(req)
            u = got if isinstance(got, User) else None
    if u is None or u.role not in ACTIVE_ROLES or not can_use(u):
        return None
    return u.tg_id


def visible_ids(tg_id: int) -> set[int]:
    from config.apps.staff.services import user_by_tg

    from .access import can_use, visible
    from .models import Account

    u = user_by_tg(tg_id)
    if u is None or not can_use(u):
        return set()
    return set(visible(u, Account.objects.all()).values_list("id", flat=True))


async def ws_app(scope: dict[str, Any], receive: Any, send: Any) -> None:
    msg = await receive()
    if msg["type"] != "websocket.connect":
        return
    h = _headers(scope)
    init = (parse_qs(scope.get("query_string", b"").decode()).get("init_data") or [""])[0]
    tg_id = await sync_to_async(_user_tg)(h.get("cookie", ""), init) if origin_ok(h) else None
    if tg_id is None:
        await send({"type": "websocket.close", "code": 4403})
        return
    allowed = await sync_to_async(visible_ids)(tg_id)
    seen_at = time.monotonic()
    await send({"type": "websocket.accept"})

    r = aredis.Redis.from_url(settings.REDIS_URL)
    ps = r.pubsub()
    try:
        await ps.subscribe(bus.EVENTS)
    except aredis.RedisError:
        await send({"type": "websocket.close", "code": 1011})
        await r.aclose()
        return

    async def forward() -> None:
        nonlocal allowed, seen_at
        while True:
            m = await ps.get_message(ignore_subscribe_messages=True, timeout=PING)
            if time.monotonic() - seen_at > REFRESH:  # yangi akkaunt / huquq o'zgarishi
                allowed = await sync_to_async(visible_ids)(tg_id)
                seen_at = time.monotonic()
                if not allowed and not await sync_to_async(_still_user)(tg_id):
                    await send({"type": "websocket.close", "code": 4403})
                    return
            if m is None:
                await send({"type": "websocket.send", "text": '{"type":"ping"}'})
                continue
            try:
                ev = json.loads(m["data"])
            except (ValueError, TypeError):
                continue
            if not isinstance(ev, dict):
                continue
            acc = _account_id(ev)
            if acc is None:
                continue
            if acc not in allowed:
                allowed = await sync_to_async(visible_ids)(tg_id)  # yangi yaratilgan akkaunt bo'lishi mumkin
                seen_at = time.monotonic()
                if acc not in allowed:
                    continue
            await send({"type": "websocket.send", "text": json.dumps(_public(ev))})

    async def until_closed() -> None:
        while (await receive())["type"] != "websocket.disconnect":
            pass

    tasks = [asyncio.create_task(forward()), asyncio.create_task(until_closed())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for t in tasks:
            t.cancel()
        with contextlib.suppress(Exception):
            await ps.unsubscribe(bus.EVENTS)
            await ps.aclose()
            await r.aclose()


def _account_id(ev: dict[str, Any]) -> int | None:
    acc = ev.get("account")
    if isinstance(acc, dict):  # akkaunt holati hodisasi — butun obyekt
        acc = acc.get("id")
    return acc if isinstance(acc, int) else None


def _still_user(tg_id: int) -> bool:
    from config.apps.core.auth import ACTIVE_ROLES
    from config.apps.staff.services import user_by_tg

    from .access import can_use

    u = user_by_tg(tg_id)
    return bool(u and u.role in ACTIVE_ROLES and can_use(u))


# brauzerga faqat shu maydonlar (matn yo'q)
PUBLIC_KEYS = ("type", "account", "op", "peer", "msg_id", "ids", "out", "outbox", "max_id", "online", "user", "action")


def _public(ev: dict[str, Any]) -> dict[str, Any]:
    out = {k: ev[k] for k in PUBLIC_KEYS if k in ev}
    out["account"] = _account_id(ev)
    return out


def wrap(app: Any) -> Any:
    """ASGI: TelegramCRM WebSocket — shu yerda; qolganlari ichki ilovaga (CRM WebSocket + Django)."""

    async def asgi(scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] == "websocket" and scope.get("path") in PATHS:
            return await ws_app(scope, receive, send)
        return await app(scope, receive, send)

    return asgi

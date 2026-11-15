"""CRM Telegram — real vaqt (WebSocket): yangi/tahrirlangan/o'chirilgan xabar → Redis `crm:tg` → ochiq brauzerlarga.

publish() — sinxron (webhook, javob yuborish ichidan), Redis bo'lmasa jim o'tadi (frontend zaxira so'rovi bilan yangilanadi).
ws_app — ASGI WebSocket `/app/api/erp/crm/tg/ws/`: kirish — sessiya cookie yoki `?init_data=` (Telegram Mini App;
brauzer WebSocket'ga sarlavha qo'ya olmaydi), Origin — shu sayt yoki CSRF_TRUSTED_ORIGINS. Huquq — HTTP API bilan bir xil:
CRM moduli; har kim faqat o'z chatlari hodisalarini oladi (rahbar ham). Xabar matni yuborilmaydi — faqat "shu chat
yangilandi" (`{type: "tg", chat}`); ma'lumotni brauzer odatdagi API'dan (huquq tekshiruvi bilan) oladi.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from http.cookies import SimpleCookie
from importlib import import_module
from typing import Any
from urllib.parse import parse_qs, urlsplit

import redis
import redis.asyncio as aredis
from asgiref.sync import sync_to_async
from django.conf import settings
from django.http import HttpRequest

log = logging.getLogger(__name__)
CHANNEL = "crm:tg"
PATHS = ("/app/api/erp/crm/tg/ws", "/app/api/erp/crm/tg/ws/")
PING = 25  # s — tunnel/proksi bo'sh ulanishni uzmasin

_pub: redis.Redis | None = None


def publish(chat_pk: int, seller_tg: int) -> None:
    global _pub
    try:
        _pub = _pub or redis.Redis.from_url(settings.REDIS_URL, socket_timeout=2, socket_connect_timeout=2)
        _pub.publish(CHANNEL, json.dumps({"chat": chat_pk, "seller": seller_tg}))
    except redis.RedisError as e:  # Redis yo'q — real vaqt yo'q, zaxira so'rov ishlaydi
        log.warning("crm tg live: Redis'ga yuborilmadi: %s", e)


# ------------------------------------------------------------------ kirish
def _headers(scope: dict[str, Any]) -> dict[str, str]:
    return {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}


def origin_ok(h: dict[str, str]) -> bool:
    """Boshqa saytdan cookie bilan ulanish (CSWSH) yopiq: Origin — shu host yoki ishonchli manzillar."""
    origin = h.get("origin", "")
    if not origin:
        return True  # brauzer emas (Origin'siz) — cookie'ni boshqa sayt ishlata olmaydi
    netloc = urlsplit(origin).netloc
    hosts = {h.get("host", ""), h.get("x-forwarded-host", "")}
    return netloc in hosts or origin.rstrip("/") in {o.rstrip("/") for o in settings.CSRF_TRUSTED_ORIGINS}


def _user_sync(cookie: str, init_data: str) -> dict[str, Any] | None:
    from django.contrib.auth import get_user

    from config.apps.core.auth import ACTIVE_ROLES, verify_init_data
    from config.apps.staff.services import User, user_by_tg

    from .access import is_sales_head

    u = None
    if init_data:
        tg = verify_init_data(init_data, settings.TELEGRAM_BOT_TOKEN)
        u = user_by_tg(int(tg["id"])) if tg else None
    else:
        c = SimpleCookie()
        c.load(cookie)
        key = c[settings.SESSION_COOKIE_NAME].value if settings.SESSION_COOKIE_NAME in c else ""
        if key:
            req = HttpRequest()
            req.session = import_module(settings.SESSION_ENGINE).SessionStore(key)
            got = get_user(req)  # sessiya xeshi ham tekshiriladi (parol/chiqish)
            u = got if isinstance(got, User) else None
    if u is None or u.role not in ACTIVE_ROLES or not u.can_module("crm"):
        return None
    return {"tg_id": u.tg_id, "head": is_sales_head(u)}


# ------------------------------------------------------------------ ASGI
async def ws_app(scope: dict[str, Any], receive: Any, send: Any) -> None:
    msg = await receive()
    if msg["type"] != "websocket.connect":
        return
    h = _headers(scope)
    init = (parse_qs(scope.get("query_string", b"").decode()).get("init_data") or [""])[0]
    me = await sync_to_async(_user_sync)(h.get("cookie", ""), init) if origin_ok(h) else None
    if me is None:
        await send({"type": "websocket.close", "code": 4403})
        return
    await send({"type": "websocket.accept"})

    r = aredis.Redis.from_url(settings.REDIS_URL)
    ps = r.pubsub()
    try:
        await ps.subscribe(CHANNEL)
    except aredis.RedisError:
        await send({"type": "websocket.close", "code": 1011})
        await r.aclose()
        return

    async def forward() -> None:
        while True:
            m = await ps.get_message(ignore_subscribe_messages=True, timeout=PING)
            if m is None:
                await send({"type": "websocket.send", "text": '{"type":"ping"}'})
                continue
            try:
                ev = json.loads(m["data"])
            except (ValueError, TypeError):
                continue
            if ev.get("seller") == me["tg_id"]:  # yozishmalar shaxsiy — faqat egasiga
                await send({"type": "websocket.send", "text": json.dumps({"type": "tg", "chat": ev.get("chat")})})

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
            await ps.unsubscribe(CHANNEL)
            await ps.aclose()
            await r.aclose()


def wrap(django_app: Any) -> Any:
    """ASGI: CRM Telegram WebSocket — shu yerda; qolgan WebSocket'lar yopiladi; HTTP — Django."""

    async def app(scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] == "websocket":
            if scope.get("path") in PATHS:
                return await ws_app(scope, receive, send)
            await receive()
            return await send({"type": "websocket.close", "code": 4404})
        return await django_app(scope, receive, send)

    return app

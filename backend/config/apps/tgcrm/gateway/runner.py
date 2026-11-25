"""Gateway jarayoni: bitta nusxa (Redis qulf), akkaunt ishchilari, Django buyruqlarini bajarish.

Qulf yo'qolsa (boshqa nusxa ishga tushgan yoki Redis uzilgan) — darhol barcha clientlar uziladi: bitta sessiyani ikki
joyda ishlatish `AUTH_KEY_DUPLICATED` bilan sessiyani o'ldiradi.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import socket
import time
import uuid
from collections.abc import Awaitable, Callable
from typing import Any, Protocol

from asgiref.sync import sync_to_async

from .. import bus
from . import store
from .client import make_client
from .errors import GatewayError
from .worker import AccountWorker, ClientFactory

log = logging.getLogger(__name__)
LOCK_TTL = 30
LOCK_EVERY = 10
JANITOR_EVERY = 30 * 60


class Bus(Protocol):
    async def acquire(self, token: str) -> bool: ...
    async def refresh(self, token: str) -> bool: ...
    async def release(self, token: str) -> None: ...
    async def next_command(self, timeout: int) -> dict[str, Any] | None: ...
    async def reply(self, cmd_id: str, payload: dict[str, Any]) -> None: ...
    async def publish(self, event: dict[str, Any]) -> None: ...
    async def info(self, data: dict[str, Any]) -> None: ...


class RedisBus:
    """bus.py kelishuvining asinxron (gateway) tomoni."""

    _REFRESH = (
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end"
    )
    _RELEASE = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"

    def __init__(self, url: str):
        import redis.asyncio as aredis

        self.r = aredis.Redis.from_url(url, socket_connect_timeout=3)

    async def acquire(self, token: str) -> bool:
        return bool(await self.r.set(bus.LOCK, token, nx=True, ex=LOCK_TTL))

    async def refresh(self, token: str) -> bool:
        return bool(await self.r.eval(self._REFRESH, 1, bus.LOCK, token, LOCK_TTL))  # type: ignore[misc]

    async def release(self, token: str) -> None:
        await self.r.eval(self._RELEASE, 1, bus.LOCK, token)  # type: ignore[misc]
        await self.r.delete(bus.INFO)

    async def info(self, data: dict[str, Any]) -> None:
        await self.r.set(bus.INFO, json.dumps(data, default=str), ex=LOCK_TTL)

    async def next_command(self, timeout: int) -> dict[str, Any] | None:
        got = await self.r.blpop([bus.CMD], timeout=timeout)  # type: ignore[misc]
        if not got:
            return None
        try:
            return json.loads(got[1])
        except ValueError:
            return None

    async def reply(self, cmd_id: str, payload: dict[str, Any]) -> None:
        key = bus.reply_key(cmd_id)
        await self.r.rpush(key, json.dumps(payload, default=str))  # type: ignore[misc]
        await self.r.expire(key, bus.REPLY_TTL)

    async def publish(self, event: dict[str, Any]) -> None:
        try:
            await self.r.publish(bus.EVENTS, json.dumps(event, default=str))
        except Exception as e:
            log.warning("tgcrm publish: %s", e)


class Gateway:
    def __init__(self, bus_: Bus, factory: ClientFactory = make_client):
        self.bus = bus_
        self.factory = factory
        self.workers: dict[int, AccountWorker] = {}
        self.token = uuid.uuid4().hex
        self.started_at = time.time()
        self._stop = asyncio.Event()
        self._tasks: set[asyncio.Task] = set()

    def worker(self, account_id: int) -> AccountWorker:
        w = self.workers.get(account_id)
        if w is None:
            w = self.workers[account_id] = AccountWorker(account_id, self.factory, self.bus.publish)
        return w

    # ------------------------------------------------------------------ hayot tsikli
    async def run(self) -> None:
        if not await self.bus.acquire(self.token):
            raise RuntimeError("Gateway allaqachon ishlayapti (Redis qulfi band). Ikkinchi nusxa ishga tushirilmaydi.")
        log.info("tgcrm gateway: ishga tushdi")
        keeper = asyncio.create_task(self._keep_lock())
        janitor = asyncio.create_task(self._janitor())
        try:
            for aid in await sync_to_async(store.runnable_ids)():
                await self.worker(aid).start()
            while not self._stop.is_set():
                cmd = await self.bus.next_command(timeout=2)
                if cmd is not None:
                    self._spawn(self.handle(cmd))
        finally:
            keeper.cancel()
            janitor.cancel()
            await self.shutdown()

    def stop(self) -> None:
        self._stop.set()

    async def _keep_lock(self) -> None:
        while not self._stop.is_set():
            await asyncio.sleep(LOCK_EVERY)
            ok = False
            with contextlib.suppress(Exception):
                ok = await self.bus.refresh(self.token)
            if not ok:
                log.error("tgcrm gateway: qulf yo'qoldi — barcha akkauntlar uziladi")
                self.stop()
                return
            with contextlib.suppress(Exception):
                await self.bus.info(self.snapshot())

    def snapshot(self) -> dict[str, Any]:
        """Sog'liq paneli uchun: ishga tushgan vaqt, akkauntlar (ulanganmi, oxirgi yangilanish)."""
        return {
            "started_at": self.started_at,
            "pid": os.getpid(),
            "host": socket.gethostname(),
            "accounts": {
                str(i): {"authorized": w.authorized, "last_update": w.last_update} for i, w in self.workers.items()
            },
        }

    async def _janitor(self) -> None:
        """Media keshi hajmi (TGCRM_MEDIA_MAX_MB) — har 30 daqiqada."""
        from django.conf import settings

        from . import media

        while not self._stop.is_set():
            try:
                res = await asyncio.to_thread(media.cleanup, settings.TGCRM_MEDIA_MAX_MB * 1024 * 1024)
                if res["removed"]:
                    log.info(
                        "tgcrm media: %s fayl o'chirildi, kesh %s MB", res["removed"], res["bytes"] // 1024 // 1024
                    )
            except Exception:
                log.exception("tgcrm media tozalash")
            await asyncio.sleep(JANITOR_EVERY)

    async def shutdown(self) -> None:
        for t in list(self._tasks):
            t.cancel()
        await asyncio.gather(*(w.close() for w in self.workers.values()), return_exceptions=True)
        with contextlib.suppress(Exception):
            await self.bus.release(self.token)
        log.info("tgcrm gateway: to'xtadi")

    def _spawn(self, coro: Awaitable[Any]) -> None:
        t = asyncio.ensure_future(coro)
        self._tasks.add(t)
        t.add_done_callback(self._tasks.discard)

    # ------------------------------------------------------------------ buyruqlar
    async def handle(self, cmd: dict[str, Any]) -> None:
        cid = str(cmd.get("id") or "")
        try:
            data = await self.dispatch(
                str(cmd.get("op") or ""), cmd.get("account"), cmd.get("args") or {}, cmd.get("actor")
            )
            payload: dict[str, Any] = {"ok": True, "data": data}
        except GatewayError as e:
            payload = {"ok": False, "status": e.status, "detail": e.detail}
        except Exception as e:
            log.exception("tgcrm buyruq %s", cmd.get("op"))
            payload = {"ok": False, "status": 500, "detail": f"Telegram xatosi: {e}"[:300]}
        if cid:
            await self.bus.reply(cid, payload)

    async def dispatch(self, op: str, account: Any, args: dict[str, Any], actor: Any) -> dict[str, Any]:
        if op == "ping":
            return {"accounts": {i: w.authorized for i, w in self.workers.items()}}
        if not isinstance(account, int) or not await sync_to_async(store.account_exists)(account):
            raise GatewayError(404, "Akkaunt topilmadi.")
        w = self.worker(account)
        actor_tg = actor if isinstance(actor, int) else None
        handlers: dict[str, Callable[[], Awaitable[dict[str, Any]]]] = {
            "login.code": lambda: w.send_code(str(args.get("phone") or ""), actor_tg),
            "login.sign_in": lambda: w.sign_in(str(args.get("code") or ""), actor_tg),
            "login.password": lambda: w.password(str(args.get("password") or ""), actor_tg),
            "login.qr": lambda: w.qr_start(actor_tg),
            "login.qr_state": _const(w.qr_state),
            "login.cancel": lambda: w.cancel(actor_tg),
            "account.logout": lambda: self._logout(account, actor_tg),
            "account.refresh": w.refresh,
            "account.restart": lambda: self._restart(account),
            "chats.sync": w.sync.dialogs,
            "chats.history": lambda: w.sync.history(_int(args.get("peer"))),
            "chats.read": lambda: w.sync.read(_int(args.get("peer")), _int(args.get("max_id"))),
            "chats.send": lambda: w.sync.send(
                _int(args.get("peer")),
                str(args.get("text") or ""),
                _int(args["reply_to"]) if args.get("reply_to") else None,
                actor_tg,
                bool(args.get("ai")),
            ),
            "chats.typing": lambda: w.sync.typing(_int(args.get("peer"))),
            "msg.edit": lambda: w.actions.edit(
                _int(args.get("peer")), _int(args.get("msg_id")), str(args.get("text") or ""), actor_tg
            ),
            "msg.delete": lambda: w.actions.delete(
                _int(args.get("peer")), _ints(args.get("ids")), bool(args.get("revoke")), actor_tg
            ),
            "msg.forward": lambda: w.actions.forward(
                _int(args.get("peer")), _ints(args.get("ids")), _int(args.get("to")), actor_tg
            ),
            "msg.react": lambda: w.actions.react(
                _int(args.get("peer")), _int(args.get("msg_id")), str(args.get("emoji") or "") or None
            ),
            "msg.pin": lambda: w.actions.pin_message(
                _int(args.get("peer")), _int(args.get("msg_id")), bool(args.get("unpin"))
            ),
            "chat.pin": lambda: w.actions.chat_pin(_int(args.get("peer")), bool(args.get("pinned"))),
            "chat.archive": lambda: w.actions.chat_archive(_int(args.get("peer")), bool(args.get("archived"))),
            "chat.mute": lambda: w.actions.chat_mute(
                _int(args.get("peer")), None if args.get("seconds") is None else _int(args.get("seconds"))
            ),
            "chat.info": lambda: w.actions.info(_int(args.get("peer"))),
            "chat.members": lambda: w.actions.members(_int(args.get("peer")), str(args.get("q") or "")),
            "chat.search": lambda: w.actions.search(
                _int(args.get("peer")),
                str(args.get("q") or ""),
                str(args.get("filter") or ""),
                _int(args.get("offset_id") or 0),
            ),
            "chat.avatar": lambda: w.actions.avatar(_int(args.get("peer"))),
            "media.download": lambda: w.media.download(
                _int(args.get("peer")), _int(args.get("msg_id")), bool(args.get("thumb"))
            ),
            "media.send": lambda: w.media.send_file(
                _int(args.get("peer")),
                str(args.get("upload") or ""),
                str(args.get("name") or "fayl"),
                str(args.get("kind") or "file"),
                str(args.get("caption") or ""),
                _int(args["reply_to"]) if args.get("reply_to") else None,
                actor_tg,
            ),
        }
        h = handlers.get(op)
        if h is None:
            raise GatewayError(400, f"Noma'lum buyruq: {op}")
        return await h()

    async def _logout(self, account: int, actor: int | None) -> dict[str, Any]:
        res = await self.worker(account).logout(actor)
        self.workers.pop(account, None)
        return res

    async def _restart(self, account: int) -> dict[str, Any]:
        w = self.worker(account)
        await w.close()
        return {"ok": await w.start()}


def _int(v: Any) -> int:
    try:
        return int(v)
    except (TypeError, ValueError) as e:
        raise GatewayError(400, "Noto'g'ri raqam.") from e


def _ints(v: Any) -> list[int]:
    if not isinstance(v, list) or len(v) > 100:
        raise GatewayError(400, "Xabarlar ro'yxati noto'g'ri (100 tagacha).")
    return [_int(x) for x in v]


def _const(fn: Callable[[], dict[str, Any]]) -> Callable[[], Awaitable[dict[str, Any]]]:
    async def run() -> dict[str, Any]:
        return fn()

    return run

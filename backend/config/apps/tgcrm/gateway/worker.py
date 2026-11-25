"""Bitta Telegram akkaunti ishchisi: ulanish, kirish (kod / 2FA / QR), qayta ulanish, xatoga qarab holat.

Har akkauntga bitta `TelegramClient` (bitta sessiya — bitta jarayon). Sessiya `DbSession` da, bazaga asinxron yoziladi.
Barcha Telegram so'rovlari `call(kind, ...)` orqali — cheklagich + xato siyosati bir joyda.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any

from asgiref.sync import sync_to_async
from telethon import TelegramClient
from telethon import errors as te
from telethon.tl import functions, types

from .. import alerts
from ..models import Status
from . import store
from .actions import Actions
from .client import fetch_limits
from .errors import GatewayError, fatal, flood_text, is_frozen, login_error
from .limiter import Limiter
from .media import Media
from .session import DbSession, Snapshot
from .sync import Sync

log = logging.getLogger(__name__)
ClientFactory = Callable[[DbSession], TelegramClient]
Publish = Callable[[dict[str, Any]], Awaitable[None]]

QR_TOTAL = 300  # s — QR kutish umumiy muddati (har ~30 s yangilanadi)
BACKOFF = (5, 15, 60, 180, 300)  # s — aloqa uzilganda qayta ulanish oraliqlari

SENT_VIA = {
    types.auth.SentCodeTypeApp: "Telegram ilovasiga (boshqa qurilmangizga)",
    types.auth.SentCodeTypeSms: "SMS orqali",
    types.auth.SentCodeTypeCall: "qo'ng'iroq orqali",
    types.auth.SentCodeTypeFlashCall: "qo'ng'iroq (flash) orqali",
    types.auth.SentCodeTypeMissedCall: "o'tkazib yuborilgan qo'ng'iroq raqami orqali",
    types.auth.SentCodeTypeFragmentSms: "Fragment SMS orqali",
    types.auth.SentCodeTypeEmailCode: "emailga",
}


def a[T](fn: Callable[..., T]) -> Callable[..., Awaitable[T]]:
    return sync_to_async(fn, thread_sensitive=True)


class AccountWorker:
    def __init__(self, account_id: int, factory: ClientFactory, publish: Publish):
        self.id = account_id
        self._factory = factory
        self._publish = publish
        self.client: TelegramClient | None = None
        self.session: DbSession | None = None
        self.limiter = Limiter()
        self.authorized = False
        self.me_id: int | None = None
        self.last_update: float | None = None  # oxirgi Telegram yangilanishi (sog'liq paneli)
        self.sync = Sync(self)
        self.media = Media(self)
        self.actions = Actions(self)
        self._phone = ""
        self._qr: Any = None
        self._qr_task: asyncio.Task | None = None
        self._watch_task: asyncio.Task | None = None
        self._closing = False
        self._write_lock = asyncio.Lock()
        self._writes: set[asyncio.Task] = set()  # sessiya yozuvlari
        self._bg: set[asyncio.Task] = set()  # qayta ulanish vazifalari

    # ------------------------------------------------------------------ sessiya va client
    def _persist(self, snap: Snapshot) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        t = loop.create_task(self._write(snap))
        self._writes.add(t)
        t.add_done_callback(self._writes.discard)

    async def _write(self, snap: Snapshot) -> None:
        async with self._write_lock:
            try:
                await a(store.save_snapshot)(self.id, snap)
            except Exception:
                log.exception("tgcrm #%s: sessiya saqlanmadi", self.id)
                if self.session is not None:  # entity'lar yo'qolmasin — keyingi saqlashda qayta
                    self.session.mark_dirty(snap.get("entities") or ())

    async def flush(self, full: bool = False) -> None:
        if self.session is not None:
            await self._write(self.session.snapshot(full=full))
        await self._settle()

    async def _settle(self) -> None:
        """Navbatdagi sessiya yozuvlari tugashini kutadi."""
        if self._writes:
            await asyncio.gather(*list(self._writes), return_exceptions=True)

    async def _open(self, fresh: bool = False) -> TelegramClient:
        if self.client is not None:
            return self.client
        snap = None if fresh else await a(store.load_snapshot)(self.id)
        self.session = DbSession(snap, persist=self._persist)
        self.client = self._factory(self.session)
        await self.client.connect()
        return self.client

    async def _drop_client(self, discard: bool = False) -> None:
        """Clientni uzadi. discard=True — sessiya saqlanmaydi (keyin o'chiriladi; eski yozuv uni "tiriltirmasin")."""
        if discard and self.session is not None:
            self.session._persist = None
        for t in (self._qr_task, self._watch_task):
            if t is not None and t is not asyncio.current_task():
                t.cancel()
        self._qr_task = self._watch_task = None
        self._qr = None
        c, self.client = self.client, None
        self.authorized = False
        if c is not None:
            with contextlib.suppress(Exception):
                await c.disconnect()  # disconnect → session.save() → _persist
        await self._settle()

    async def _discard(self) -> None:
        """Clientni uzib, sessiyani bazadan butunlay o'chiradi."""
        await self._drop_client(discard=True)
        await a(store.clear_session)(self.id)

    async def close(self) -> None:
        """Gateway to'xtaganda: sessiyani saqlab, uziladi (holat o'zgarmaydi)."""
        self._closing = True
        for t in list(self._bg):
            t.cancel()
        c = self.client
        await self._drop_client()
        if c is not None and self.session is not None:
            await self.flush(full=True)

    # ------------------------------------------------------------------ holat
    async def _set(self, **fields: Any) -> dict[str, Any] | None:
        pub = await a(store.update_account)(self.id, **fields)
        if pub is not None:
            await self._publish({"type": "account", "account": pub})
            if "status" in fields:  # muhim holat — mas'ullarga ogohlantirish (xatosi gateway'ni to'xtatmaydi)
                try:
                    await a(alerts.account_changed)(
                        self.id, str(fields["status"]), str(fields.get("status_detail") or "")
                    )
                except Exception:
                    log.exception("tgcrm #%s: ogohlantirish yuborilmadi", self.id)
        return pub

    async def _event(self, kind: str, detail: str = "", actor: int | None = None) -> None:
        await a(store.event)(self.id, kind, detail, actor)

    # ------------------------------------------------------------------ ishga tushirish (avtorizatsiyadan o'tgan)
    async def start(self) -> bool:
        self._closing = False
        try:
            c = await self._open()
            if not await c.is_user_authorized():
                await self._discard()
                await self._set(status=Status.LOGGED_OUT, status_detail="Sessiya yaroqsiz. Qayta ulang.")
                await self._event("logged_out", "ishga tushishda avtorizatsiya yo'q")
                return False
            me = await c.get_me()
            await self._authorized(me, fresh=False)
            return True
        except Exception as e:
            if await self._on_error(e):
                return False
            log.warning("tgcrm #%s: ulanmadi: %s", self.id, e)
            await self._drop_client()
            await self._set(status=Status.OFFLINE, status_detail=f"Ulanmadi: {e}"[:300])
            self._schedule_retry(0)
            return False

    def _schedule_retry(self, attempt: int) -> None:
        if self._closing:
            return
        delay = BACKOFF[min(attempt, len(BACKOFF) - 1)]

        async def later() -> None:
            await asyncio.sleep(delay)
            if not self._closing and self.client is None and not await self.start():
                self._schedule_retry(attempt + 1)

        self._bg_task(later())

    def _watch(self) -> None:
        """Telethon o'zi qayta ulanadi; urinishlar tugasa `disconnected` tugaydi → biz qayta ko'taramiz."""
        c = self.client
        if c is None:
            return

        async def run() -> None:
            with contextlib.suppress(Exception):
                await c.disconnected
            if self._closing or self.client is not c:
                return
            self.client = None
            self.authorized = False
            await self._set(status=Status.OFFLINE, status_detail="Telegram bilan aloqa uzildi, qayta ulanmoqda…")
            await self._event("offline")
            self._schedule_retry(0)

        self._watch_task = asyncio.get_running_loop().create_task(run())

    async def _authorized(self, me: Any, fresh: bool) -> None:
        if me is None:
            raise GatewayError(500, "Telegram foydalanuvchi ma'lumotini bermadi.")
        if await a(store.tg_user_taken)(self.id, me.id):
            with contextlib.suppress(Exception):
                if fresh and self.client is not None:
                    await self.client.log_out()  # faqat shu yangi sessiya yopiladi
            await self._discard()
            detail = "Bu Telegram akkaunti allaqachon boshqa kartada ulangan."
            await self._set(status=Status.NEW, status_detail=detail)
            raise GatewayError(409, detail)
        assert self.client is not None
        self.me_id = me.id
        premium = bool(getattr(me, "premium", False))
        limits: dict[str, Any] = {}
        try:
            limits = await fetch_limits(self.client, premium)
        except Exception as e:  # limitlar ixtiyoriy — standartlar bilan davom etadi
            log.info("tgcrm #%s: appConfig o'qilmadi: %s", self.id, e)
        self.authorized = True
        name = " ".join(x for x in (getattr(me, "first_name", ""), getattr(me, "last_name", "")) if x)
        fields: dict[str, Any] = {
            "tg_user_id": me.id,
            "username": getattr(me, "username", None) or "",
            "name": name,
            "premium": premium,
            "status": Status.ACTIVE,
            "status_detail": "",
            "limits": limits,
        }
        if getattr(me, "phone", None):
            fields["phone"] = f"+{me.phone.lstrip('+')}"
        if limits.get("freeze_since_date"):
            fields["status"] = Status.FROZEN
            fields["status_detail"] = _frozen_text(limits)
        if fresh:
            fields["connected_at"] = store.now()
        await self._set(**fields)
        await self.flush(full=fresh)
        if fresh:
            await self._event("connected", name)
        self._watch()
        # jonli yangilanishlar + ro'yxat sinxroni (fonda; catch_up bo'shliqni o'zi to'ldiradi)
        self.sync.attach(self.client)
        self._bg_task(self._sync_dialogs())

    async def _sync_dialogs(self) -> None:
        try:
            res = await self.sync.dialogs()
            log.info("tgcrm #%s: %s chat, %s papka sinxronlandi", self.id, res["dialogs"], res["folders"])
        except GatewayError as e:
            log.warning("tgcrm #%s: chatlar sinxronlanmadi: %s", self.id, e.detail)
        except Exception:
            log.exception("tgcrm #%s: chatlar sinxronlanmadi", self.id)

    def _bg_task(self, coro: Any) -> None:
        t = asyncio.get_running_loop().create_task(coro)
        self._bg.add(t)
        t.add_done_callback(self._bg.discard)

    # ------------------------------------------------------------------ xatolar
    async def _on_error(self, exc: BaseException) -> bool:
        """Akkaunt holatini o'zgartiradigan xato bo'lsa — qayta ishlaydi va True."""
        f = fatal(exc)
        if f is not None:
            await self._discard()
            await self._set(status=f.status, status_detail=f.detail)
            await self._event(f.status, f.detail)
            return True
        if is_frozen(exc):
            limits: dict[str, Any] = {}
            with contextlib.suppress(Exception):
                if self.client is not None:
                    limits = await fetch_limits(self.client, False)
            await self._set(status=Status.FROZEN, status_detail=_frozen_text(limits))
            await self._event("frozen")
            return True
        if isinstance(exc, te.PeerFloodError):
            detail = "Telegram akkauntni spam deb cheklagan: notanishlarga yozish yopiq. Telegram'da @SpamBot ga yozib tekshiring."
            await self._set(status=Status.LIMITED, status_detail=detail)
            await self._event("limited", detail)
            return True
        return False

    async def call[T](self, kind: str, fn: Callable[[TelegramClient], Awaitable[T]]) -> T:
        """Telegram so'rovi: cheklagich → so'rov → xato siyosati. Flood → GatewayError(429)."""
        if self.client is None or not self.authorized:
            raise GatewayError(409, "Akkaunt ulanmagan.")
        await self.limiter.slot(kind)
        try:
            return await fn(self.client)
        except te.FloodWaitError as e:
            self.limiter.on_flood(kind, e.seconds)
            until = store.now() + timedelta(seconds=e.seconds)
            await self._set(status=Status.FLOOD, flood_until=until, status_detail=f"{kind}: {flood_text(e.seconds)}")
            await self._event("flood", f"{kind} {e.seconds}s")
            raise GatewayError(429, f"Telegram {flood_text(e.seconds)} kutishni so'radi.") from e
        except Exception as e:
            if await self._on_error(e):
                raise GatewayError(409, "Akkaunt holati o'zgardi — kartani tekshiring.") from e
            raise

    # ------------------------------------------------------------------ kirish: kod
    async def _fresh(self) -> TelegramClient:
        self._closing = False
        await self._discard()
        return await self._open(fresh=True)

    async def send_code(self, phone: str, actor: int | None = None) -> dict[str, Any]:
        phone = "+" + "".join(ch for ch in phone if ch.isdigit())
        if len(phone) < 8:
            raise GatewayError(400, "Telefon raqamini xalqaro formatda kiriting: +998901234567.")
        c = await self._fresh()
        try:
            sent = await c.send_code_request(phone)
        except Exception as e:
            await self._drop_client()
            raise login_error(e) or e from e
        if isinstance(sent.type, types.auth.SentCodeTypeSetUpEmailRequired):
            await self._drop_client()
            raise GatewayError(
                400, "Telegram login emailini sozlashni talab qilyapti — avval telefonda kiring va email qo'shing."
            )
        self._phone = phone
        via = SENT_VIA.get(type(sent.type), "Telegram orqali")
        await self._set(status=Status.CODE_SENT, phone=phone, status_detail=f"Kod yuborildi: {via}")
        await self._event("code_sent", via, actor)
        return {"status": Status.CODE_SENT, "via": via}

    async def sign_in(self, code: str, actor: int | None = None) -> dict[str, Any]:
        if self.client is None or not self._phone:
            raise GatewayError(409, "Kirish boshlanmagan yoki shlyuz qayta ishga tushgan. Raqamni qayta kiriting.")
        code = "".join(ch for ch in code if ch.isdigit())
        try:
            me = await self.client.sign_in(phone=self._phone, code=code)
        except te.SessionPasswordNeededError:
            return await self._need_password()
        except Exception as e:
            raise login_error(e) or e from e
        await self._authorized(me, fresh=True)
        await self._event("signed_in", "kod", actor)
        return {"status": Status.ACTIVE}

    async def _need_password(self) -> dict[str, Any]:
        hint = ""
        with contextlib.suppress(Exception):
            if self.client is not None:
                hint = (await self.client(functions.account.GetPasswordRequest())).hint or ""
        detail = "Ikki bosqichli himoya (2FA) paroli kerak" + (f" · maslahat: {hint}" if hint else "")
        await self._set(status=Status.PASSWORD, status_detail=detail)
        return {"status": Status.PASSWORD, "hint": hint}

    async def password(self, password: str, actor: int | None = None) -> dict[str, Any]:
        if self.client is None:
            raise GatewayError(409, "Kirish boshlanmagan yoki shlyuz qayta ishga tushgan. Qaytadan boshlang.")
        if not password:
            raise GatewayError(400, "Parolni kiriting.")
        try:
            me = await self.client.sign_in(password=password)
        except Exception as e:
            raise login_error(e) or e from e
        await self._authorized(me, fresh=True)
        await self._event("signed_in", "2fa", actor)
        return {"status": Status.ACTIVE}

    # ------------------------------------------------------------------ kirish: QR
    async def qr_start(self, actor: int | None = None) -> dict[str, Any]:
        c = await self._fresh()
        try:
            self._qr = await c.qr_login()
        except Exception as e:
            await self._drop_client()
            raise login_error(e) or e from e
        await self._set(
            status=Status.QR, status_detail="Telefonda: Sozlamalar → Qurilmalar → Qurilma ulash → QR'ni skanerlang"
        )
        await self._event("qr", "", actor)
        self._qr_task = asyncio.get_running_loop().create_task(self._qr_loop())
        return self.qr_state()

    def qr_state(self) -> dict[str, Any]:
        if self._qr is None:
            return {"status": "", "url": "", "expires": None}
        return {"status": Status.QR, "url": self._qr.url, "expires": self._qr.expires.isoformat()}

    async def _qr_loop(self) -> None:
        loop = asyncio.get_running_loop()
        deadline = loop.time() + QR_TOTAL
        while True:
            try:
                me = await self._qr.wait()
            except TimeoutError:
                if loop.time() >= deadline:
                    await self._drop_client()
                    await self._set(status=Status.NEW, status_detail="QR muddati tugadi. Qaytadan boshlang.")
                    return
                try:
                    await self._qr.recreate()
                except Exception as e:
                    await self._qr_fail(e)
                    return
                continue
            except te.SessionPasswordNeededError:
                self._qr = None
                await self._need_password()
                return
            except asyncio.CancelledError:
                raise
            except Exception as e:
                await self._qr_fail(e)
                return
            self._qr = None
            self._qr_task = None
            try:
                await self._authorized(me, fresh=True)
                await self._event("signed_in", "qr")
            except GatewayError:
                pass  # holat _authorized ichida yozilgan
            return

    async def _qr_fail(self, e: BaseException) -> None:
        err = login_error(e)
        self._qr = None
        await self._drop_client()
        await self._set(status=Status.NEW, status_detail=(err.detail if err else f"QR xatosi: {e}")[:300])

    # ------------------------------------------------------------------ bekor qilish / chiqish
    async def cancel(self, actor: int | None = None) -> dict[str, Any]:
        await self._discard()
        self._phone = ""
        await self._set(status=Status.NEW, status_detail="")
        await self._event("login_cancel", "", actor)
        return {"status": Status.NEW}

    async def logout(self, actor: int | None = None) -> dict[str, Any]:
        """Telegram'da sessiyani yopadi (telefondagi "Qurilmalar" ro'yxatidan ham ketadi)."""
        self._closing = True
        if self.client is not None and self.authorized:
            with contextlib.suppress(Exception):
                await self.client.log_out()
        await self._discard()
        await self._set(status=Status.NEW, status_detail="", tg_user_id=None)
        await self._event("logout", "", actor)
        return {"status": Status.NEW}

    async def refresh(self) -> dict[str, Any]:
        me = await self.call("default", lambda c: c.get_me())
        await self._authorized(me, fresh=False)
        return {"status": Status.ACTIVE}


def _frozen_text(limits: dict[str, Any]) -> str:
    url = limits.get("freeze_appeal_url") or ""
    return "Akkaunt muzlatilgan: faqat o'qish mumkin." + (f" Apellyatsiya: {url}" if url else "")

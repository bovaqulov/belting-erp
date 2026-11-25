"""Akkaunt sinxroni (2-bosqich): dialoglar, papkalar, dangasa tarix, o'qildi, jonli yangilanishlar → baza → Redis.

Barcha Telegram so'rovlari `worker.call(kind, …)` orqali (cheklagich: dialogs 2 s, history 3 s — PLAN §1.3).
Brauzerga hodisa faqat "nima o'zgardi" (matnsiz) — ma'lumotni u API'dan huquq tekshiruvi bilan oladi.
"""

from __future__ import annotations

import asyncio
import contextlib
import datetime as dt
import logging
import time
from typing import TYPE_CHECKING, Any, cast

from asgiref.sync import sync_to_async
from telethon import TelegramClient, events, utils
from telethon.tl import functions, types

from . import chats, convert
from .errors import GatewayError, send_error

if TYPE_CHECKING:
    from .worker import AccountWorker

log = logging.getLogger(__name__)
PAGE_DIALOGS = 100
PAGE_HISTORY = 50
MAX_DIALOG_PAGES = 100  # 10 000 chat — undan ko'pi dangasa (kamdan-kam)


def a(fn: Any) -> Any:
    return sync_to_async(fn, thread_sensitive=True)


def _limits(account_id: int) -> dict[str, Any]:
    from ..models import Account

    return Account.objects.filter(pk=account_id).values_list("limits", flat=True).first() or {}


class Sync:
    def __init__(self, w: AccountWorker):
        self.w = w
        self._attached: TelegramClient | None = None
        self._folders_task: asyncio.Task | None = None

    @property
    def acc(self) -> int:
        return self.w.id

    async def emit(self, ev: dict[str, Any]) -> None:
        await self.w._publish({"account": self.acc, **ev})

    def _peers(self, res: Any) -> list[dict[str, Any]]:
        out = []
        for e in [*(getattr(res, "users", None) or ()), *(getattr(res, "chats", None) or ())]:
            f = convert.peer_fields(e, self.w.me_id)
            if f:
                out.append(f)
        return out

    async def input_peer(self, pid: int) -> Any:
        """Kesh (sessiya)dan — resolve so'rovisiz. Topilmasa: chat hali sinxronlanmagan."""
        c = self.w.client
        if c is None:
            raise GatewayError(409, "Akkaunt ulanmagan.")
        try:
            return await c.get_input_entity(pid)
        except (ValueError, TypeError) as e:
            raise GatewayError(404, "Chat topilmadi (ro'yxat hali sinxronlanmagan bo'lishi mumkin).") from e

    # ------------------------------------------------------------------ dialoglar
    async def dialogs(self) -> dict[str, int]:
        offset_date, offset_id, offset_peer = None, 0, types.InputPeerEmpty()
        seen: set[int] = set()
        pages = 0
        while pages < MAX_DIALOG_PAGES:
            pages += 1
            req = functions.messages.GetDialogsRequest(
                offset_date=offset_date,
                offset_id=offset_id,
                offset_peer=offset_peer,
                limit=PAGE_DIALOGS,
                hash=0,
                exclude_pinned=pages > 1,
            )
            res = await self.w.call("dialogs", lambda c, r=req: c(r))
            if isinstance(res, types.messages.DialogsNotModified):
                break
            raw = [d for d in res.dialogs if isinstance(d, types.Dialog)]
            rows = [convert.dialog_fields(d) for d in raw]
            fresh = [r for r in rows if r["peer_id"] not in seen]
            if not fresh:
                break
            seen.update(r["peer_id"] for r in fresh)
            msgs = [convert.message_fields(m) for m in res.messages]
            await a(chats.save_dialogs_page)(self.acc, self._peers(res), fresh, [m for m in msgs if m])
            await self.emit({"type": "dialogs"})
            if isinstance(res, types.messages.Dialogs) or len(res.dialogs) < PAGE_DIALOGS:
                break
            # keyingi sahifa: oxirgi dialogning oxirgi xabari (Telethon _DialogsIter kabi)
            last = raw[-1]
            by_id = {(convert.peer_id(m.peer_id), m.id): m for m in res.messages if hasattr(m, "peer_id")}
            lm = by_id.get((convert.peer_id(last.peer), last.top_message))
            ents = {utils.get_peer_id(e): e for e in [*res.users, *res.chats]}
            ent = ents.get(convert.peer_id(last.peer))
            if lm is None or ent is None:
                break
            offset_date, offset_id = lm.date, lm.id
            offset_peer = utils.get_input_peer(ent)
        nf = await self.folders()
        return {"dialogs": len(seen), "folders": nf}

    async def folders(self) -> int:
        res = await self.w.call("dialogs", lambda c: c(functions.messages.GetDialogFiltersRequest()))
        filters = getattr(res, "filters", res) or []
        rows = [r for r in (convert.folder_fields(f, i) for i, f in enumerate(filters)) if r]
        n = await a(chats.replace_folders)(self.acc, rows)
        await self.emit({"type": "folders"})
        return n

    def _folders_later(self) -> None:
        """Papka o'zgarishlari ketma-ket keladi — bir marta (2 s keyin) yangilanadi."""
        if self._folders_task and not self._folders_task.done():
            return

        async def run() -> None:
            await asyncio.sleep(2)
            with contextlib.suppress(Exception):
                await self.folders()

        self._folders_task = asyncio.get_running_loop().create_task(run())

    # ------------------------------------------------------------------ tarix (dangasa)
    async def history(self, pid: int) -> dict[str, Any]:
        """Uzluksiz oraliqni pastga davom ettiradi (yoki birinchi marta — eng yangi sahifa)."""
        state = await a(chats.dialog_state)(self.acc, pid)
        if state["complete"] and state["min_id"] is not None:
            return {"loaded": 0, **state}
        offset = state["min_id"] or 0
        peer = await self.input_peer(pid)
        req = functions.messages.GetHistoryRequest(
            peer=peer, offset_id=offset, offset_date=None, add_offset=0, limit=PAGE_HISTORY, max_id=0, min_id=0, hash=0
        )
        res = await self.w.call("history", lambda c: c(req))
        msgs = [m for m in (convert.message_fields(x) for x in getattr(res, "messages", ())) if m]
        out = await a(chats.save_history)(self.acc, pid, self._peers(res), msgs, PAGE_HISTORY, offset)
        await self.emit({"type": "history", "peer": pid})
        return out

    async def send(
        self, pid: int, text: str, reply_to: int | None, actor: int | None, ai: bool = False
    ) -> dict[str, Any]:
        """Matnli xabar (Telegram markdown'isiz — matn qanday yozilgan bo'lsa shunday). Yuborgan xodim — sent_by."""
        text = text.strip("\n")
        if not text.strip():
            raise GatewayError(400, "Bo'sh xabar yuborilmaydi.")
        limit = int((await a(_limits)(self.acc)).get("message") or 4096)
        if len(text) > limit:
            raise GatewayError(400, f"Xabar juda uzun: {len(text)} / {limit} belgi.")
        peer = await self.input_peer(pid)

        async def go(c: TelegramClient) -> Any:
            try:
                return await c.send_message(
                    peer, text, reply_to=cast(Any, reply_to), parse_mode=None, link_preview=True
                )
            except Exception as e:
                raise send_error(e) or e from e

        sent = await self.w.call("send", go)
        m = convert.message_fields(sent)
        if m is None:
            raise GatewayError(502, "Telegram xabarni qaytarmadi.")
        m["sent_by"] = actor
        m["by_ai"] = ai
        await a(chats.on_new_message)(self.acc, m, [])
        await self.emit({"type": "msg", "op": "new", "peer": pid, "msg_id": m["msg_id"], "out": True})
        return {"msg_id": m["msg_id"]}

    async def typing(self, pid: int) -> dict[str, Any]:
        peer = await self.input_peer(pid)
        req = functions.messages.SetTypingRequest(peer=peer, action=types.SendMessageTypingAction())
        try:
            await self.w.call("typing", lambda c: c(req))
        except GatewayError as e:
            if e.status != 429:  # tez-tez bosilgan — jim o'tadi
                raise
        return {"ok": True}

    async def read(self, pid: int, max_id: int) -> dict[str, Any]:
        """O'qildi — faqat operator chatni haqiqatan ochganda (ToS: o'qildi belgisini soxtalashtirish taqiqlangan)."""
        peer = await self.input_peer(pid)
        await self.w.call("read", lambda c: c.send_read_acknowledge(peer, max_id=max_id))
        await a(chats.mark_read_local)(self.acc, pid, max_id)
        await self.emit({"type": "dialog", "peer": pid})
        return {"ok": True}

    # ------------------------------------------------------------------ jonli
    def attach(self, c: TelegramClient) -> None:
        if self._attached is c:
            return
        self._attached = c
        c.add_event_handler(self._guard(self.on_new), events.NewMessage())
        c.add_event_handler(self._guard(self.on_edit), events.MessageEdited())
        c.add_event_handler(self._guard(self.on_deleted), events.MessageDeleted())
        c.add_event_handler(self._guard(self.on_raw), events.Raw())

    def _guard(self, fn: Any) -> Any:
        async def run(ev: Any) -> None:
            self.w.last_update = time.time()
            try:
                await fn(ev)
            except Exception:
                log.exception("tgcrm #%s: hodisa qayta ishlanmadi (%s)", self.acc, fn.__name__)

        run.__name__ = fn.__name__
        return run

    def _event_peers(self, ev: Any) -> list[dict[str, Any]]:
        ents = getattr(ev, "_entities", None) or {}
        return [f for f in (convert.peer_fields(e, self.w.me_id) for e in ents.values()) if f]

    async def on_new(self, ev: events.NewMessage.Event) -> None:
        m = convert.message_fields(ev.message)
        if m is None:
            return
        await a(chats.on_new_message)(self.acc, m, self._event_peers(ev))
        await self.emit({"type": "msg", "op": "new", "peer": m["peer_id"], "msg_id": m["msg_id"], "out": m["out"]})
        if (
            not m["out"] and m["peer_id"] > 0
        ):  # shaxsiy chatga kiruvchi — AI yordamchi (yoqilgan bo'lsa) rejalashtiriladi
            from .. import assistant

            try:
                await a(assistant.schedule)(self.acc, m["peer_id"], m["msg_id"])
            except Exception:
                log.exception("tgcrm #%s: AI rejalashtirilmadi", self.acc)

    async def on_edit(self, ev: events.MessageEdited.Event) -> None:
        m = convert.message_fields(ev.message)
        if m and await a(chats.on_edit)(self.acc, m, self._event_peers(ev)):
            await self.emit({"type": "msg", "op": "edit", "peer": m["peer_id"], "msg_id": m["msg_id"]})

    async def on_deleted(self, ev: events.MessageDeleted.Event) -> None:
        ids = list(ev.deleted_ids or ())
        channel = ev.chat_id if isinstance(ev.original_update, types.UpdateDeleteChannelMessages) else None
        for pid in await a(chats.on_delete)(self.acc, ids, channel):
            await self.emit({"type": "msg", "op": "delete", "peer": pid, "ids": ids})

    async def on_raw(self, u: Any) -> None:
        if isinstance(u, (types.UpdateReadHistoryInbox, types.UpdateReadHistoryOutbox)):
            out = isinstance(u, types.UpdateReadHistoryOutbox)
            pid = convert.peer_id(u.peer)
            still = None if out else u.still_unread_count
            if await a(chats.on_read)(self.acc, pid, u.max_id, out, still):
                await self.emit({"type": "read", "peer": pid, "outbox": out, "max_id": u.max_id})
        elif isinstance(u, (types.UpdateReadChannelInbox, types.UpdateReadChannelOutbox)):
            out = isinstance(u, types.UpdateReadChannelOutbox)
            pid = utils.get_peer_id(types.PeerChannel(u.channel_id))
            max_id = u.max_id
            still = None if out else u.still_unread_count
            if await a(chats.on_read)(self.acc, pid, max_id, out, still):
                await self.emit({"type": "read", "peer": pid, "outbox": out, "max_id": max_id})
        elif isinstance(u, types.UpdateUserStatus):
            pid = u.user_id
            online = isinstance(u.status, types.UserStatusOnline)
            seen = u.status.was_online if isinstance(u.status, types.UserStatusOffline) else None
            await a(chats.on_status)(self.acc, pid, online, seen)
            await self.emit({"type": "status", "peer": pid, "online": online})
        elif isinstance(u, types.UpdateUserTyping):
            await self.emit({"type": "typing", "peer": u.user_id, "user": u.user_id, "action": _typing(u.action)})
        elif isinstance(u, types.UpdateChatUserTyping):
            pid = utils.get_peer_id(types.PeerChat(u.chat_id))
            await self.emit(
                {"type": "typing", "peer": pid, "user": convert.peer_id(u.from_id), "action": _typing(u.action)}
            )
        elif isinstance(u, types.UpdateChannelUserTyping):
            pid = utils.get_peer_id(types.PeerChannel(u.channel_id))
            await self.emit(
                {"type": "typing", "peer": pid, "user": convert.peer_id(u.from_id), "action": _typing(u.action)}
            )
        elif isinstance(u, types.UpdateDialogPinned) and isinstance(u.peer, types.DialogPeer):
            await self._flags(convert.peer_id(u.peer.peer), pinned=bool(u.pinned))
        elif isinstance(u, types.UpdateFolderPeers):
            for fp in u.folder_peers:
                await self._flags(convert.peer_id(fp.peer), archived=fp.folder_id == 1)
        elif isinstance(u, types.UpdateNotifySettings) and isinstance(u.peer, types.NotifyPeer):
            mute = getattr(u.notify_settings, "mute_until", None)
            muted = mute if isinstance(mute, dt.datetime) and mute > dt.datetime.now(dt.UTC) else None
            await self._flags(convert.peer_id(u.peer.peer), muted_until=muted)
        elif isinstance(u, types.UpdateDraftMessage):
            text = u.draft.message if isinstance(u.draft, types.DraftMessage) else ""
            await self._flags(convert.peer_id(u.peer), draft=text or "")
        elif isinstance(u, types.UpdateMessageReactions):
            pid = convert.peer_id(u.peer)
            if await a(chats.set_reactions)(self.acc, pid, u.msg_id, convert.reactions_info(u.reactions)):
                await self.emit({"type": "msg", "op": "edit", "peer": pid, "msg_id": u.msg_id})
        elif isinstance(u, (types.UpdateDialogFilter, types.UpdateDialogFilters, types.UpdateDialogFilterOrder)):
            self._folders_later()

    async def _flags(self, pid: int, **flags: Any) -> None:
        if await a(chats.set_dialog_flags)(self.acc, pid, **flags):
            await self.emit({"type": "dialog", "peer": pid})


TYPING = {
    "SendMessageTypingAction": "typing",
    "SendMessageRecordAudioAction": "voice",
    "SendMessageUploadAudioAction": "voice",
    "SendMessageRecordVideoAction": "video",
    "SendMessageUploadVideoAction": "video",
    "SendMessageRecordRoundAction": "round",
    "SendMessageUploadPhotoAction": "photo",
    "SendMessageUploadDocumentAction": "file",
    "SendMessageChooseStickerAction": "sticker",
    "SendMessageCancelAction": "cancel",
}


def _typing(action: Any) -> str:
    return TYPING.get(type(action).__name__, "typing")

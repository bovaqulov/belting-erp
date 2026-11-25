"""5-bosqich: xabar va chat amallari — tahrir, o'chirish, uzatish, reaksiya, qadash; chatni qadash/ovozsiz/arxiv;
profil (bio, qadalgan xabar), a'zolar, chat ichida qidiruv va umumiy media, avatarlar.

O'chirish/tahrir/uzatish — akkaunt jurnaliga (AccountEvent) xodim bilan yoziladi (CRM audit).
"""

from __future__ import annotations

import datetime as dt
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any, cast

from asgiref.sync import sync_to_async
from telethon import TelegramClient
from telethon import errors as te
from telethon.tl import functions, types

from .. import files
from . import chats, convert, store
from .errors import GatewayError, send_error

if TYPE_CHECKING:
    from .worker import AccountWorker

log = logging.getLogger(__name__)
SEARCH_PAGE = 40
MEMBERS_MAX = 200
FILTERS: dict[str, Any] = {
    "": types.InputMessagesFilterEmpty,
    "photo": types.InputMessagesFilterPhotos,
    "video": types.InputMessagesFilterVideo,
    "file": types.InputMessagesFilterDocument,
    "link": types.InputMessagesFilterUrl,
    "voice": types.InputMessagesFilterVoice,
    "music": types.InputMessagesFilterMusic,
}


def a(fn: Any) -> Any:
    return sync_to_async(fn, thread_sensitive=True)


def action_error(exc: BaseException) -> GatewayError | None:
    table: list[tuple[type[BaseException], int, str]] = [
        (te.MessageEditTimeExpiredError, 403, "Tahrirlash muddati o'tgan (Telegram — 48 soat)."),
        (te.MessageNotModifiedError, 400, "Matn o'zgarmagan."),
        (te.MessageAuthorRequiredError, 403, "Faqat o'z xabaringizni tahrirlash mumkin."),
        (te.MessageDeleteForbiddenError, 403, "Bu xabarni o'chirish huquqi yo'q."),
        (te.MessageIdInvalidError, 404, "Xabar topilmadi (o'chirilgan bo'lishi mumkin)."),
        (te.ReactionInvalidError, 400, "Bu chatda bunday reaksiya ruxsat etilmagan."),
        (te.ReactionsTooManyError, 400, "Reaksiyalar soni chegarasi."),
        (te.ChatForwardsRestrictedError, 403, "Bu chatdan uzatish taqiqlangan."),
        (te.PinRestrictedError, 403, "Bu chatda xabar qadash huquqi yo'q."),
        (te.PinnedDialogsTooMuchError, 400, "Qadalgan chatlar chegarasi to'ldi — avval birini olib tashlang."),
    ]
    for cls, status, text in table:
        if isinstance(exc, cls):
            return GatewayError(status, text)
    return send_error(exc)


class Actions:
    def __init__(self, w: AccountWorker):
        self.w = w

    @property
    def acc(self) -> int:
        return self.w.id

    async def _do(self, kind: str, fn: Any) -> Any:
        async def go(c: TelegramClient) -> Any:
            try:
                return await fn(c)
            except Exception as e:
                raise action_error(e) or e from e

        return await self.w.call(kind, go)

    async def _peer(self, pid: int) -> Any:
        return await self.w.sync.input_peer(pid)

    async def _emit(self, ev: dict[str, Any]) -> None:
        await self.w.sync.emit(ev)

    # ------------------------------------------------------------------ xabarlar
    async def edit(self, pid: int, msg_id: int, text: str, actor: int | None) -> dict[str, Any]:
        text = text.strip("\n")
        if not text.strip():
            raise GatewayError(400, "Bo'sh matn bo'lmaydi.")
        peer = await self._peer(pid)
        res = await self._do("send", lambda c: c.edit_message(peer, msg_id, text, parse_mode=None))
        m = convert.message_fields(res)
        if m:
            await a(chats.on_edit)(self.acc, m, [])
        await a(store.event)(self.acc, "msg_edit", f"{pid}:{msg_id}", actor)
        await self._emit({"type": "msg", "op": "edit", "peer": pid, "msg_id": msg_id})
        return {"ok": True}

    async def delete(self, pid: int, ids: list[int], revoke: bool, actor: int | None) -> dict[str, Any]:
        if not ids:
            raise GatewayError(400, "Xabar tanlanmagan.")
        peer = await self._peer(pid)
        await self._do("send", lambda c: c.delete_messages(peer, ids, revoke=revoke))
        await a(chats.mark_deleted)(self.acc, pid, ids)
        await a(store.event)(
            self.acc, "msg_delete", f"{pid}:{','.join(map(str, ids))}{' (hamma uchun)' if revoke else ''}", actor
        )
        await self._emit({"type": "msg", "op": "delete", "peer": pid, "ids": ids})
        return {"ok": True}

    async def forward(self, pid: int, ids: list[int], to_pid: int, actor: int | None) -> dict[str, Any]:
        if not ids:
            raise GatewayError(400, "Xabar tanlanmagan.")
        src, dst = await self._peer(pid), await self._peer(to_pid)
        res = await self._do("send", lambda c: c.forward_messages(dst, ids, from_peer=src))
        sent = res if isinstance(res, list) else [res]
        for msg in sent:
            m = convert.message_fields(msg)
            if m:
                m["sent_by"] = actor
                await a(chats.on_new_message)(self.acc, m, [])
        await a(store.event)(self.acc, "msg_forward", f"{pid}:{','.join(map(str, ids))} → {to_pid}", actor)
        await self._emit({"type": "msg", "op": "new", "peer": to_pid, "out": True})
        return {"ok": True, "count": len(sent)}

    async def react(self, pid: int, msg_id: int, emoji: str | None) -> dict[str, Any]:
        peer = await self._peer(pid)
        reaction = [types.ReactionEmoji(emoticon=emoji)] if emoji else []
        req = functions.messages.SendReactionRequest(peer=peer, msg_id=msg_id, reaction=cast(Any, reaction))
        res = await self._do("send", lambda c: c(req))
        for u in getattr(res, "updates", None) or ():
            if isinstance(u, types.UpdateMessageReactions):
                await self.w.sync.on_raw(u)
        return {"ok": True}

    async def pin_message(self, pid: int, msg_id: int, unpin: bool) -> dict[str, Any]:
        peer = await self._peer(pid)
        if unpin:
            await self._do("send", lambda c: c.unpin_message(peer, msg_id))
        else:
            await self._do("send", lambda c: c.pin_message(peer, msg_id, notify=False))
        await self._emit({"type": "dialog", "peer": pid, "pinned_msg": 0 if unpin else msg_id})
        return {"ok": True}

    # ------------------------------------------------------------------ chat
    async def chat_pin(self, pid: int, pinned: bool) -> dict[str, Any]:
        peer = await self._peer(pid)
        req = functions.messages.ToggleDialogPinRequest(peer=types.InputDialogPeer(peer), pinned=pinned)
        await self._do("dialogs", lambda c: c(req))
        await a(chats.set_dialog_flags)(self.acc, pid, pinned=pinned)
        await self._emit({"type": "dialog", "peer": pid})
        return {"ok": True}

    async def chat_archive(self, pid: int, archived: bool) -> dict[str, Any]:
        peer = await self._peer(pid)
        await self._do("dialogs", lambda c: c.edit_folder(peer, 1 if archived else 0))
        await a(chats.set_dialog_flags)(self.acc, pid, archived=archived)
        await self._emit({"type": "dialog", "peer": pid})
        return {"ok": True}

    async def chat_mute(self, pid: int, seconds: int | None) -> dict[str, Any]:
        """seconds: None — ovozni yoqish; 0 — doimiy; >0 — shuncha vaqtga."""
        peer = await self._peer(pid)
        if seconds is None:
            until = None
        elif seconds == 0:
            until = dt.datetime(2038, 1, 1, tzinfo=dt.UTC)  # Telegram "doimiy" — uzoq sana
        else:
            until = dt.datetime.now(dt.UTC) + dt.timedelta(seconds=seconds)
        settings = types.InputPeerNotifySettings(mute_until=until or dt.datetime.fromtimestamp(0, dt.UTC))
        req = functions.account.UpdateNotifySettingsRequest(peer=types.InputNotifyPeer(peer), settings=settings)
        await self._do("dialogs", lambda c: c(req))
        await a(chats.set_dialog_flags)(self.acc, pid, muted_until=until)
        await self._emit({"type": "dialog", "peer": pid})
        return {"ok": True}

    async def info(self, pid: int) -> dict[str, Any]:
        """Profil: bio, qadalgan xabar, a'zolar soni. Qadalgan xabar bazaga yoziladi (ko'rsatish uchun)."""
        peer = await self._peer(pid)
        out: dict[str, Any] = {
            "about": "",
            "pinned_msg_id": None,
            "members": None,
            "admins": None,
            "common_chats": None,
        }
        if isinstance(peer, types.InputPeerUser):
            full = await self._do("default", lambda c: c(functions.users.GetFullUserRequest(peer)))
            fu = full.full_user
            out |= {"about": fu.about or "", "pinned_msg_id": fu.pinned_msg_id, "common_chats": fu.common_chats_count}
        elif isinstance(peer, types.InputPeerChannel):
            full = await self._do("default", lambda c: c(functions.channels.GetFullChannelRequest(peer)))
            fc = full.full_chat
            out |= {
                "about": fc.about or "",
                "pinned_msg_id": fc.pinned_msg_id,
                "members": fc.participants_count,
                "admins": fc.admins_count,
            }
        elif isinstance(peer, types.InputPeerChat):
            full = await self._do("default", lambda c: c(functions.messages.GetFullChatRequest(peer.chat_id)))
            fc = full.full_chat
            n = len(getattr(fc.participants, "participants", None) or [])
            out |= {"about": fc.about or "", "pinned_msg_id": fc.pinned_msg_id, "members": n or None}
        pin = out["pinned_msg_id"]
        if pin:
            msg = await self._do("download", lambda c: c.get_messages(peer, ids=pin))
            m = convert.message_fields(msg) if msg else None
            if m:
                await a(chats.save_loose)(self.acc, [], [m])
        return out

    async def members(self, pid: int, q: str) -> dict[str, Any]:
        """Guruh a'zolari (200 tagacha; katta guruhda — qidiruv bilan). Kanal — faqat admin bo'lsa."""
        peer = await self._peer(pid)
        if isinstance(peer, types.InputPeerUser):
            raise GatewayError(400, "Bu shaxsiy chat.")

        async def go(c: TelegramClient) -> list[Any]:
            try:
                return list(await c.get_participants(peer, limit=MEMBERS_MAX, search=q))
            except (te.ChatAdminRequiredError, te.ChannelPrivateError) as e:
                raise GatewayError(403, "A'zolar ro'yxati faqat adminlarga ko'rinadi.") from e

        users = await self.w.call("members", go)
        rows = []
        for u in users:
            f = convert.peer_fields(u, self.w.me_id)
            if not f:
                continue
            part = getattr(u, "participant", None)
            role = "owner" if isinstance(part, (types.ChannelParticipantCreator, types.ChatParticipantCreator)) else (
                "admin" if isinstance(part, (types.ChannelParticipantAdmin, types.ChatParticipantAdmin)) else ""
            )  # fmt: skip
            rows.append(f | {"role": role})
        await a(chats.upsert_peers)(self.acc, rows)
        rows.sort(key=lambda r: ({"owner": 0, "admin": 1}.get(r["role"], 2), not r.get("online"), r.get("title") or ""))
        return {"members": [_member_json(r) for r in rows], "limited": len(rows) >= MEMBERS_MAX}

    async def search(self, pid: int, q: str, flt: str, offset_id: int) -> dict[str, Any]:
        """Chat ichida qidiruv yoki umumiy media (rasm, fayl, havola …) — Telegram'dan, 40 tadan."""
        if flt not in FILTERS:
            raise GatewayError(400, "Noma'lum filtr.")
        if not q.strip() and not flt:
            raise GatewayError(400, "Qidiruv so'zini kiriting.")
        peer = await self._peer(pid)
        req = functions.messages.SearchRequest(
            peer=peer, q=q.strip(), filter=FILTERS[flt](), min_date=None, max_date=None, offset_id=offset_id,
            add_offset=0, limit=SEARCH_PAGE, max_id=0, min_id=0, hash=0,
        )  # fmt: skip
        res = await self.w.call("search", lambda c: c(req))
        msgs = [
            m for m in (convert.message_fields(x) for x in getattr(res, "messages", ())) if m and m["peer_id"] == pid
        ]
        await a(chats.save_loose)(self.acc, self.w.sync._peers(res), msgs)
        ids = [m["msg_id"] for m in msgs]
        return {"ids": ids, "has_more": len(msgs) >= SEARCH_PAGE, "total": getattr(res, "count", len(msgs))}

    async def avatar(self, pid: int) -> dict[str, Any]:
        """Profil rasmi (kichik, 160px) → kesh. Peer.photo_id o'zgarsa — yangi fayl."""
        photo_id = await a(chats.peer_photo_id)(self.acc, pid)
        if not photo_id:
            raise GatewayError(404, "Rasm yo'q.")
        path = files.avatar_path(self.acc, pid, photo_id)
        if path.is_file():
            return {"path": str(path.relative_to(files.root()))}
        peer = await self._peer(pid)
        path.parent.mkdir(parents=True, exist_ok=True)
        got = await self.w.call(
            "download", lambda c: c.download_profile_photo(peer, file=str(path), download_big=False)
        )
        if not got:
            raise GatewayError(404, "Rasm yuklab olinmadi.")
        p = Path(cast(str, got))
        if p != path and p.is_file():
            p.rename(path)
        return {"path": str(path.relative_to(files.root()))}


def _member_json(r: dict[str, Any]) -> dict[str, Any]:
    return {
        "peer_id": r["peer_id"],
        "title": r.get("title") or "",
        "username": r.get("username") or "",
        "kind": r.get("kind"),
        "online": bool(r.get("online")),
        "last_seen": r["last_seen"].isoformat() if r.get("last_seen") else None,
        "role": r.get("role") or "",
        "has_photo": r.get("photo_id") is not None,
        "is_self": bool(r.get("is_self")),
    }

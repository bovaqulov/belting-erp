"""Soxta TelegramClient — gateway mantig'ini haqiqiy Telegram'siz sinash uchun (Telethon xulqiga yaqin)."""

from __future__ import annotations

import asyncio
from typing import Any

from telethon.crypto import AuthKey
from telethon.tl import functions, types


def user(uid: int = 777, first: str = "Ali", phone: str = "998901112233", premium: bool = False) -> types.User:
    return types.User(
        id=uid, access_hash=555, first_name=first, last_name="Valiyev", username="ali", phone=phone, premium=premium
    )


class FakeClient:
    """Sozlanadigan xulq: `authorized`, `me`, `errors` (metod → istisno), `password` (2FA)."""

    instances: list[FakeClient] = []

    def __init__(self, session: Any):
        self.session = session
        self.authorized = session.auth_key is not None
        self.me = user()
        self.errors: dict[str, BaseException] = {}
        self.password: str | None = None
        self.connected = False
        self.logged_out = False
        self._disc: asyncio.Future = asyncio.get_running_loop().create_future()
        self.calls: list[str] = []
        self.handlers: list[tuple[Any, Any]] = []
        self.responses: dict[str, Any] = {}  # so'rov nomi → javob yoki javoblar ro'yxati (navbat bilan)
        self.requests: list[Any] = []
        self.read_acks: list[tuple[Any, int]] = []
        self.sent: list[dict[str, Any]] = []
        self.stored: dict[int, Any] = {}  # get_messages javoblari
        self.downloads: list[tuple[int, Any]] = []
        self.files: list[dict[str, Any]] = []
        self.acts: list[tuple] = []
        self.participants: list[Any] = []
        FakeClient.instances.append(self)

    def _raise(self, name: str) -> None:
        self.calls.append(name)
        e = self.errors.get(name)
        if e is not None:
            raise e

    async def connect(self) -> None:
        self._raise("connect")
        self.connected = True
        if self.session.auth_key is None:
            self.session.auth_key = AuthKey(b"k" * 256)
        self.session.set_dc(2, "149.154.167.51", 443)
        self.session.save()

    async def disconnect(self) -> None:
        self.connected = False
        self.session.save()
        if not self._disc.done():
            self._disc.set_result(None)

    @property
    def disconnected(self) -> asyncio.Future:
        return self._disc

    async def is_user_authorized(self) -> bool:
        self._raise("is_user_authorized")
        return self.authorized

    async def get_me(self) -> types.User:
        self._raise("get_me")
        return self.me

    async def send_code_request(self, phone: str) -> Any:
        self._raise("send_code_request")
        return types.auth.SentCode(type=types.auth.SentCodeTypeApp(length=5), phone_code_hash="h")

    async def sign_in(
        self, phone: str | None = None, code: str | None = None, password: str | None = None
    ) -> types.User:
        from telethon import errors as te

        self._raise("sign_in")
        if password is None and code != "12345":
            raise te.PhoneCodeInvalidError(request=None)
        if password is None and self.password is not None:
            raise te.SessionPasswordNeededError(request=None)
        if password is not None and password != self.password:
            raise te.PasswordHashInvalidError(request=None)
        self.authorized = True
        self.session.process_entities(
            types.contacts.ResolvedPeer(peer=types.PeerUser(self.me.id), chats=[], users=[self.me])
        )
        return self.me

    async def log_out(self) -> bool:
        self.logged_out = True
        self.authorized = False
        await self.disconnect()
        return True

    def add_event_handler(self, fn: Any, ev: Any) -> None:
        self.handlers.append((fn, ev))

    async def get_input_entity(self, peer: Any) -> Any:
        return self.session.get_input_entity(peer)

    async def send_message(
        self, peer: Any, text: str, reply_to: Any = None, parse_mode: Any = (), link_preview: bool = True
    ) -> Any:
        import datetime as dt

        self._raise("send_message")
        self.sent.append({"peer": peer, "text": text, "reply_to": reply_to, "parse_mode": parse_mode})
        self._next_id = getattr(self, "_next_id", 9000) + 1
        uid = getattr(peer, "user_id", None)
        target = types.PeerUser(uid) if uid else types.PeerChannel(getattr(peer, "channel_id", 0))
        reply = types.MessageReplyHeader(reply_to_msg_id=reply_to) if reply_to else None
        return types.Message(
            id=self._next_id, peer_id=target, date=dt.datetime.now(dt.UTC), message=text, out=True, reply_to=reply
        )

    async def get_messages(self, peer: Any, ids: int) -> Any:
        self._raise("get_messages")
        return self.stored.get(ids)

    async def download_media(self, msg: Any, file: str, thumb: Any = None) -> str:
        self._raise("download_media")
        self.downloads.append((msg.id, thumb))
        path = f"{file}.jpg"
        with open(path, "wb") as f:
            f.write(b"\xff\xd8thumb" if thumb is not None else b"\xff\xd8full")
        return path

    async def send_file(self, peer: Any, file: str, **kw: Any) -> Any:
        import datetime as dt
        import os

        self._raise("send_file")
        self.files.append({"peer": peer, "file": file, "exists": os.path.exists(file), **kw})
        self._next_id = getattr(self, "_next_id", 9000) + 1
        doc = types.Document(
            id=1, access_hash=1, file_reference=b"", date=dt.datetime.now(dt.UTC), mime_type="application/pdf", size=10, dc_id=2,
            attributes=[types.DocumentAttributeFilename(os.path.basename(file))],
        )  # fmt: skip
        media = types.MessageMediaDocument(document=doc, voice=bool(kw.get("voice_note")))
        return types.Message(
            id=self._next_id, peer_id=types.PeerUser(getattr(peer, "user_id", 0)), date=dt.datetime.now(dt.UTC),
            message=kw.get("caption") or "", out=True, media=media,
        )  # fmt: skip

    # ---------------------------------------------------------------- 5-bosqich
    async def edit_message(self, peer: Any, msg_id: int, text: str, parse_mode: Any = ()) -> Any:
        import datetime as dt

        self._raise("edit_message")
        self.acts.append(("edit", msg_id, text, parse_mode))
        return types.Message(id=msg_id, peer_id=types.PeerUser(peer.user_id), date=dt.datetime.now(dt.UTC), message=text, out=True,
                             edit_date=dt.datetime.now(dt.UTC))  # fmt: skip

    async def delete_messages(self, peer: Any, ids: Any, revoke: bool = True) -> Any:
        self._raise("delete_messages")
        self.acts.append(("delete", list(ids), revoke))
        return []

    async def forward_messages(self, to: Any, ids: Any, from_peer: Any = None) -> Any:
        import datetime as dt

        self._raise("forward_messages")
        self.acts.append(("forward", list(ids), to.user_id))
        out = []
        for i in ids:
            self._next_id = getattr(self, "_next_id", 9000) + 1
            out.append(types.Message(id=self._next_id, peer_id=types.PeerUser(to.user_id), date=dt.datetime.now(dt.UTC), message=f"fwd {i}", out=True,
                                     fwd_from=types.MessageFwdHeader(date=dt.datetime.now(dt.UTC), from_name="X")))  # fmt: skip
        return out

    async def pin_message(self, peer: Any, msg_id: int, notify: bool = False) -> Any:
        self.acts.append(("pin", msg_id))

    async def unpin_message(self, peer: Any, msg_id: int | None = None) -> Any:
        self.acts.append(("unpin", msg_id))

    async def edit_folder(self, peer: Any, folder: int) -> Any:
        self.acts.append(("folder", folder))

    async def get_participants(self, peer: Any, limit: int = 0, search: str = "") -> Any:
        self._raise("get_participants")
        return self.participants

    async def download_profile_photo(self, peer: Any, file: str, download_big: bool = True) -> str:
        self.acts.append(("avatar", download_big))
        with open(file, "wb") as f:
            f.write(b"\xff\xd8avatar")
        return file

    async def send_read_acknowledge(self, peer: Any, max_id: int) -> bool:
        self._raise("send_read_acknowledge")
        self.read_acks.append((peer, max_id))
        return True

    async def __call__(self, req: Any) -> Any:
        name = type(req).__name__
        self._raise(name)
        self.requests.append(req)
        if name in self.responses:
            r = self.responses[name]
            res = r.pop(0) if isinstance(r, list) else r
            self.session.process_entities(res)  # Telethon har javobdagi entity'larni keshlaydi
            return res
        if isinstance(req, functions.help.GetAppConfigRequest):
            cfg = types.JsonObject([types.JsonObjectValue("caption_length_limit_default", types.JsonNumber(1024))])
            return types.help.AppConfig(hash=1, config=cfg)
        if isinstance(req, functions.account.GetPasswordRequest):
            return types.account.Password(
                new_algo=types.PasswordKdfAlgoUnknown(),
                new_secure_algo=types.SecurePasswordKdfAlgoUnknown(),
                secure_random=b"",
                has_password=True,
                hint="it",
            )
        raise NotImplementedError(name)


class FakeBus:
    def __init__(self) -> None:
        self.lock: str | None = None
        self.queue: asyncio.Queue = asyncio.Queue()
        self.replies: dict[str, dict[str, Any]] = {}
        self.events: list[dict[str, Any]] = []
        self.infos: list[dict[str, Any]] = []

    async def acquire(self, token: str) -> bool:
        if self.lock is not None:
            return False
        self.lock = token
        return True

    async def refresh(self, token: str) -> bool:
        return self.lock == token

    async def release(self, token: str) -> None:
        if self.lock == token:
            self.lock = None

    async def next_command(self, timeout: int) -> dict[str, Any] | None:
        try:
            return await asyncio.wait_for(self.queue.get(), timeout=0.05)
        except TimeoutError:
            return None

    async def reply(self, cmd_id: str, payload: dict[str, Any]) -> None:
        self.replies[cmd_id] = payload

    async def publish(self, event: dict[str, Any]) -> None:
        self.events.append(event)

    async def info(self, data: dict[str, Any]) -> None:
        self.infos.append(data)

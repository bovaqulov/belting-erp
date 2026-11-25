"""Media (4-bosqich): yuklab olish (kesh bilan), yuborish (rasm, fayl, video, ovozli xabar), kesh hajmi nazorati.

Fayllar: TGCRM_MEDIA_DIR/<akkaunt>/<peer>_<msg_id>[_t].<ext> — nom faqat raqamlardan (yo'l in'ektsiyasi yo'q).
Yuklangan (yuborilayotgan) fayllar: TGCRM_MEDIA_DIR/uploads/<uuid> — Django yozadi, gateway yuborgach keshga ko'chiradi.
Gateway va Django bitta serverda (umumiy disk) — prod'da ham shunday (bitta gateway nusxasi).
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import shutil
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any, cast

from asgiref.sync import sync_to_async
from telethon import TelegramClient
from telethon.tl import types

from ..files import base_path, cached, guess_mime, root, uploads_dir
from . import chats, convert
from .errors import GatewayError, send_error

if TYPE_CHECKING:
    from .worker import AccountWorker

log = logging.getLogger(__name__)
KINDS = ("photo", "file", "video", "voice", "audio")
UPLOAD_TTL = 24 * 3600
__all__ = ["Media", "base_path", "cached", "cleanup", "guess_mime", "root", "uploads_dir"]


class Media:
    def __init__(self, w: AccountWorker):
        self.w = w

    @property
    def acc(self) -> int:
        return self.w.id

    async def _message(self, pid: int, msg_id: int) -> Any:
        peer = await self.w.sync.input_peer(pid)
        msg = await self.w.call("download", lambda c: c.get_messages(peer, ids=msg_id))
        if msg is None or getattr(msg, "media", None) is None:
            raise GatewayError(404, "Xabar yoki fayl topilmadi (o'chirilgan bo'lishi mumkin).")
        return msg

    async def download(self, pid: int, msg_id: int, thumb: bool) -> dict[str, Any]:
        hit = cached(self.acc, pid, msg_id, thumb)
        if hit is not None:
            return {"path": str(hit.relative_to(root())), "mime": guess_mime(hit)}
        msg = await self._message(pid, msg_id)
        base = base_path(self.acc, pid, msg_id, thumb)
        base.parent.mkdir(parents=True, exist_ok=True)
        kw: dict[str, Any] = {}
        if thumb:
            kw["thumb"] = _thumb_choice(msg.media)
            if kw["thumb"] is None:
                raise GatewayError(404, "Bu faylning kichik rasmi yo'q.")

        async def go(c: TelegramClient) -> Any:
            return await c.download_media(msg, file=str(base), **kw)

        got = await self.w.call("download", go)
        if not got:
            raise GatewayError(404, "Fayl yuklab olinmadi.")
        p = Path(cast(str, got))
        mime = getattr(getattr(msg.media, "document", None), "mime_type", None) or guess_mime(p)
        return {"path": str(p.relative_to(root())), "mime": mime if not thumb else guess_mime(p, "image/jpeg")}

    async def send_file(
        self, pid: int, rel: str, name: str, kind: str, caption: str, reply_to: int | None, actor: int | None
    ) -> dict[str, Any]:
        if kind not in KINDS:
            raise GatewayError(400, "Turi: photo, file, video, voice yoki audio.")
        src = (uploads_dir() / Path(rel).name).resolve()
        if src.parent != uploads_dir().resolve() or not src.is_file():
            raise GatewayError(404, "Yuklangan fayl topilmadi — qayta yuboring.")
        caption = caption.strip()
        limits = await sync_to_async(_limits)(self.acc)
        if len(caption) > int(limits.get("caption") or 1024):
            raise GatewayError(400, f"Izoh juda uzun ({len(caption)} / {limits.get('caption') or 1024} belgi).")
        if src.stat().st_size > int(limits.get("file_bytes") or 2000 * 1024**2):
            raise GatewayError(413, "Fayl Telegram chegarasidan katta.")
        peer = await self.w.sync.input_peer(pid)
        to_send = src
        attrs: list[Any] | None = None
        try:
            if kind == "voice":
                to_send, duration = await _to_voice(src)
                attrs = [types.DocumentAttributeAudio(duration=duration, voice=True)]
            # asl nom saqlansin (Telegram'da ko'rinadi); faylni yuborish nomi — xavfsiz satr
            named = (
                to_send.with_name(_safe_name(name, to_send.suffix)) if kind in ("file", "audio", "video") else to_send
            )
            if named != to_send:
                to_send.rename(named)
                to_send = named

            async def go(c: TelegramClient) -> Any:
                try:
                    return await c.send_file(
                        peer,
                        str(to_send),
                        caption=cast(Any, caption or None),
                        parse_mode=None,
                        reply_to=cast(Any, reply_to),
                        force_document=kind == "file",
                        voice_note=kind == "voice",
                        supports_streaming=kind == "video",
                        attributes=cast(Any, attrs),
                    )
                except Exception as e:
                    raise send_error(e) or e from e

            sent = await self.w.call("send", go)
            m = convert.message_fields(sent)
            if m is None:
                raise GatewayError(502, "Telegram xabarni qaytarmadi.")
            m["sent_by"] = actor
            await sync_to_async(chats.on_new_message)(self.acc, m, [])
            # yuborgan odam qayta yuklab olmasin — fayl keshga
            dest = base_path(self.acc, pid, m["msg_id"], False).with_suffix(to_send.suffix or ".bin")
            dest.parent.mkdir(parents=True, exist_ok=True)
            with contextlib.suppress(OSError):
                shutil.move(str(to_send), dest)
            await self.w.sync.emit({"type": "msg", "op": "new", "peer": pid, "msg_id": m["msg_id"], "out": True})
            return {"msg_id": m["msg_id"]}
        finally:
            for p in {src, to_send}:
                with contextlib.suppress(OSError):
                    if p.exists() and p.parent == uploads_dir().resolve():
                        p.unlink()


def _limits(account_id: int) -> dict[str, Any]:
    from ..models import Account

    return Account.objects.filter(pk=account_id).values_list("limits", flat=True).first() or {}


def _safe_name(name: str, suffix: str) -> str:
    keep = "".join(ch for ch in Path(name).name if ch.isalnum() or ch in " ._-()[]").strip(" .")[:120]
    if not keep:
        keep = "fayl"
    return keep if Path(keep).suffix else keep + suffix


def _thumb_choice(media: Any) -> Any:
    """Rasm — ~800px o'lcham ('x'), bo'lmasa eng kattasi; hujjat — eng katta eskiz. Yo'q bo'lsa None."""
    if isinstance(media, types.MessageMediaPhoto) and isinstance(media.photo, types.Photo):
        sizes = [
            s
            for s in media.photo.sizes
            if isinstance(s, (types.PhotoSize, types.PhotoSizeProgressive, types.PhotoCachedSize))
        ]
        for s in sizes:
            if s.type == "x":
                return s
        return -1 if sizes else None
    doc = getattr(media, "document", None)
    if isinstance(doc, types.Document) and any(
        isinstance(s, (types.PhotoSize, types.PhotoSizeProgressive, types.PhotoCachedSize)) for s in doc.thumbs or ()
    ):
        return -1
    return None


async def _run(*args: str) -> tuple[int, bytes]:
    proc = await asyncio.create_subprocess_exec(*args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    out, err = await proc.communicate()
    if proc.returncode:
        log.warning("tgcrm %s: %s", args[0], err.decode(errors="ignore")[-300:])
    return proc.returncode or 0, out


async def _to_voice(src: Path) -> tuple[Path, int]:
    """Brauzer yozuvi (webm/mp4) → Telegram ovozli xabari (OGG/Opus, mono, 48 kHz) + davomiylik."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise GatewayError(500, "Serverda ffmpeg yo'q — ovozli xabar yuborib bo'lmaydi.")
    out = src.with_suffix(".ogg")
    code, _ = await _run(
        ffmpeg,
        "-y",
        "-v",
        "error",
        "-i",
        str(src),
        "-vn",
        "-c:a",
        "libopus",
        "-b:a",
        "32k",
        "-ac",
        "1",
        "-ar",
        "48000",
        str(out),
    )
    if code or not out.exists():
        raise GatewayError(400, "Ovozni o'girib bo'lmadi (fayl buzilgan bo'lishi mumkin).")
    duration = 0
    probe = shutil.which("ffprobe")
    if probe:
        _, raw = await _run(
            probe, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(out)
        )
        with contextlib.suppress(ValueError):
            duration = round(float(raw.decode().strip() or 0))
    return out, duration


def cleanup(max_bytes: int) -> dict[str, int]:
    """Kesh hajmi chegaradan oshsa — eng eski (oxirgi ochilgan) fayllar o'chiriladi (80% gacha). Eski yuklamalar ham."""
    r = root()
    if not r.is_dir():
        return {"removed": 0, "bytes": 0}
    now = time.time()
    removed = 0
    for p in uploads_dir().iterdir():
        with contextlib.suppress(OSError):
            if p.is_file() and now - p.stat().st_mtime > UPLOAD_TTL:
                p.unlink()
                removed += 1
    files = [p for p in r.rglob("*") if p.is_file() and p.parent.name != "uploads"]
    total = sum(p.stat().st_size for p in files)
    if total > max_bytes:
        target = int(max_bytes * 0.8)
        for p in sorted(files, key=lambda f: max(f.stat().st_atime, f.stat().st_mtime)):
            if total <= target:
                break
            with contextlib.suppress(OSError):
                size = p.stat().st_size
                p.unlink()
                total -= size
                removed += 1
    return {"removed": removed, "bytes": total}

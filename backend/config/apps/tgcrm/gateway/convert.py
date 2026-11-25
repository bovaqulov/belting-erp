"""Telethon (xom TL) obyektlari → bazaga yoziladigan lug'atlar. Sof funksiyalar (tarmoq/baza yo'q) — testlanadi.

Matn — Telegram'dagi xom ko'rinishda (`message`) + formatlash `entities` (offset/length UTF-16 da, Telegram kabi);
brauzer uni o'zi chizadi. Media — faqat meta (tur, o'lcham, nom); fayl yuklash 4-bosqichda.
"""

from __future__ import annotations

import base64
import datetime as dt
from typing import Any

from telethon import utils
from telethon.tl import types

from ..models import PeerKind

PREVIEW_MAX = 300

MEDIA_NAMES = {
    "photo": "Rasm",
    "video": "Video",
    "round": "Video xabar",
    "voice": "Ovozli xabar",
    "audio": "Audio",
    "gif": "GIF",
    "sticker": "Stiker",
    "file": "Fayl",
    "geo": "Joylashuv",
    "venue": "Manzil",
    "contact": "Kontakt",
    "poll": "So'rovnoma",
    "dice": "O'yin kubigi",
    "game": "O'yin",
    "invoice": "Hisob",
    "story": "Story",
    "paid": "Pullik media",
    "giveaway": "Konkurs",
    "unsupported": "Xabar",
}


def peer_id(peer: Any) -> int:
    return utils.get_peer_id(peer)


# ------------------------------------------------------------------ suhbatdosh
def peer_fields(e: Any, self_id: int | None = None) -> dict[str, Any] | None:
    """User / Chat / Channel → Peer maydonlari (+ "peer_id"). Boshqa turlar (ChatForbidden …) — minimal."""
    try:
        pid = utils.get_peer_id(e)
    except TypeError:
        return None
    out: dict[str, Any] = {"peer_id": pid}
    if isinstance(e, types.User):
        name = " ".join(x for x in (e.first_name, e.last_name) if x) or ("O'chirilgan akkaunt" if e.deleted else "")
        status = e.status
        online = isinstance(status, types.UserStatusOnline)
        seen = status.was_online if isinstance(status, types.UserStatusOffline) else None
        out |= {
            "kind": PeerKind.BOT if e.bot else PeerKind.USER,
            "title": name,
            "username": e.username or _first_username(e),
            "phone": f"+{e.phone}" if e.phone else "",
            "photo_id": getattr(e.photo, "photo_id", None),
            "verified": bool(e.verified),
            "scam": bool(e.scam or e.fake),
            "deleted": bool(e.deleted),
            "is_self": bool(e.is_self or (self_id is not None and e.id == self_id)),
            "contact": bool(e.contact),
            "online": online,
            "last_seen": seen,
        }
    elif isinstance(e, types.Chat):
        out |= {
            "kind": PeerKind.GROUP,
            "title": e.title,
            "members": e.participants_count,
            "photo_id": getattr(e.photo, "photo_id", None),
        }
    elif isinstance(e, types.Channel):
        out |= {
            "kind": PeerKind.CHANNEL if e.broadcast else PeerKind.SUPERGROUP,
            "title": e.title,
            "username": e.username or _first_username(e),
            "members": e.participants_count,
            "photo_id": getattr(e.photo, "photo_id", None),
            "verified": bool(e.verified),
            "scam": bool(e.scam or e.fake),
        }
    elif isinstance(e, (types.ChatForbidden, types.ChannelForbidden)):
        kind = PeerKind.GROUP if isinstance(e, types.ChatForbidden) else PeerKind.CHANNEL
        out |= {"kind": kind, "title": e.title}
    else:
        return None
    for k in ("title", "username", "phone"):
        if k in out:
            out[k] = (out[k] or "")[: 255 if k == "title" else 64 if k == "username" else 32]
    return out


def _first_username(e: Any) -> str:
    for u in getattr(e, "usernames", None) or ():
        if getattr(u, "active", False):
            return u.username
    return ""


# ------------------------------------------------------------------ xabar
def entities(ents: Any) -> list[dict[str, Any]]:
    out = []
    for e in ents or ():
        d: dict[str, Any] = {
            "type": type(e).__name__.removeprefix("MessageEntity").lower(),
            "offset": e.offset,
            "length": e.length,
        }
        for k in ("url", "language", "user_id", "document_id"):
            v = getattr(e, k, None)
            if v is not None:
                d[k] = v
        out.append(d)
    return out


def media_info(m: Any) -> dict[str, Any] | None:
    if m is None or isinstance(m, types.MessageMediaEmpty):
        return None
    if isinstance(m, types.MessageMediaPhoto):
        p = m.photo
        size = _largest(getattr(p, "sizes", None) or ())
        return {
            "kind": "photo",
            "id": getattr(p, "id", None),
            "w": size[0],
            "h": size[1],
            "spoiler": bool(m.spoiler),
            "ttl": m.ttl_seconds,
            "mini": mini_thumb(getattr(p, "sizes", None)),
            "thumb": _has_thumb(getattr(p, "sizes", None)),
        }
    if isinstance(m, types.MessageMediaDocument):
        return _document(m)
    if isinstance(m, (types.MessageMediaGeo, types.MessageMediaGeoLive)):
        g = m.geo
        return {
            "kind": "geo",
            "lat": getattr(g, "lat", None),
            "long": getattr(g, "long", None),
            "live": isinstance(m, types.MessageMediaGeoLive),
        }
    if isinstance(m, types.MessageMediaVenue):
        return {
            "kind": "venue",
            "title": m.title,
            "address": m.address,
            "lat": getattr(m.geo, "lat", None),
            "long": getattr(m.geo, "long", None),
        }
    if isinstance(m, types.MessageMediaContact):
        return {
            "kind": "contact",
            "name": " ".join(x for x in (m.first_name, m.last_name) if x),
            "phone": m.phone_number,
            "user_id": m.user_id or None,
        }
    if isinstance(m, types.MessageMediaPoll):
        q = m.poll.question
        return {
            "kind": "poll",
            "question": getattr(q, "text", q),
            "answers": [getattr(a.text, "text", a.text) for a in m.poll.answers],
        }
    if isinstance(m, types.MessageMediaDice):
        return {"kind": "dice", "emoji": m.emoticon, "value": m.value}
    if isinstance(m, types.MessageMediaWebPage):
        w = m.webpage
        if isinstance(w, types.WebPage):
            return {
                "kind": "webpage",
                "url": w.url,
                "site": w.site_name or "",
                "title": w.title or "",
                "description": (w.description or "")[:300],
            }
        return None  # ko'rinish tayyor emas — matndagi havola yetadi
    if isinstance(m, types.MessageMediaGame):
        return {"kind": "game", "title": m.game.title}
    if isinstance(m, types.MessageMediaInvoice):
        return {"kind": "invoice", "title": m.title, "amount": m.total_amount, "currency": m.currency}
    if isinstance(m, types.MessageMediaStory):
        return {"kind": "story"}
    if isinstance(m, types.MessageMediaPaidMedia):
        return {"kind": "paid", "stars": m.stars_amount}
    if isinstance(m, (types.MessageMediaGiveaway, types.MessageMediaGiveawayResults)):
        return {"kind": "giveaway"}
    return {"kind": "unsupported", "type": type(m).__name__}


def mini_thumb(sizes: Any) -> str | None:
    """Telegram'ning ichki xira eskizi (PhotoStrippedSize, ~1 KB) → data:image/jpeg — yuklab olishsiz darhol ko'rinadi."""
    for s in sizes or ():
        if isinstance(s, types.PhotoStrippedSize):
            try:
                jpg = utils.stripped_photo_to_jpg(s.bytes)
            except Exception:
                return None
            return "data:image/jpeg;base64," + base64.b64encode(jpg).decode()
    return None


def _has_thumb(sizes: Any) -> bool:
    return any(isinstance(s, (types.PhotoSize, types.PhotoSizeProgressive, types.PhotoCachedSize)) for s in sizes or ())


def _largest(sizes: Any) -> tuple[int | None, int | None]:
    best = (None, None)
    area = -1
    for s in sizes:
        w, h = getattr(s, "w", None), getattr(s, "h", None)
        if w and h and w * h > area:
            best, area = (w, h), w * h
    return best


def _document(m: types.MessageMediaDocument) -> dict[str, Any]:
    d = m.document
    if not isinstance(d, types.Document):
        return {"kind": "file", "name": "", "size": None}
    out: dict[str, Any] = {
        "id": d.id,
        "size": d.size,
        "mime": d.mime_type,
        "spoiler": bool(m.spoiler),
        "mini": mini_thumb(d.thumbs),
        "thumb": _has_thumb(d.thumbs) or _has_thumb(d.video_thumbs),
    }
    kind = "file"
    for a in d.attributes:
        if isinstance(a, types.DocumentAttributeFilename):
            out["name"] = a.file_name
        elif isinstance(a, types.DocumentAttributeSticker):
            kind = "sticker"
            out["emoji"] = a.alt
            out["animated"] = d.mime_type == "application/x-tgsticker"  # Lottie — eskiz bilan ko'rsatiladi
        elif isinstance(a, types.DocumentAttributeAnimated):
            kind = "gif" if kind != "sticker" else kind
        elif isinstance(a, types.DocumentAttributeVideo):
            if kind not in ("sticker", "gif"):
                kind = "round" if a.round_message else "video"
            out |= {"w": a.w, "h": a.h, "duration": a.duration}
        elif isinstance(a, types.DocumentAttributeAudio):
            kind = "voice" if a.voice else "audio"
            out |= {"duration": a.duration, "title": a.title or "", "performer": a.performer or ""}
            if a.waveform:
                out["wave"] = _waveform(a.waveform)
        elif isinstance(a, types.DocumentAttributeImageSize):
            out |= {"w": a.w, "h": a.h}
    if m.round:
        kind = "round"
    if m.voice:
        kind = "voice"
    out["kind"] = kind
    return out


def _waveform(raw: bytes, bars: int = 48) -> list[int]:
    """Ovozli xabar to'lqini: Telegram 5 bitli qiymatlar (0..31) → `bars` ta ustun."""
    bits = int.from_bytes(raw, "little")
    vals = [(bits >> (i * 5)) & 31 for i in range(len(raw) * 8 // 5)]
    if not vals:
        return []
    step = len(vals) / bars
    return [max(vals[int(i * step) : max(int((i + 1) * step), int(i * step) + 1)]) for i in range(bars)]


def action_info(a: Any) -> dict[str, Any] | None:
    """Xizmat xabari: tur nomi + oddiy maydonlar (matn, ro'yxat, raqam)."""
    if a is None:
        return None
    d: dict[str, Any] = {"type": type(a).__name__.removeprefix("MessageAction")}
    for k, v in (a.to_dict() or {}).items():
        if k == "_":
            continue
        if isinstance(v, (str, int, float, bool)) or (isinstance(v, list) and all(isinstance(x, int) for x in v)):
            d[k] = v
        elif isinstance(v, dt.datetime):
            d[k] = v.isoformat()
    if isinstance(a, types.MessageActionPhoneCall):
        d["reason"] = type(a.reason).__name__.removeprefix("PhoneCallDiscardReason") if a.reason else ""
    return d


def fwd_info(f: Any) -> dict[str, Any] | None:
    if f is None:
        return None
    out: dict[str, Any] = {"date": f.date.isoformat() if f.date else None}
    if f.from_id is not None:
        out["from_id"] = peer_id(f.from_id)
    if f.from_name:
        out["from_name"] = f.from_name
    if f.post_author:
        out["post_author"] = f.post_author
    return out


def reactions_info(r: Any) -> list[dict[str, Any]] | None:
    if r is None or not r.results:
        return None
    out = []
    for rc in r.results:
        x = rc.reaction
        emoji = getattr(x, "emoticon", None) or ("⭐" if isinstance(x, types.ReactionPaid) else "")
        out.append(
            {
                "emoji": emoji,
                "custom": getattr(x, "document_id", None),
                "count": rc.count,
                "mine": rc.chosen_order is not None,
            }
        )
    return out


def message_fields(m: Any) -> dict[str, Any] | None:
    """types.Message / MessageService → Message maydonlari (+ "peer_id"). MessageEmpty — None."""
    if not isinstance(m, (types.Message, types.MessageService)):
        return None
    service = isinstance(m, types.MessageService)
    reply = m.reply_to.reply_to_msg_id if isinstance(m.reply_to, types.MessageReplyHeader) else None
    return {
        "peer_id": peer_id(m.peer_id),
        "msg_id": m.id,
        "date": m.date,
        "out": bool(m.out),
        "sender_id": peer_id(m.from_id) if m.from_id is not None else (peer_id(m.peer_id) if not m.out else None),
        "text": "" if service else (m.message or ""),
        "entities": [] if service else entities(m.entities),
        "media": None if service else media_info(m.media),
        "action": action_info(m.action) if service else None,
        "reply_to": reply,
        "fwd": None if service else fwd_info(m.fwd_from),
        "grouped_id": None if service else m.grouped_id,
        "edit_date": None if service else m.edit_date,
        "views": None if service else m.views,
        "post_author": ("" if service else m.post_author or "")[:128],
        "reactions": reactions_info(m.reactions),
        # Telegram Business boti (AI yordamchi) egasi nomidan yuborgan — odam yozgani emas
        "by_ai": bool(m.out and not service and getattr(m, "via_business_bot_id", None)),
    }


ACTION_TEXT = {
    "ChatAddUser": "a'zo qo'shildi",
    "ChatDeleteUser": "a'zo chiqdi",
    "ChatJoinedByLink": "havola orqali qo'shildi",
    "ChatJoinedByRequest": "so'rov orqali qo'shildi",
    "ChatEditTitle": "nom o'zgardi",
    "ChatEditPhoto": "rasm o'zgardi",
    "ChatCreate": "guruh yaratildi",
    "ChannelCreate": "kanal yaratildi",
    "PinMessage": "xabar qadaldi",
    "PhoneCall": "Qo'ng'iroq",
    "ContactSignUp": "Telegram'ga qo'shildi",
    "HistoryClear": "tarix tozalandi",
}


def preview(f: dict[str, Any]) -> str:
    """Chat ro'yxati uchun qisqa matn."""
    if f.get("action"):
        t = f["action"].get("type", "")
        return ACTION_TEXT.get(t, t)
    text = (f.get("text") or "").replace("\n", " ").strip()
    media = f.get("media")
    if media:
        name = MEDIA_NAMES.get(media.get("kind", ""), "")
        if media.get("kind") == "sticker" and media.get("emoji"):
            name = f"{media['emoji']} Stiker"
        if media.get("kind") == "file" and media.get("name"):
            name = media["name"]
        if media.get("kind") == "webpage":
            name = ""
        text = f"{name}, {text}" if name and text else (name or text)
    return text[:PREVIEW_MAX]


# ------------------------------------------------------------------ dialog va papka
def dialog_fields(d: types.Dialog) -> dict[str, Any]:
    ns = d.notify_settings
    mute = getattr(ns, "mute_until", None)
    draft = d.draft.message if isinstance(d.draft, types.DraftMessage) else ""
    return {
        "peer_id": peer_id(d.peer),
        "top_msg_id": d.top_message,
        "unread": d.unread_count,
        "unread_mentions": d.unread_mentions_count,
        "read_inbox_max": d.read_inbox_max_id,
        "read_outbox_max": d.read_outbox_max_id,
        "pinned": bool(d.pinned),
        "archived": d.folder_id == 1,
        "muted_until": mute if isinstance(mute, dt.datetime) and mute > dt.datetime.now(dt.UTC) else None,
        "draft": draft or "",
    }


def folder_fields(f: Any, order: int) -> dict[str, Any] | None:
    if not isinstance(f, (types.DialogFilter, types.DialogFilterChatlist)):
        return None  # DialogFilterDefault — "Barcha chatlar"
    title = getattr(f.title, "text", f.title) or ""

    def ids(xs: Any) -> list[int]:
        out = []
        for p in xs or ():
            try:
                out.append(peer_id(p))
            except TypeError:  # InputPeerSelf / Empty — o'zi; papkada "Saqlangan xabarlar" kerak bo'lsa self_id bilan
                continue
        return out

    flags = {}
    if isinstance(f, types.DialogFilter):
        for k in (
            "contacts",
            "non_contacts",
            "groups",
            "broadcasts",
            "bots",
            "exclude_muted",
            "exclude_read",
            "exclude_archived",
        ):
            flags[k] = bool(getattr(f, k))
    return {
        "folder_id": f.id,
        "title": title[:64],
        "emoticon": f.emoticon or "",
        "order": order,
        "flags": flags,
        "include": ids(f.include_peers),
        "exclude": ids(getattr(f, "exclude_peers", None)),
        "pinned": ids(f.pinned_peers),
    }

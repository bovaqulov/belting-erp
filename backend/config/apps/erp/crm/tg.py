"""Sotuvchilar Telegram'i — Telegram Business bot (BUSINESS_CONNECTION_BOT_TOKEN, Jarvis botidan alohida).

Oqim: sotuvchi botni Telegram Business'ga ulaydi → `business_connection` → har yangi/tahrirlangan/o'chirilgan xabar
webhook'ga keladi (`handle_update`) → bazaga (TgChat/TgMessage) → CRM'da ko'rinadi. Javob (`send`) — sotuvchi nomidan,
faqat ulanishda `can_reply` huquqi bo'lsa (qisman boshqaruv: o'qish + javob). Bot API — httpx (testlarda MockTransport).
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

import httpx
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from config.apps.core.http import ApiError

from . import live
from .models import Lead, LeadStatus, TgChat, TgConnection, TgMessage

log = logging.getLogger(__name__)
TIMEOUT = 15
ALLOWED_UPDATES = [
    "message",
    "business_connection",
    "business_message",
    "edited_business_message",
    "deleted_business_messages",
]
# xabar turlari: matnsiz bo'lsa ro'yxatda shu yozuv ko'rinadi
KINDS = {
    "photo": "Rasm",
    "video": "Video",
    "voice": "Ovozli xabar",
    "video_note": "Video xabar",
    "audio": "Audio",
    "document": "Fayl",
    "sticker": "Stiker",
    "animation": "GIF",
    "contact": "Kontakt",
    "venue": "Manzil",
    "location": "Joylashuv",
    "poll": "So'rovnoma",
    "dice": "O'yin kubigi",
    "story": "Story",
    "paid_media": "Pullik media",
    "game": "O'yin",
    "invoice": "Hisob-faktura",
    "gift": "Sovg'a",
}
# fayli bor turlar (getFile orqali yuklab olinadi; Bot API — 20 MB gacha)
MEDIA = ("photo", "video", "voice", "video_note", "audio", "document", "sticker", "animation")
FILE_MAX = 20 * 1024 * 1024
CONNECT_HELP = (
    "Salom! Men Belting CRM botiman.\n\n"
    "Mijozlar bilan yozishmalaringiz CRM'da ko'rinishi uchun meni ulang:\n"
    "Telegram → Sozlamalar → Telegram Business → Chat-botlar → shu botni tanlang.\n\n"
    "Qaysi chatlarni ko'rishimni o'zingiz belgilaysiz. CRM'dan javob yozish uchun «Xabarlarga javob berish» huquqini yoqing."
)


def enabled() -> bool:
    return bool(settings.BUSINESS_CONNECTION_BOT_TOKEN)


def call(method: str, **params: Any) -> Any:
    """Bot API chaqiruvi; xato → ApiError (502 — Telegram javobi matni bilan)."""
    if not enabled():
        raise ApiError(503, "CRM Telegram boti sozlanmagan (BUSINESS_CONNECTION_BOT_TOKEN).")
    url = f"https://api.telegram.org/bot{settings.BUSINESS_CONNECTION_BOT_TOKEN}/{method}"
    try:
        with httpx.Client(timeout=TIMEOUT) as h:
            data = h.post(url, json={k: v for k, v in params.items() if v is not None}).json()
    except (httpx.HTTPError, ValueError) as e:
        raise ApiError(502, "Telegram bilan aloqa bo'lmadi — keyinroq urinib ko'ring.") from e
    if not data.get("ok"):
        raise ApiError(502, f"Telegram rad etdi: {data.get('description') or 'nomaʼlum xato'}")
    return data.get("result")


_me: dict[str, Any] = {}


def bot_username() -> str:
    """Bot nomi (ulash yo'riqnomasi uchun) — getMe, jarayon ichida keshlanadi."""
    if not enabled():
        return ""
    if "u" not in _me:
        try:
            _me["u"] = (call("getMe") or {}).get("username") or ""
        except ApiError:
            return ""
    return _me["u"]


# ------------------------------------------------------------------ yangilanishlar
def _dt(ts: int | None) -> datetime:
    return datetime.fromtimestamp(ts or 0, tz=UTC)


def _name(u: dict[str, Any]) -> str:
    return " ".join(x for x in (u.get("first_name"), u.get("last_name")) if x).strip() or u.get("title") or ""


def _body(m: dict[str, Any]) -> tuple[str, str]:
    """(tur, matn): matn yoki izoh; maxsus turlar uchun o'qiladigan matn. Noma'lum tur (matnsiz) — "other"."""
    kind = next((k for k in KINDS if k in m), "text" if (m.get("text") or m.get("caption")) else "other")
    text = m.get("text") or m.get("caption") or ""
    if kind == "contact":
        c = m["contact"]
        text = text or f"{_name(c)} +{str(c.get('phone_number', '')).lstrip('+')}"
    elif kind == "venue":
        v = m["venue"]
        text = text or " — ".join(x for x in (v.get("title"), v.get("address")) if x)
    elif kind == "poll":
        p = m["poll"]
        text = p.get("question", "") + "".join(f"\n• {o.get('text', '')}" for o in p.get("options") or [])
    elif kind == "dice":
        text = f"{m['dice'].get('emoji', '🎲')} {m['dice'].get('value', '')}"
    elif kind == "sticker":
        text = text or m["sticker"].get("emoji") or ""
    return kind, text


def _media(m: dict[str, Any], kind: str) -> dict[str, Any] | None:
    """Fayl ma'lumoti (file_id va ko'rsatish uchun o'lcham/tur); joylashuv — koordinata."""
    if kind in ("location", "venue"):
        loc = m.get("location") or (m.get("venue") or {}).get("location") or {}
        return {"lat": loc.get("latitude"), "lon": loc.get("longitude")} if loc else None
    if kind not in MEDIA:
        return None
    f = m[kind]
    if kind == "photo":  # bir nechta o'lcham — 1280 px gacha eng kattasi (tez yuklansin)
        sizes = sorted(f, key=lambda x: x.get("width", 0))
        f = next((x for x in reversed(sizes) if x.get("width", 0) <= 1280), sizes[-1])
    mime = f.get("mime_type") or {
        "photo": "image/jpeg",
        "voice": "audio/ogg",
        "video_note": "video/mp4",
        "sticker": "video/webm" if f.get("is_video") else "image/webp",
    }.get(kind, "")
    return {
        "file_id": f.get("file_id"),
        "mime": mime,
        "name": f.get("file_name") or "",
        "size": f.get("file_size") or 0,
        "width": f.get("width") or f.get("length"),
        "height": f.get("height") or f.get("length"),
        "duration": f.get("duration"),
        "animated": bool(f.get("is_animated")),  # .tgs stiker — brauzer ko'rsata olmaydi
    }


def _reply(m: dict[str, Any]) -> dict[str, Any] | None:
    """Javob (reply) qilingan xabar: iqtibos uchun qisqa matn (Telegram «quote» — belgilangan qismi bo'lsa o'sha)."""
    rm = m.get("reply_to_message")
    if not rm:
        return None
    kind, text = _body(rm)
    quote = (m.get("quote") or {}).get("text")
    return {
        "message_id": rm.get("message_id"),
        "text": preview(kind, quote or text)[:200],
        "kind": kind,
        "from_id": (rm.get("from") or {}).get("id"),
    }


def preview(kind: str, text: str) -> str:
    return (text or KINDS.get(kind) or "Xabar").replace("\n", " ")[:300]


def save_connection(bc: dict[str, Any]) -> TgConnection:
    rights = bc.get("rights") or {}
    u = bc.get("user") or {}
    conn, _ = TgConnection.objects.update_or_create(
        id=bc["id"],
        defaults={
            "user_tg": u.get("id") or 0,
            "user_name": _name(u),
            "user_chat_id": bc.get("user_chat_id"),
            # Bot API 9.0+: rights.can_reply; eski: can_reply
            "can_reply": bool(rights.get("can_reply", bc.get("can_reply", False))),
            "rights": rights,
            "is_enabled": bool(bc.get("is_enabled", True)),
        },
    )
    return conn


def _connection(cid: str) -> TgConnection | None:
    conn = TgConnection.objects.filter(id=cid).first()
    if conn is None and cid:  # ulanish bazada yo'q (bot qayta o'rnatilgan) — Telegram'dan so'raymiz
        try:
            conn = save_connection(call("getBusinessConnection", business_connection_id=cid))
        except ApiError:
            log.warning("business_connection %s olinmadi", cid)
    return conn


@transaction.atomic
def save_message(conn: TgConnection, m: dict[str, Any], *, edited: bool = False, via_crm: bool = False) -> TgMessage:
    c = m.get("chat") or {}
    chat, _ = TgChat.objects.get_or_create(connection=conn, chat_id=c.get("id") or 0)
    # shaxsiy chat nomi — mijoz ismi (sotuvchi yozgan xabarda ham chat = mijoz)
    chat.title = _name(c) or chat.title
    chat.username = c.get("username") or chat.username
    out = via_crm or (m.get("from") or {}).get("id") == conn.user_tg
    kind, text = _body(m)
    date = _dt(m.get("date"))
    old = TgMessage.objects.filter(chat=chat, message_id=m["message_id"]).first()
    history = list(old.history or []) if old else []
    if old and edited and (old.text != text or old.kind != kind):
        # tahrir: oldingi matn tarixda qoladi (eskisidan yangisiga)
        history.append({"text": old.text, "kind": old.kind, "at": (old.edited_at or old.date).isoformat()})
    msg, created = TgMessage.objects.update_or_create(
        chat=chat,
        message_id=m["message_id"],
        defaults={
            "out": out,
            "kind": kind,
            "text": text,
            "date": date,
            "media": _media(m, kind),
            "raw": m,
            "reply": _reply(m),
            "history": history,
            **({"edited_at": _dt(m.get("edit_date"))} if edited else {}),
        },
    )
    if via_crm and not msg.via_crm:
        msg.via_crm = True
        msg.save(update_fields=["via_crm"])
    if created and (chat.last_at is None or date >= chat.last_at):
        chat.last_at, chat.last_text, chat.last_out = date, preview(kind, text), out
        chat.unread = 0 if out else chat.unread + 1  # sotuvchi javob berdi — o'qilgan
    elif not created and chat.last_at == date:
        chat.last_text = preview(kind, text)
    chat.save()
    if created:
        lead_from_chat(chat, conn, msg, from_user=m.get("from") or {})
    transaction.on_commit(lambda: live.publish(chat.pk, conn.user_tg))
    return msg


def lead_from_chat(chat: TgChat, conn: TgConnection, msg: TgMessage, from_user: dict[str, Any]) -> None:
    """Telegram → lid: mijozga bog'lanmagan chatda yangi odam yozsa — «Yangi» lid (mas'ul — shu sotuvchi; har chatdan
    bir marta — "Yaroqsiz: shaxsiy chat" qilinsa qayta ochilmaydi). Sotuvchi javob yozsa — «Ishda» (javob vaqti)."""
    lead = Lead.objects.filter(tg_chat=chat).order_by("-created").first()
    if msg.out:
        if lead is not None and lead.status == LeadStatus.NEW:
            lead.status = LeadStatus.WORK
            lead.first_touch = lead.first_touch or msg.date
            lead.save(update_fields=["status", "first_touch"])
        return
    if lead is not None or from_user.get("is_bot"):
        return
    if chat.customer_id:
        # doimiy mijoz — lid emas: ochiq bitimi yo'q bo'lsa, o'z menejeriga bitim (har xabarda emas — ochiq bitim bo'lsa jim)
        from .sales import customer_deal

        if chat.customer is not None:
            customer_deal(
                chat.customer, {"source": "telegram", "note": preview(msg.kind, msg.text)}, msg.date, comment=False
            )
        return
    # suhbatni sotuvchining o'zi boshlagan bo'lsa — darhol «Ishda»
    first_out = TgMessage.objects.filter(chat=chat, out=True).order_by("date").values_list("date", flat=True).first()
    Lead.objects.create(
        created=msg.date,
        name=chat.title[:200],
        note=preview(msg.kind, msg.text),
        source="telegram",
        owner_tg=conn.user_tg,
        status=LeadStatus.WORK if first_out else LeadStatus.NEW,
        first_touch=first_out,
        tg_chat=chat,
    )


def bot_id() -> int:
    """Botning o'z Telegram ID'si (token boshidagi raqam)."""
    head = settings.BUSINESS_CONNECTION_BOT_TOKEN.split(":", 1)[0]
    return int(head) if head.isdigit() else 0


def is_bot_chat(m: dict[str, Any]) -> bool:
    """Bot bilan chat (mijoz emas): bot username'i doim "bot" bilan tugaydi (oddiy foydalanuvchiga bunday nom berilmaydi)
    yoki suhbatdoshning o'zi bot (from.is_bot)."""
    c, frm = m.get("chat") or {}, m.get("from") or {}
    return str(c.get("username") or "").lower().endswith("bot") or (
        bool(frm.get("is_bot")) and frm.get("id") == c.get("id")
    )


def handle_update(u: dict[str, Any]) -> None:
    if bc := u.get("business_connection"):
        save_connection(bc)
    elif m := u.get("business_message") or u.get("edited_business_message"):
        if (m.get("chat") or {}).get("id") == bot_id() or is_bot_chat(m):
            return  # botlar bilan chat (CRM boti ham) — mijoz emas, CRM'ga yozilmaydi
        conn = _connection(m.get("business_connection_id", ""))
        if conn is not None:
            save_message(conn, m, edited="edited_business_message" in u)
    elif d := u.get("deleted_business_messages"):
        # o'chirilgan xabar bazada qoladi (matni bilan) — faqat belgilanadi va vaqti yoziladi
        TgMessage.objects.filter(
            chat__connection_id=d.get("business_connection_id"),
            chat__chat_id=(d.get("chat") or {}).get("id"),
            message_id__in=d.get("message_ids") or [],
            deleted=False,
        ).update(deleted=True, deleted_at=timezone.now())
        chat = (
            TgChat.objects.select_related("connection")
            .filter(connection_id=d.get("business_connection_id"), chat_id=(d.get("chat") or {}).get("id"))
            .first()
        )
        if chat is not None:
            live.publish(chat.pk, chat.connection.user_tg)
    elif (
        (m := u.get("message"))
        and (m.get("chat") or {}).get("type") == "private"
        and str(m.get("text") or "").startswith("/start")
    ):
        # botga to'g'ridan-to'g'ri /start — ulash yo'riqnomasi (boshqa xabarlarga javob yo'q)
        try:
            call("sendMessage", chat_id=m["chat"]["id"], text=CONNECT_HELP)
        except ApiError:
            log.warning("yo'riqnoma yuborilmadi")


# ------------------------------------------------------------------ javob
UPLOAD_MAX = 50 * 1024 * 1024  # Bot API — yuborishda 50 MB gacha
PHOTO_MAX = 10 * 1024 * 1024  # sendPhoto — 10 MB gacha (kattasi — fayl sifatida)


def _can_send(chat: TgChat) -> TgConnection:
    conn = chat.connection
    if not conn.is_enabled:
        raise ApiError(409, "Telegram ulanishi uzilgan — sotuvchi botni Telegram Business'da qayta ulasin.")
    if not conn.can_reply:
        raise ApiError(
            403,
            "Bot javob yoza olmaydi: Telegram → Sozlamalar → Telegram Business → Chat-botlar → «Xabarlarga javob berish» ni yoqing.",
        )
    return conn


def _reply_params(reply_to: int | None) -> dict[str, Any] | None:
    """Javob (reply) — Telegram message_id; asl xabar o'chirilgan bo'lsa ham yuboriladi (iqtibossiz)."""
    return {"message_id": reply_to, "allow_sending_without_reply": True} if reply_to else None


def send(chat: TgChat, text: str, reply_to: int | None = None) -> TgMessage:
    conn = _can_send(chat)
    m = call(
        "sendMessage",
        business_connection_id=conn.id,
        chat_id=chat.chat_id,
        text=text,
        reply_parameters=_reply_params(reply_to),
    )
    return save_message(conn, m, via_crm=True)


def send_location(chat: TgChat, lat: float, lon: float, reply_to: int | None = None) -> TgMessage:
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ApiError(400, "Koordinata noto'g'ri.")
    conn = _can_send(chat)
    m = call(
        "sendLocation",
        business_connection_id=conn.id,
        chat_id=chat.chat_id,
        latitude=lat,
        longitude=lon,
        reply_parameters=_reply_params(reply_to),
    )
    return save_message(conn, m, via_crm=True)


def upload_method(mime: str, size: int, as_file: bool) -> tuple[str, str]:
    """(Bot API metodi, fayl maydoni): rasm — sendPhoto (10 MB gacha), mp4 — sendVideo, audio — sendAudio, qolgani — hujjat."""
    if not as_file:
        if mime in ("image/jpeg", "image/png", "image/webp") and size <= PHOTO_MAX:
            return "sendPhoto", "photo"
        if mime == "video/mp4":
            return "sendVideo", "video"
        if mime in ("audio/mpeg", "audio/mp4", "audio/x-m4a"):
            return "sendAudio", "audio"
        if mime == "audio/ogg":
            return "sendVoice", "voice"
    return "sendDocument", "document"


def send_file(
    chat: TgChat,
    name: str,
    mime: str,
    data: bytes,
    caption: str = "",
    as_file: bool = False,
    reply_to: int | None = None,
) -> TgMessage:
    if not data:
        raise ApiError(400, "Fayl bo'sh.")
    if len(data) > UPLOAD_MAX:
        raise ApiError(413, "Fayl 50 MB dan katta — Telegram bot orqali yuborib bo'lmaydi.")
    if len(caption) > 1024:
        raise ApiError(400, "Izoh juda uzun (1024 belgigacha).")
    conn = _can_send(chat)
    method, field = upload_method(mime, len(data), as_file)
    url = f"https://api.telegram.org/bot{settings.BUSINESS_CONNECTION_BOT_TOKEN}/{method}"
    form = {
        "business_connection_id": conn.id,
        "chat_id": str(chat.chat_id),
        **({"caption": caption} if caption else {}),
        **({"reply_parameters": json.dumps(_reply_params(reply_to))} if reply_to else {}),
    }
    try:
        with httpx.Client(timeout=120) as h:
            res = h.post(
                url, data=form, files={field: (name or "fayl", data, mime or "application/octet-stream")}
            ).json()
    except (httpx.HTTPError, ValueError) as e:
        raise ApiError(502, "Telegram bilan aloqa bo'lmadi — keyinroq urinib ko'ring.") from e
    if not res.get("ok"):
        raise ApiError(502, f"Telegram rad etdi: {res.get('description') or 'nomaʼlum xato'}")
    return save_message(conn, res["result"], via_crm=True)


# ------------------------------------------------------------------ fayl
def download(msg: TgMessage) -> tuple[bytes, str]:
    """Xabar fayli (getFile → Telegram fayl serveri). 20 MB dan katta — Bot API bermaydi."""
    media = msg.media or {}
    if not media.get("file_id"):
        raise ApiError(404, "Bu xabarda fayl yo'q")
    if (media.get("size") or 0) > FILE_MAX:
        raise ApiError(413, "Fayl 20 MB dan katta — Telegram'ning o'zida oching.")
    f = call("getFile", file_id=media["file_id"]) or {}
    path = f.get("file_path")
    if not path:
        raise ApiError(404, "Telegram faylni bermadi (muddati o'tgan bo'lishi mumkin)")
    url = f"https://api.telegram.org/file/bot{settings.BUSINESS_CONNECTION_BOT_TOKEN}/{path}"
    try:
        with httpx.Client(timeout=60) as h:
            r = h.get(url)
            r.raise_for_status()
    except httpx.HTTPError as e:
        raise ApiError(502, "Faylni Telegram'dan olib bo'lmadi — keyinroq urinib ko'ring.") from e
    return r.content, media.get("mime") or r.headers.get("content-type", "application/octet-stream")

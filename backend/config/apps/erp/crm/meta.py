"""WhatsApp va Instagram Direct — rasmiy Meta API (WhatsApp Cloud API; Instagram API with Instagram Login).

Telegram'dan farqi: kompaniyaning BITTA WhatsApp raqami va BITTA Instagram akkaunti. Yangi suhbat sotuvchiga
taqsimlanadi: mijoz telefoni CRM mijoziga mos kelsa — uning menejeri, aks holda — lid taqsimlash qoidalari / navbat
(sales.next_seller). Chat sotuvchining shu kanaldagi «ulanishi» (TgConnection id «wa:<tg_id>», channel=wa) ostida
saqlanadi — Telegram chatlari bilan bir xil jadval: shaxsiylik (har kim o'z chatini ko'radi), o'qilmagan, real vaqt,
lid, mijozga biriktirish, chatdan bitim.

Webhook (bitta manzil ikkala kanal uchun): GET — tasdiqlash (hub.verify_token = META_VERIFY_TOKEN), POST — imzo
X-Hub-Signature-256 (META_APP_SECRET) tekshiriladi. Xabar ID'lari Meta'da matn (wamid…, mid…) — bazada barqaror 63-bit
xesh (message_id), asl ID — raw["id"].
24 soat qoidasi: mijozning oxirgi xabaridan 24 soat o'tgach erkin xabar yuborib bo'lmaydi (WhatsApp — faqat tasdiqlangan
shablon) — yuborishdan oldin tekshiriladi va tushunarli xato qaytariladi.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlparse

import httpx
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from config.apps.core.http import ApiError

from . import live
from .models import Channel, Customer, TgChat, TgConnection, TgMessage

log = logging.getLogger(__name__)
TIMEOUT = 20
GRAPH = "https://graph.facebook.com"
IG_GRAPH = "https://graph.instagram.com"
WINDOW = timedelta(hours=24)
NAMES: dict[str, str] = {"wa": "WhatsApp", "ig": "Instagram"}
# WhatsApp xabar turi → CRM turi (Telegram bilan bir xil nomlar — frontend shu bo'yicha ko'rsatadi)
WA_KINDS = {
    "image": "photo",
    "video": "video",
    "audio": "audio",
    "document": "document",
    "sticker": "sticker",
    "location": "location",
    "contacts": "contact",
}
IG_KINDS = {
    "image": "photo",
    "video": "video",
    "audio": "audio",
    "file": "document",
    "share": "text",
    "story_mention": "story",
}
IG_HOSTS = (".fbcdn.net", ".cdninstagram.com", ".fbsbx.com", ".facebook.com", ".instagram.com")
WA_PHOTO_MAX = 5 * 1024 * 1024
WA_MEDIA_MAX = 16 * 1024 * 1024


def enabled(ch: str) -> bool:
    if ch == Channel.WA:
        return bool(settings.WA_TOKEN and settings.WA_PHONE_ID)
    if ch == Channel.IG:
        return bool(settings.IG_TOKEN and settings.IG_USER_ID)
    return False


def msg_id(ext: str) -> int:
    """Meta xabar ID'si (matn) → barqaror musbat 63-bit son (TgMessage.message_id)."""
    return int.from_bytes(hashlib.blake2b(ext.encode(), digest_size=8).digest(), "big") & ((1 << 63) - 1)


def check_signature(body: bytes, header: str) -> bool:
    if not settings.META_APP_SECRET or not header.startswith("sha256="):
        return False
    want = hmac.new(settings.META_APP_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, header.removeprefix("sha256="))


# ------------------------------------------------------------------ Graph API
def _url(ch: str, path: str) -> str:
    return f"{IG_GRAPH if ch == Channel.IG else GRAPH}/{settings.META_GRAPH_VERSION}/{path}"


def _token(ch: str) -> str:
    return settings.IG_TOKEN if ch == Channel.IG else settings.WA_TOKEN


def call(ch: str, method: str, path: str, **kw: Any) -> dict[str, Any]:
    """Graph API chaqiruvi; xato → ApiError (Meta xabari bilan). 24 soat oynasi yopilgan — 409."""
    if not enabled(ch):
        raise ApiError(503, f"{NAMES.get(ch, ch)} ulanmagan — administrator Meta kalitlarini sozlashi kerak.")
    try:
        with httpx.Client(timeout=kw.pop("timeout", TIMEOUT)) as h:
            r = h.request(method, _url(ch, path), headers={"Authorization": f"Bearer {_token(ch)}"}, **kw)
            data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise ApiError(502, f"{NAMES[ch]} bilan aloqa bo'lmadi — keyinroq urinib ko'ring.") from e
    err = data.get("error") if isinstance(data, dict) else None
    if err:
        if err.get("code") in (131047, 10) or err.get("error_subcode") == 2534022:
            raise ApiError(409, window_text(ch))
        raise ApiError(502, f"{NAMES[ch]} rad etdi: {err.get('message') or 'nomaʼlum xato'}")
    return data if isinstance(data, dict) else {}


def window_text(ch: str) -> str:
    return (
        f"{NAMES[ch]}: mijozning oxirgi xabaridan 24 soat o'tgan — Meta qoidasiga ko'ra erkin xabar yuborib bo'lmaydi. "
        "Mijoz yana yozgach javob bering yoki qo'ng'iroq qiling."
    )


# ------------------------------------------------------------------ chat va sotuvchi
def _seller_name(tg_id: int) -> str:
    from config.apps.staff.services import user_names

    return user_names([tg_id]).get(tg_id, "")


def connection(ch: str, seller_tg: int) -> TgConnection:
    conn, _ = TgConnection.objects.get_or_create(
        id=f"{ch}:{seller_tg}",
        defaults={"channel": ch, "user_tg": seller_tg, "user_name": _seller_name(seller_tg), "can_reply": True},
    )
    return conn


def _owner(phone: str, note: str, now: datetime) -> tuple[int | None, Customer | None]:
    """Yangi suhbat kimga: CRM mijozi (telefon bo'yicha) — uning menejeri; aks holda qoidalar / navbat."""
    from .sales import find_customer, next_seller

    c = find_customer(phone, "") if phone else None
    if c is not None and c.owner_tg:
        return c.owner_tg, c
    return next_seller(now, {"note": note}), c


def get_chat(ch: str, ext: int, title: str, username: str, phone: str, note: str, now: datetime) -> TgChat | None:
    chat = TgChat.objects.select_related("connection").filter(connection__channel=ch, chat_id=ext).first()
    if chat is None:
        seller, cust = _owner(phone, note, now)
        if seller is None:
            log.warning("%s: yangi suhbat %s — faol sotuvchi yo'q, saqlanmadi", ch, ext)
            return None
        chat = TgChat.objects.create(connection=connection(ch, seller), chat_id=ext, customer=cust)
    changed = False
    if title and chat.title != title:
        chat.title, changed = title[:255], True
    if username and chat.username != username:
        chat.username, changed = username[:64], True
    if changed:
        chat.save(update_fields=["title", "username"])
    return chat


@transaction.atomic
def save(
    chat: TgChat,
    ext: str,
    *,
    out: bool,
    kind: str,
    text: str,
    date: datetime,
    media: dict[str, Any] | None = None,
    reply_ext: str | None = None,
    raw: dict[str, Any] | None = None,
    via_crm: bool = False,
) -> TgMessage:
    from .tg import lead_from_chat, preview

    reply = None
    if reply_ext:
        ref = TgMessage.objects.filter(chat=chat, message_id=msg_id(reply_ext)).first()
        reply = {
            "message_id": msg_id(reply_ext),
            "text": preview(ref.kind, ref.text)[:200] if ref else "",
            "kind": ref.kind if ref else "text",
            "from_id": chat.connection.user_tg if ref and ref.out else 0,
        }
    msg, created = TgMessage.objects.update_or_create(
        chat=chat,
        message_id=msg_id(ext),
        defaults={
            "out": out,
            "kind": kind,
            "text": text,
            "date": date,
            "media": media,
            "reply": reply,
            "raw": {"id": ext, **(raw or {})},
        },
    )
    if via_crm and not msg.via_crm:
        msg.via_crm = True
        msg.save(update_fields=["via_crm"])
    if created and (chat.last_at is None or date >= chat.last_at):
        chat.last_at, chat.last_text, chat.last_out = date, preview(kind, text), out
        chat.unread = 0 if out else chat.unread + 1
        chat.save(update_fields=["last_at", "last_text", "last_out", "unread"])
    if created:
        lead_from_chat(chat, chat.connection, msg, from_user={})
    conn = chat.connection
    transaction.on_commit(lambda: live.publish(chat.pk, conn.user_tg))
    return msg


# ------------------------------------------------------------------ webhook
def handle(payload: dict[str, Any]) -> None:
    obj = payload.get("object")
    for e in payload.get("entry") or []:
        if obj == "whatsapp_business_account":
            for change in e.get("changes") or []:
                v = change.get("value") or {}
                names = {c.get("wa_id"): (c.get("profile") or {}).get("name", "") for c in v.get("contacts") or []}
                for m in v.get("messages") or []:
                    try:
                        _wa_in(m, names.get(m.get("from"), ""))
                    except Exception:  # bitta xabar xatosi qolganlarini to'xtatmasin
                        log.exception("whatsapp xabari %s ishlanmadi", m.get("id"))
        elif obj == "instagram":
            for m in e.get("messaging") or []:
                try:
                    _ig_in(m)
                except Exception:
                    log.exception("instagram xabari ishlanmadi")


def _ts(v: Any, ms: bool = False) -> datetime:
    try:
        n = int(v)
    except (TypeError, ValueError):
        return timezone.now()
    return datetime.fromtimestamp(n / 1000 if ms else n, tz=UTC)


def _wa_body(m: dict[str, Any]) -> tuple[str, str, dict[str, Any] | None]:
    """WhatsApp xabari → (tur, matn, media)."""
    t = m.get("type") or "text"
    if t == "text":
        return "text", (m.get("text") or {}).get("body", ""), None
    if t in ("button", "interactive"):
        b = m.get("button") or {}
        i = m.get("interactive") or {}
        text = b.get("text") or (i.get("button_reply") or i.get("list_reply") or {}).get("title", "")
        return "text", text, None
    if t == "location":
        loc = m.get("location") or {}
        text = " — ".join(x for x in (loc.get("name"), loc.get("address")) if x)
        return "location", text, {"lat": loc.get("latitude"), "lon": loc.get("longitude")}
    if t == "contacts":
        cs = m.get("contacts") or []
        text = "; ".join(
            " ".join(
                x
                for x in ((c.get("name") or {}).get("formatted_name"), *(p.get("phone") for p in c.get("phones") or []))
                if x
            )
            for c in cs
        )
        return "contact", text, None
    if t == "reaction":
        return "text", (m.get("reaction") or {}).get("emoji", ""), None
    if t in WA_KINDS:
        f = m.get(t) or {}
        kind = "voice" if t == "audio" and f.get("voice") else WA_KINDS[t]
        media = {
            "file_id": f.get("id"),
            "mime": (f.get("mime_type") or "").split(";")[0],
            "name": f.get("filename") or "",
            "size": 0,
            "animated": bool(f.get("animated")),
        }
        return kind, f.get("caption") or "", media
    return "other", "", None


def _wa_in(m: dict[str, Any], name: str) -> None:
    phone = str(m.get("from") or "")
    if not phone.isdigit() or not m.get("id"):
        return
    kind, text, media = _wa_body(m)
    date = _ts(m.get("timestamp"))
    chat = get_chat(Channel.WA, int(phone), name or f"+{phone}", "", phone, text, date)
    if chat is None:
        return
    reply_ext = (m.get("context") or {}).get("id")
    save(chat, m["id"], out=False, kind=kind, text=text, date=date, media=media, reply_ext=reply_ext, raw=m)


def _ig_profile(igsid: str) -> tuple[str, str]:
    try:
        p = call(Channel.IG, "GET", igsid, params={"fields": "name,username"})
    except ApiError:
        return "", ""
    return str(p.get("name") or ""), str(p.get("username") or "")


def _ig_in(ev: dict[str, Any]) -> None:
    m = ev.get("message")
    if not isinstance(m, dict) or not m.get("mid"):
        return  # o'qildi, reaksiya va boshqa hodisalar — kerak emas
    me = settings.IG_USER_ID
    sender, recipient = str((ev.get("sender") or {}).get("id") or ""), str((ev.get("recipient") or {}).get("id") or "")
    out = bool(m.get("is_echo")) or sender == me  # Instagram ilovasining o'zidan yozilgan javob ham keladi (echo)
    peer = recipient if out else sender
    if not peer.isdigit():
        return
    if m.get("is_deleted"):
        TgMessage.objects.filter(
            chat__connection__channel=Channel.IG, chat__chat_id=int(peer), message_id=msg_id(m["mid"])
        ).update(deleted=True, deleted_at=timezone.now())
        return
    att = (m.get("attachments") or [{}])[0] if m.get("attachments") else None
    kind, media = "text", None
    if att:
        kind = IG_KINDS.get(att.get("type") or "", "other")
        url = (att.get("payload") or {}).get("url")
        if url and kind not in ("text", "story", "other"):
            media = {"file_id": url, "mime": "", "name": "", "size": 0}
    text = m.get("text") or ""
    if not text and kind == "text" and att:  # ulashilgan post — havolasi
        text = str((att.get("payload") or {}).get("url") or "")
    date = _ts(ev.get("timestamp"), ms=True)
    exists = TgChat.objects.filter(connection__channel=Channel.IG, chat_id=int(peer)).exists()
    name, username = ("", "") if exists else _ig_profile(peer)
    chat = get_chat(Channel.IG, int(peer), name or (f"@{username}" if username else ""), username, "", text, date)
    if chat is None:
        return
    reply_ext = (m.get("reply_to") or {}).get("mid")
    save(chat, m["mid"], out=out, kind=kind, text=text, date=date, media=media, reply_ext=reply_ext, raw=ev)


# ------------------------------------------------------------------ javob
def _window(chat: TgChat) -> None:
    last_in = TgMessage.objects.filter(chat=chat, out=False).order_by("-date").values_list("date", flat=True).first()
    if last_in is None or timezone.now() - last_in > WINDOW:
        raise ApiError(409, window_text(chat.connection.channel))


def _ext(chat: TgChat, reply_to: int | None) -> str | None:
    if not reply_to:
        return None
    m = TgMessage.objects.filter(chat=chat, message_id=reply_to).first()
    return str((m.raw or {}).get("id") or "") or None if m else None


def _wa_send(chat: TgChat, body: dict[str, Any], reply_to: int | None) -> str:
    ctx = _ext(chat, reply_to)
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": str(chat.chat_id),
        **body,
        **({"context": {"message_id": ctx}} if ctx else {}),
    }
    r = call(Channel.WA, "POST", f"{settings.WA_PHONE_ID}/messages", json=payload)
    return str(((r.get("messages") or [{}])[0]).get("id") or "")


def send(chat: TgChat, text: str, reply_to: int | None = None) -> TgMessage:
    ch = chat.connection.channel
    _window(chat)
    if ch == Channel.WA:
        ext = _wa_send(chat, {"type": "text", "text": {"body": text, "preview_url": True}}, reply_to)
    else:
        r = call(
            Channel.IG,
            "POST",
            f"{settings.IG_USER_ID}/messages",
            json={"recipient": {"id": str(chat.chat_id)}, "message": {"text": text}},
        )
        ext = str(r.get("message_id") or "")
    if not ext:
        raise ApiError(502, f"{NAMES[ch]} xabar ID'sini qaytarmadi — yuborilganini ilovada tekshiring.")
    return save(chat, ext, out=True, kind="text", text=text, date=timezone.now(), via_crm=True)


def send_location(chat: TgChat, lat: float, lon: float, reply_to: int | None = None) -> TgMessage:
    if chat.connection.channel != Channel.WA:
        raise ApiError(400, "Instagram orqali joylashuv yuborib bo'lmaydi — manzilni matn bilan yozing.")
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ApiError(400, "Koordinata noto'g'ri.")
    _window(chat)
    ext = _wa_send(chat, {"type": "location", "location": {"latitude": lat, "longitude": lon}}, reply_to)
    return save(
        chat, ext, out=True, kind="location", text="", date=timezone.now(), media={"lat": lat, "lon": lon}, via_crm=True
    )


def wa_type(mime: str, size: int, as_file: bool) -> str:
    """WhatsApp media turi: rasm (5 MB gacha), mp4 video / audio (16 MB gacha), qolgani — hujjat."""
    if not as_file:
        if mime in ("image/jpeg", "image/png") and size <= WA_PHOTO_MAX:
            return "image"
        if mime in ("video/mp4", "video/3gpp") and size <= WA_MEDIA_MAX:
            return "video"
        if mime in ("audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/amr") and size <= WA_MEDIA_MAX:
            return "audio"
    return "document"


def send_file(
    chat: TgChat, name: str, mime: str, data: bytes, caption: str, as_file: bool, reply_to: int | None
) -> TgMessage:
    if chat.connection.channel != Channel.WA:
        raise ApiError(400, "Instagram'ga CRM'dan fayl yuborib bo'lmaydi (Meta faqat ochiq havola qabul qiladi).")
    _window(chat)
    t = wa_type(mime, len(data), as_file)
    up = call(
        Channel.WA,
        "POST",
        f"{settings.WA_PHONE_ID}/media",
        data={"messaging_product": "whatsapp", "type": mime or "application/octet-stream"},
        files={"file": (name or "fayl", data, mime or "application/octet-stream")},
        timeout=120,
    )
    media_id = str(up.get("id") or "")
    if not media_id:
        raise ApiError(502, "WhatsApp faylni qabul qilmadi.")
    obj: dict[str, Any] = {"id": media_id}
    if caption and t != "audio":
        obj["caption"] = caption
    if t == "document":
        obj["filename"] = name or "fayl"
    ext = _wa_send(chat, {"type": t, t: obj}, reply_to)
    kind = {"image": "photo"}.get(t, t)
    media = {"file_id": media_id, "mime": mime, "name": name, "size": len(data)}
    return save(chat, ext, out=True, kind=kind, text=caption, date=timezone.now(), media=media, via_crm=True)


# ------------------------------------------------------------------ fayl
def download(msg: TgMessage) -> tuple[bytes, str]:
    ch = msg.chat.connection.channel
    media = msg.media or {}
    ref = str(media.get("file_id") or "")
    if not ref:
        raise ApiError(404, "Bu xabarda fayl yo'q")
    headers: dict[str, str] = {}
    if ch == Channel.WA:  # media ID → vaqtinchalik havola (token bilan yuklanadi)
        info = call(Channel.WA, "GET", ref)
        url, mime = str(info.get("url") or ""), str(info.get("mime_type") or media.get("mime") or "")
        headers = {"Authorization": f"Bearer {settings.WA_TOKEN}"}
    else:  # Instagram — CDN havolasi (muddati cheklangan); faqat Meta domenlari (webhook ma'lumotiga ko'r-ko'rona ishonmaymiz)
        url, mime = ref, str(media.get("mime") or "")
        if not (urlparse(url).hostname or "").endswith(IG_HOSTS):
            raise ApiError(404, "Fayl havolasi noma'lum manzilda — Instagram ilovasida oching.")
    if not url.startswith("https://"):
        raise ApiError(404, "Fayl havolasi topilmadi (muddati o'tgan bo'lishi mumkin)")
    try:
        with httpx.Client(timeout=60, follow_redirects=True) as h:
            r = h.get(url, headers=headers)
            r.raise_for_status()
    except httpx.HTTPError as e:
        raise ApiError(502, f"Faylni {NAMES.get(ch, ch)}'dan olib bo'lmadi — muddati o'tgan bo'lishi mumkin.") from e
    return r.content, mime or r.headers.get("content-type", "application/octet-stream")

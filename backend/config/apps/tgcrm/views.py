"""TelegramCRM API ko'rinishlari. Telegram bilan gaplashish — faqat gateway orqali (bus.call)."""

from __future__ import annotations

import uuid
from datetime import timedelta
from pathlib import Path
from typing import Any

import segno
from django.conf import settings
from django.db.models import Count, Q
from django.http import FileResponse, HttpRequest, HttpResponse
from django.http.response import HttpResponseBase
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from config.apps.core.http import ApiError, api, json_body, ok
from config.apps.staff.services import User, active_users, user_by_tg
from config.apps.staff.services import user_names as staff_names

from . import bus, crm, files, inbox, locks
from .access import can_manage, can_use, can_write, is_head, role_of, visible
from .models import (
    LOGIN,
    Account,
    AccountEvent,
    AccountMember,
    Contact,
    Dialog,
    Folder,
    Kind,
    Message,
    Note,
    Peer,
    PeerKind,
    QuickReply,
    Role,
    Stage,
    Status,
    Tag,
    Task,
)
from .serialize import public

DENY = "TelegramCRM — sotuv bo'limi, rahbariyat va adminlar uchun."
NEEDS_SESSION = (*LOGIN, Status.ACTIVE, Status.OFFLINE, Status.FLOOD, Status.LIMITED, Status.FROZEN)


def _pub(user: User, a: Account) -> dict[str, Any]:
    return public(a) | {"can_manage": can_manage(user, a), "role": role_of(user, a)}


def _get(user: User, pk: int) -> Account:
    a = visible(user, Account.objects.all()).filter(pk=pk).first()
    if a is None:
        raise ApiError(404, "Akkaunt topilmadi.")
    return a


def _managed(user: User, pk: int) -> Account:
    a = _get(user, pk)
    if not can_manage(user, a):
        raise ApiError(403, "Bu akkauntni faqat egasi yoki sotuv rahbari boshqaradi.")
    return a


def _configured() -> bool:
    return bool(settings.TGCRM_API_ID and settings.TGCRM_API_HASH)


@api(check=can_use, deny=DENY)
def status(request: HttpRequest, user: User) -> HttpResponse:
    return ok(
        {"gateway": bus.alive(), "configured": _configured(), "me": {"tg_id": user.tg_id, "is_head": is_head(user)}}
    )


@api(("GET", "POST"), check=can_use, deny=DENY)
def accounts(request: HttpRequest, user: User) -> HttpResponse:
    if request.method == "GET":
        rows = [_pub(user, a) for a in visible(user, Account.objects.all())]
        return ok({"accounts": rows})
    body = json_body(request)
    kind = str(body.get("kind") or Kind.PERSONAL)
    if kind not in Kind.values:
        raise ApiError(400, "Turi: company yoki personal.")
    if kind == Kind.COMPANY and not is_head(user):
        raise ApiError(403, "Firma raqamini faqat sotuv rahbari yoki admin ulaydi.")
    title = str(body.get("title") or "").strip()[:120]
    if kind == Kind.COMPANY and not title:
        raise ApiError(400, "Firma raqamiga nom bering (masalan: «Sotuv bo'limi»).")
    a = Account.objects.create(kind=kind, title=title, owner_tg=user.tg_id)
    AccountEvent.objects.create(account=a, kind="created", actor_tg=user.tg_id)
    return ok(_pub(user, a), status=201)


@api(("GET", "PATCH", "DELETE"), check=can_use, deny=DENY)
def account(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    if request.method == "GET":
        a = _get(user, pk)
        return ok(_pub(user, a))
    a = _managed(user, pk)
    if request.method == "PATCH":
        body = json_body(request)
        if "title" in body:
            a.title = str(body["title"] or "").strip()[:120]
            a.save(update_fields=["title", "updated_at"])
        return ok(_pub(user, a))
    if a.status in NEEDS_SESSION:
        # avval Telegram'dagi sessiyani yopamiz (gateway ishlamasa — 503: sessiya telefonda "osilib" qolmasin)
        bus.call("account.logout", a.pk, actor=user.tg_id)
    a.delete()
    return ok()


@api(("POST",), check=can_use, deny=DENY)
def login(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    a = _managed(user, pk)
    if not _configured():
        raise ApiError(503, "TGCRM_API_ID / TGCRM_API_HASH sozlanmagan (.env.local).")
    body = json_body(request)
    step = str(body.get("step") or "")
    ops: dict[str, tuple[str, dict[str, Any]]] = {
        "phone": ("login.code", {"phone": str(body.get("phone") or "")}),
        "code": ("login.sign_in", {"code": str(body.get("code") or "")}),
        "password": ("login.password", {"password": str(body.get("password") or "")}),
        "qr": ("login.qr", {}),
        "qr_state": ("login.qr_state", {}),
        "cancel": ("login.cancel", {}),
    }
    if step not in ops:
        raise ApiError(400, "Qadam: phone, code, password, qr, qr_state yoki cancel.")
    if a.status == Status.ACTIVE and step not in ("qr_state",):
        raise ApiError(409, "Akkaunt allaqachon ulangan. Avval uzing.")
    op, args = ops[step]
    data = bus.call(op, a.pk, args, actor=user.tg_id, timeout=45)
    if data.get("url"):
        # QR — serverda (segno), brauzerga <img> uchun data URI; tg://login?token=… telefon kamerasi bilan skanerlanadi
        data["qr"] = segno.make(data["url"], error="m").svg_data_uri(scale=6, border=2)
    a.refresh_from_db()
    return ok({"result": data, "account": _pub(user, a)})


@api(("POST",), check=can_use, deny=DENY)
def logout(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    a = _managed(user, pk)
    bus.call("account.logout", a.pk, actor=user.tg_id)
    a.refresh_from_db()
    return ok(_pub(user, a))


@api(("POST",), check=can_use, deny=DENY)
def restart(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    a = _managed(user, pk)
    bus.call("account.restart", a.pk, actor=user.tg_id, timeout=60)
    a.refresh_from_db()
    return ok(_pub(user, a))


@api(check=can_use, deny=DENY)
def events(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    a = _get(user, pk)
    rows = list(AccountEvent.objects.filter(account=a)[:100])
    names = staff_names({e.actor_tg for e in rows if e.actor_tg})
    return ok(
        {
            "events": [
                {
                    "kind": e.kind,
                    "detail": e.detail,
                    "actor_tg": e.actor_tg,
                    "actor": names.get(e.actor_tg or 0, ""),
                    "at": e.at.isoformat(),
                }
                for e in rows
            ]
        }
    )


# ---------------------------------------------------------------------- 2-bosqich: chatlar va xabarlar
def _dialog(a: Account, peer: int) -> Dialog:
    d = Dialog.objects.filter(account=a, peer__peer_id=peer).select_related("peer").first()
    if d is None:
        raise ApiError(404, "Chat topilmadi.")
    return d


@api(check=can_use, deny=DENY)
def dialogs(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    a = _get(user, pk)
    g = request.GET
    folder = None
    fid = g.get("folder", "")
    if fid == "archive":
        archived = True
    else:
        archived = False
        if fid:
            folder = Folder.objects.filter(account=a, folder_id=_num(fid)).first()
            if folder is None:
                raise ApiError(404, "Papka topilmadi.")
    limit = min(max(_num(g.get("limit") or inbox.PAGE), 1), 200)
    who = g.get("who", "") if g.get("who") in ("mine", "free", "waiting") else ""
    page = inbox.dialogs_page(
        a.pk,
        archived=archived,
        folder=folder,
        q=g.get("q", "").strip()[:64],
        cursor=g.get("cursor", ""),
        limit=limit,
        who=who,
        me=user.tg_id,
    )
    return ok(page | {"synced": Dialog.objects.filter(account=a).exists(), "can_write": can_write(user, a)})


@api(check=can_use, deny=DENY)
def folders(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    a = _get(user, pk)
    return ok({"folders": inbox.folders_json(a.pk)})


@api(check=can_use, deny=DENY)
def chat(request: HttpRequest, user: User, pk: int, peer: int) -> HttpResponse:
    a = _get(user, pk)
    return ok(inbox.dialog_json(_dialog(a, peer)) | {"can_write": can_write(user, a)})


@api(check=can_use, deny=DENY)
def messages(request: HttpRequest, user: User, pk: int, peer: int) -> HttpResponse:
    """Dangasa tarix: bazadagi uzluksiz oraliqdan; yetmasa — shlyuz Telegram'dan keyingi sahifani oladi (50 ta).
    Shlyuz ishlamasa — bazadagisi `stale: true` bilan."""
    a = _get(user, pk)
    d = _dialog(a, peer)
    before = _num(request.GET.get("before") or 0) or None
    page = inbox.messages_page(d, before)
    stale = False
    if d.history_min_id is None or (len(page["messages"]) < inbox.PAGE and not d.history_complete):
        try:
            bus.call("chats.history", a.pk, {"peer": peer}, actor=user.tg_id, timeout=40)
            d.refresh_from_db()
            page = inbox.messages_page(d, before)
        except ApiError as e:
            if e.status not in (409, 429, 503, 504):
                raise
            stale = True
            page["notice"] = e.detail
    return ok(page | {"stale": stale})


@api(("POST",), check=can_use, deny=DENY)
def read(request: HttpRequest, user: User, pk: int, peer: int) -> HttpResponse:
    """O'qildi — operator chatni ochganda (faqat ko'ringan oxirgi xabargacha)."""
    a = _get(user, pk)
    d = _dialog(a, peer)
    max_id = _num(json_body(request).get("max_id") or d.top_msg_id)
    if max_id <= d.read_inbox_max and d.unread == 0:
        return ok({"ok": True, "skipped": True})
    bus.call("chats.read", a.pk, {"peer": peer, "max_id": max_id}, actor=user.tg_id)
    return ok({"ok": True})


def _writer(user: User, pk: int) -> Account:
    a = _get(user, pk)
    if not can_write(user, a):
        raise ApiError(403, "Shaxsiy raqamdan faqat egasi yozadi.")
    return a


@api(("POST",), check=can_use, deny=DENY)
def send(request: HttpRequest, user: User, pk: int, peer: int) -> HttpResponse:
    a = _writer(user, pk)
    d = _dialog(a, peer)
    body = json_body(request)
    text = str(body.get("text") or "")
    if not text.strip():
        raise ApiError(400, "Bo'sh xabar yuborilmaydi.")
    reply = _num(body["reply_to"]) if body.get("reply_to") else None
    _guard_lock(user, a, peer, bool(body.get("force")))
    res = bus.call("chats.send", a.pk, {"peer": peer, "text": text, "reply_to": reply}, actor=user.tg_id, timeout=30)
    _auto_assign(user, a, d)
    m = Message.objects.filter(peer_id=d.peer_id, msg_id=res.get("msg_id")).first()
    d.refresh_from_db()
    return ok({"message": inbox.message_json(m, d.read_outbox_max) if m else None}, status=201)


@api(("POST",), check=can_use, deny=DENY)
def typing(request: HttpRequest, user: User, pk: int, peer: int) -> HttpResponse:
    a = _writer(user, pk)
    _dialog(a, peer)
    try:
        bus.call("chats.typing", a.pk, {"peer": peer}, actor=user.tg_id, timeout=10)
    except ApiError as e:
        if e.status not in (429, 503, 504):  # "yozmoqda" — muhim emas, jim o'tadi
            raise
    return ok({"ok": True})


@api(("POST",), check=can_use, deny=DENY)
def sync(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    a = _get(user, pk)
    return ok(bus.call("chats.sync", a.pk, actor=user.tg_id, timeout=300))


def _num(v: Any) -> int:
    try:
        return int(v)
    except (TypeError, ValueError) as e:
        raise ApiError(400, "Noto'g'ri raqam.") from e


# ---------------------------------------------------------------------- 4-bosqich: media
# brauzerda to'g'ridan-to'g'ri ochiladigan turlar; boshqasi (html, svg, pdf …) — faqat yuklab olish (XSS yo'q)
INLINE_MIME = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/webm", "video/quicktime",
    "audio/ogg", "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/wav", "audio/webm", "audio/flac",
}  # fmt: skip


@api(check=can_use, deny=DENY)
def media(request: HttpRequest, user: User, pk: int, peer: int, msg: int) -> HttpResponseBase:
    """GET …/media/<msg_id>[?thumb=1][&download=1] — fayl (keshdan yoki shlyuz Telegram'dan yuklab oladi)."""
    a = _get(user, pk)
    d = _dialog(a, peer)
    m = Message.objects.filter(peer_id=d.peer_id, msg_id=msg).first()
    if (
        m is None
        or not m.media
        or m.media.get("kind") in (None, "webpage", "geo", "venue", "contact", "poll", "dice", "unsupported")
    ):
        raise ApiError(404, "Bu xabarda fayl yo'q.")
    thumb = request.GET.get("thumb") == "1"
    if thumb and not m.media.get("thumb"):
        raise ApiError(404, "Kichik rasm yo'q.")
    path = files.cached(a.pk, peer, msg, thumb)
    if path is None:
        res = bus.call(
            "media.download",
            a.pk,
            {"peer": peer, "msg_id": msg, "thumb": thumb},
            actor=user.tg_id,
            timeout=60 if thumb else 600,
        )
        path = files.root() / str(res.get("path") or "")
        if not files.inside(path) or not path.is_file():
            raise ApiError(502, "Fayl yuklab olinmadi.")
    mime = files.guess_mime(path, "image/jpeg") if thumb else (m.media.get("mime") or files.guess_mime(path))
    if m.media.get("kind") == "photo" and not thumb:
        mime = files.guess_mime(path, "image/jpeg")
    inline = mime in INLINE_MIME and request.GET.get("download") != "1"
    name = str(m.media.get("name") or f"{m.media.get('kind', 'fayl')}_{msg}{path.suffix}")
    resp = FileResponse(
        path.open("rb"),
        content_type=mime if inline else "application/octet-stream",
        as_attachment=not inline,
        filename=name,
    )
    resp["X-Content-Type-Options"] = "nosniff"
    resp["Cache-Control"] = "private, max-age=86400"
    resp["Content-Security-Policy"] = "default-src 'none'; sandbox"
    return resp


@api(("POST",), check=can_use, deny=DENY)
def send_file(request: HttpRequest, user: User, pk: int, peer: int) -> HttpResponse:
    """POST …/send-file (multipart: file, kind=photo|file|video|voice|audio, caption?, reply_to?).
    Sarlavha `X-Requested-With: tgcrm` majburiy — boshqa saytdagi oddiy forma yubora olmaydi (CORS preflight)."""
    if request.headers.get("X-Requested-With") != "tgcrm":
        raise ApiError(403, "So'rov ilovadan kelmagan.")
    a = _writer(user, pk)
    d = _dialog(a, peer)
    f = request.FILES.get("file")
    if f is None or not f.size:
        raise ApiError(400, "Faylni tanlang.")
    kind = str(request.POST.get("kind") or "file")
    if kind not in ("photo", "file", "video", "voice", "audio"):
        raise ApiError(400, "Turi: photo, file, video, voice yoki audio.")
    cap = int((a.limits or {}).get("file_bytes") or 2000 * 1024**2)
    if f.size > cap:
        raise ApiError(413, f"Fayl juda katta: Telegram chegarasi {cap // 1024**2} MB.")
    if kind == "photo" and f.size > 10 * 1024**2:
        raise ApiError(413, "Rasm sifatida 10 MB gacha — kattasini «Fayl» qilib yuboring.")
    suffix = "".join(ch for ch in Path(f.name or "").suffix.lower() if ch.isalnum() or ch == ".")[:10]
    tmp = files.uploads_dir() / f"{uuid.uuid4().hex}{suffix}"
    with tmp.open("wb") as out:
        for chunk in f.chunks():
            out.write(chunk)
    reply = _num(request.POST["reply_to"]) if request.POST.get("reply_to") else None
    args = {
        "peer": peer,
        "upload": tmp.name,
        "name": f.name or "fayl",
        "kind": kind,
        "caption": str(request.POST.get("caption") or ""),
        "reply_to": reply,
    }
    try:
        _guard_lock(user, a, peer, request.POST.get("force") in ("1", "true"))
        res = bus.call("media.send", a.pk, args, actor=user.tg_id, timeout=900)
    finally:
        tmp.unlink(missing_ok=True)  # shlyuz yuborgach keshga ko'chiradi; xato bo'lsa — o'chadi
    _auto_assign(user, a, d)
    m = Message.objects.filter(peer_id=d.peer_id, msg_id=res.get("msg_id")).first()
    d.refresh_from_db()
    return ok({"message": inbox.message_json(m, d.read_outbox_max) if m else None}, status=201)


# ---------------------------------------------------------------------- 5-bosqich: amallar, profil, qidiruv
def _msgs_json(d: Dialog, ids: list[int]) -> list[dict[str, Any]]:
    rows = {m.msg_id: m for m in Message.objects.filter(peer_id=d.peer_id, msg_id__in=ids)}
    return [inbox.message_json(rows[i], d.read_outbox_max) for i in ids if i in rows]


def _act(
    request: HttpRequest, user: User, pk: int, peer: int, op: str, args: dict[str, Any], timeout: int = 30
) -> dict[str, Any]:
    a = _writer(user, pk)
    _dialog(a, peer)
    return bus.call(op, a.pk, {"peer": peer, **args}, actor=user.tg_id, timeout=timeout)


@api(("POST",), check=can_use, deny=DENY)
def msg_edit(request: HttpRequest, user: User, pk: int, peer: int, msg: int) -> HttpResponse:
    text = str(json_body(request).get("text") or "")
    if not text.strip():
        raise ApiError(400, "Bo'sh matn bo'lmaydi.")
    a = _writer(user, pk)
    d = _dialog(a, peer)
    m = Message.objects.filter(peer_id=d.peer_id, msg_id=msg).first()
    if m is None or not m.out:
        raise ApiError(403, "Faqat o'z xabaringizni tahrirlash mumkin.")
    bus.call("msg.edit", a.pk, {"peer": peer, "msg_id": msg, "text": text}, actor=user.tg_id)
    m.refresh_from_db()
    return ok({"message": inbox.message_json(m, d.read_outbox_max)})


@api(("POST",), check=can_use, deny=DENY)
def msg_delete(request: HttpRequest, user: User, pk: int, peer: int) -> HttpResponse:
    body = json_body(request)
    ids = [_num(x) for x in (body.get("ids") or [])][:100]
    return ok(_act(request, user, pk, peer, "msg.delete", {"ids": ids, "revoke": bool(body.get("revoke"))}))


@api(("POST",), check=can_use, deny=DENY)
def msg_forward(request: HttpRequest, user: User, pk: int, peer: int) -> HttpResponse:
    body = json_body(request)
    ids = [_num(x) for x in (body.get("ids") or [])][:100]
    to = _num(body.get("to"))
    a = _writer(user, pk)
    _dialog(a, to)  # manzil ham shu akkaunt chati bo'lsin
    return ok(_act(request, user, pk, peer, "msg.forward", {"ids": ids, "to": to}))


@api(("POST",), check=can_use, deny=DENY)
def msg_react(request: HttpRequest, user: User, pk: int, peer: int, msg: int) -> HttpResponse:
    emoji = str(json_body(request).get("emoji") or "")[:16]
    return ok(_act(request, user, pk, peer, "msg.react", {"msg_id": msg, "emoji": emoji}))


@api(("POST",), check=can_use, deny=DENY)
def msg_pin(request: HttpRequest, user: User, pk: int, peer: int, msg: int) -> HttpResponse:
    return ok(_act(request, user, pk, peer, "msg.pin", {"msg_id": msg, "unpin": bool(json_body(request).get("unpin"))}))


@api(("POST",), check=can_use, deny=DENY)
def chat_set(request: HttpRequest, user: User, pk: int, peer: int, what: str) -> HttpResponse:
    """POST …/chats/<peer>/(pin|archive|mute) — {pinned} / {archived} / {seconds: null|0|N}."""
    body = json_body(request)
    if what == "pin":
        res = _act(request, user, pk, peer, "chat.pin", {"pinned": bool(body.get("pinned"))})
    elif what == "archive":
        res = _act(request, user, pk, peer, "chat.archive", {"archived": bool(body.get("archived"))})
    elif what == "mute":
        sec = body.get("seconds")
        res = _act(request, user, pk, peer, "chat.mute", {"seconds": None if sec is None else max(0, _num(sec))})
    else:
        raise ApiError(404, "Noma'lum amal.")
    return ok(res)


@api(check=can_use, deny=DENY)
def chat_info(request: HttpRequest, user: User, pk: int, peer: int) -> HttpResponse:
    a = _get(user, pk)
    d = _dialog(a, peer)
    info = bus.call("chat.info", a.pk, {"peer": peer}, actor=user.tg_id)
    pin = info.get("pinned_msg_id")
    pinned = _msgs_json(d, [pin]) if pin else []
    return ok(info | {"pinned": pinned[0] if pinned else None, "can_write": can_write(user, a)})


@api(check=can_use, deny=DENY)
def chat_members(request: HttpRequest, user: User, pk: int, peer: int) -> HttpResponse:
    a = _get(user, pk)
    _dialog(a, peer)
    return ok(
        bus.call("chat.members", a.pk, {"peer": peer, "q": request.GET.get("q", "")[:64]}, actor=user.tg_id, timeout=60)
    )


@api(check=can_use, deny=DENY)
def chat_search(request: HttpRequest, user: User, pk: int, peer: int) -> HttpResponse:
    """Chat ichida qidiruv (`q`) yoki umumiy media (`filter`: photo|video|file|link|voice|music) — Telegram'dan."""
    a = _get(user, pk)
    d = _dialog(a, peer)
    g = request.GET
    args = {
        "peer": peer,
        "q": g.get("q", "")[:128],
        "filter": g.get("filter", ""),
        "offset_id": _num(g.get("offset_id") or 0),
    }
    res = bus.call("chat.search", a.pk, args, actor=user.tg_id, timeout=40)
    msgs = _msgs_json(d, [int(x) for x in res.get("ids") or []])
    senders = {m["sender_id"] for m in msgs if m["sender_id"]}
    peers = Peer.objects.filter(account=a, peer_id__in=senders)
    return ok(
        {
            "messages": msgs,
            "peers": {str(p.peer_id): {"title": p.title, "username": p.username, "kind": p.kind} for p in peers},
            "has_more": bool(res.get("has_more")),
            "total": res.get("total"),
        }
    )


@api(check=can_use, deny=DENY)
def search_all(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    """Barcha chatlar bo'yicha (bazadagi xabarlar) — CRM: "qaysi mijoz narx so'ragan edi"."""
    a = _get(user, pk)
    q = request.GET.get("q", "").strip()[:128]
    if len(q) < 2:
        return ok({"results": []})
    rows = (
        Message.objects.filter(account=a, deleted=False, text__icontains=q)
        .select_related("peer", "peer__dialog")
        .order_by("-date")[:50]
    )
    out = []
    for m in rows:
        d = getattr(m.peer, "dialog", None)
        if d is None:
            continue
        out.append({"chat": inbox.dialog_json(d), "message": inbox.message_json(m, d.read_outbox_max)})
    return ok({"results": out})


@api(check=can_use, deny=DENY)
def peer_photo(request: HttpRequest, user: User, pk: int, peer: int) -> HttpResponseBase:
    a = _get(user, pk)
    p = Peer.objects.filter(account=a, peer_id=peer).first()
    if p is None or not p.photo_id:
        raise ApiError(404, "Rasm yo'q.")
    path = files.avatar_path(a.pk, peer, p.photo_id)
    if not path.is_file():
        res = bus.call("chat.avatar", a.pk, {"peer": peer}, actor=user.tg_id, timeout=30)
        path = files.root() / str(res.get("path") or "")
        if not files.inside(path) or not path.is_file():
            raise ApiError(502, "Rasm yuklab olinmadi.")
    resp = FileResponse(path.open("rb"), content_type="image/jpeg")
    resp["X-Content-Type-Options"] = "nosniff"
    resp["Cache-Control"] = "private, max-age=604800"  # photo_id URL'da — rasm almashsa URL ham almashadi
    return resp


# ---------------------------------------------------------------------- 6-bosqich: operatorlar
def _guard_lock(user: User, a: Account, peer: int, force: bool) -> None:
    """Boshqa operator shu chatga hozir javob yozayotgan bo'lsa — 409 (frontend so'raydi: baribir yuborish → force)."""
    holder = locks.holder(a.pk, peer)
    if holder and holder != user.tg_id and not force:
        name = staff_names([holder]).get(holder) or "Boshqa xodim"
        raise ApiError(409, f"{name} hozir shu chatga javob yozmoqda.")


def _auto_assign(user: User, a: Account, d: Dialog) -> None:
    """Biriktirilmagan mijoz chatiga birinchi javob bergan operator — mas'ul."""
    if d.assignee_tg is None and d.peer.kind == PeerKind.USER and not d.peer.is_self:
        n = Dialog.objects.filter(pk=d.pk, assignee_tg=None).update(
            assignee_tg=user.tg_id, assigned_at=timezone.now(), assigned_by=user.tg_id
        )
        if n:
            bus.publish({"type": "dialog", "account": a.pk, "peer": d.peer.peer_id})


def _eligible(a: Account) -> dict[int, str]:
    """Chat biriktirish mumkin bo'lgan xodimlar (operator va admin): a'zolar ro'yxati; firma raqamida ro'yxat bo'sh —
    modulning hamma faol xodimi; shaxsiy raqamda — egasi va yordamchilari."""
    rows = {m.staff_tg: m.role for m in AccountMember.objects.filter(account=a)}
    ids = {tg for tg, r in rows.items() if r != Role.VIEWER}
    if a.kind == Kind.PERSONAL:
        ids.add(a.owner_tg)
    elif not rows:
        ids = {u.tg_id for u in active_users() if can_use(u)}
    return staff_names(ids)


@api(("POST",), check=can_use, deny=DENY)
def assign(request: HttpRequest, user: User, pk: int, peer: int) -> HttpResponse:
    """POST …/chats/<peer>/assign {tg_id | null} — admin: istalgan operatorga; operator: o'ziga oladi / o'zinikini bo'shatadi."""
    a = _get(user, pk)
    d = _dialog(a, peer)
    raw = json_body(request).get("tg_id")
    to = _num(raw) if raw is not None else None
    admin = can_manage(user, a) and role_of(user, a) == Role.ADMIN
    if not can_write(user, a):
        raise ApiError(403, "Chat biriktirish — operator yoki admin uchun.")
    if not admin:
        if to not in (None, user.tg_id):
            raise ApiError(403, "Chatni faqat o'zingizga olishingiz mumkin (boshqaga — admin biriktiradi).")
        if to is None and d.assignee_tg not in (None, user.tg_id):
            raise ApiError(403, "Boshqa xodimning chatini faqat admin bo'shatadi.")
        if to == user.tg_id and d.assignee_tg not in (None, user.tg_id):
            raise ApiError(409, "Chat boshqa xodimga biriktirilgan — admin qayta biriktiradi.")
    if to is not None and to not in _eligible(a):
        raise ApiError(400, "Bu xodim akkauntda operator emas.")
    d.assignee_tg, d.assigned_at, d.assigned_by = to, (timezone.now() if to else None), (user.tg_id if to else None)
    d.save(update_fields=["assignee_tg", "assigned_at", "assigned_by"])
    who = staff_names([to]).get(to, str(to)) if to else "bo'shatildi"
    AccountEvent.objects.create(
        account=a, kind="assign", detail=f"{d.peer.title or peer} → {who}"[:500], actor_tg=user.tg_id
    )
    bus.publish({"type": "dialog", "account": a.pk, "peer": peer})
    return ok(inbox.dialog_json(d))


@api(("POST",), check=can_use, deny=DENY)
def lock(request: HttpRequest, user: User, pk: int, peer: int) -> HttpResponse:
    """POST …/chats/<peer>/lock {release?} — "men javob yozyapman" (25 s, yozish davomida yangilanadi)."""
    a = _writer(user, pk)
    _dialog(a, peer)
    if json_body(request).get("release"):
        locks.release(a.pk, peer, user.tg_id)
        bus.publish({"type": "lock", "account": a.pk, "peer": peer, "user": 0})
        return ok({"holder": None})
    holder, new = locks.take(a.pk, peer, user.tg_id)
    if new:
        bus.publish({"type": "lock", "account": a.pk, "peer": peer, "user": user.tg_id})
    name = staff_names([holder]).get(holder, "") if holder != user.tg_id else user.name
    return ok({"holder": holder, "name": name, "mine": holder == user.tg_id})


@api(check=can_use, deny=DENY)
def lock_state(request: HttpRequest, user: User, pk: int, peer: int) -> HttpResponse:
    a = _get(user, pk)
    holder = locks.holder(a.pk, peer)
    return ok(
        {
            "holder": holder,
            "name": staff_names([holder]).get(holder, "") if holder else "",
            "mine": holder == user.tg_id,
        }
    )


@api(check=can_use, deny=DENY)
def staff_list(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    """Biriktirish uchun xodimlar: [{tg_id, name}]."""
    a = _get(user, pk)
    return ok(
        {
            "staff": [{"tg_id": tg, "name": n} for tg, n in sorted(_eligible(a).items(), key=lambda x: x[1])],
            "me": user.tg_id,
        }
    )


@api(("GET", "PUT"), check=can_use, deny=DENY)
def members(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    """GET — a'zolar; PUT {tg_id, role: admin|operator|viewer|null} — qo'shish/o'zgartirish/olib tashlash (admin)."""
    a = _get(user, pk)
    if request.method == "PUT":
        if not can_manage(user, a):
            raise ApiError(403, "A'zolarni akkaunt admini boshqaradi.")
        body = json_body(request)
        tg = _num(body.get("tg_id"))
        role = body.get("role")
        target = user_by_tg(tg)
        if target is None or not can_use(target):
            raise ApiError(400, "Xodim topilmadi yoki TelegramCRM moduliga kirishi yo'q.")
        if role is None:
            AccountMember.objects.filter(account=a, staff_tg=tg).delete()
            Dialog.objects.filter(account=a, assignee_tg=tg).update(
                assignee_tg=None, assigned_at=None
            )  # chatlari bo'shaydi
        elif role in Role.values:
            AccountMember.objects.update_or_create(
                account=a, staff_tg=tg, defaults={"role": role, "added_by": user.tg_id}
            )
        else:
            raise ApiError(400, "Rol: admin, operator yoki viewer.")
        AccountEvent.objects.create(
            account=a,
            kind="member",
            detail=f"{target.name or tg}: {Role(role).label if role else 'olib tashlandi'}",
            actor_tg=user.tg_id,
        )
    rows = list(AccountMember.objects.filter(account=a).order_by("role", "staff_tg"))
    names = staff_names({m.staff_tg for m in rows})
    owner = a.owner_tg if a.kind == Kind.PERSONAL else None  # egasi — doim admin, ro'yxatga qo'shilmaydi
    candidates = (
        []
        if not can_manage(user, a)
        else [{"tg_id": u.tg_id, "name": u.name} for u in active_users() if can_use(u) and u.tg_id != owner]
    )
    return ok(
        {
            "members": [{"tg_id": m.staff_tg, "name": names.get(m.staff_tg, ""), "role": m.role} for m in rows],
            "open": a.kind == Kind.COMPANY and not rows,  # ro'yxat bo'sh — hamma operator
            "candidates": sorted(candidates, key=lambda x: x["name"]),
            "can_manage": can_manage(user, a),
        }
    )


# ---------------------------------------------------------------------- 7-bosqich: CRM qatlami
def _contact(user: User, pk: int, peer: int, write: bool = False) -> tuple[Account, Contact]:
    a = _writer(user, pk) if write else _get(user, pk)
    d = _dialog(a, peer)
    if d.peer.kind != PeerKind.USER or d.peer.is_self:
        raise ApiError(400, "Mijoz kartasi — faqat shaxsiy chatlar uchun.")
    return a, crm.contact_for(d.peer)


@api(("GET", "PATCH"), check=can_use, deny=DENY)
def contact(request: HttpRequest, user: User, pk: int, peer: int) -> HttpResponse:
    a, c = _contact(user, pk, peer, write=request.method == "PATCH")
    if request.method == "PATCH":
        body = json_body(request)
        if body.get("owner_tg") and _num(body["owner_tg"]) not in _eligible(a):
            raise ApiError(400, "Mas'ul — akkaunt operatori bo'lsin.")
        errs = crm.update_contact(c, body, user.tg_id)
        if errs:
            raise ApiError(400, " ".join(errs))
        c.refresh_from_db()
        bus.publish({"type": "dialog", "account": a.pk, "peer": peer})
    return ok(
        crm.contact_json(c)
        | {"can_write": can_write(user, a), "stages": [{"id": s, "label": Stage(s).label} for s in Stage.values]}
    )


@api(("POST",), check=can_use, deny=DENY)
def contact_note(request: HttpRequest, user: User, pk: int, peer: int) -> HttpResponse:
    _, c = _contact(user, pk, peer, write=True)
    text = str(json_body(request).get("text") or "").strip()[:4000]
    if not text:
        raise ApiError(400, "Izoh bo'sh.")
    Note.objects.create(contact=c, author_tg=user.tg_id, text=text)
    return ok(crm.contact_json(c), status=201)


@api(("DELETE",), check=can_use, deny=DENY)
def contact_note_delete(request: HttpRequest, user: User, pk: int, peer: int, note: int) -> HttpResponse:
    a, c = _contact(user, pk, peer, write=True)
    n = Note.objects.filter(contact=c, pk=note).first()
    if n is None:
        raise ApiError(404, "Izoh topilmadi.")
    if n.author_tg != user.tg_id and role_of(user, a) != Role.ADMIN:
        raise ApiError(403, "Izohni muallif yoki admin o'chiradi.")
    n.delete()
    return ok(crm.contact_json(c))


@api(("POST",), check=can_use, deny=DENY)
def contact_task(request: HttpRequest, user: User, pk: int, peer: int) -> HttpResponse:
    a, c = _contact(user, pk, peer, write=True)
    body = json_body(request)
    title = str(body.get("title") or "").strip()[:200]
    due = parse_datetime(str(body.get("due_at") or ""))
    if not title or due is None:
        raise ApiError(400, "Vazifa matni va muddatini kiriting.")
    if timezone.is_naive(due):
        due = timezone.make_aware(due)
    who = _num(body.get("assignee_tg") or user.tg_id)
    if who not in _eligible(a):
        raise ApiError(400, "Bajaruvchi — akkaunt operatori bo'lsin.")
    Task.objects.create(contact=c, title=title, due_at=due, assignee_tg=who, created_by=user.tg_id)
    return ok(crm.contact_json(c), status=201)


@api(("POST",), check=can_use, deny=DENY)
def contact_task_done(request: HttpRequest, user: User, pk: int, peer: int, task: int) -> HttpResponse:
    _, c = _contact(user, pk, peer, write=True)
    t = Task.objects.filter(contact=c, pk=task).first()
    if t is None:
        raise ApiError(404, "Vazifa topilmadi.")
    t.done_at = None if json_body(request).get("undo") else timezone.now()
    t.save(update_fields=["done_at"])
    return ok(crm.contact_json(c))


@api(check=can_use, deny=DENY)
def tags(request: HttpRequest, user: User) -> HttpResponse:
    return ok({"tags": [{"id": t.pk, "name": t.name, "color": t.color} for t in Tag.objects.all()[:200]]})


@api(("GET", "POST"), check=can_use, deny=DENY)
def quick_replies(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    """Tez javoblar: shu akkaunt + umumiy (account=None). Qo'shish — operator; umumiy — faqat admin."""
    a = _get(user, pk)
    if request.method == "POST":
        if not can_write(user, a):
            raise ApiError(403, "Shablon qo'shish — operator yoki admin.")
        body = json_body(request)
        title, text = str(body.get("title") or "").strip()[:60], str(body.get("text") or "").strip()[:4096]
        if not title or not text:
            raise ApiError(400, "Nomi va matnini kiriting.")
        shared = bool(body.get("shared")) and role_of(user, a) == Role.ADMIN
        QuickReply.objects.create(account=None if shared else a, title=title, text=text, created_by=user.tg_id)
    rows = QuickReply.objects.filter(Q(account=a) | Q(account=None))
    admin = role_of(user, a) == Role.ADMIN
    return ok(
        {
            "replies": [
                {
                    "id": r.pk,
                    "title": r.title,
                    "text": r.text,
                    "shared": r.account_id is None,
                    "can_delete": admin or r.created_by == user.tg_id,
                }
                for r in rows
            ]
        }
    )


@api(("DELETE",), check=can_use, deny=DENY)
def quick_reply_delete(request: HttpRequest, user: User, pk: int, reply: int) -> HttpResponse:
    a = _get(user, pk)
    r = QuickReply.objects.filter(Q(account=a) | Q(account=None), pk=reply).first()
    if r is None:
        raise ApiError(404, "Shablon topilmadi.")
    if r.created_by != user.tg_id and role_of(user, a) != Role.ADMIN:
        raise ApiError(403, "Shablonni muallif yoki admin o'chiradi.")
    r.delete()
    return ok()


@api(("GET", "PATCH"), check=can_use, deny=DENY)
def crm_report(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    """GET ?days=7|30 — hisobot; PATCH {sla_minutes} — javob muddati (admin)."""
    a = _get(user, pk)
    if request.method == "PATCH":
        if role_of(user, a) != Role.ADMIN:
            raise ApiError(403, "SLA ni admin o'zgartiradi.")
        m = _num(json_body(request).get("sla_minutes"))
        if not 1 <= m <= 1440:
            raise ApiError(400, "Javob muddati 1 daqiqadan 24 soatgacha.")
        a.sla_minutes = m
        a.save(update_fields=["sla_minutes", "updated_at"])
    days = min(max(_num(request.GET.get("days") or 7), 1), 90)
    return ok(crm.report(a, days) | {"can_edit_sla": role_of(user, a) == Role.ADMIN})


# ---------------------------------------------------------------------- 8-bosqich: tizim holati
@api(check=can_use, deny=DENY)
def health_view(request: HttpRequest, user: User) -> HttpResponse:
    """Tizim holati (sotuv rahbari / admin): tekshiruvlar va akkauntlar sog'lig'i."""
    if not is_head(user):
        raise ApiError(403, "Tizim holati — sotuv rahbari va adminlar uchun.")
    from . import health

    return ok({"checks": health.checks(), "accounts": health.accounts(visible(user, Account.objects.all()))})


# ---------------------------------------------------------------------- AI yordamchi
AI_FIELDS = ("ai_enabled", "ai_instructions", "ai_delay_sec", "ai_quiet_min", "ai_max_per_hour")


@api(("GET", "PATCH"), check=can_use, deny=DENY)
def ai_settings(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    """Akkaunt AI yordamchisi: yoqish, ko'rsatmalar, kechikish, jimlik, soatlik limit. O'zgartirish — admin (egasi)."""
    a = _get(user, pk)
    if request.method == "PATCH":
        if role_of(user, a) != Role.ADMIN:
            raise ApiError(403, "AI yordamchini akkaunt admini sozlaydi.")
        body = json_body(request)
        if "ai_enabled" in body:
            from . import bizbot

            if body["ai_enabled"] and not (ch := bizbot.status(a.tg_user_id))["ok"]:
                raise ApiError(400, f"AI javoblari faqat Telegram Business bot orqali yuboriladi. {ch['detail']}")
            a.ai_enabled = bool(body["ai_enabled"])
        if "ai_instructions" in body:
            a.ai_instructions = str(body["ai_instructions"] or "")[:4000]
        for f, lo, hi in (("ai_delay_sec", 3, 600), ("ai_quiet_min", 0, 1440), ("ai_max_per_hour", 1, 30)):
            if f in body:
                v = _num(body[f])
                if not lo <= v <= hi:
                    raise ApiError(400, f"{f}: {lo}–{hi} oralig'ida.")
                setattr(a, f, v)
        a.save()
        AccountEvent.objects.create(
            account=a, kind="ai", detail="yoqildi" if a.ai_enabled else "o'chirildi", actor_tg=user.tg_id
        )
    from . import bizbot, stock

    since = timezone.now() - timedelta(days=1)
    ev = AccountEvent.objects.filter(account=a, kind__startswith="ai_")
    day = dict(ev.filter(at__gte=since).values("kind").annotate(n=Count("id")).values_list("kind", "n"))
    return ok(
        {f: getattr(a, f) for f in AI_FIELDS}
        | {
            "can_edit": role_of(user, a) == Role.ADMIN,
            "replies_24h": day.get("ai_reply", 0),
            "orders_24h": day.get("ai_order", 0),
            "handoffs_24h": day.get("ai_handoff", 0),
            "errors_24h": day.get("ai_error", 0),
            "channel": bizbot.status(a.tg_user_id),
            "stock": stock.source(),
            "log": [{"kind": e.kind, "detail": e.detail, "at": e.at.isoformat()} for e in ev[:15]],
        }
    )


@api(("POST",), check=can_use, deny=DENY)
def chat_ai_off(request: HttpRequest, user: User, pk: int, peer: int) -> HttpResponse:
    """Shu chatda AI javob bermasin (do'st, oila …) yoki qayta yoqilsin: {off}."""
    a = _writer(user, pk)
    d = _dialog(a, peer)
    d.ai_off = bool(json_body(request).get("off"))
    d.save(update_fields=["ai_off"])
    return ok({"ai_off": d.ai_off})


@api(("POST",), check=can_use, deny=DENY)
def chat_ai_ask(request: HttpRequest, user: User, pk: int, peer: int) -> HttpResponse:
    """Xodim uchun AI: {mode: summary|draft|auto} yoki {question}. auto — avtomatik javob nima bo'lardi (yubormasdan)."""
    a = _get(user, pk)
    d = _dialog(a, peer)
    body = json_body(request)
    from . import assistant

    if body.get("mode") == "auto":
        return ok({"answer": assistant.preview(a, d)})
    return ok({"answer": assistant.ask(d, str(body.get("mode") or ""), str(body.get("question") or ""))})

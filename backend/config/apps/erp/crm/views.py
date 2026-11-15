"""CRM API (docs/api/crm.md): meta, kanban, bitimlar, mijozlar, faoliyat, lidlar, reja (mantiq — deals.py) va
sotuvchilar Telegram'i (tg.py). Huquqlar — access.py.

Telegram huquqi (egasi qarori 2026-11-14): yozishmalar shaxsiy — HAR KIM faqat o'z ulanishidagi chatlarni ko'radi va javob
yozadi, rahbar ham boshqalarnikini ko'rmaydi. Boshqaning chati — 404 (mavjudligi ham ko'rinmaydi).
"""

from __future__ import annotations

import hmac
import json
import logging
from typing import Any
from urllib.parse import quote

from django.conf import settings
from django.db.models import Q, QuerySet
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from config.apps.core.http import ApiError, api, json_body, ok
from config.apps.staff.services import User

from . import customers as CU
from . import deals as D
from . import reports as RP
from . import tg
from .access import Me, is_sales_head
from .models import Customer, TgChat, TgConnection, TgMessage

log = logging.getLogger(__name__)
PAGE = 50
# CRM (va sotuvchilar Telegram'i) — Sotuv (B2B) bo'limi, rahbariyat, ega/admin (staff.MODULE_DEPTS)
CRM_DENY = "CRM faqat Sotuv (B2B) bo'limi va rahbariyat uchun. Kirish kerak bo'lsa — administratorga murojaat qiling."


def _crm(u: User) -> bool:
    return u.can_module("crm")


def _chats(u: User) -> QuerySet[TgChat]:
    return TgChat.objects.people().select_related("connection", "customer").filter(connection__user_tg=u.tg_id)


def _link(u: User, chat_pk: Any, customer: Customer | None) -> None:
    """Chatni mijozga biriktirish (faqat o'z chati; mijoz — sotuvchi ko'ra oladigan)."""
    chat = _chat(u, int(chat_pk))
    chat.customer = customer
    chat.save(update_fields=["customer"])


def _chat(u: User, pk: int) -> TgChat:
    chat = _chats(u).filter(pk=pk).first()
    if chat is None:
        raise ApiError(404, "Chat topilmadi")
    return chat


def _reply_to(chat: TgChat, pk: Any) -> int | None:
    """Javob beriladigan xabar (CRM id) → Telegram message_id; shu chatdan bo'lmasa — 400."""
    if pk in (None, "", 0, "0"):
        return None
    m = TgMessage.objects.filter(chat=chat, pk=D.int_or_none(pk) or 0).first()
    if m is None:
        raise ApiError(400, "Javob beriladigan xabar topilmadi.")
    return m.message_id


def _chat_json(c: TgChat, u: User) -> dict[str, Any]:
    return {
        "id": c.pk,
        "title": c.title or (f"@{c.username}" if c.username else str(c.chat_id)),
        "username": c.username or None,
        "seller_tg": c.connection.user_tg,
        "seller": c.connection.user_name,
        "last_at": c.last_at.isoformat() if c.last_at else None,
        "last_text": c.last_text,
        "last_out": c.last_out,
        "unread": c.unread,
        "can_send": c.connection.user_tg == u.tg_id and c.connection.can_reply and c.connection.is_enabled,
        "customer": {"id": c.customer_id, "name": c.customer.name} if c.customer else None,
    }


def _msg_json(m: TgMessage, refs: dict[int, int] | None = None) -> dict[str, Any]:
    """refs — shu chatdagi Telegram message_id → bizning id (javob iqtibosini bosib asl xabarga o'tish uchun)."""
    rp = m.reply
    if rp and refs is None:
        refs = dict(
            TgMessage.objects.filter(chat_id=m.chat_id, message_id=rp.get("message_id")).values_list("message_id", "pk")
        )
    return {
        "id": m.pk,
        "out": m.out,
        "kind": m.kind,
        "text": m.text,
        "date": m.date.isoformat(),
        "edited": m.edited_at is not None,
        "deleted": m.deleted,
        "via_crm": m.via_crm,
        "deleted_at": m.deleted_at.isoformat() if m.deleted_at else None,
        # tahrirlar: oldingi matnlar (eskisidan yangisiga)
        "history": list(m.history or []),
        # javob: kimning qaysi xabariga (out — sotuvchiniki), ref — CRM'dagi id (bo'lmasa — null)
        "reply": None
        if not rp
        else {
            "text": rp.get("text") or "",
            "kind": rp.get("kind") or "text",
            "out": rp.get("from_id") == m.chat.connection.user_tg,
            "ref": (refs or {}).get(rp.get("message_id")),
        },
        # fayl: file_id brauzerga berilmaydi — yuklash shu backend orqali (huquq tekshiruvi bilan)
        "media": None
        if not m.media
        else {k: v for k, v in m.media.items() if k != "file_id"}
        | ({"url": f"/app/api/erp/crm/tg/messages/{m.pk}/file"} if m.media.get("file_id") else {}),
    }


@csrf_exempt
def webhook(request: HttpRequest) -> HttpResponse:
    """POST /app/api/erp/crm/tg/webhook — Telegram (sir sarlavha bilan)."""
    if request.method != "POST":
        return JsonResponse({"detail": "Faqat POST."}, status=405)
    got = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if not tg.enabled() or not hmac.compare_digest(got, settings.CRM_TG_WEBHOOK_SECRET):
        return JsonResponse({"detail": "Ruxsat yo'q"}, status=403)
    try:
        update = json.loads(request.body)
    except ValueError:
        return JsonResponse({"detail": "Noto'g'ri JSON"}, status=400)
    try:
        tg.handle_update(update if isinstance(update, dict) else {})
    except Exception:  # Telegram qayta yubormasin — xato logda
        log.exception("crm tg update %s ishlanmadi", update.get("update_id") if isinstance(update, dict) else "?")
    return JsonResponse({"ok": True})


@api(check=_crm, deny=CRM_DENY)
def chats(request: HttpRequest, u: User) -> HttpResponse:
    """GET tg/chats?q= — chatlar (oxirgi xabar bo'yicha) va o'z ulanish holati."""
    q = (request.GET.get("q") or "").strip()
    qs = _chats(u)
    if q:
        qs = qs.filter(
            Q(title__icontains=q) | Q(username__icontains=q.lstrip("@")) | Q(connection__user_name__icontains=q)
        )
    conn = TgConnection.objects.filter(user_tg=u.tg_id).order_by("-is_enabled", "-updated_at").first()
    return ok(
        {
            "bot": tg.bot_username(),
            "head": is_sales_head(u),
            "connection": None if conn is None else {"enabled": conn.is_enabled, "can_reply": conn.can_reply},
            "chats": [_chat_json(c, u) for c in qs.order_by("-last_at")[:200]],
        }
    )


@api(check=_crm, deny=CRM_DENY)
def messages(request: HttpRequest, u: User, pk: int) -> HttpResponse:
    """GET tg/chats/{id}/messages?before= — oxirgi 50 xabar (eskidan yangiga); egasi ochsa — o'qilgan."""
    chat = _chat(u, pk)
    qs = TgMessage.objects.filter(chat=chat).select_related("chat__connection")
    if before := request.GET.get("before"):
        qs = qs.filter(pk__lt=int(before) if before.isdigit() else 0)
    rows = list(qs.order_by("-date", "-message_id")[:PAGE])[::-1]
    if chat.unread and chat.connection.user_tg == u.tg_id:
        chat.unread = 0
        chat.save(update_fields=["unread"])
    ids = {m.reply["message_id"] for m in rows if m.reply and m.reply.get("message_id")}
    refs = dict(TgMessage.objects.filter(chat=chat, message_id__in=ids).values_list("message_id", "pk"))
    return ok({"chat": _chat_json(chat, u), "messages": [_msg_json(m, refs) for m in rows], "more": len(rows) == PAGE})


@api(("POST",), check=_crm, deny=CRM_DENY)
def send(request: HttpRequest, u: User, pk: int) -> HttpResponse:
    """POST tg/chats/{id}/send {text} — sotuvchi nomidan javob (faqat chat egasi)."""
    chat = _chat(u, pk)
    if chat.connection.user_tg != u.tg_id:
        raise ApiError(403, "Javobni faqat chat egasi — sotuvchining o'zi yozadi.")
    b = json_body(request)
    if "latitude" in b or "longitude" in b:  # joylashuv
        try:
            lat, lon = float(str(b.get("latitude"))), float(str(b.get("longitude")))
        except (TypeError, ValueError) as e:
            raise ApiError(400, "Koordinata noto'g'ri.") from e
        return ok(_msg_json(tg.send_location(chat, lat, lon, _reply_to(chat, b.get("reply_to")))))
    text = str(b.get("text") or "").strip()
    if not text:
        raise ApiError(400, "Xabar bo'sh.")
    if len(text) > 4096:
        raise ApiError(400, "Xabar juda uzun (4096 belgigacha).")
    return ok(_msg_json(tg.send(chat, text, _reply_to(chat, b.get("reply_to")))))


# ------------------------------------------------------------------ CRM
def _q(request: HttpRequest) -> dict[str, str]:
    return {k: v for k, v in request.GET.items()}


@api(check=_crm, deny=CRM_DENY)
def meta(request: HttpRequest, u: User) -> HttpResponse:
    return ok(D.meta())


@api(check=_crm, deny=CRM_DENY)
def board(request: HttpRequest, u: User) -> HttpResponse:
    return ok(D.board(Me.of(u), _q(request), timezone.now()))


@api(("GET", "POST"), check=_crm, deny=CRM_DENY)
def deals(request: HttpRequest, u: User) -> HttpResponse:
    me, now = Me.of(u), timezone.now()
    if request.method == "GET":
        return ok(D.deal_list(me, _q(request), now))
    b = json_body(request)
    if not b.get("counterparty_id"):
        raise ApiError(400, "Mijozni tanlang")
    cust = D.get_customer(me, b["counterparty_id"])
    # Telegram chatidan ochildi — chat shu mijozga biriktiriladi (avval tekshiriladi: begona chat — 404, bitim yaratilmaydi)
    chat = _chat(u, D.int_or_none(b["tg_chat_id"]) or 0) if b.get("tg_chat_id") else None
    d = D.new_deal(me, b, now, customer=cust)
    if chat is not None:
        chat.customer = cust
        chat.save(update_fields=["customer"])
    return ok(D.detail(me, d.pk, now))


@api(("GET", "POST"), check=_crm, deny=CRM_DENY)
def deal(request: HttpRequest, u: User, pk: int) -> HttpResponse:
    me, now = Me.of(u), timezone.now()
    if request.method == "POST":
        D.patch_deal(me, D.get_deal(me, pk), json_body(request), now)
    return ok(D.detail(me, pk, now))


@api(("POST",), check=_crm, deny=CRM_DENY)
def deal_stage(request: HttpRequest, u: User, pk: int) -> HttpResponse:
    me, now = Me.of(u), timezone.now()
    b = json_body(request)
    if D.s(b.get("stage")) == "later":  # «Keyinroq» — qayta bog'lanish sanasi majburiy
        from . import sales

        sales.later(me, D.get_deal(me, pk), b.get("recall"), now)
    else:
        D.move_stage(me, D.get_deal(me, pk), D.s(b.get("stage")), D.s(b.get("reason")).strip(), now)
    return ok(D.detail(me, pk, now))


@api(("POST",), check=_crm, deny=CRM_DENY)
def deal_items(request: HttpRequest, u: User, pk: int) -> HttpResponse:
    me = Me.of(u)
    return ok(D.save_items(D.get_deal(me, pk), json_body(request), timezone.now()))


@api(("POST",), check=_crm, deny=CRM_DENY)
def deal_doc(request: HttpRequest, u: User, pk: int) -> HttpResponse:
    me = Me.of(u)
    return ok(D.make_doc(me, D.get_deal(me, pk), D.s(json_body(request).get("kind")), timezone.now()))


@api(check=_crm, deny=CRM_DENY)
def doc_pdf(request: HttpRequest, u: User, pk: int) -> HttpResponse:
    raise ApiError(501, "PDF hali tayyor emas — hujjat shabloni 1C/savdo moduli ko'chirilganda qo'shiladi.")


@api(check=_crm, deny=CRM_DENY)
def items(request: HttpRequest, u: User) -> HttpResponse:
    """Katalog qidiruvi — katalog moduli hali ko'chirilmagan: bo'sh (tovar nomini qo'lda yozish mumkin)."""
    return ok([])


@api(("GET", "POST"), check=_crm, deny=CRM_DENY)
def customers(request: HttpRequest, u: User) -> HttpResponse:
    me = Me.of(u)
    if request.method == "GET":
        return ok(D.find_customers(me, request.GET.get("q") or ""))
    return ok(D.new_customer(me, json_body(request)))


@api(("POST",), check=_crm, deny=CRM_DENY)
def activity(request: HttpRequest, u: User) -> HttpResponse:
    me = Me.of(u)
    b = json_body(request)
    return ok(D.add_activity(me, D.get_deal(me, D.int_or_none(b.get("deal_id")) or 0), b, timezone.now()))


@api(("POST",), check=_crm, deny=CRM_DENY)
def task_done(request: HttpRequest, u: User, pk: int) -> HttpResponse:
    return ok(D.task_done(Me.of(u), pk, json_body(request), timezone.now()))


@api(("GET", "POST"), check=_crm, deny=CRM_DENY)
def leads(request: HttpRequest, u: User) -> HttpResponse:
    me = Me.of(u)
    if request.method == "GET":
        return ok(D.leads(me, _q(request)))
    return ok(D.new_lead(me, json_body(request), timezone.now()))


@api(("POST",), check=_crm, deny=CRM_DENY)
def lead_act(request: HttpRequest, u: User, pk: int, act: str) -> HttpResponse:
    me, now = Me.of(u), timezone.now()
    lead = D.get_lead(me, pk)
    b = json_body(request)
    if act == "assign":
        return ok(D.assign_lead(me, lead, b))
    if act == "junk":
        return ok(D.junk_lead(lead, b))
    if act == "status":
        return ok(D.move_lead(lead, b, now))
    if act == "edit":
        return ok(D.edit_lead(lead, b))
    if act == "noanswer":
        from . import sales

        sales.no_answer(lead, now)
        return ok(D.lead_json(lead))
    if act == "convert":
        return ok(D.detail(me, D.convert_lead(me, lead, now).pk, now))
    raise ApiError(404, "Noma'lum amal")


@api(("GET", "POST"), check=_crm, deny=CRM_DENY)
def goals(request: HttpRequest, u: User) -> HttpResponse:
    me = Me.of(u)
    if request.method == "GET":
        return ok(D.goals(me, request.GET.get("month") or "", timezone.now()))
    D.set_goal(me, json_body(request))
    return ok()


@api(check=_crm, deny=CRM_DENY)
def message_file(request: HttpRequest, u: User, pk: int) -> HttpResponse:
    """GET tg/messages/{id}/file — rasm, video, ovoz, hujjat (faqat chat egasi)."""
    msg = TgMessage.objects.filter(pk=pk, chat__in=_chats(u)).first()
    if msg is None:
        raise ApiError(404, "Xabar topilmadi")
    data, mime = tg.download(msg)
    resp = HttpResponse(data, content_type=mime)
    resp["Cache-Control"] = "private, max-age=86400"
    resp["X-Content-Type-Options"] = "nosniff"
    # hujjat va noma'lum tur — faqat yuklab olish (HTML/SVG brauzerda ochilib qolmasin)
    if msg.kind == "document" or not mime.startswith(("image/", "video/", "audio/")) or mime == "image/svg+xml":
        name = (msg.media or {}).get("name") or "fayl"
        resp["Content-Type"] = "application/octet-stream"
        resp["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(name)}"
    return resp


@api(("POST",), check=_crm, deny=CRM_DENY)
def send_file(request: HttpRequest, u: User, pk: int) -> HttpResponse:
    """POST tg/chats/{id}/send-file (multipart: file, caption?, as_file?) — rasm, video, audio yoki hujjat."""
    chat = _chat(u, pk)
    if chat.connection.user_tg != u.tg_id:
        raise ApiError(403, "Javobni faqat chat egasi — sotuvchining o'zi yozadi.")
    f = request.FILES.get("file")
    if f is None:
        raise ApiError(400, "Faylni tanlang.")
    if f.size and f.size > tg.UPLOAD_MAX:
        raise ApiError(413, "Fayl 50 MB dan katta — Telegram bot orqali yuborib bo'lmaydi.")
    msg = tg.send_file(
        chat,
        f.name or "fayl",
        f.content_type or "application/octet-stream",
        f.read(),
        str(request.POST.get("caption") or "").strip(),
        request.POST.get("as_file") in ("1", "true"),
        _reply_to(chat, request.POST.get("reply_to")),
    )
    return ok(_msg_json(msg))


@api(("POST",), check=_crm, deny=CRM_DENY)
def link_chat(request: HttpRequest, u: User, pk: int) -> HttpResponse:
    """POST tg/chats/{id}/link {customer_id | null} — chatni CRM mijoziga biriktirish yoki ajratish."""
    cid = json_body(request).get("customer_id")
    _link(u, pk, D.get_customer(Me.of(u), cid) if cid else None)
    return ok(_chat_json(_chat(u, pk), u))


@api(check=_crm, deny=CRM_DENY)
def customers_table(request: HttpRequest, u: User) -> HttpResponse:
    """GET customers/table?q=&owner=&sort=next|last|sum|name&offset= — mijozlar jadvali."""
    return ok(CU.table(Me.of(u), _q(request), timezone.now()))


@api(("GET", "POST"), check=_crm, deny=CRM_DENY)
def customer(request: HttpRequest, u: User, pk: int) -> HttpResponse:
    """GET/POST customers/{id} — kartochka; POST: name, inn, phones, contacts, note, owner_tg (rahbar)."""
    me = Me.of(u)
    if request.method == "POST":
        CU.update(me, pk, json_body(request))
    return ok(CU.card(me, pk, timezone.now()))


@api(check=_crm, deny=CRM_DENY)
def report(request: HttpRequest, u: User) -> HttpResponse:
    """GET reports?from=YYYY-MM-DD&to=YYYY-MM-DD — hisobot (rahbar — hamma, sotuvchi — o'zi)."""
    return ok(RP.report(Me.of(u), _q(request), timezone.now()))


@api(("POST",), check=_crm, deny=CRM_DENY)
def deal_payment(request: HttpRequest, u: User, pk: int) -> HttpResponse:
    """POST deals/{id}/payment {amount, via} — to'lov (bank/1C integratsiyasigacha qo'lda); oldindan to'lov yetsa —
    bitim avtomatik «Ishlab chiqarishda»."""
    from . import sales

    me, now = Me.of(u), timezone.now()
    b = json_body(request)
    sales.add_payment(me, D.get_deal(me, pk), D.num(b.get("amount")), D.s(b.get("via")).strip()[:40] or "bank", now)
    return ok(D.detail(me, pk, now))


@csrf_exempt
def intake(request: HttpRequest) -> HttpResponse:
    """POST erp/crm/intake — sayt / marketplace formalaridan lid (sarlavha X-Intake-Token = CRM_INTAKE_TOKEN).
    {name, phone, company, inn, product, size, qty, note, source} → dublikat / doimiy mijoz bitimi / navbat bo'yicha lid."""
    from . import sales

    if request.method != "POST":
        return JsonResponse({"detail": "Faqat POST."}, status=405)
    token = settings.CRM_INTAKE_TOKEN
    if not token or not hmac.compare_digest(request.headers.get("X-Intake-Token", ""), token):
        return JsonResponse({"detail": "Ruxsat yo'q"}, status=403)
    try:
        b = json_body(request)
        if not (D.digits(b.get("phone")) or D.s(b.get("name")).strip()):
            raise ApiError(400, "Ism yoki telefon kerak.")
        return ok(D.new_lead(sales.ROBOT, {**b, "source": D.s(b.get("source")) or "site"}, timezone.now()))
    except ApiError as e:
        return JsonResponse({"detail": e.detail}, status=e.status)


@api(("GET", "POST"), check=_crm, deny=CRM_DENY)
def routing(request: HttpRequest, u: User) -> HttpResponse:
    """GET/POST routing — lid taqsimlash qoidalari [{kind: product|region, keywords, seller_tg}]; POST — butun ro'yxat (rahbar)."""
    from .models import RoutingRule

    if request.method == "POST":
        if not Me.of(u).is_head:
            raise ApiError(403, "Taqsimlash qoidalarini sotuv bo'limi rahbari belgilaydi")
        rows = json_body(request).get("rules")
        if not isinstance(rows, list):
            raise ApiError(400, "Qoidalar ro'yxat ko'rinishida bo'lsin.")
        clean = []
        for i, r in enumerate(rows[:100]):
            kind, kw, tg_id = (
                D.s((r or {}).get("kind")),
                D.s((r or {}).get("keywords")).strip(),
                D.int_or_none((r or {}).get("seller_tg")),
            )
            if kind not in RoutingRule.Kind.values or not kw or not tg_id:
                raise ApiError(400, f"{i + 1}-qoida to'liq emas: turi, kalit so'zlar va sotuvchi kerak.")
            clean.append(RoutingRule(kind=kind, keywords=kw[:300], seller_tg=tg_id, order=i))
        RoutingRule.objects.all().delete()
        RoutingRule.objects.bulk_create(clean)
    return ok(
        {
            "rules": [
                {"kind": r.kind, "keywords": r.keywords, "seller_tg": r.seller_tg} for r in RoutingRule.objects.all()
            ]
        }
    )

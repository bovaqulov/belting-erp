"""Sales jarayoni qoidalari (egasi tavsifi, 2026-11-14):

1. Lid qabuli: manba alohida maydonda; dublikat (telefon / STIR) — ochiq lidga izoh qo'shiladi; doimiy mijoz — lid emas,
   o'z menejeriga to'g'ridan-to'g'ri bitim (ochiq bitimi bo'lsa — unga izoh); yangi mijoz — navbat bo'yicha sotuvchiga
   (rahbar qo'lda taqsimlamaydi, yirik B2B ni o'ziga oladi).
2. Kvalifikatsiya: tasma turi, o'lcham, hajm, kompaniya, STIR; «javob bermadi» — 1, 3, 7 kunda qayta qo'ng'iroq, keyin yopiladi;
   bitimga — tasma turi va kompaniya majburiy; rad — sabab majburiy.
3. Taklif: «Taklif yuborildi» ga kirganda — 2 va 5 kunlik eslatma vazifalari.
4. To'lov: 100% yoki 50/50; oldindan to'lov tushishi bilan — «Ishlab chiqarishda»; qolgan to'lovsiz — jo'natib bo'lmaydi.
5. «Tayyor» — mijozga Telegram'da avtomatik xabar; «Yutildi» — yuk xati va dalolatnoma imzolangach.
Har bosqich SLA'si (Stage.sla_hours) — robots.sla_reminders.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from django.db.models import Count

from config.apps.core.http import ApiError

from .access import Me, is_sales_head, sellers
from .models import Activity, Customer, Deal, Lead, PayTerms, RoutingRule, Stage, StageKind, TgChat

log = logging.getLogger(__name__)
ROBOT = Me(0, "Robot", True)
PREPAY_STAGES = ("new", "offer", "later", "contract", "payment")  # oldindan to'lovgacha
OFFER_FOLLOWUPS = (2, 5)  # kun
CALLBACK_DAYS = (1, 3, 7)  # javob bermadi → qayta qo'ng'iroq


# ------------------------------------------------------------------ lid qabuli
def rule_seller(info: dict[str, Any]) -> int | None:
    """Taqsimlash qoidalari (tartib bo'yicha birinchi mosi): mahsulot — tasma turi / izoh; hudud — hudud / kompaniya /
    izoh. Qoidadagi sotuvchi faol sotuvchilar ro'yxatida bo'lishi kerak."""
    active = {p["tg_id"] for p in sellers()}
    hay = {
        RoutingRule.Kind.PRODUCT: " ".join(str(info.get(k) or "") for k in ("product", "size", "note")).lower(),
        RoutingRule.Kind.REGION: " ".join(str(info.get(k) or "") for k in ("region", "company", "note")).lower(),
    }
    for r in RoutingRule.objects.all():
        words = [w.strip().lower() for w in r.keywords.split(",") if w.strip()]
        if r.seller_tg in active and any(w in hay.get(r.kind, "") for w in words):
            return r.seller_tg
    return None


def next_seller(now: datetime, info: dict[str, Any] | None = None) -> int | None:
    """Taqsimlash: avval qoidalar (mahsulot / hudud), keyin navbat — oxirgi 7 kunda eng kam lid olgan sotuvchi
    (rahbarlar navbatda emas, agar boshqa sotuvchi bo'lsa)."""
    from config.apps.staff.services import users_by_tg

    if info and (by_rule := rule_seller(info)):
        return by_rule
    pool = sellers()
    if not pool:
        return None
    users = users_by_tg(p["tg_id"] for p in pool)
    plain = [p for p in pool if p["tg_id"] in users and not is_sales_head(users[p["tg_id"]])] or pool
    load = dict(
        Lead.objects.filter(owner_tg__in=[p["tg_id"] for p in plain], created__gte=now - timedelta(days=7))
        .values_list("owner_tg")
        .annotate(n=Count("id"))
    )
    return min(plain, key=lambda p: (load.get(p["tg_id"], 0), p["name"]))["tg_id"]


def find_customer(phone: str, inn: str) -> Customer | None:
    """Doimiy mijoz: STIR yoki telefon (oxirgi 9 raqam) bo'yicha."""
    if inn and (c := Customer.objects.filter(inn=inn).first()):
        return c
    if len(phone) >= 9:
        return Customer.objects.filter(phones__icontains=phone[-9:]).first()
    return None


def customer_deal(c: Customer, b: dict[str, Any], now: datetime, *, comment: bool = True) -> dict[str, Any]:
    """Doimiy mijoz murojaati: ochiq bitimi bo'lsa — unga izoh; bo'lmasa — o'z menejeriga yangi bitim (takroriy)."""
    from .deals import new_deal

    source = str(b.get("source") or "manual")[:32]
    note = str(b.get("note") or "").strip()
    open_deal = (
        Deal.objects.filter(customer=c, stage__pipeline_id="main", stage__kind=StageKind.OPEN)
        .order_by("-updated")
        .first()
    )
    if open_deal is not None:
        if comment and note:
            Activity.objects.create(deal=open_deal, kind="comment", ts=now, text=f"Yangi murojaat ({source}): {note}")
        return {"routed": "deal", "deal_id": open_deal.pk, "existing": True}
    owner = c.owner_tg or next_seller(now, b)
    d = new_deal(
        ROBOT,
        {
            "title": str(b.get("product") or "").strip() or f"Takroriy: {c.name}",
            "owner_tg": owner,
            "source": source,
            "need": note,
        },
        now,
        customer=c,
    )
    d.repeat = True
    d.save(update_fields=["repeat"])
    Activity.objects.create(
        deal=d, kind="comment", ts=now, text=f"Doimiy mijoz — avtomatik bitim ({source}). {note}".strip()
    )
    return {"routed": "deal", "deal_id": d.pk, "existing": False}


# ------------------------------------------------------------------ bosqich qoidalari
def threshold(d: Deal) -> Decimal:
    """Ishlab chiqarishga berish uchun kerakli oldindan to'lov."""
    return d.amount if d.pay_terms == PayTerms.FULL else (d.amount / 2).quantize(Decimal("0.01"))


def check_move(d: Deal, st: Stage) -> None:
    if st.code == "production" and d.amount and d.paid_sum < threshold(d):
        raise ApiError(
            400,
            f"Oldindan to'lov tushmagan: kerak {threshold(d):,.0f} so'm, tushgan {d.paid_sum:,.0f}.".replace(",", " "),
        )
    if st.code == "shipping" and d.amount and d.paid_sum < d.amount:
        raise ApiError(
            400,
            f"Qolgan to'lov tushmagan: {d.amount - d.paid_sum:,.0f} so'm. Jo'natishdan oldin to'liq to'lov olinadi.".replace(
                ",", " "
            ),
        )
    if st.code == "won" and not d.docs_done:
        raise ApiError(
            400, "Yuk xati va dalolatnoma imzolanmagan — bitim kartochkasida «Hujjatlar imzolandi» ni belgilang."
        )


# Sales ketma-ketligi (asosiy voronka) — avtomatik o'tish faqat oldinga
FLOW = ("new", "offer", "later", "contract", "payment", "production", "ready", "shipping", "won")


def advance(me: Me, d: Deal, code: str, now: datetime, why: str) -> bool:
    """Hodisa bo'yicha bitimni keyingi bosqichga avtomatik o'tkazish: faqat ochiq va maqsaddan oldingi bosqichdan
    (orqaga hech qachon; yopilgan bitim — tegilmaydi). Bosqich sharti bajarilmasa (masalan, to'lov) — o'tkazilmaydi.
    Tarixda — `src: auto` va sababi bilan izoh."""
    from .deals import move_stage

    cur = d.stage_id
    if d.stage.kind != StageKind.OPEN or cur not in FLOW or code not in FLOW or FLOW.index(cur) >= FLOW.index(code):
        return False
    try:
        move_stage(me, d, code, "", now, src="auto")
    except ApiError:
        return False
    Activity.objects.create(
        deal=d, kind="stage", ts=now, actor=None, text=f"Avtomatik: «{d.stage.name}» bosqichiga o'tdi — {why}"
    )
    return True


def on_enter(me: Me, d: Deal, now: datetime) -> None:
    """Bosqichga kirgandagi avtomatik amallar."""
    if d.stage_id == "offer":
        for n in OFFER_FOLLOWUPS:
            Activity.objects.create(
                deal=d,
                kind="task",
                ts=now,
                actor=None,
                text=f"Taklif bo'yicha mijozga qayta yozing ({n}-kun)",
                due=now + timedelta(days=n),
                assignee=d.owner_tg,
            )
    elif d.stage_id == "ready":
        notify_ready(d, now)
    from . import production

    production.on_enter(d, now)  # sex zakazlari, ombor yig'ish navbati, bekor qilish


def chat_name(chat: TgChat) -> str:
    return {"wa": "WhatsApp", "ig": "Instagram"}.get(chat.connection.channel, "Telegram")


def notify_ready(d: Deal, now: datetime) -> None:
    """«Tayyor» — mijozga mas'ul sotuvchining eng so'nggi chati orqali xabar (Telegram Business bot / WhatsApp / Instagram;
    WhatsApp va Instagram — mijoz oxirgi 24 soatda yozgan bo'lsa)."""
    from . import tg

    chat = (
        TgChat.objects.people()
        .select_related("connection")
        .filter(customer_id=d.customer_id, connection__user_tg=d.owner_tg, connection__is_enabled=True)
        .order_by("-last_at")
        .first()
        if d.customer_id
        else None
    )
    if chat is None:
        Activity.objects.create(
            deal=d,
            kind="comment",
            ts=now,
            text="Tayyor: mijozga bog'langan chat (Telegram / WhatsApp / Instagram) yo'q — o'zingiz xabar bering.",
        )
        return
    text = f"Assalomu alaykum! «{d.title}» buyurtmangiz tayyor. Jo'natish bo'yicha tez orada bog'lanamiz."
    try:
        tg.send(chat, text)
        Activity.objects.create(
            deal=d, kind="message", ts=now, text=f"Mijozga {chat_name(chat)}'da xabar yuborildi: {text}"
        )
    except ApiError as e:
        Activity.objects.create(
            deal=d,
            kind="comment",
            ts=now,
            text=f"Tayyor: {chat_name(chat)} xabari yuborilmadi ({e.detail}) — o'zingiz xabar bering.",
        )


def add_payment(me: Me, d: Deal, amount: Decimal, via: str, now: datetime) -> None:
    """To'lov (bank/1C integratsiyasigacha — qo'lda): yig'indi; oldindan to'lov yetsa — avtomatik «Ishlab chiqarishda»."""
    from .deals import move_stage

    if amount <= 0:
        raise ApiError(400, "To'lov summasi musbat bo'lsin.")
    d.paid_sum = (d.paid_sum or Decimal(0)) + amount
    d.save(update_fields=["paid_sum"])
    Activity.objects.create(
        deal=d,
        kind="payment",
        ts=now,
        actor=me.tg_id,
        text=f"To'lov: {amount:,.0f} so'm ({via})".replace(",", " "),
        data={"amount": str(amount), "via": via},
    )
    if d.stage_id in PREPAY_STAGES and d.paid_sum >= threshold(d):
        move_stage(me, d, "production", "", now)
        Activity.objects.create(
            deal=d, kind="stage", ts=now, text="Avtomatik: oldindan to'lov tushdi — buyurtma ishlab chiqarishga berildi"
        )


# ------------------------------------------------------------------ kvalifikatsiya
def later(me: Me, d: Deal, recall: Any, now: datetime, at: Any = None, note: Any = "") -> None:
    """«Keyinroq»: qayta bog'lanish sanasi majburiy — shu kun va soatga (standart 10:00) vazifa; izoh — vazifa matnida."""
    from django.utils import timezone
    from django.utils.dateparse import parse_date

    from .deals import move_stage

    s = str(recall or "").strip()
    day = parse_date(s[:10]) if "-" in s else None
    if day is None and len(parts := s.split(".")) == 3:  # 15.12.2026
        try:
            day = datetime(int(parts[2]), int(parts[1]), int(parts[0])).date()
        except ValueError:
            day = None
    if day is None:
        raise ApiError(400, "Qayta bog'lanish sanasini kiriting (masalan, 15.12.2026).")
    if day < timezone.localdate(now):
        raise ApiError(400, "Qayta bog'lanish sanasi o'tib ketgan — bugun yoki keyingi kunni tanlang.")
    hm = str(at or "").strip() or "10:00"
    try:
        h, mi = (int(x) for x in hm.split(":")[:2])
        due = timezone.make_aware(datetime(day.year, day.month, day.day, h, mi))
    except ValueError as e:
        raise ApiError(400, "Soat noto'g'ri — masalan, 14:30.") from e
    if due < now:
        raise ApiError(400, "Bu vaqt o'tib ketgan — keyingi soat yoki kunni tanlang.")
    text = str(note or "").strip()[:500]
    move_stage(me, d, "later", "", now)
    Activity.objects.create(
        deal=d,
        kind="task",
        ts=now,
        actor=me.tg_id or None,
        text=f"Mijoz bilan qayta bog'lanish: {text}" if text else "Mijoz bilan qayta bog'lanish (keyinroq degan)",
        due=due,
        assignee=d.owner_tg,
    )


def no_answer(lead: Lead, now: datetime) -> None:
    """Javob bermadi: 1, 3, 7 kunda qayta qo'ng'iroq; to'rtinchisida — «Javob bermadi» sababi bilan yopiladi."""
    from .models import LeadStatus

    lead.no_answer += 1
    lead.first_touch = lead.first_touch or now
    if lead.no_answer > len(CALLBACK_DAYS):
        lead.status, lead.junk_reason, lead.next_call_at = (
            LeadStatus.JUNK,
            "Javob bermadi (3 marta qayta qo'ng'iroq)",
            None,
        )
    else:
        lead.next_call_at = now + timedelta(days=CALLBACK_DAYS[lead.no_answer - 1])
        if lead.status == LeadStatus.NEW:
            lead.status = LeadStatus.WORK
    lead.call_reminded_at = None
    lead.save(update_fields=["no_answer", "first_touch", "status", "junk_reason", "next_call_at", "call_reminded_at"])


def qualify_check(lead: Lead) -> None:
    miss = [n for n, v in (("tasma turi", lead.product), ("kompaniya", lead.company or lead.name)) if not v.strip()]
    if miss:
        raise ApiError(400, f"Kvalifikatsiya to'liq emas: {', '.join(miss)} kiritilmagan.")


def lead_need(lead: Lead) -> str:
    parts = [
        f"Tasma: {lead.product}" if lead.product else "",
        f"O'lcham: {lead.size}" if lead.size else "",
        f"Hajm: {lead.qty}" if lead.qty else "",
        lead.note,
    ]
    return "\n".join(p for p in parts if p)

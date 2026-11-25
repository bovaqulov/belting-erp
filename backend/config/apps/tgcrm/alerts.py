"""8-bosqich: ogohlantirishlar — akkaunt holati yomonlashsa yoki shlyuz o'chsa, mas'ullarga Telegram (Jarvis bot) orqali.

Kimga: shaxsiy raqam — egasi; firma raqami — akkaunt adminlari; har doim — sotuv rahbarlari (modulga kirishi bor).
Takrorlanmaydi: bir akkaunt + bir holat — soatiga bir marta (Account.alert_status/alert_at); shlyuz — Redis kaliti.
"""

from __future__ import annotations

import logging
from datetime import timedelta

import redis
from django.utils import timezone

from config.apps.staff.services import active_users

from . import bus
from .access import can_use, is_head
from .models import RUNNABLE, Account, AccountMember, Kind, Role, Status

log = logging.getLogger(__name__)
REPEAT = timedelta(hours=1)
OFFLINE_AFTER = timedelta(minutes=10)
FLOOD_ALERT = timedelta(minutes=10)

TEXT: dict[str, str] = {
    Status.LOGGED_OUT: "sessiya tugadi — qayta ulash kerak",
    Status.BANNED: "Telegram akkauntni blokladi",
    Status.FROZEN: "akkaunt muzlatildi (faqat o'qish)",
    Status.LIMITED: "spam-cheklov: notanishlarga yozish yopiq",
    Status.FLOOD: "Telegram uzoq kutishni so'radi (flood)",
    Status.OFFLINE: "10 daqiqadan beri Telegram bilan aloqa yo'q",
}


def recipients(a: Account) -> set[int]:
    out: set[int] = set()
    if a.kind == Kind.PERSONAL:
        out.add(a.owner_tg)
    out |= set(AccountMember.objects.filter(account=a, role=Role.ADMIN).values_list("staff_tg", flat=True))
    out |= {u.tg_id for u in active_users() if can_use(u) and is_head(u)}
    return out


def _send(to: set[int], text: str) -> int:
    from config.apps.core.telegram import send_message

    return sum(1 for tg in to if send_message(tg, text))


def account_changed(account_id: int, status: str, detail: str = "") -> int:
    """Holat o'zgarganda (gateway chaqiradi). Muhim holat bo'lsa — ogohlantirish (soatiga bir marta)."""
    if status not in TEXT or status == Status.OFFLINE:  # aloqa uzilishi — vaqtinchalik bo'lishi mumkin, beat tekshiradi
        return 0
    a = Account.objects.filter(pk=account_id).first()
    if a is None:
        return 0
    now = timezone.now()
    if status == Status.FLOOD and (not a.flood_until or a.flood_until - now < FLOOD_ALERT):
        return 0
    if a.alert_status == status and a.alert_at and now - a.alert_at < REPEAT:
        return 0
    n = _send(recipients(a), f"⚠️ TG CRM: «{a}» — {TEXT[status]}.\n{detail}".strip())
    Account.objects.filter(pk=a.pk).update(alert_status=status, alert_at=now)
    return n


def check() -> dict[str, int]:
    """Celery beat (5 daqiqa): shlyuz o'chganmi, uzoq aloqasiz akkauntlar."""
    from django.conf import settings

    sent = 0
    runnable = Account.objects.filter(status__in=RUNNABLE)
    if settings.TGCRM_API_ID and runnable.exists() and not bus.alive():
        try:
            fresh = bus._redis().set("tgcrm:alert:gateway", 1, nx=True, ex=int(REPEAT.total_seconds()))
        except redis.RedisError:
            fresh = False  # Redis yo'q — dev.sh/servis o'zi ko'rsatadi
        if fresh:
            heads = {u.tg_id for u in active_users() if can_use(u) and is_head(u)}
            sent += _send(
                heads,
                "⚠️ TG CRM: Telegram shlyuzi ishlamayapti — xabarlar kelmaydi va yuborilmaydi. Servisni tekshiring.",
            )
    now = timezone.now()
    for a in Account.objects.filter(status=Status.OFFLINE, updated_at__lt=now - OFFLINE_AFTER):
        if a.alert_status == Status.OFFLINE and a.alert_at and now - a.alert_at < REPEAT:
            continue
        sent += _send(recipients(a), f"⚠️ TG CRM: «{a}» — {TEXT[Status.OFFLINE]}.")
        Account.objects.filter(pk=a.pk).update(alert_status=Status.OFFLINE, alert_at=now)
    return {"sent": sent}

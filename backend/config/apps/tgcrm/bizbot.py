"""AI javobini yuborish — FAQAT Telegram Business boti orqali (BUSINESS_CONNECTION_BOT_TOKEN).

Nega shaxsiy akkaunt (Telethon) emas: Telegram API ToS §1.5 Telegram ma'lumotini AI uchun ishlatishni cheklaydi, Bot
Developer ToS §5.4 esa Business'ga ulangan botga egasi tanlagan shaxsiy chatlarda javob berishga rasman ruxsat beradi.
Qaysi chatlarda bot ishlashini egasi Telegram'ning o'zida tanlaydi (Sozlamalar → Telegram Business → Chatbotlar) va chat
sarlavhasidagi tugma bilan istalgan chatda to'xtatadi. Bot xabarida tugma (reply_markup) bo'lmaydi; javob oynasi —
mijozning oxirgi xabaridan 24 soat. Ulanish ma'lumoti — CRM appidan (ochiq interfeys).
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from django.conf import settings

from config.apps.erp.crm import services as crm

log = logging.getLogger(__name__)
TIMEOUT = 15
LIMIT = 4096


class NotSent(Exception):
    """Yuborilmadi — sabab foydalanuvchiga tushunarli matnda."""


def connection(account_tg: int | None) -> dict[str, Any] | None:
    """Telegram akkauntining (Account.tg_user_id) Business ulanishi (javob huquqi bilan)."""
    if not account_tg or not settings.BUSINESS_CONNECTION_BOT_TOKEN:
        return None
    return crm.business_connection(account_tg)


def status(account_tg: int | None) -> dict[str, Any]:
    """Panel uchun: kanal tayyormi."""
    if not settings.BUSINESS_CONNECTION_BOT_TOKEN:
        return {"ok": False, "detail": "Business bot sozlanmagan (BUSINESS_CONNECTION_BOT_TOKEN)"}
    c = connection(account_tg)
    if c is None:
        return {
            "ok": False,
            "detail": "Akkaunt Business botga ulanmagan: Telegram → Sozlamalar → Telegram Business → Chatbotlar",
        }
    if not c["can_reply"]:
        return {"ok": False, "detail": "Business botda «javob berish» huquqi yo'q — Telegram'da ruxsat bering"}
    return {"ok": True, "detail": "Business bot orqali (egasi nomidan)"}


def _reason(desc: str) -> str:
    d = desc.upper()
    if "PEER" in d or "CHAT NOT FOUND" in d or "USAGE_MISSING" in d:
        return "chat Business bot ro'yxatida emas yoki mijoz 24 soatdan beri yozmagan"
    if "NOT ENOUGH RIGHTS" in d or "CAN_REPLY" in d or "FORBIDDEN" in d:
        return "Business botda javob huquqi yo'q"
    if "TOO MANY REQUESTS" in d or "RETRY AFTER" in d:
        return "Telegram cheklovi (keyinroq)"
    return desc[:200] or "Telegram xatosi"


def send(account_tg: int | None, chat_id: int, text: str) -> int:
    """Egasi nomidan yuboradi. Natija — Telegram message_id. Xato — NotSent(sabab)."""
    c = connection(account_tg)
    if c is None or not c["can_reply"]:
        raise NotSent(status(account_tg)["detail"])
    url = f"https://api.telegram.org/bot{settings.BUSINESS_CONNECTION_BOT_TOKEN}/sendMessage"
    try:
        r = httpx.post(
            url,
            json={"business_connection_id": c["id"], "chat_id": chat_id, "text": text[:LIMIT]},
            timeout=TIMEOUT,
        )
        data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise NotSent(f"Telegram'ga ulanib bo'lmadi: {type(e).__name__}") from e
    if not data.get("ok"):
        raise NotSent(_reason(str(data.get("description") or "")))
    return int(data["result"]["message_id"])

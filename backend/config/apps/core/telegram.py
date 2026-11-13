"""Telegram Bot API — pyTelegramBotAPI (telebot). Bitta bot obyekti (token bo'yicha keshlanadi), sinxron (threaded=False):
webhook yangilanishi ko'rinish ichida darhol ishlanadi. Handlerlar — bots app (bots/handlers.py)."""

from __future__ import annotations

import logging

import telebot
from django.conf import settings
from telebot import apihelper

log = logging.getLogger(__name__)
LIMIT = 4000  # Telegram 4096 belgi — zaxira bilan
setattr(apihelper, "CONNECT_TIMEOUT", 10)  # noqa: B010 — standart 15; tarmoq sekin bo'lsa tezroq qayta urinish
setattr(apihelper, "READ_TIMEOUT", 30)  # noqa: B010

_bots: dict[str, telebot.TeleBot] = {}


def get_bot() -> telebot.TeleBot:
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN yo'q (.env.local)")
    if token not in _bots:
        _bots[token] = telebot.TeleBot(token, threaded=False)
    return _bots[token]


def send_message(chat_id: int | str, text: str) -> bool:
    if not settings.TELEGRAM_BOT_TOKEN:
        log.info("TELEGRAM_BOT_TOKEN yo'q — xabar yuborilmadi (%s)", chat_id)
        return False
    bot = get_bot()
    try:
        for i in range(0, max(len(text), 1), LIMIT):
            bot.send_message(chat_id, text[i : i + LIMIT])
    except Exception as e:  # tarmoq yoki Telegram xatosi — chaqiruvchi ishni to'xtatmasin
        log.warning("Telegram'ga yuborilmadi (%s): %s", chat_id, e)
        return False
    return True

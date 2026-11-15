"""Bot handlerlari (pyTelegramBotAPI): /start login_<token> — brauzer kirishini tasdiqlash; /start inv_<kod> — xodim taklifi."""

from __future__ import annotations

import telebot
from telebot import types, util

from config.apps.staff.services import accept_invite

from .login import confirm_login

_registered: set[int] = set()  # handler bir bot obyektiga bir marta
GREETING = "Belting Agent boti. Kirish: saytda «Telegram orqali kirish» tugmasini bosing."


def register(bot: telebot.TeleBot) -> telebot.TeleBot:
    if id(bot) in _registered:
        return bot

    @bot.message_handler(commands=["start"])
    def start(m: types.Message) -> None:
        arg = (util.extract_arguments(m.text or "") or "").strip()
        u = m.from_user
        if arg.startswith("login_") and u is not None:
            tg = {"id": u.id, "first_name": u.first_name, "last_name": u.last_name, "username": u.username}
            bot.send_message(m.chat.id, confirm_login(arg.removeprefix("login_"), tg))
        elif arg.startswith("inv_") and u is not None:
            tg = {"id": u.id, "first_name": u.first_name, "last_name": u.last_name, "username": u.username}
            bot.send_message(m.chat.id, accept_invite(arg.removeprefix("inv_"), tg))
        else:
            bot.send_message(m.chat.id, GREETING)

    _registered.add(id(bot))
    return bot

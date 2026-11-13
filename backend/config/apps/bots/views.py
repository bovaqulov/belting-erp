"""Telegram webhook: POST /app/api/bots/telegram/ — Telegram yangilanishni yuboradi, sir sarlavha bilan tekshiriladi."""

from __future__ import annotations

import hmac
import json
import logging

from django.conf import settings
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from telebot import types

from config.apps.core.telegram import get_bot

from .handlers import register

log = logging.getLogger(__name__)


@csrf_exempt
def telegram_webhook(request: HttpRequest) -> HttpResponse:
    if request.method != "POST":
        return JsonResponse({"detail": "Faqat POST."}, status=405)
    got = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if not settings.TELEGRAM_BOT_TOKEN or not hmac.compare_digest(got, settings.TELEGRAM_WEBHOOK_SECRET):
        return JsonResponse({"detail": "Ruxsat yo'q"}, status=403)
    try:
        update = types.Update.de_json(json.loads(request.body))
    except ValueError:
        return JsonResponse({"detail": "Noto'g'ri JSON"}, status=400)
    if update is not None:
        try:
            register(get_bot()).process_new_updates([update])
        except Exception:  # Telegram qayta yubormasin — xato logda
            log.exception("telegram update %s ishlanmadi", update.update_id)
    return JsonResponse({"ok": True})

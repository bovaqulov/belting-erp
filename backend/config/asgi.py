"""ASGI (uvicorn): HTTP — Django (chat SSE uchun asinxron ko'rinishlar ham); WebSocket — CRM Telegram real vaqt (erp/crm/live) va TelegramCRM (tgcrm/live)."""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django_app = get_asgi_application()

from config.apps.erp.crm.live import wrap  # noqa: E402 — Django sozlangandan keyin
from config.apps.tgcrm.live import wrap as tgcrm_wrap  # noqa: E402

# TelegramCRM WebSocket'i birinchi (o'z yo'li), qolgani — CRM WebSocket va Django (o'zgarishsiz)
application = tgcrm_wrap(wrap(django_app))

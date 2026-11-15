"""ASGI (uvicorn): HTTP — Django (chat SSE uchun asinxron ko'rinishlar ham); WebSocket — CRM Telegram real vaqt (erp/crm/live)."""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django_app = get_asgi_application()

from config.apps.erp.crm.live import wrap  # noqa: E402 — Django sozlangandan keyin

application = wrap(django_app)

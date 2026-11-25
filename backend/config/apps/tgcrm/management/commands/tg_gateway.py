"""TelegramCRM shlyuzi: `uv run python manage.py tg_gateway` — doimiy jarayon (Telethon clientlari).

Faqat BITTA nusxa ishlaydi (Redis qulfi). dev va prod bitta akkauntni bir vaqtda ishlatmasin — sessiya o'ladi.
"""

from __future__ import annotations

import asyncio
import logging
import signal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from config.apps.tgcrm.gateway.runner import Gateway, RedisBus


class Command(BaseCommand):
    help = "TelegramCRM shlyuzi (Telethon) — akkauntlarni ulab turadi, Django buyruqlarini bajaradi"

    def handle(self, *args, **opts) -> None:
        if not settings.TGCRM_API_ID or not settings.TGCRM_API_HASH:
            raise CommandError(
                "TGCRM_API_ID va TGCRM_API_HASH .env.local da yo'q (my.telegram.org → API development tools)."
            )
        if not settings.TGCRM_SESSION_KEY:
            self.stderr.write(
                "Ogohlantirish: TGCRM_SESSION_KEY bo'sh — sessiya kaliti SECRET_KEY'dan hosil qilinadi (faqat dev)."
            )
        logging.getLogger("telethon").setLevel(logging.WARNING)
        try:
            asyncio.run(self._main())
        except RuntimeError as e:
            raise CommandError(str(e)) from e

    async def _main(self) -> None:
        gw = Gateway(RedisBus(settings.REDIS_URL))
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, gw.stop)
        await gw.run()

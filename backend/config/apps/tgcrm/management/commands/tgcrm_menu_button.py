"""@BeltingBusinessBot menyusiga "TG CRM" Web App tugmasi: `manage.py tgcrm_menu_button [--url https://…]`.

Manzil: --url yoki JARVIS_PUBLIC_URL (tunnel manzili o'zgarsa — tunnel.sh qayta chaqiradi). Telegram faqat HTTPS qabul qiladi.
Ochilganda kirish — initData (Business bot tokeni bilan imzolangan; core.auth.verify_any).
"""

from __future__ import annotations

import httpx
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

TEXT = "TG CRM"
PATH = "/app/tgcrm/"


class Command(BaseCommand):
    help = "Business bot menyusiga TG CRM Web App tugmasini o'rnatadi"

    def add_arguments(self, parser) -> None:
        parser.add_argument("--url", default="", help="Sayt manzili (standart: JARVIS_PUBLIC_URL)")
        parser.add_argument("--remove", action="store_true", help="Tugmani olib tashlash (standart menyu)")

    def handle(self, *args, **opts) -> None:
        token = settings.BUSINESS_CONNECTION_BOT_TOKEN
        if not token:
            raise CommandError("BUSINESS_CONNECTION_BOT_TOKEN yo'q (.env.local).")
        url = ""
        if opts["remove"]:
            button: dict = {"type": "default"}
        else:
            base = (opts["url"] or settings.JARVIS_PUBLIC_URL).rstrip("/")
            if not base.startswith("https://"):
                raise CommandError("Manzil HTTPS bo'lishi kerak (JARVIS_PUBLIC_URL yoki --url).")
            url = base + PATH
            button = {"type": "web_app", "text": TEXT, "web_app": {"url": url}}
        try:
            r = httpx.post(
                f"https://api.telegram.org/bot{token}/setChatMenuButton", json={"menu_button": button}, timeout=15
            )
            data = r.json()
        except (httpx.HTTPError, ValueError) as e:
            raise CommandError(f"Telegram bilan aloqa yo'q: {e}") from e
        if not data.get("ok"):
            raise CommandError(f"Telegram rad etdi: {data.get('description')}")
        self.stdout.write(
            self.style.SUCCESS(
                "Menyu tugmasi olib tashlandi." if opts["remove"] else f"Menyu tugmasi: «{TEXT}» → {url}"
            )
        )

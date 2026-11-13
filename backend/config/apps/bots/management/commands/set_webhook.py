from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from config.apps.core.telegram import get_bot

PATH = "/app/api/bots/telegram/"  # oxirgi «/» — Next trailingSlash 308 bermasin (Telegram redirectga ergashmaydi)


class Command(BaseCommand):
    help = "Telegram webhook'ni o'rnatish: {JARVIS_PUBLIC_URL yoki --url}/app/api/bots/telegram/"

    def add_arguments(self, parser):
        parser.add_argument("--url", default="", help="tashqi HTTPS manzil (tunnel/domen)")

    def handle(self, *args, url: str, **opts):
        base = (url or settings.JARVIS_PUBLIC_URL).rstrip("/")
        if not base.startswith("https://"):
            raise CommandError("HTTPS manzil kerak: --url https://... yoki .env.local JARVIS_PUBLIC_URL")
        ok = get_bot().set_webhook(
            url=base + PATH,
            secret_token=settings.TELEGRAM_WEBHOOK_SECRET,
            allowed_updates=["message"],
            max_connections=10,
        )
        if not ok:
            raise CommandError("Telegram webhook'ni qabul qilmadi")
        self.stdout.write(f"Webhook: {base}{PATH}")

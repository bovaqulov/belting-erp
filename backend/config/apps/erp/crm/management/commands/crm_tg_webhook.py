from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from config.apps.core.http import ApiError
from config.apps.erp.crm import tg

PATH = "/app/api/erp/crm/tg/webhook/"  # oxirgi «/» — Next trailingSlash 308 bermasin


class Command(BaseCommand):
    help = "CRM Telegram Business boti webhook'i: {JARVIS_PUBLIC_URL yoki --url}/app/api/erp/crm/tg/webhook/ (--info — holat)"

    def add_arguments(self, parser):
        parser.add_argument("--url", default="", help="tashqi HTTPS manzil (tunnel/domen)")
        parser.add_argument("--info", action="store_true", help="faqat joriy holatni ko'rsatish")

    def handle(self, *args, url: str, info: bool, **opts):
        if not tg.enabled():
            raise CommandError("BUSINESS_CONNECTION_BOT_TOKEN yo'q (.env.local)")
        try:
            if info:
                self.stdout.write(str(tg.call("getWebhookInfo")))
                return
            base = (url or settings.JARVIS_PUBLIC_URL).rstrip("/")
            if not base.startswith("https://"):
                raise CommandError("HTTPS manzil kerak: --url https://... yoki .env.local JARVIS_PUBLIC_URL")
            tg.call(
                "setWebhook",
                url=base + PATH,
                secret_token=settings.CRM_TG_WEBHOOK_SECRET,
                allowed_updates=tg.ALLOWED_UPDATES,
                max_connections=10,
            )
        except ApiError as e:
            raise CommandError(e.detail) from e
        self.stdout.write(f"CRM Telegram webhook: {base}{PATH} (@{tg.bot_username()})")

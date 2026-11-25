from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from telebot.apihelper import ApiTelegramException
from telebot.types import MenuButtonDefault, MenuButtonWebApp, WebAppInfo

from config.apps.core.telegram import get_bot

PATH = "/app/api/bots/telegram/"  # oxirgi «/» — Next trailingSlash 308 bermasin (Telegram redirectga ergashmaydi)
APP_PATH = "/app/"
MENU_TEXT = "Belting"


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
        # Menyu tugmasi (Mini App) — tunnel manzili o'zgarsa eskisida qolmasin
        app_url = base + APP_PATH
        get_bot().set_chat_menu_button(menu_button=MenuButtonWebApp(MENU_TEXT, WebAppInfo(app_url)))
        self.stdout.write(f"Menyu tugmasi: «{MENU_TEXT}» → {app_url}")
        # Chatga xos tugma umumiysidan ustun — eski manzilda qolganlarini olib tashlaymiz (umumiysi ko'rinadi)
        reset = 0
        for tg_id in get_user_model().objects.values_list("tg_id", flat=True):
            try:
                if getattr(get_bot().get_chat_menu_button(tg_id), "type", "") != "default":
                    get_bot().set_chat_menu_button(tg_id, MenuButtonDefault())
                    reset += 1
            except ApiTelegramException:
                continue  # botni ochmagan / bloklagan
        if reset:
            self.stdout.write(f"Chatga xos eski tugmalar olib tashlandi: {reset}")

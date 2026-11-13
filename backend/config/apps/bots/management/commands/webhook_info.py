from django.core.management.base import BaseCommand

from config.apps.core.telegram import get_bot


class Command(BaseCommand):
    help = "Telegram webhook holati (manzil, kutayotgan yangilanishlar, oxirgi xato)"

    def add_arguments(self, parser):
        parser.add_argument("--delete", action="store_true", help="webhook'ni o'chirish")

    def handle(self, *args, delete: bool, **opts):
        bot = get_bot()
        if delete:
            bot.remove_webhook()
            self.stdout.write("Webhook o'chirildi")
            return
        i = bot.get_webhook_info()
        self.stdout.write(
            f"url: {i.url or '—'}\nkutmoqda: {i.pending_update_count}\noxirgi xato: {i.last_error_message or '—'}"
        )

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from config.apps.core.models import LoginToken
from config.apps.staff.models import User


class Command(BaseCommand):
    help = "Telegram login tokenini tasdiqlash (bot ulanmaguncha qo'lda): confirm_login <token> <tg_id>."

    def add_arguments(self, parser):
        parser.add_argument("token")
        parser.add_argument("tg_id", type=int)

    def handle(self, *args, token: str, tg_id: int, **opts):
        t = LoginToken.objects.filter(token=token).first()
        u = User.objects.filter(tg_id=tg_id).first()
        if t is None or t.expired:
            raise CommandError("Token topilmadi yoki eskirgan")
        if u is None:
            raise CommandError(f"{tg_id} topilmadi")
        t.user, t.confirmed_at = u, timezone.now()
        t.save(update_fields=["user", "confirmed_at"])
        self.stdout.write(f"Tasdiqlandi: {u.name}")

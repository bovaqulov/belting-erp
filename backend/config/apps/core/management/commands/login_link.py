from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from config.apps.core.views import magic_link


class Command(BaseCommand):
    help = "Brauzerda kirish uchun bir martalik havola (10 daqiqa, faqat JARVIS_MAGIC_LOGIN=1)."

    def add_arguments(self, parser):
        parser.add_argument("tg_id", type=int)
        parser.add_argument("--base", default="", help="masalan https://xxx.trycloudflare.com")

    def handle(self, *args, tg_id: int, base: str, **opts):
        if not get_user_model().objects.filter(tg_id=tg_id).exists():
            raise CommandError(f"{tg_id} topilmadi — avval: manage.py add_user {tg_id} --name ... --role owner")
        self.stdout.write(magic_link(tg_id, base.rstrip("/")))

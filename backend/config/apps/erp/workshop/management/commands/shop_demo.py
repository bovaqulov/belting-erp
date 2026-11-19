"""Demo sex (dev baza): ombor demosi + rukavdan remen, ulanadigan lenta mahsulotlari va 3 ta zakaz.

uv run python manage.py shop_demo
"""

from django.core.management.base import BaseCommand

from config.apps.erp.workshop import demo


class Command(BaseCommand):
    help = "Demo sex zakazlari (takror chaqirilsa — qayta yaratilmaydi)"

    def handle(self, *args, **opts) -> None:
        demo.seed()
        self.stdout.write(self.style.SUCCESS("Tayyor: sex taxtasi — /app/erp/sex"))

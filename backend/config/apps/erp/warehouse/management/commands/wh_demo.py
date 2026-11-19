"""Demo ombor ma'lumotlari (dev baza): firmalar, omborlar, javonlar, birliklar, yig'ish navbati, kirim.

uv run python manage.py wh_demo
"""

from django.core.management.base import BaseCommand

from config.apps.erp.warehouse import demo


class Command(BaseCommand):
    help = "Demo ombor ma'lumotlari (takror chaqirilsa — bor narsa qayta yaratilmaydi)"

    def handle(self, *args, **opts) -> None:
        r = demo.seed()
        self.stdout.write(self.style.SUCCESS(f"Tayyor: {len(r['items'])} tovar, omborlar {r['warehouses']}"))

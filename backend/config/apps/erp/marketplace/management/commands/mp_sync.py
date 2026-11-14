"""Marketplace sinxroni qo'lda: buyurtmalar (standart) va kartochkalar + audit (--cards).

uv run python manage.py mp_sync                # barcha ulangan kanallar, 30 kun
uv run python manage.py mp_sync wb --days 7
uv run python manage.py mp_sync --cards        # kartochkalar va audit
"""

from django.core.management.base import BaseCommand, CommandError

from config.apps.erp.marketplace import cards, channels, orders
from config.apps.erp.marketplace.channels import ChannelError


class Command(BaseCommand):
    help = "Marketplace: kanal buyurtmalari (yoki --cards: kartochkalar va audit) sinxroni"

    def add_arguments(self, parser):
        parser.add_argument("channels", nargs="*", help="wb, ozon, uzum (standart — ulanganlarning hammasi)")
        parser.add_argument("--days", type=int, default=30)
        parser.add_argument("--cards", action="store_true")

    def handle(self, *args, **o):
        try:
            if o["cards"]:
                self.stdout.write(str(cards.run()))
                return
            if bad := [c for c in o["channels"] if c not in orders.CHANNELS]:
                raise CommandError(f"Noma'lum kanal: {', '.join(bad)} (wb, ozon, uzum)")
            for ch in o["channels"] or [c for c in orders.CHANNELS if channels.configured(c)]:
                self.stdout.write(f"{ch}: {orders.sync(ch, o['days'])}")
        except ChannelError as e:
            raise CommandError(e.detail) from e

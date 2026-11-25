"""AppSheet narxlari → katalog (narx siyosati, docs/plans/2026-11-21-pricing.md).

manage.py pricing_sync                         # jonli AppSheet API (.env: APPSHEET_VBELT_*, APPSHEET_TIMING_*)
manage.py pricing_sync --from-jarvis <db>      # Jarvis bazasi nusxasidagi AppSheet keshidan (belt_item)
manage.py pricing_sync --relink                # faqat katalog bilan qayta bog'lash (tovar qo'shilgach)
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError

from config.apps.erp.catalog import pricing


class Command(BaseCommand):
    help = "AppSheet narxlarini sinxronlash va katalog bilan bog'lash"

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--from-jarvis", default="")
        parser.add_argument("--relink", action="store_true")

    def handle(self, *args: Any, **o: Any) -> None:
        if o["relink"]:
            self.stdout.write(str(pricing.link()))
            return
        try:
            st = pricing.sync_jarvis(o["from_jarvis"]) if o["from_jarvis"] else pricing.sync_live()
        except Exception as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(f"{st} · {pricing.policy().sync_note}")

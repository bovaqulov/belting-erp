"""Demo katalog (dev baza): kategoriyalar, remenlar, konveyer lentalari (kenglik variantlari), rukavlar, shkivlar —
narx va ombor qoldig'i bilan. CRM tovar qidiruvi (crm/items) shu katalogdan ishlaydi.

Yaratilganlar ID'lari `data/catalog_demo.json` ga yoziladi — `--clear` faqat shularni o'chiradi.
    manage.py catalog_demo            # bor nomlar o'tkaziladi
    manage.py catalog_demo --clear
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from config.apps.erp.catalog import services

REG = Path(settings.BASE_DIR) / "data" / "catalog_demo.json"


class Command(BaseCommand):
    help = "Demo katalog (dev): tovarlar, narxlar, qoldiq; --clear — o'chirish"

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--clear", action="store_true", help="demo tovarlarni o'chirish")

    def handle(self, *args: Any, clear: bool = False, **opts: Any) -> None:
        if not settings.DEBUG and "sqlite" not in settings.DATABASES["default"]["ENGINE"]:
            raise CommandError("Demo katalog faqat dev bazaga (DEBUG yoki SQLite) — production'ga yozilmaydi.")
        old: dict[str, list[int]] = json.loads(REG.read_text()) if REG.exists() else {"groups": [], "items": []}
        if clear:
            n = services.demo_clear(old)
            REG.unlink(missing_ok=True)
            self.stdout.write(f"Demo katalog o'chirildi: {n} ta yozuv")
            return
        made = services.demo_seed()
        reg = {k: sorted(set(old.get(k, [])) | set(v)) for k, v in made.items()}
        REG.parent.mkdir(parents=True, exist_ok=True)
        REG.write_text(json.dumps(reg))
        self.stdout.write(
            self.style.SUCCESS(f"Demo katalog: yangi {len(made['items'])} tovar ({len(reg['items'])} jami demo)")
        )

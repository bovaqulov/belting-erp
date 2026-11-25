"""Texnik oilalar: frontend JSON'ini yangilash va mavjud tovarlarning ko'rsatkichlarini nomdan to'ldirish.

    manage.py catalog_specs --export-json          # frontend/src/erp/finance/lib/specs.json (reestr o'zgarsa)
    manage.py catalog_specs --fill [--dry-run]     # spec bo'sh tovarlar — nomdan (parse.py); hammasiga belgi va kalit
    manage.py catalog_specs --brands [--dry-run]   # brendi bo'sh tovarlar — nomdagi brend («RTS-MEGADYNE» → MEGADYNE)

To'ldirishda: tovarning oilasi bo'sh yoki «other» / spec'i bo'sh bo'lsa — nomdan ajratiladi (kategoriya nomi — ishora);
brend bo'sh bo'lsa — nomdagi brend. Nom, birlik, narx, qoldiq o'zgarmaydi."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction

from config.apps.erp.catalog import parse as P
from config.apps.erp.catalog import specs as S
from config.apps.erp.catalog.models import Item

JSON_PATH = Path(settings.BASE_DIR).parent / "frontend" / "src" / "erp" / "finance" / "lib" / "specs.json"


def recompute(it: Item) -> None:
    fam = S.get(it.family)
    if fam is None:
        return
    it.designation = S.designation(fam, it.spec or {})
    it.match_key = S.match_key(fam, it.spec or {})
    if fam.belt:
        it.belt_mark = it.designation


class Command(BaseCommand):
    help = "Texnik oilalar: frontend JSON (--export-json), ko'rsatkichlarni nomdan to'ldirish (--fill)"

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--export-json", action="store_true")
        parser.add_argument("--fill", action="store_true")
        parser.add_argument("--brands", action="store_true")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args: Any, **o: Any) -> None:
        if o["export_json"]:
            JSON_PATH.write_text(json.dumps(S.export(), ensure_ascii=False, indent=1) + "\n")
            self.stdout.write(f"Yozildi: {JSON_PATH}")
        if o["fill"]:
            self.fill(o["dry_run"])
        if o["brands"]:
            self.brands(o["dry_run"])

    def brands(self, dry: bool) -> None:
        n = 0
        with transaction.atomic():
            for it in Item.objects.filter(active=True, brand=""):
                b = P.brand_of(it.name) or P.brand_of(it.name_ru)
                if b:
                    it.brand = b
                    it.save(update_fields=["brand"])
                    n += 1
            if dry:
                transaction.set_rollback(True)
        self.stdout.write(f"{'(sinov) ' if dry else ''}brend qo'yildi: {n}")

    def fill(self, dry: bool) -> None:
        stats = {"parsed": 0, "kept": 0, "unknown": 0}
        with transaction.atomic():
            for it in Item.objects.select_related("group").order_by("pk"):
                fam = S.get(it.family)
                if not it.spec and (fam is None or fam.fields):
                    p = P.parse(it.name, it.group.name if it.group else "")
                    f, spec, errs = P.to_spec(p) if p is not None else (None, {}, {"": ""})
                    if f is not None and not errs and (spec or not f.fields):
                        it.family, it.spec = f.key, spec
                        it.brand = it.brand or (p.brand if p else "")
                        stats["parsed"] += 1
                        self.stdout.write(f"  {it.name} → {f.key}: {S.designation(f, spec)}")
                    else:
                        stats["unknown"] += 1  # ko'rsatkichsiz oila belgi bera olmaydi — «boshqa»
                        it.family = "other"
                else:
                    stats["kept"] += 1
                recompute(it)
                it.save(update_fields=["family", "spec", "brand", "designation", "match_key", "belt_mark"])
            if dry:
                transaction.set_rollback(True)
        self.stdout.write(f"{'(sinov) ' if dry else ''}{stats}")

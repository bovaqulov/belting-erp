"""1C'dan kassalar, bank hisoblari va qoldiqlar (Jarvis `office.db` nusxasi, `onec_cash`) — ERP boshlang'ich qoldig'i.

    manage.py money_import_1c /yo'l/office.db --dry-run
    manage.py money_import_1c /yo'l/office.db

- 1C bazasi → firma: BR — nomida «belting», NB — «novobelt» (topilmasa — to'xtaydi).
- Bank: «20208000800858759001, в Юнусабадский филиал Узнацбанка» → hisob raqam + bank; kassa — nomi.
- Boshlang'ich qoldiq = 1C qoldig'i, sana — 1C holati (`as_of`). Qayta import — qoldiq va sana yangilanadi
  (ERP hujjatlariga tegilmaydi). Bir nomli ikki kassa — «(2)» bilan alohida.
"""

from __future__ import annotations

import re
import sqlite3
from decimal import Decimal
from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.dateparse import parse_datetime

from config.apps.erp.money.models import AccKind, Account
from config.apps.erp.warehouse import services as wh

FIRM_HINT = {"BR": "belting", "NB": "novobelt"}
CUR = {"сум": "UZS", "usd": "USD", "eur": "EUR", "руб": "RUB"}


def firm_map() -> dict[str, str]:
    out = {}
    for base, hint in FIRM_HINT.items():
        f = next((x for x in wh.firms() if hint in x["name"].casefold()), None)
        if f is None:
            raise CommandError(f"1C bazasi {base} uchun ERP firmasi topilmadi (nomida «{hint}» bo'lsin)")
        out[base] = f["code"]
    return out


class Command(BaseCommand):
    help = "1C kassalari va bank hisoblari qoldig'i → pul bo'limi (boshlang'ich qoldiq)"

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("db")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args: Any, **o: Any) -> None:
        try:
            con = sqlite3.connect(f"file:{o['db']}?mode=ro", uri=True)
            rows = con.execute(
                "SELECT base, tur, hisob, valyuta, summa, as_of FROM onec_cash ORDER BY base, tur, summa DESC"
            ).fetchall()
        except sqlite3.Error as e:
            raise CommandError(f"Baza o'qilmadi: {e}") from e
        firms = firm_map()
        seen: dict[str, int] = {}
        made = updated = 0
        with transaction.atomic():
            for base, tur, hisob, val, summa, as_of in rows:
                bank = tur == "Банк"
                raw = (hisob or "").strip()
                key = f"1c:{base}:{raw}"
                seen[key] = seen.get(key, 0) + 1
                if seen[key] > 1:
                    key = f"{key}#{seen[key]}"
                num, bname = "", ""
                if bank:
                    m = re.match(r"^\s*(\d{20})\s*,?\s*(?:в\s+)?(.*)$", raw)
                    num, bname = (m.group(1), re.sub(r"\s*\(USD\s*$", "", m.group(2)).strip()) if m else ("", raw)
                name = f"{num} — {bname or 'bank'}" if bank and num else raw
                if seen[f"1c:{base}:{raw}"] > 1:
                    name = f"{name} ({seen[f'1c:{base}:{raw}']})"
                cur = CUR.get((val or "").strip().casefold(), (val or "UZS").upper()[:3])
                dt = parse_datetime(as_of or "")
                a = Account.objects.filter(source=key).first()
                vals = {
                    "firm": firms[base],
                    "kind": AccKind.BANK if bank else AccKind.CASH,
                    "name": name[:160],
                    "number": num,
                    "bank": bname[:160],
                    "currency": cur,
                    "opening": Decimal(str(summa or 0)).quantize(Decimal("0.01")),
                    "opening_date": dt.date() if dt else None,
                }
                if a is None:
                    a = Account(source=key, **vals)
                    made += 1
                else:
                    for k, v in vals.items():
                        setattr(a, k, v)
                    updated += 1
                a.save()
                self.stdout.write(f"  {base} → {a.firm}: {a.name} [{a.currency}] = {a.opening} ({a.opening_date})")
            # har firma + turi uchun asosiy hisob — eng katta so'm qoldiqlisi (sotuv to'lovlari shu yerga)
            for firm in set(firms.values()):
                for kind in (AccKind.BANK, AccKind.CASH):
                    qs = Account.objects.filter(firm=firm, kind=kind, currency="UZS", source__startswith="1c:")
                    best = qs.order_by("-opening").first()
                    if (
                        best
                        and not Account.objects.filter(firm=firm, kind=kind, main=True)
                        .exclude(source__startswith="1c:")
                        .exists()
                    ):
                        Account.objects.filter(firm=firm, kind=kind).update(main=False)
                        best.main = True
                        best.save(update_fields=["main"])
            if o["dry_run"]:
                transaction.set_rollback(True)
        self.stdout.write(f"{'(sinov) ' if o['dry_run'] else ''}yangi: {made}, yangilandi: {updated}")

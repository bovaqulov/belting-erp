"""1C nomenklaturasini katalogga import (Jarvis `office.db` nusxasi: `onec_item`, `onec_char`, `onec_barcode`).

    manage.py catalog_import_1c /yo'l/office.db --dry-run     # hisobot: tanildi / tanilmadi / birlashdi
    manage.py catalog_import_1c /yo'l/office.db               # yozish (takror ishga tushirish xavfsiz)

Qoidalar:
- har nom `parse.py` bilan texnik oila + spec'ga ajratiladi (xalqaro standart belgisi, analog kaliti); tanilmagani —
  «Boshqa tovar», nomi 1C'dagidek (" - M", "NB/" qo'shimchalari olib tashlanadi);
- ikki baza (BR, NB) va bir xil tovar — bitta: kalit = standart kalit + brend + birlik (tanilmagan — toza nom + birlik);
- 1C kodlari (`BR:0Н-00001204`), shtrixkodlar, QQS, to'liq nom saqlanadi; o'lcham variantlari (`Размер 30 X 1`) —
  donali tovarda eni (mm) varianti;
- katalogda bor tovar (kalit yoki nom bo'yicha) — faqat kodlari qo'shiladi, nomi/narxi/qoldig'i o'zgarmaydi.
"""

from __future__ import annotations

import re
import sqlite3
from collections import Counter, defaultdict
from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from config.apps.erp.catalog import ops
from config.apps.erp.catalog import parse as P
from config.apps.erp.catalog import specs as S
from config.apps.erp.catalog.models import Char, Group, Item, Kind
from config.apps.erp.catalog.naming import search_text

UNIT = {"шт": ("dona", None), "мм": ("mm", "w"), "м": ("m", "l"), "м2": ("m2", "wl"), "л": ("l", None)}
MAX_CHARS = 60


def clean_name(name: str) -> str:
    s = re.sub(r"\s*-\s*[MМ](?:/NB)?\s*$", "", name.strip())
    s = re.sub(r"^NB/", "", s)
    s = re.sub(r"\s+нал\.?\s*$", "", s, flags=re.I)
    return " ".join(s.split())


class Command(BaseCommand):
    help = "1C nomenklaturasini (Jarvis office.db) katalogga import: texnik oila, standart belgi, kodlar"

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("db")
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--samples", type=int, default=15)

    def handle(self, *args: Any, **o: Any) -> None:
        try:
            con = sqlite3.connect(f"file:{o['db']}?mode=ro", uri=True)
            rows = con.execute(
                "SELECT base, kod, name, full_name, artikul, grp, category, kind, unit, vat FROM onec_item"
            ).fetchall()
        except sqlite3.Error as e:
            raise CommandError(f"Baza o'qilmadi: {e}") from e
        chars: dict[tuple[str, str], list[float]] = defaultdict(list)
        for base, kod, eni in con.execute("SELECT base, item_kod, eni FROM onec_char WHERE eni IS NOT NULL"):
            chars[(base, kod)].append(float(eni))
        bcs: dict[tuple[str, str], list[str]] = defaultdict(list)
        for base, kod, bc in con.execute("SELECT base, item_kod, barcode FROM onec_barcode"):
            if bc and bc not in bcs[(base, kod)]:
                bcs[(base, kod)].append(bc)
        with transaction.atomic():
            stats = self.run(rows, chars, bcs, o["samples"])
            if o["dry_run"]:
                transaction.set_rollback(True)
        self.stdout.write(f"{'(sinov — yozilmadi) ' if o['dry_run'] else ''}{stats}")

    # ------------------------------------------------------------------
    def run(self, rows: list[tuple], chars: dict, bcs: dict, samples: int) -> dict[str, Any]:
        ops.seed_groups()
        groups = {g.name: g for g in Group.objects.filter(parent=None)}
        by_family = {}
        for name, _ru, attrs in ops.TEMPLATE:
            by_family.setdefault(attrs.get("family"), groups.get(name))
        merged: dict[str, dict[str, Any]] = {}
        fams: Counter[str] = Counter()
        unknown: list[str] = []
        for base, kod, name, full, artikul, grp, cat, kind1c, unit1c, vat in rows:
            unit, dims = UNIT.get(unit1c or "шт", ("dona", None))
            service = (kind1c or "").startswith("Услуг")
            p = P.parse(name, f"{grp or ''} {cat or ''}")
            fam: S.Family | None = None
            spec: dict[str, Any] = {}
            if p is not None:
                f, sp, errs = P.to_spec(p)
                if not errs:
                    fam, spec = f, sp
            if fam is not None and fam.key == "timing" and dims == "w":
                fam = S.BY_KEY["sleeve"]
            if fam is None:
                fam = S.BY_KEY["service" if service else "other"]
                if not service:
                    unknown.append(name)
            brand = p.brand if p else ""
            key_std = S.match_key(fam, spec)
            key = f"{key_std}|{brand}|{unit}" if key_std else f"N:{clean_name(name).casefold()}|{unit}"
            m: dict[str, Any] | None = merged.get(key)
            if m is None:
                auto, full_auto = S.auto_name(fam, spec, brand, p.series if p else "")
                m = {
                    "fam": fam,
                    "spec": spec,
                    "brand": brand,
                    "series": p.series if p else "",
                    "name": auto or clean_name(name),
                    "name_ru": (full or "").strip() or full_auto or clean_name(name),
                    "unit": unit,
                    "dims": dims,
                    "kind": Kind.SERVICE if service else fam.kind,
                    "codes": [],
                    "bases": set(),
                    "barcodes": [],
                    "widths": set(),
                    # 1C «artikul»ida ko'pincha kategoriya nomi («Timing belt») — faqat raqamli kod artikul
                    "sku": (artikul or "").strip() if re.search(r"\d", artikul or "") else "",
                    "vat": vat or "",
                    "old": [],
                }
                merged[key] = m
                fams[fam.key] += 1
            m["codes"].append(f"{base}:{kod}")
            m["bases"].add(base)
            m["old"].append(name)
            for bc in bcs.get((base, kod), []):
                if bc not in m["barcodes"]:
                    m["barcodes"].append(bc)
            if p is not None and p.width and unit == "dona" and fam.key == "sleeve" and p.width == int(p.width):
                m["widths"].add(int(p.width))  # rukav bo'lagi — aniq eni (dona)
            if unit == "dona" and fam.key in ("timing", "vbelt", "ribbed", "other"):
                for w in chars.get((base, kod), []):
                    if 3 <= w <= 500 and w == int(w):
                        m["widths"].add(int(w))
        created, updated = self.write(merged, by_family)
        return {
            "1C qatorlari": len(rows),
            "katalog tovarlari": len(merged),
            "yangi": created,
            "kodlari qo'shildi": updated,
            "tanilmadi": len(unknown),
            "oilalar": dict(fams.most_common()),
            "tanilmagan namunalar": unknown[:samples],
        }

    def write(self, merged: dict[str, dict[str, Any]], by_family: dict[str | None, Group | None]) -> tuple[int, int]:
        existing = list(Item.objects.filter(active=True))
        by_key = {f"{it.match_key}|{it.brand}|{it.unit}": it for it in existing if it.match_key}
        by_name = {it.name.casefold(): it for it in existing}
        created = updated = 0
        new_items: list[tuple[Item, set[int]]] = []
        pending: dict[str, Item] = {}

        def natural(m: dict[str, Any]) -> bool:
            """Oilaning asosiy birligi (rukav — mm, lenta — m², remen — dona): nom to'qnashsa oddiy nom shunga."""
            d = m["fam"].dims
            return m["unit"] == ({"w": "mm", "wl": "m2", "l": "m"}[d] if d else "dona")

        for key, m in sorted(merged.items(), key=lambda kv: not natural(kv[1])):
            if (p := pending.get(m["name"].casefold())) is not None and p.unit == m["unit"]:
                p.attrs["legacy_codes"] = sorted({*p.attrs["legacy_codes"], *m["codes"]})  # bir nomli ikki yozuv
                p.attrs["barcodes"] = [
                    *p.attrs["barcodes"],
                    *(b for b in m["barcodes"] if b not in p.attrs["barcodes"]),
                ]
                continue
            it = by_key.get(key) or by_name.get(m["name"].casefold())
            if it is not None and (it.unit == m["unit"] or not it.match_key):
                a = dict(it.attrs or {})
                codes = sorted({*(a.get("legacy_codes") or []), *m["codes"]})
                if codes != (a.get("legacy_codes") or []):
                    a["legacy_codes"] = codes
                    a["barcodes"] = sorted({*(a.get("barcodes") or []), *m["barcodes"]})
                    a.setdefault("barcode", m["barcodes"][0] if m["barcodes"] else None)
                    it.attrs = a
                    it.save(update_fields=["attrs"])
                    updated += 1
                continue
            name = m["name"]
            if (
                name.casefold() in by_name or name.casefold() in pending
            ):  # boshqa birlikdagi bir xil nom («- M» — metrlab)
                name = f"{name} ({m['unit']})"
            if name.casefold() in by_name or name.casefold() in pending:
                name = f"{name} {m['codes'][0]}"
            fam: S.Family = m["fam"]
            mark = S.designation(fam, m["spec"])
            it = Item(
                group=by_family.get(fam.key) or by_family.get("other"),
                name=name[:255],
                name_ru=m["name_ru"][:255],
                kind=m["kind"],
                unit=m["unit"],
                measured=m["dims"] is not None,
                brand=m["brand"],
                belt_mark=mark if fam.belt else "",
                sku=m["sku"][:60],
                family=fam.key,
                spec=m["spec"],
                designation=mark[:80],
                match_key=S.match_key(fam, m["spec"])[:120],
                attrs={
                    "dims": m["dims"],
                    "series": m["series"] or None,
                    "legacy": m["codes"][0],
                    "legacy_codes": sorted(m["codes"]),
                    "base": ",".join(sorted(m["bases"])),
                    "barcode": m["barcodes"][0] if m["barcodes"] else None,
                    "barcodes": m["barcodes"],
                    "vat": m["vat"] or None,
                    "old_names": sorted(set(m["old"]))[:10],
                    "search": search_text(name, mark),
                },
            )
            pending[name.casefold()] = it
            new_items.append((it, m["widths"]))
            created += 1
        Item.objects.bulk_create([it for it, _ in new_items], batch_size=500)
        Char.objects.bulk_create(
            [Char(item=it, name=f"{w} mm", width_mm=w) for it, ws in new_items for w in sorted(ws)[:MAX_CHARS]],
            batch_size=1000,
            ignore_conflicts=True,
        )
        return created, updated

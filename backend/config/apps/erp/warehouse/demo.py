"""Demo ombor (dev baza va testlar): frontend demo urug'i (`src/erp/warehouse/demo/seed.lib.ts`) bilan bir xil —
konveyer lentalar (m², eni × uzunligi), rukav (eni), tishli remen rulon (m), donali remenlar; 2 firma, 4 ombor
(bittasi — yo'lda), bloklar va javonlar, yig'ish navbati, yo'ldagi kirim. Tovarlar katalogga `ensure_item` orqali.
Takror chaqirilsa — bor narsa qayta yaratilmaydi (kodlar bo'yicha).
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from . import codes as K
from .models import Block, Building, Cell, Doc, DocStatus, Firm, Incoming, ItemMeta, Pick, Rack, Unit, Warehouse, WhKind

D = Decimal
ITEMS: list[dict[str, Any]] = [
    {
        "key": 1,
        "name": "Konveyer lenta EP 400/3 4+2",
        "sku": "EP400-3",
        "unit": "m2",
        "kind": "material",
        "dims": "wl",
        "group": "Konveyer lentalar",
        "barcode": "4780100000011",
        "legacy": "00117",
        "base": "BLT",
        "min": 50,
        "cls": "A",
        "cost": 185000,
        "count": 12,
    },
    {
        "key": 2,
        "name": "Konveyer lenta EP 200/2 2+1",
        "sku": "EP200-2",
        "unit": "m2",
        "kind": "material",
        "dims": "wl",
        "group": "Konveyer lentalar",
        "barcode": "4780100000028",
        "legacy": "00123",
        "base": "BLT",
        "min": 30,
        "cls": "A",
        "cost": 120000,
        "count": 41,
    },
    {
        "key": 3,
        "name": "Rukav PU T10 (ochiq)",
        "sku": "RUK-T10",
        "unit": "mm",
        "kind": "material",
        "dims": "w",
        "group": "Rukavlar",
        "barcode": "4780100000035",
        "min": 0,
        "cls": "C",
        "cost": 45000,
        "count": None,
    },
    {
        "key": 4,
        "name": "Ремень 1040-8M-30",
        "sku": "1040-8M-30",
        "unit": "dona",
        "kind": "goods",
        "dims": None,
        "group": "Tishli remenlar",
        "barcode": "4780100000042",
        "legacy": "00231",
        "base": "RMN",
        "min": 10,
        "cls": "A",
        "cost": 98000,
        "count": 35,
    },
    {
        "key": 5,
        "name": "Ремень SPB 1650 Lw",
        "sku": "SPB1650-LW",
        "unit": "dona",
        "kind": "goods",
        "dims": None,
        "group": "Klinli remenlar",
        "barcode": "4780100000059",
        "legacy": "00123",
        "base": "RMN",
        "min": 20,
        "cls": "B",
        "cost": 64000,
        "count": 20,
    },
    {
        "key": 6,
        "name": "Ремень поликлиновой 8PK 1200",
        "sku": "8PK1200",
        "unit": "dona",
        "kind": "goods",
        "dims": None,
        "group": "Poliklinli remenlar",
        "barcode": "4780100000066",
        "min": 5,
        "cls": "C",
        "cost": 52000,
        "count": 30,
    },
    {
        "key": 7,
        "name": "Tishli remen T10 (ochiq, rulon)",
        "sku": "T10-OPEN",
        "unit": "m",
        "kind": "material",
        "dims": "l",
        "group": "Tishli remenlar",
        "barcode": "4780100000073",
        "min": 20,
        "cls": "B",
        "cost": 76000,
        "count": 70,
    },
    {
        "key": 8,
        "name": "Ремень HTD 1400-14M",
        "sku": "1400-14M",
        "unit": "dona",
        "kind": "goods",
        "dims": None,
        "group": "Tishli remenlar",
        "min": 4,
        "cls": "B",
        "cost": 210000,
        "count": None,
        "chars": [("40 mm", 40), ("55 mm", 55)],
    },
]


@transaction.atomic
def seed() -> dict[str, Any]:
    from config.apps.erp.catalog import services as catalog

    from . import stock as S

    t = timezone.now()

    def at(days: float, h: int = 10) -> Any:
        return t.replace(hour=h, minute=0, second=0, microsecond=0) - timedelta(days=days)

    blt, _ = Firm.objects.get_or_create(code="BLT", defaults={"name": "Belting MChJ"})
    rmn, _ = Firm.objects.get_or_create(code="RMN", defaults={"name": "Remen Savdo MChJ"})
    main, _ = Warehouse.objects.get_or_create(name="Asosiy ombor", defaults={"kind": WhKind.STORE, "code": "AO"})
    shop_wh, _ = Warehouse.objects.get_or_create(
        name="Do'kon — Chilonzor", defaults={"kind": WhKind.SHOP, "code": "DC"}
    )
    sex, _ = Warehouse.objects.get_or_create(name="Sex", defaults={"kind": WhKind.PRODUCTION, "code": "SX"})
    road, _ = Warehouse.objects.get_or_create(name="Yo'lda", defaults={"kind": WhKind.TRANSIT, "code": "YL"})
    # tuzilma: ombor → bino → xona → stellaj (qator × qavat); joy kodi AO1-A-01-03-A (codes.py)
    bld, _ = Building.objects.get_or_create(warehouse=main, number=1, defaults={"name": "1-bino"})
    sbld, _ = Building.objects.get_or_create(warehouse=shop_wh, number=1, defaults={"name": "1-bino"})
    a, _ = Block.objects.get_or_create(
        building=bld, code="A", defaults={"warehouse": main, "name": "Konveyer lentalar"}
    )
    b, _ = Block.objects.get_or_create(building=bld, code="B", defaults={"warehouse": main, "name": "Remenlar"})
    d, _ = Block.objects.get_or_create(building=sbld, code="A", defaults={"warehouse": shop_wh, "name": "Vitrina"})
    for blk, bn, rows, floors in ((a, bld, 3, 2), (b, bld, 2, 3), (d, sbld, 1, 2)):
        rack, _ = Rack.objects.get_or_create(
            warehouse=blk.warehouse, block=blk, number=1, defaults={"rows": rows, "floors": floors}
        )
        rc = K.rack(K.block(K.building(blk.warehouse.code, bn.number), blk.code), 1)
        for q in range(1, rows + 1):
            for f in range(1, floors + 1):
                Cell.objects.get_or_create(
                    code=K.cell(rc, q, f),
                    defaults={"warehouse": blk.warehouse, "block": blk, "rack": rack, "row": q, "floor": f},
                )
    for f in (1, 2):  # xonasiz (erkin) joy — eski usul namunasi
        Cell.objects.get_or_create(code=f"C-01-{f}", defaults={"warehouse": main})
    cell = {c.code: c for c in Cell.objects.all()}

    ids: dict[int, int] = {}
    chars: dict[str, int] = {}
    for x in ITEMS:
        attrs = {k: x[k] for k in ("barcode", "legacy", "base") if x.get(k)}
        pk, ch = catalog.ensure_item(
            x["name"],
            unit=x["unit"],
            kind=x["kind"],
            dims=x["dims"],
            sku=x["sku"],
            group=x["group"],
            min_qty=D(x["min"]) if x["min"] else None,
            attrs=attrs,
            chars=x.get("chars"),
        )
        ids[x["key"]] = pk
        chars.update(ch)
        ItemMeta.objects.update_or_create(
            item_id=pk,
            defaults={
                "cls": x["cls"],
                "cost": D(x["cost"]),
                "last_count": at(x["count"]) if x["count"] is not None else None,
            },
        )

    def unit(code: str | None, key: int, firm: Firm, wh: Warehouse, kind: str, qty: str, **kw: Any) -> None:
        if code and Unit.objects.filter(code=code).exists():
            return
        loc = cell.get(kw.pop("loc", "") or "")
        Unit.objects.create(
            code=code,
            item_id=ids[key],
            firm=firm.code,
            warehouse=wh,
            kind=kind,
            qty=D(qty),
            loc=loc,
            created=kw.pop("created", at(60)),
            **kw,
        )

    made = {"kind": "cut", "by_name": "Akmal", "posted_at": at(5, 11).isoformat(), "job": "BR-BU-26-00027"}
    cut = {**made, "number": "KS-26-0041", "width_mm": 800, "length_mm": 12500, "qty": 10}
    if not Unit.objects.filter(code="P00000101").exists():
        unit(
            "P00000101",
            1,
            blt,
            main,
            "roll",
            "32",
            loc="AO1-A-01-01-A",
            width_mm=D(800),
            length_mm=D(40000),
            cuts=[cut],
        )
        unit(
            "P00000102",
            1,
            blt,
            main,
            "piece",
            "10",
            loc="AO1-A-01-01-B",
            width_mm=D(800),
            length_mm=D(12500),
            parent_code="P00000101",
            made=made,
        )
        unit("P00000103", 1, blt, main, "piece", "1.95", width_mm=D(650), length_mm=D(3000), created=at(140))
        unit("P00000104", 2, blt, main, "roll", "15", loc="AO1-A-01-02-A", width_mm=D(500), length_mm=D(30000))
        unit("P00000105", 2, rmn, main, "piece", "2.1", loc="AO1-A-01-02-B", width_mm=D(500), length_mm=D(4200))
        unit("P00000106", 3, blt, main, "piece", "1", loc="AO1-A-01-03-A", width_mm=D(120))
        unit("P00000107", 3, blt, main, "piece", "1", loc="AO1-A-01-03-A", width_mm=D(150))
        unit("P00000108", 7, blt, main, "roll", "50", loc="AO1-B-01-02-A", length_mm=D(50000))
        unit("P00000109", 7, blt, main, "piece", "12", length_mm=D(12000), created=at(120))
        unit("P00000110", 2, blt, main, "piece", "1", width_mm=D(500), length_mm=D(2000), pending=True)
        unit("P00000111", 1, blt, sex, "piece", "4", width_mm=D(800), length_mm=D(5000))
        unit(None, 4, rmn, main, "lot", "14", loc="AO1-B-01-01-A")
        unit(None, 5, rmn, main, "lot", "8", loc="AO1-B-01-01-B")
        unit(None, 6, rmn, shop_wh, "lot", "30", loc="DC1-A-01-01-A")
        unit(None, 6, rmn, main, "lot", "3")
        Unit.objects.create(
            item_id=ids[8],
            char_id=chars["40 mm"],
            firm=rmn.code,
            warehouse=main,
            kind="lot",
            qty=D(6),
            loc=cell["AO1-B-01-01-C"],
            created=at(60),
        )
        S.next_code()  # hisoblagich mavjud kodlardan davom etsin

        def posted(number: str, kind: str, days: int, data: dict[str, Any] | None = None) -> None:
            Doc.objects.get_or_create(
                number=number,
                defaults={
                    "kind": kind,
                    "status": DocStatus.POSTED,
                    "firm": "BLT",
                    "warehouse": main,
                    "author": None,
                    "date": at(days, 9),
                    "updated": at(days, 17),
                    "version": 2,
                    "data": data or {},
                },
            )

        posted("INV-26-0011", "inventory", 10, {"positions": 25, "diff": 0})
        posted("INV-26-0012", "inventory", 3, {"positions": 18, "diff": 2})
        posted("KS-26-0041", "cut", 5, {"scrap": 0.4, "used": 10.4})
        posted("KS-26-0045", "cut", 0, {"scrap": 0.15, "used": 3.2})
        posted("KO-26-0019", "transfer", 0)

        def pick(
            number: str,
            customer: str,
            firm: Firm,
            lines: list[tuple[int, int | None, str]],
            channel: str = "",
            days: int = 0,
        ) -> None:
            Pick.objects.create(
                number=number,
                date=at(days),
                customer=customer,
                firm=firm.code,
                channel=channel,
                warehouse=main,
                source=f"demo:{number}",
                lines=[
                    {"line_no": i + 1, "item_id": ids[k], "char_id": c, "qty": float(q), "left": float(q)}
                    for i, (k, c, q) in enumerate(lines)
                ],
            )

        pick("BR-BU-26-00031", "Olmaliq KMK", blt, [(1, None, "4.8"), (4, None, "2")], days=1)
        pick("BR-BU-26-00034", "Ozon buyurtmasi 0187", rmn, [(5, None, "3")], channel="ozon")
        pick("BR-BU-26-00035", "Qizilqum sement", blt, [(7, None, "6"), (8, chars["40 mm"], "1"), (3, None, "1")])
        Incoming.objects.get_or_create(
            number="PO-26-0007",
            defaults={
                "supplier": "Bando (Xitoy)",
                "firm": "RMN",
                "warehouse": road,
                "expected": at(-1),
                "items": [
                    {"item_id": ids[4], "char_id": None, "qty": 20},
                    {"item_id": ids[5], "char_id": None, "qty": 30},
                ],
            },
        )
        Incoming.objects.get_or_create(
            number="PO-26-0008",
            defaults={
                "supplier": "Optibelt",
                "firm": "RMN",
                "warehouse": road,
                "expected": at(-4),
                "items": [
                    {"item_id": ids[8], "char_id": chars["55 mm"], "qty": 6},
                    {"item_id": ids[6], "char_id": None, "qty": 50},
                ],
            },
        )
    return {
        "items": ids,
        "chars": chars,
        "warehouses": {"main": main.pk, "shop": shop_wh.pk, "sex": sex.pk, "road": road.pk},
    }

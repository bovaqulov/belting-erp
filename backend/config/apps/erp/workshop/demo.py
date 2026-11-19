"""Demo sex (dev baza va testlar): ombor demosi ustiga — rukavdan kesiladigan tishli remen (eni bo'yicha variantlar)
va ulanadigan konveyer lenta (mahsulot, materiali — ombordagi rukav / lenta) hamda turli bosqichdagi zakazlar."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.utils import timezone

from config.apps.erp.catalog import services as catalog
from config.apps.erp.warehouse import services as warehouse

from . import shop
from .models import Job


def products(wh: dict[str, Any]) -> dict[str, Any]:
    rukav, lenta = wh["items"][3], wh["items"][1]
    belt, chars = catalog.ensure_item(
        "Tishli remen T10 (rukavdan)",
        unit="dona",
        kind="product",
        sku="T10-RUK",
        group="Tishli remenlar",
        attrs={"material_id": rukav},
        chars=[("25 mm", 25), ("50 mm", 50)],
    )
    conv, _ = catalog.ensure_item(
        "Konveyer lenta EP 400/3 (ulangan)",
        unit="m2",
        kind="product",
        dims="wl",
        sku="EP400-3-END",
        group="Konveyer lentalar",
        attrs={"material_id": lenta},
    )
    return {"belt": belt, "belt_chars": chars, "conv": conv}


def seed() -> dict[str, Any]:
    wh = warehouse.demo_seed()
    p = products(wh)
    if not Job.objects.filter(source__startswith="demo:").exists():
        t = timezone.now()
        shop.open_jobs(
            source="demo:BR-26-0101",
            order_number="BR-26-0101",
            customer="Olmaliq KMK",
            lines=[{"item_id": p["belt"], "char_id": p["belt_chars"]["50 mm"], "qty": 2}],
            due=t + timedelta(hours=6),
            seller_name="Dilshod",
            note="Shoshilinch — liniya to'xtagan",
        )
        shop.open_jobs(
            source="demo:BR-26-0102",
            order_number="BR-26-0102",
            customer="Qizilqum sement",
            lines=[{"item_id": p["conv"], "qty": 1, "spec": {"width": 650, "length": 2500, "joint": 300}}],
            due=t + timedelta(days=2),
            seller_name="Jasur",
        )
        shop.open_jobs(
            source="demo:BR-26-0099",
            order_number="BR-26-0099",
            customer="Ozon buyurtmasi 0192",
            channel="ozon",
            lines=[{"item_id": p["belt"], "char_id": p["belt_chars"]["25 mm"], "qty": 1}],
            due=t - timedelta(hours=3),
        )
    return {**wh, **p}

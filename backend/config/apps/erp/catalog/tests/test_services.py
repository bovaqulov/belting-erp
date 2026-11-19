"""Katalog servislari: narx hisobi (dona / 1 mm × kenglik / qo'lda), qidiruv (variantlar, belgi), erkin qoldiq, demo."""

from decimal import Decimal

import pytest

from config.apps.erp.catalog import services
from config.apps.erp.catalog.models import Char, Item
from config.apps.erp.warehouse import services as wh

pytestmark = pytest.mark.django_db


def test_narx_dona_mm_va_qolda():
    it = Item.objects.create(
        name="Лента EP", unit="m", price={"mode": "mm", "price": 390, "step_mm": 50, "overrides": {"1000": 380000}}
    )
    a = Char.objects.create(item=it, name="800 мм", width_mm=800)
    b = Char.objects.create(item=it, name="820 мм", width_mm=820)  # qadam 50 → 850
    c = Char.objects.create(item=it, name="1000 мм", width_mm=1000)
    assert [services.price_of(it, x) for x in (a, b, c)] == [Decimal(312000), Decimal(331500), Decimal(380000)]
    assert services.price_of(Item(name="x", price={"mode": "piece", "price": 98000})) == Decimal(98000)
    assert services.price_of(Item(name="y")) is None


def test_qidiruv_va_qoldiq():
    made = services.demo_seed()
    assert made["items"] and services.demo_seed()["items"] == []  # takroriy chaqiruv — yangi tovar yo'q
    hits = services.search("spb1650")
    assert [h["name"] for h in hits] == ["Ремень клиновой SPB 1650"]
    h = hits[0]
    assert (h["price"], h["unit"], h["free"]) == ("185000", "dona", "64.000")  # band — faqat yig'ish navbatidan (ombor)
    assert services.search("SPB 1650") == hits
    lenta = services.search("ep-400 800")
    assert [(x["char"], x["price"]) for x in lenta] == [("800 мм", "312000")]
    assert len(services.search("EP-400/3")) == 4  # har kenglik — alohida qator
    assert services.search("") == [] and services.search("yo'q tovar") == []
    # lotincha / kategoriya bo'yicha: "remen spb" = "ремень SPB", "rukav 25", "tishli" (kategoriya)
    assert [x["name"] for x in services.search("remen spb 1650")] == ["Ремень клиновой SPB 1650"]
    assert [x["name"] for x in services.search("rukav 25")] == ["Рукав напорный 25 мм"]
    assert len(services.search("tishli")) == 4 and len(services.search("lenta 800")) == 1
    f = services.find("Лента конвейерная EP-400/3", "800 мм")
    assert f is not None and f["free"] == "210.000"
    assert services.find("Лента конвейерная EP-400/3", "9 мм") is None
    assert services.demo_clear(made) > 0 and not Item.objects.exists() and wh.free(made["items"]) == {}

"""1C importi (Jarvis office.db shakli): ikki baza birlashadi, texnik oila va belgi, 1C kodlari va shtrixkodlar
(ombor skaneri topadi), rukav mm / rukav bo'lagi dona — alohida, kategoriya-artikul tashlanadi, qayta import — yangi yo'q."""

import sqlite3

import pytest
from django.core.management import call_command

from config.apps.erp.catalog import services
from config.apps.erp.catalog.models import Char, Item

pytestmark = pytest.mark.django_db

ROWS = [
    (
        "BR",
        "0Н-1",
        "1040 HTD 8M NOVOBELT",
        "Зубчатый ремень 1040 HTD 8M NOVOBELT",
        "Timing belt",
        "Тип RPP8 / 8M",
        "Зубчатые ремни",
        "Запас",
        "шт",
        "12%",
    ),
    (
        "NB",
        "0Н-2",
        "1040 8M NB",
        "Зубчатый ремень 1040 8M NB",
        "",
        "Тип RPP8 / 8M",
        "Зубчатые ремни",
        "Запас",
        "шт",
        "12%",
    ),
    (
        "NB",
        "0Н-3",
        "Рукав 1040 8M NOVOBELT",
        "Рукав зубчатого ремня 1040 8M",
        "8M1040",
        "Рукава Тип RPP8 / 8M",
        "Зубчатые ремни",
        "Запас",
        "мм",
        "Без НДС",
    ),
    (
        "NB",
        "0Н-4",
        "Рукав 1040 8M NOVOBELT ширина: 450мм",
        "",
        "",
        "Рукава Тип RPP8 / 8M",
        "Зубчатые ремни",
        "Запас",
        "шт",
        "12%",
    ),
    (
        "BR",
        "0Н-5",
        "SPB-1650 Lp PIX",
        "Клиновой ремень тип SPB-1650 Lp PIX",
        "",
        "Тип - SPB",
        "Клиновые ремни",
        "Запас",
        "шт",
        "12%",
    ),
    ("BR", "0Н-6", "Клей - K2000 500 гр", "", "", "Товары", "", "Запас", "шт", "12%"),
    ("BR", "0Н-7", "Установка", "", "", "Услуги", "", "Услуга", "шт", "12%"),
]


@pytest.fixture
def office(tmp_path):
    p = tmp_path / "office.db"
    con = sqlite3.connect(p)
    con.executescript(
        "CREATE TABLE onec_item(base, kod, name, full_name, artikul, grp, category, kind, unit, vat);"
        "CREATE TABLE onec_char(base, item_kod, kod, name, eni, uzunligi, barcode, created);"
        "CREATE TABLE onec_barcode(base, item_kod, barcode, char_name, extra);"
    )
    con.executemany("INSERT INTO onec_item VALUES(?,?,?,?,?,?,?,?,?,?)", ROWS)
    con.executemany(
        "INSERT INTO onec_char VALUES(?,?,?,?,?,?,?,?)",
        [
            ("BR", "0Н-1", "a", "Размер 30 X 1", 30.0, 1.0, "", ""),
            ("BR", "0Н-1", "b", "Размер 445 X 1", 445.0, 1.0, "", ""),
        ],
    )
    con.execute("INSERT INTO onec_barcode VALUES('NB','0Н-2','4780000000017','','')")
    con.commit()
    return str(p)


def test_import(office):
    call_command("catalog_import_1c", office)
    belt = Item.objects.get(name="1040-8M NOVOBELT")
    a = belt.attrs
    assert belt.family == "timing" and belt.designation == "1040-8M" and belt.brand == "NOVOBELT"
    assert a["legacy_codes"] == ["BR:0Н-1", "NB:0Н-2"] and a["barcode"] == "4780000000017" and a["base"] == "BR,NB"
    assert belt.sku == "" and belt.name_ru.startswith("Зубчатый ремень")  # «Timing belt» — artikul emas
    assert sorted(Char.objects.filter(item=belt).values_list("width_mm", flat=True)) == [30, 445]
    sleeve = Item.objects.get(name="Рукав 1040-8M NOVOBELT")
    piece = Item.objects.get(name="Рукав 1040-8M NOVOBELT (dona)")
    assert (sleeve.unit, sleeve.family, sleeve.sku) == ("mm", "sleeve", "8M1040")
    assert piece.unit == "dona" and list(Char.objects.filter(item=piece).values_list("width_mm", flat=True)) == [450]
    assert Item.objects.get(name="SPB-1650 Lp PIX").family == "vbelt"
    assert Item.objects.get(name="Клей - K2000 500 гр").family == "other"
    assert Item.objects.get(name="Установка").kind == "service"
    assert [x["id"] for x in services.by_code("4780000000017")] == [belt.pk]
    assert [x["id"] for x in services.by_code("0Н-5")] == [Item.objects.get(name="SPB-1650 Lp PIX").pk]
    n = Item.objects.count()
    call_command("catalog_import_1c", office)
    assert Item.objects.count() == n

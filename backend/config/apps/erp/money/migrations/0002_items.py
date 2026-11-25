"""Boshlang'ich pul oqimi moddalari (1C «Статьи движения денег» kabi); `code` — tizim moddasi (operatsiya bo'yicha)."""

from django.db import migrations

ITEMS = [
    ("in", "customer", "Mijozlardan to'lov"),
    ("in", "loan_in", "Kredit va qarz olindi"),
    ("in", "refund_in", "Yetkazib beruvchidan qaytgan pul"),
    ("in", "other_in", "Boshqa kirim"),
    ("out", "supplier", "Yetkazib beruvchilarga to'lov"),
    ("out", "import", "Import: bojxona va logistika"),
    ("out", "salary", "Ish haqi"),
    ("out", "tax", "Soliqlar"),
    ("out", "rent", "Ijara"),
    ("out", "utility", "Kommunal xizmatlar"),
    ("out", "logistics", "Yetkazib berish (logistika)"),
    ("out", "bank_fee", "Bank xizmati"),
    ("out", "loan_out", "Kredit va qarz qaytarildi"),
    ("out", "refund", "Mijozga qaytarilgan pul"),
    ("out", "other_out", "Boshqa xarajat"),
]


def seed(apps, schema_editor):
    FlowItem = apps.get_model("erp_money", "FlowItem")
    for i, (d, code, name) in enumerate(ITEMS):
        FlowItem.objects.get_or_create(code=code, defaults={"name": name, "direction": d, "sort": i * 10})


class Migration(migrations.Migration):
    dependencies = [("erp_money", "0001_initial")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]

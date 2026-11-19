"""Jurnal boshlanishi: mavjud har birlik (qoldig'i bor, kutilmayotgan) uchun «Boshlang'ich holat» yozuvi — shundan keyin
har birlik uchun Σ delta = joriy qoldiq."""

from django.db import migrations
from django.utils import timezone


def forward(apps, schema_editor):
    Unit = apps.get_model("erp_warehouse", "Unit")
    StockMove = apps.get_model("erp_warehouse", "StockMove")
    at = timezone.now()
    rows = [
        StockMove(
            at=at,
            op="opening",
            unit_id=u.pk,
            unit_code=u.code or "",
            item_id=u.item_id,
            char_id=u.char_id,
            firm=u.firm,
            delta=u.qty,
            qty_after=u.qty,
            wh_to_id=u.warehouse_id,
            loc_to_id=u.loc_id,
            loc_to_code=u.loc.code if u.loc_id else "",
        )
        for u in Unit.objects.filter(qty__gt=0, pending=False).select_related("loc")
    ]
    StockMove.objects.bulk_create(rows, batch_size=500)


class Migration(migrations.Migration):
    dependencies = [("erp_warehouse", "0007_ledger")]
    operations = [migrations.RunPython(forward, migrations.RunPython.noop)]

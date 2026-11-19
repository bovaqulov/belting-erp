"""Mavjud joylar → stellajlar: xonadagi (blokdagi) `A-03-2` (xona-qator-qavat) joylari shu xonaning 1-stellajiga o'tadi,
kodi `A-1-03-2` (xona-stellaj-qator-qavat) bo'ladi. Joy obyekti o'sha qoladi — undagi birliklar joyida."""

import re

from django.db import migrations


def forward(apps, schema_editor):
    Block = apps.get_model("erp_warehouse", "Block")
    Cell = apps.get_model("erp_warehouse", "Cell")
    Rack = apps.get_model("erp_warehouse", "Rack")
    for b in Block.objects.all():
        pat = re.compile(rf"^{re.escape(b.code)}-(\d+)-(\d+)$")
        old = [(c, pat.match(c.code)) for c in Cell.objects.filter(block=b, rack__isnull=True)]
        old = [(c, m) for c, m in old if m]
        if not old:
            continue
        rows = max(int(m.group(1)) for _, m in old)
        floors = max(int(m.group(2)) for _, m in old)
        rack = Rack.objects.create(warehouse_id=b.warehouse_id, block=b, number=1, rows=rows, floors=floors)
        for c, m in old:
            new = f"{b.code}-1-{int(m.group(1)):02d}-{int(m.group(2))}"
            if Cell.objects.filter(code=new).exclude(pk=c.pk).exists():
                continue  # band (kutilmagan) — eski kodda, stellajsiz qoladi
            c.code, c.rack = new, rack
            c.save(update_fields=["code", "rack"])


def backward(apps, schema_editor):
    Cell = apps.get_model("erp_warehouse", "Cell")
    pat = re.compile(r"^([A-Z]{1,3})-\d+-(\d+)-(\d+)$")
    for c in Cell.objects.filter(rack__isnull=False):
        if m := pat.match(c.code):
            c.code, c.rack = f"{m.group(1)}-{m.group(2)}-{m.group(3)}", None
            c.save(update_fields=["code", "rack"])


class Migration(migrations.Migration):
    dependencies = [("erp_warehouse", "0004_racks")]
    operations = [migrations.RunPython(forward, backward)]

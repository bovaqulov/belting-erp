"""Mavjud bitimlar nomiga unikal raqam: «#42 SPB 1650 remen» (yangilari — deals.deal_title)."""

import re

from django.db import migrations

DEAL_NO = re.compile(r"^#\d+\s*")


def number(apps, schema_editor):
    Deal = apps.get_model("erp_crm", "Deal")
    for d in Deal.objects.only("pk", "title").iterator():
        t = f"#{d.pk} {DEAL_NO.sub('', d.title.strip()) or 'Yangi bitim'}"[:255]
        if t != d.title:
            Deal.objects.filter(pk=d.pk).update(title=t)


def unnumber(apps, schema_editor):
    Deal = apps.get_model("erp_crm", "Deal")
    for d in Deal.objects.only("pk", "title").iterator():
        t = re.sub(rf"^#{d.pk}\s+", "", d.title)
        if t != d.title:
            Deal.objects.filter(pk=d.pk).update(title=t)


class Migration(migrations.Migration):
    dependencies = [("erp_crm", "0016_routing_rules")]
    operations = [migrations.RunPython(number, unnumber)]

"""CRM — faqat Sales voronkasi (egasi qarori, 2026-11-14): ishlab chiqarish va logistika — alohida tizim (keyin), monitoring
ham olib tashlanadi. Boshqa voronkalar, ularning bosqichlari va tunnellar o'chiriladi (bitim bo'lsa — Sales «Yangi» ga)."""

from django.db import migrations

GONE = ("prod", "ship", "mon")


def forward(apps, schema_editor):
    Pipeline = apps.get_model("erp_crm", "Pipeline")
    Stage = apps.get_model("erp_crm", "Stage")
    Deal = apps.get_model("erp_crm", "Deal")
    Tunnel = apps.get_model("erp_crm", "Tunnel")
    Tunnel.objects.all().delete()
    Deal.objects.filter(stage__pipeline_id__in=GONE).update(stage_id="new")
    Stage.objects.filter(pipeline_id__in=GONE).delete()
    Pipeline.objects.filter(code__in=GONE).delete()
    Pipeline.objects.filter(code="main").update(name="Sales")
    Stage.objects.filter(code="paid").update(name="To'lov olindi", guide="To'lov tushdi — buyurtmani bajarishga topshiring.")


class Migration(migrations.Migration):
    dependencies = [("erp_crm", "0012_tg_reply_history")]
    operations = [migrations.RunPython(forward, migrations.RunPython.noop)]

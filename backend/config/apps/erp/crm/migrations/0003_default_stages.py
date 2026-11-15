"""Standart voronkalar, bosqichlar (Jarvis/erp_crm bilan bir xil kodlar) va rad etish sabablari."""

from django.db import migrations

PIPELINES = [("main", "Asosiy savdo", 0), ("dealer", "Dilerlar", 1)]
# code, pipeline, name, kind, color, probability, rot_days, guide
STAGES = [
    ("new", "main", "Yangi so'rov", "open", "#3e88f7", 10, 3, "24 soat ichida qo'ng'iroq qiling: qaysi remen, o'lcham, miqdor, muddat."),
    ("qual", "main", "Ehtiyoj aniqlandi", "open", "#3ab5c9", 25, 7, "Tovarlarni qo'shing va tijorat taklifini yuboring."),
    ("offer", "main", "Taklif yuborildi", "open", "#a65ff0", 45, 10, "Taklif bo'yicha javobni oling, e'tirozlarni yozib qo'ying."),
    ("agree", "main", "Kelishuv", "open", "#e8538f", 70, 14, "Narx va muddat kelishilgach — buyurtma tuzing."),
    ("pay", "main", "To'lov kutilmoqda", "open", "#f09a37", 90, 7, "To'lovni kuzating; tushgach jo'natishga o'tkazing."),
    ("won", "main", "Yutildi", "won", "#4ac158", 100, None, ""),
    ("lost", "main", "Yutqazildi", "lost", "#eb4d3d", 0, None, ""),
    ("dl_new", "dealer", "Muzokara", "open", "#5e5ce6", 30, 14, ""),
    ("dl_contract", "dealer", "Shartnoma", "open", "#e6b422", 75, 21, ""),
    ("dl_won", "dealer", "Diler bo'ldi", "won", "#4ac158", 100, None, ""),
    ("dl_lost", "dealer", "Rad etdi", "lost", "#eb4d3d", 0, None, ""),
]
LOST = ["Qimmat", "Raqobatchidan oldi", "Muddat to'g'ri kelmadi", "Tovar yo'q edi", "Javob bermay qo'ydi", "Loyiha to'xtadi"]


def seed(apps, schema_editor):
    Pipeline = apps.get_model("erp_crm", "Pipeline")
    Stage = apps.get_model("erp_crm", "Stage")
    LostReason = apps.get_model("erp_crm", "LostReason")
    for code, name, order in PIPELINES:
        Pipeline.objects.get_or_create(code=code, defaults={"name": name, "order": order})
    for i, (code, pipe, name, kind, color, prob, rot, guide) in enumerate(STAGES):
        Stage.objects.get_or_create(
            code=code,
            defaults={"pipeline_id": pipe, "name": name, "kind": kind, "color": color, "probability": prob, "rot_days": rot, "guide": guide, "order": i},
        )
    for i, name in enumerate(LOST):
        LostReason.objects.get_or_create(name=name, defaults={"order": i})


class Migration(migrations.Migration):
    dependencies = [("erp_crm", "0002_crm_core")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]

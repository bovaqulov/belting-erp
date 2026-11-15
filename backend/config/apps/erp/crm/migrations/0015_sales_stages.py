"""Sales jarayoni (egasi tavsifi, 2026-11-14): bosqichlar, SLA (soat) va ko'rsatmalar. Eski bosqichlar yangisiga ko'chiriladi."""

from django.db import migrations

# code, name, kind, color, probability, rot_days, sla_hours, guide
STAGES = [
    ("new", "Yangi", "open", "#3e88f7", 10, 3, 24, "Ehtiyojni aniqlang va 24 soat ichida narx va muddat ko'rsatilgan tijorat taklifini yuboring."),
    ("offer", "Taklif yuborildi", "open", "#3ab5c9", 40, 7, 168, "2 va 5 kundan keyin mijozga qayta yozing (vazifalar avtomatik). Rozi — shartnomaga; rad etsa — sababi bilan yoping; «keyinroq» — «Keyinroq» bosqichi."),
    ("later", "Keyinroq", "open", "#8fd3f4", 20, None, None, "Mijoz keyinroq dedi — qayta bog'lanish sanasiga vazifa qo'ying."),
    ("contract", "Shartnoma va hisob-faktura", "open", "#2fd3a5", 70, 3, 24, "Shartnoma va hisob-fakturani birga yuboring (Didox); 1 kun ichida imzolanishini kuzating."),
    ("payment", "To'lov kutilmoqda", "open", "#f5a623", 85, 5, 72, "To'lov sharti — 100% yoki 50/50. Oldindan to'lov tushishi bilan buyurtma o'zi ishlab chiqarishga o'tadi."),
    ("production", "Ishlab chiqarishda", "open", "#a65ff0", 90, None, None, "Buyurtma ishlab chiqarishda. Tayyor bo'lgach «Tayyor» ga o'tkazing — mijozga xabar avtomatik boradi."),
    ("ready", "Tayyor", "open", "#5bd0d6", 95, 3, 72, "50/50 bo'lsa — qolgan 50% ni jo'natishdan oldin oling."),
    ("shipping", "Jo'natildi / hujjatlar", "open", "#e8538f", 98, 5, 72, "Yuk xati va dalolatnoma (Didox) imzolangach — «Yutildi»."),
    ("won", "Yutildi", "won", "#4ac158", 100, None, None, ""),
    ("lost", "Yo'qotildi", "lost", "#eb4d3d", 0, None, None, ""),
]
REMAP = {"proc": "new", "info": "new", "nostock": "later", "paid": "production", "shipped": "shipping", "lost_an": "lost"}


def forward(apps, schema_editor):
    Stage = apps.get_model("erp_crm", "Stage")
    Deal = apps.get_model("erp_crm", "Deal")
    StageHistory = apps.get_model("erp_crm", "StageHistory")
    for i, (code, name, kind, color, prob, rot, sla, guide) in enumerate(STAGES):
        Stage.objects.update_or_create(
            code=code,
            defaults={"pipeline_id": "main", "name": name, "kind": kind, "color": color, "probability": prob, "rot_days": rot, "sla_hours": sla, "guide": guide, "order": i},
        )
    for old, new in REMAP.items():
        Deal.objects.filter(stage_id=old).update(stage_id=new)
        StageHistory.objects.filter(to_stage=old).update(to_stage=new)
        StageHistory.objects.filter(from_stage=old).update(from_stage=new)
    Stage.objects.exclude(code__in=[s[0] for s in STAGES]).delete()


class Migration(migrations.Migration):
    dependencies = [("erp_crm", "0014_sales_process")]
    operations = [migrations.RunPython(forward, migrations.RunPython.noop)]

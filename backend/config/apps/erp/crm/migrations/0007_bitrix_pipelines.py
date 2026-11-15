"""Belting savdo jarayoni (egasi tushuntirdi, 2026-11-14): 4 voronka — Savdo, Ishlab chiqarish, Jo'natish, Monitoring —
va ular orasidagi tunnellar. Eski bosqichlar (qual, agree, pay, dl_*) yangisiga ko'chiriladi; "Dilerlar" voronkasi olib tashlanadi.

Oqim: Savdo «To'lov olindi» → Ishlab chiqarish «Yangi» (bog'langan bitim); Ishlab chiqarish ✓«Jo'natishga» →
Jo'natish «Jo'natishga tayyor»; Jo'natish ✓«Tovar jo'natildi» → asl savdo bitimi «Tovar jo'natildi»;
Savdo «Tovar jo'natildi» → Monitoring «Yangi».
"""

from django.db import migrations

PIPELINES = [("main", "Savdo", 0), ("prod", "Ishlab chiqarish", 1), ("ship", "Jo'natish", 2), ("mon", "Monitoring", 3)]
LOST = ("#eb4d3d", 0)
# code, pipeline, name, kind, color, probability, rot_days, guide
STAGES = [
    ("new", "main", "Yangi", "open", "#3e88f7", 10, 1, "24 soat ichida bog'laning: qaysi remen, o'lcham, miqdor, muddat."),
    ("proc", "main", "Ishlovda", "open", "#2fb5e8", 20, 3, "Ehtiyojni aniqlang, tovarlarni qo'shing."),
    ("info", "main", "Ma'lumot berildi", "open", "#8fd3f4", 30, 5, "Narx va mavjudlik haqida ma'lumot yuborildi — javobni oling."),
    ("offer", "main", "Tijorat taklifi", "open", "#3ab5c9", 45, 7, "Tijorat taklifini yuboring va muhokama qiling."),
    ("contract", "main", "Shartnoma berildi", "open", "#2fd3a5", 70, 7, "Shartnoma imzolanishi va to'lovni kuzating."),
    ("paid", "main", "To'lov olindi / ishlab chiqarishda", "open", "#8fe3f4", 90, 14, "Ishlab chiqarishga bitim avtomatik ochildi."),
    ("shipped", "main", "Tovar jo'natildi", "open", "#f5a623", 95, 30, "Yopilish hujjatlari va qoldiq to'lovni tekshiring."),
    ("nostock", "main", "Tovar yetishmadi", "open", "#f0a3a3", 10, 14, "Tovar yo'qligi sababli kutilmoqda — kelganda xabar bering."),
    ("won", "main", "Bitim muvaffaqiyatli", "won", "#4ac158", 100, None, ""),
    ("lost", "main", "Bitim muvaffaqiyatsiz", "lost", *LOST, None, ""),
    ("lost_an", "main", "Sabab tahlili", "lost", "#d0021b", 0, None, ""),
    ("p_new", "prod", "Yangi", "open", "#3e88f7", None, 1, "Buyurtmani ishlab chiqarish rejasiga qo'ying."),
    ("p_work", "prod", "Ishda", "open", "#2fb5e8", None, 3, ""),
    ("p_hold", "prod", "Buyurtma kechiktirildi", "open", "#f8e58c", None, 7, "Sababini izohda yozing."),
    ("p_today", "prod", "Muddati BUGUN", "open", "#f5544a", None, 1, "Bugun tayyor bo'lishi kerak."),
    ("p_done", "prod", "Tayyor / qadoqlash", "open", "#5bd0d6", None, 2, ""),
    ("p_won", "prod", "Jo'natishga", "won", "#7ed321", None, None, ""),
    ("p_lost", "prod", "Muvaffaqiyatsiz", "lost", *LOST, None, ""),
    ("p_lost_an", "prod", "Sabab tahlili", "lost", "#d0021b", 0, None, ""),
    ("s_ready", "ship", "Jo'natishga tayyor", "open", "#3e88f7", None, 1, "Mijoz bilan jo'natish usuli va vaqtini kelishing."),
    ("s_partial", "ship", "Buyurtma to'liq emas", "open", "#f5544a", None, 3, ""),
    ("s_work", "ship", "Ishda", "open", "#7cc56f", None, 2, ""),
    ("s_nocall", "ship", "Qo'ng'iroq qilinmadi", "open", "#e5191e", None, 1, "Qayta qo'ng'iroq qiling."),
    ("s_pickup", "ship", "Olib ketadi", "open", "#fbf38c", None, 3, ""),
    ("s_delivery", "ship", "Yetkazib berish", "open", "#4be0c2", None, 3, ""),
    ("s_won", "ship", "Tovar jo'natildi", "won", "#7ed321", None, None, ""),
    ("s_lost", "ship", "Muvaffaqiyatsiz", "lost", *LOST, None, ""),
    ("s_lost_an", "ship", "Sabab tahlili", "lost", "#d0021b", 0, None, ""),
    ("m_new", "mon", "Yangi", "open", "#3e88f7", None, 3, "Mijozdan tovar va xizmat haqida fikr so'rang."),
    ("m_nocall", "mon", "Qo'ng'iroq qilinmadi", "open", "#e5191e", None, 1, ""),
    ("m_work", "mon", "Ishda", "open", "#4be0c2", None, 7, ""),
    ("m_month", "mon", "1 oylik monitoring", "open", "#16a7ef", None, 30, "Bir oydan keyin qayta qo'ng'iroq: remen qanday ishlayapti?"),
    ("m_problem", "mon", "Muammoli", "open", "#f5544a", None, 3, "Muammoni hal qiling yoki rahbarga yetkazing."),
    ("m_final", "mon", "Yakuniy hisobot", "open", "#f5a623", None, None, ""),
    ("m_won", "mon", "Muvaffaqiyatli", "won", "#7ed321", None, None, ""),
    ("m_lost", "mon", "Muvaffaqiyatsiz", "lost", *LOST, None, ""),
    ("m_lost_an", "mon", "Sabab tahlili", "lost", "#d0021b", 0, None, ""),
]
TUNNELS = [("paid", "p_new", "copy"), ("p_won", "s_ready", "copy"), ("s_won", "shipped", "root"), ("shipped", "m_new", "copy")]
# eski kod → yangi
REMAP = {"qual": "info", "agree": "contract", "pay": "paid", "dl_new": "new", "dl_contract": "contract", "dl_won": "won", "dl_lost": "lost"}


def forward(apps, schema_editor):
    Pipeline = apps.get_model("erp_crm", "Pipeline")
    Stage = apps.get_model("erp_crm", "Stage")
    Deal = apps.get_model("erp_crm", "Deal")
    StageHistory = apps.get_model("erp_crm", "StageHistory")
    Tunnel = apps.get_model("erp_crm", "Tunnel")
    for code, name, order in PIPELINES:
        Pipeline.objects.update_or_create(code=code, defaults={"name": name, "order": order})
    for i, (code, pipe, name, kind, color, prob, rot, guide) in enumerate(STAGES):
        Stage.objects.update_or_create(
            code=code,
            defaults={"pipeline_id": pipe, "name": name, "kind": kind, "color": color, "probability": prob, "rot_days": rot, "guide": guide, "order": i},
        )
    for old, new in REMAP.items():
        Deal.objects.filter(stage_id=old).update(stage_id=new)
        StageHistory.objects.filter(to_stage=old).update(to_stage=new)
        StageHistory.objects.filter(from_stage=old).update(from_stage=new)
    keep = {s[0] for s in STAGES}
    Stage.objects.exclude(code__in=keep).delete()
    Pipeline.objects.exclude(code__in=[p[0] for p in PIPELINES]).delete()
    for frm, to, action in TUNNELS:
        Tunnel.objects.get_or_create(from_stage_id=frm, to_stage_id=to, defaults={"action": action})


class Migration(migrations.Migration):
    dependencies = [("erp_crm", "0006_pipelines_fields")]
    operations = [migrations.RunPython(forward, migrations.RunPython.noop)]

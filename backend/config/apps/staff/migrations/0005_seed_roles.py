"""Boshlang'ich (tizim) rollari — Jarvis `erp.role_perm` asosida (seller, sales_head, accounting, warehouse, workshop,
marketplace, management). Ruxsatlarni keyin Xodimlar → Rollar oynasida o'zgartirish mumkin."""

from django.db import migrations

ROLES = [
    ("sotuvchi", "Sotuvchi", "O'z bitimlari, lidlari va mijozlari; savdo hujjatlari", ["crm", "tgcrm", "sales"]),
    (
        "sotuv_rahbari",
        "Sotuv rahbari",
        "Barcha bitim va lidlar, taqsimlash, mas'ul va reja",
        ["crm", "crm.head", "tgcrm", "sales"],
    ),
    ("buxgalter", "Buxgalter", "Buxgalteriya, katalog, savdo hujjatlari, kassa va bank", ["accounting", "sales", "money"]),
    ("omborchi", "Omborchi", "Ombor va jo'natmalar", ["warehouse", "logistics"]),
    ("sex_ustasi", "Sex ustasi", "Sex va ombordan material", ["manufacturing", "warehouse"]),
    ("logist", "Logist", "Jo'natmalar va ombor", ["logistics", "warehouse"]),
    ("marketplace", "Marketplace operatori", "WB, Ozon, Uzum buyurtmalari", ["marketplace"]),
    ("kadrlar", "Kadrlar", "Xodimlar ro'yxati", ["hr"]),
    (
        "rahbariyat",
        "Rahbariyat",
        "Barcha modullar (ko'rish va boshqarish)",
        ["crm", "crm.head", "tgcrm", "sales", "marketplace", "warehouse", "manufacturing", "logistics", "accounting", "money", "hr"],
    ),
]


def seed(apps, schema_editor):
    AccessRole = apps.get_model("staff", "AccessRole")
    for i, (key, name, note, perms) in enumerate(ROLES):
        AccessRole.objects.get_or_create(
            key=key, defaults={"name": name, "note": note, "perms": perms, "system": True, "position": i}
        )


class Migration(migrations.Migration):
    dependencies = [("staff", "0004_access_roles")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]

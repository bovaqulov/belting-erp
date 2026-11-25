"""Boshlang'ich shablon (Jarvis departments.yaml `report:` — sotuv_b2b «SOTUVCHI»): bazada shu bo'lim shabloni bo'lmasa."""

from django.db import migrations

SEED = {
    "sotuv_b2b": {
        "title": "SOTUVCHI",
        "ask_at": "18:00",
        "summary_at": "20:00",
        "fields": [
            {"key": "calls", "label": "📞 Qo'ng'iroqlar soni", "type": "number"},
            {"key": "offers", "label": "💼 Berilgan takliflar / Shartnoma (so'm)", "type": "money"},
            {"key": "sales", "label": "💰 Kunlik sotuv (so'm)", "type": "money"},
            {"key": "meetings", "label": "🤝 Uchrashuvlar soni", "type": "number"},
            {"key": "comment", "label": "💬 Komment", "type": "text"},
        ],
    }
}


def seed(apps, schema_editor):
    Template = apps.get_model("reports", "Template")
    for dept, t in SEED.items():
        if not Template.objects.filter(dept=dept).exists():
            Template.objects.create(dept=dept, version=1, status="active", **t)


class Migration(migrations.Migration):
    dependencies = [("reports", "0001_initial")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]

"""Mavjud kategoriyalarga texnik oila (attrs.family) — nomidan (0003 dagi qoidalar); bor bo'lsa — tegilmaydi.
Rukav nomli kategoriya — eni mm bo'yicha (dims=w) bo'lsa sleeve, aks holda (shlang) — other."""

from django.db import migrations

BY_NAME = [
    ("rukav", None),
    ("poliklin", "ribbed"),
    ("klin", "vbelt"),
    ("tishli", "timing"),
    ("konveyer lenta material", "light"),
    ("konveyer", "conveyor"),
    ("yassi", "flat"),
    ("modulli", "modular"),
    ("dumaloq", "round"),
    ("profil", "profile"),
    ("ulagich", "fastener"),
    ("val qoplama", "lagging"),
    ("shkiv", "pulley"),
    ("vtulka", "pulley"),
    ("xizmat", "service"),
    ("boshqa", "other"),
]


def fill(apps, schema_editor):
    Group = apps.get_model("erp_catalog", "Group")
    for g in Group.objects.all():
        a = dict(g.attrs or {})
        if a.get("family"):
            continue
        name = g.name.casefold()
        for word, fam in BY_NAME:
            if word in name:
                a["family"] = fam or ("sleeve" if a.get("dims") == "w" else "other")
                g.attrs = a
                g.save(update_fields=["attrs"])
                break


class Migration(migrations.Migration):
    dependencies = [("erp_catalog", "0003_spec_fill")]
    operations = [migrations.RunPython(fill, migrations.RunPython.noop)]

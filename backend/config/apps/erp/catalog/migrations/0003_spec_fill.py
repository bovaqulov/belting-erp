"""Eski atributlar → texnik oila va spec: `attrs.family` (timing / v / rib) + profil, uzunlik, Li/Lp, qovurg'a;
rukav (eni mm) — `sleeve`; qolganlar — kategoriya nomidan oila (ko'rsatkichsiz). Belgi va kalitni keyin `catalog_specs`
buyrug'i (nomdan ajratish bilan) to'ldiradi; bu yerda — mavjud `belt_mark` saqlanadi."""

from django.db import migrations

LEGACY = {"timing": "timing", "v": "vbelt", "rib": "ribbed"}
BY_GROUP = [
    ("rukav", None),  # rukav nomli kategoriyada shlang ham bo'lishi mumkin — faqat eni mm bo'lsa sleeve
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
]


def fill(apps, schema_editor):
    Item = apps.get_model("erp_catalog", "Item")
    for it in Item.objects.select_related("group").all():
        a = it.attrs or {}
        fam = ""
        spec = {}
        dims = a.get("dims")
        if a.get("profile") and a.get("length"):
            old = LEGACY.get(a.get("family") or "", "timing")
            fam = "sleeve" if old == "timing" and dims == "w" else old
            if fam in ("timing", "sleeve"):
                spec = {"profile": a["profile"], "length": a["length"]}
            elif fam == "vbelt":
                spec = {"section": a["profile"], "length": a["length"]}
                if a.get("lstd"):
                    spec["lref"] = a["lstd"][:1].upper() + a["lstd"][1:].lower()
            else:
                spec = {"profile": a["profile"], "length": a["length"]}
                if a.get("ribs"):
                    spec["ribs"] = a["ribs"]
        elif it.kind == "service":
            fam = "service"
        else:
            g = (it.group.name if it.group else "").casefold()
            for word, f in BY_GROUP:
                if word in g:
                    fam = f or ("sleeve" if dims == "w" else "other")
                    break
            fam = fam or "other"
        it.family = fam
        it.spec = spec
        it.designation = it.belt_mark or ""
        it.save(update_fields=["family", "spec", "designation"])


class Migration(migrations.Migration):
    dependencies = [("erp_catalog", "0002_spec")]
    operations = [migrations.RunPython(fill, migrations.RunPython.noop)]

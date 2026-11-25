"""Katalog API (docs/api/catalog.md) — frontend demo `src/erp/finance/demo/server.lib.ts` ssenariylari haqiqiy baza
ustida: kategoriyalar (2 daraja, takror, tavsiya, o'chirish), tovar (belgidan nom, takror, birlik qulfi), kengliklar,
rukavdan tayyor mahsulot, narx, qoldiq, ruxsatlar, ombor qidiruvi bilan moslik."""

from decimal import Decimal

import pytest

from config.apps.erp.catalog import naming
from config.apps.erp.catalog.models import Char, Group, Item
from config.apps.erp.warehouse import services as wh

pytestmark = pytest.mark.django_db
A = "/app/api/erp/cat"


def post(c, path, body=None):
    return c.post(path, body or {}, content_type="application/json")


def ok(r):
    assert r.status_code == 200, r.json()
    return r.json()


def err(r, status=400):
    assert r.status_code == status, r.json()
    return r.json()["detail"]


@pytest.fixture
def c(admin_client):
    return admin_client


@pytest.fixture
def remen(c):
    return ok(post(c, f"{A}/groups", {"name": "Remenlar", "attrs": {"kind": "goods", "belt": True}}))


# ------------------------------------------------------------------ nom va belgi (frontend lib bilan bir xil)
@pytest.mark.parametrize(
    ("profile", "length", "lstd", "ribs", "want"),
    [
        ("8M", 1040, "", None, "1040-8M"),
        ("XL", 210, "", None, "210XL"),
        ("B", "1450", "lp", None, "B-1450 Lp"),
        ("PK", 1795, "", 8, "8PK-1795"),
        ("8M", "1250,5", "", None, "1250.5-8M"),
        ("8M", "", "", None, ""),
    ],
)
def test_belt_mark(profile, length, lstd, ribs, want):
    assert naming.belt_mark(profile, length, lstd, ribs) == want


def test_auto_name():
    assert naming.auto_name(profile="8m", length=1040, brand="megadyne") == "1040-8M MEGADYNE"
    assert naming.auto_name(profile="8M", length=1040, brand="cnfulo", dims="w") == "Рукав 1040-8M CNFULO"
    assert naming.auto_name(profile="", length=1040) == ""


# ------------------------------------------------------------------ kategoriyalar
def test_groups_two_levels_and_dups(c, remen):
    sub = ok(post(c, f"{A}/groups", {"name": "Tishli", "parent_id": remen["id"]}))
    assert sub["parent_id"] == remen["id"]
    assert "2 daraja" in err(post(c, f"{A}/groups", {"name": "Ichki", "parent_id": sub["id"]}))
    assert "bor" in err(post(c, f"{A}/groups", {"name": "remenlar"}))  # katta-kichik harf farqsiz
    assert "noto'g'ri" in err(post(c, f"{A}/groups", {"name": "X", "attrs": {"dims": "zz"}}))
    rows = ok(c.get(f"{A}/groups"))
    assert [g["name"] for g in rows] == ["Remenlar", "Tishli"]  # avval asosiylar
    assert rows[0]["attrs"] == {"kind": "goods", "belt": True}


def test_seed_skips_existing(c):
    ok(post(c, f"{A}/groups", {"name": "Rukavlar"}))
    made = ok(post(c, f"{A}/groups/seed"))
    assert len(made) == 14 and "Rukavlar" not in [g["name"] for g in made]
    assert ok(post(c, f"{A}/groups/seed")) == []


def test_drop_group_only_empty(c, remen):
    it = ok(post(c, f"{A}/items", {"group_id": remen["id"], "profile": "8M", "length": 1040}))
    assert "avval" in err(post(c, f"{A}/groups/{remen['id']}/drop"))
    Item.objects.filter(pk=it["id"]).update(active=False)  # arxivdagi tovar o'chirishga xalaqit bermaydi
    assert ok(post(c, f"{A}/groups/{remen['id']}/drop")) == {"ok": True}
    assert not Group.objects.filter(pk=remen["id"]).exists()
    assert Item.objects.get(pk=it["id"]).group_id is None


# ------------------------------------------------------------------ tovarlar
def test_item_name_from_mark_and_dup(c, remen):
    it = ok(post(c, f"{A}/items", {"group_id": remen["id"], "profile": "8m", "length": "1040", "brand": "megadyne"}))
    assert it["name"] == "1040-8M MEGADYNE"
    assert it["belt_mark"] == "1040-8M"
    assert it["kind"] == "goods" and it["unit"] == "dona" and not it["measured"]
    assert it["family"] == "timing" and it["spec"] == {"profile": "8M", "length": 1040}
    assert "katalogda bor" in err(post(c, f"{A}/items", {"group_id": remen["id"], "name": "1040-8m megadyne"}))
    assert "nomi kerak" in err(post(c, f"{A}/items", {"group_id": remen["id"]}))
    assert "Kategoriyani" in err(post(c, f"{A}/items", {"name": "X"}))
    # qidiruv: belgi chiziqsiz ham topiladi; kategoriya ichkilari bilan
    assert [r["id"] for r in ok(c.get(f"{A}/items", {"q": "1040 8m"}))] == [it["id"]]
    assert ok(c.get(f"{A}/items", {"group_id": remen["id"]}))[0]["grp"] == "Remenlar"


def test_rukav_widths_products_price(c):
    ruk = ok(post(c, f"{A}/groups", {"name": "Rukavlar", "attrs": {"kind": "material", "dims": "w", "belt": True}}))
    tish = ok(post(c, f"{A}/groups", {"name": "Tishli", "attrs": {"kind": "product"}}))
    m = ok(post(c, f"{A}/items", {"group_id": ruk["id"], "profile": "8M", "length": 1040, "brand": "cnfulo"}))
    assert m["name"] == "Рукав 1040-8M CNFULO" and m["unit"] == "mm" and m["kind"] == "material"
    p = ok(post(c, f"{A}/items/{m['id']}/products", {"group_id": tish["id"], "widths": [20, "30", 20]}))
    assert p["name"] == "1040-8M CNFULO" and p["kind"] == "product" and p["unit"] == "dona"
    assert p["material"] == {"id": m["id"], "name": m["name"]}
    assert [ch["name"] for ch in p["chars"]] == ["20 mm", "30 mm"]
    # ikkinchi marta — o'sha mahsulotga kenglik qo'shiladi
    p2 = ok(post(c, f"{A}/items/{m['id']}/products", {"group_id": tish["id"], "widths": [25]}))
    assert p2["id"] == p["id"] and [ch["width_mm"] for ch in p2["chars"]] == [20, 25, 30]
    assert ok(c.get(f"{A}/items/{m['id']}"))["products"] == [{"id": p["id"], "name": p["name"]}]
    assert "rukavdan" in err(post(c, f"{A}/items/{p['id']}/products", {"group_id": tish["id"]}))
    assert "Kenglik" in err(post(c, f"{A}/items/{p['id']}/widths", {"widths": [0]}))
    assert "Kenglik" in err(post(c, f"{A}/items/{p['id']}/widths", {"widths": [6000]}))
    # narx: mm bo'yicha, qadam, kenglik bo'yicha qo'lda; bo'sh override o'chadi
    pr = ok(
        post(
            c,
            f"{A}/items/{p['id']}/price",
            {"mode": "mm", "price": "14 000", "step_mm": 5, "overrides": {"20": 250000, "25": ""}},
        )
    )
    assert pr["price"] == {"mode": "mm", "price": 14000, "step_mm": 5, "overrides": {"20": 250000}, "source": "manual"}
    assert "manfiy" in err(post(c, f"{A}/items/{p['id']}/price", {"price": -1}))
    # dona rejimida qadam saqlanmaydi
    assert (
        ok(post(c, f"{A}/items/{p['id']}/price", {"mode": "piece", "price": 9, "step_mm": 5}))["price"]["step_mm"]
        is None
    )


def test_stock_and_unit_lock(c, remen):
    lenta = ok(post(c, f"{A}/groups", {"name": "Lentalar", "attrs": {"dims": "l"}}))
    it = ok(post(c, f"{A}/items", {"group_id": lenta["id"], "name": "Лента EP-400/3"}))
    assert it["unit"] == "m" and it["measured"]
    wh.set_qty(it["id"], None, Decimal("12.5"))
    row = ok(c.get(f"{A}/items", {"q": "EP-400"}))[0]
    assert row["qty"] == 12.5 and row["units"] == 1
    d = ok(c.get(f"{A}/items/{it['id']}"))
    assert d["stock"][0]["qty"] == 12.5 and d["stock"][0]["firm"]
    # qoldig'i bor tovar birligi o'zgarmaydi (boshqa o'lcham turidagi kategoriyaga o'tkazilsa ham)
    assert "birligi" in err(post(c, f"{A}/items", {"id": it["id"], "group_id": remen["id"], "name": "Лента EP-400/3"}))
    # o'zgarmasa — tahrir mumkin
    assert (
        ok(post(c, f"{A}/items", {"id": it["id"], "group_id": lenta["id"], "name": "Лента EP-400/3", "sku": "EP400"}))[
            "sku"
        ]
        == "EP400"
    )


def test_detail_shape_for_warehouse(c, remen):
    """Ombor (Joylash) shu yo'llarni ishlatadi: CatItem {id, name, grp, kind, unit, measured, attrs.dims, chars}."""
    it = ok(post(c, f"{A}/items", {"group_id": remen["id"], "name": "Rukav PU", "dims": "w", "widths": [10]}))
    d = ok(c.get(f"{A}/items/{it['id']}"))
    assert {"id", "name", "grp", "kind", "unit", "measured", "attrs", "chars"} <= d.keys()
    assert d["attrs"]["dims"] == "w" and d["chars"][0]["name"] == "10 mm"
    assert ok(c.get(f"{A}/items", {"q": "remenlar"}))[0]["id"] == it["id"]  # kategoriya nomi bo'yicha ham
    assert err(c.get(f"{A}/items/999999"), 404) == "Tovar topilmadi"


def test_labels_link(c, remen):
    it = ok(post(c, f"{A}/items", {"group_id": remen["id"], "name": "Shkiv"}))
    assert "stikerli" in err(post(c, "/app/api/erp/labels/link", {"item_id": it["id"]}))
    assert err(post(c, "/app/api/erp/labels/link", {"item_id": 999999}), 404) == "Tovar topilmadi"


# ------------------------------------------------------------------ ruxsatlar
@pytest.fixture
def depts2(depts):
    from config.apps.jarvis.models import Agent

    lead = depts["rahbariyat"]
    for key, name in (("buxgalteriya", "Buxgalteriya"), ("ombor", "Ombor")):
        depts[key] = Agent.objects.create(key=key, kind="dept", name=name, persona="p" * 25, parent=lead)
    return depts


def test_permissions(client, make_user, depts2):
    client.force_login(make_user(10, "employee", depts2["ombor"]))
    assert ok(client.get(f"{A}/groups")) == []  # ombor — o'qiydi
    assert err(post(client, f"{A}/groups", {"name": "X"}), 403).startswith("Ruxsat yo'q")
    assert err(post(client, f"{A}/groups/seed"), 403).startswith("Ruxsat yo'q")
    client.force_login(make_user(11, "employee"))  # bo'limsiz — hech narsa
    assert err(client.get(f"{A}/items"), 403).startswith("Ruxsat yo'q")
    client.force_login(make_user(12, "employee", depts2["buxgalteriya"]))
    assert ok(post(client, f"{A}/groups", {"name": "X"}))["name"] == "X"
    assert Char.objects.count() == 0

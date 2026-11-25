"""Katalog API — texnik oilalar: spec bilan saqlash (belgi, nom, ruscha to'liq nom, remen belgisi), tekshiruv xatosi,
takror (bir xil belgi + brend) va analog (boshqa brend, mos profil), jonli ko'rinish, takrorlar ro'yxati, brendlar,
filtr, eski so'rov shakli, kodlar (shtrixkod, TIF TN)."""

import pytest

pytestmark = pytest.mark.django_db
A = "/app/api/erp/cat"


def post(c, path, body=None):
    return c.post(path, body or {}, content_type="application/json")


def ok(r):
    assert r.status_code == 200, r.json()
    return r.json()


@pytest.fixture
def c(admin_client):
    return admin_client


@pytest.fixture
def groups(c):
    ok(post(c, f"{A}/groups/seed"))
    return {g["name"]: g["id"] for g in ok(c.get(f"{A}/groups"))}


def item(c, groups, grp, family, spec, brand="", **kw):
    return post(c, f"{A}/items", {"group_id": groups[grp], "family": family, "spec": spec, "brand": brand, **kw})


def test_save_with_spec(c, groups):
    it = ok(item(c, groups, "Tishli remenlar", "timing", {"profile": "8m", "length": "1040", "width": 30}, "novobelt"))
    assert it["name"] == "1040-8M-30 NOVOBELT" and it["name_ru"] == "Зубчатый ремень 1040-8M-30 NOVOBELT"
    assert it["designation"] == it["belt_mark"] == "1040-8M-30" and it["family"] == "timing"
    assert it["kind"] == "product" and it["unit"] == "dona"  # kategoriya odatiy qiymati
    assert {x["label"]: x["value"] for x in it["computed"]}["Tishlar soni"] == "130"
    assert it["hs_hint"] == "4010.35" and it["hs_code"] is None
    assert [x["label"] for x in it["spec_view"]] == ["Profil", "Uzunlik", "Eni"]
    assert it["std"].startswith("ISO 5296")
    conv = ok(
        item(
            c,
            groups,
            "Konveyer lentalar",
            "conveyor",
            {"carcass": "EP", "strength": 400, "plies": 3, "top": 4, "bottom": 2, "grade": "Y"},
        )
    )
    assert conv["name"] == "EP 400/3 4+2 Y" and conv["unit"] == "m2" and conv["belt_mark"] is None
    bad = post(c, f"{A}/items", {"group_id": groups["Klinli remenlar"], "family": "vbelt", "spec": {"length": 1650}})
    assert bad.status_code == 400 and bad.json()["detail"] == "Kesim kerak"


def test_duplicate_and_analogs(c, groups):
    a = ok(item(c, groups, "Tishli remenlar", "timing", {"profile": "8M", "length": 1040}, "NOVOBELT"))
    r = item(c, groups, "Tishli remenlar", "timing", {"profile": "8M", "length": 1040}, "novobelt", name="Boshqa nom")
    assert r.status_code == 400 and "bir xil belgi va brend" in r.json()["detail"]
    b = ok(item(c, groups, "Tishli remenlar", "timing", {"profile": "RPP8", "length": 1040}, "MEGADYNE"))
    assert [x["id"] for x in ok(c.get(f"{A}/items/{a['id']}"))["analogs"]] == [b["id"]]
    pv = ok(
        post(c, f"{A}/preview", {"family": "timing", "spec": {"profile": "8M", "length": 1040}, "brand": "novobelt"})
    )
    assert pv["designation"] == "1040-8M" and pv["dup"] == {"id": a["id"], "name": a["name"]}
    assert {x["id"] for x in pv["analogs"]} == {a["id"], b["id"]}
    pv = ok(post(c, f"{A}/preview", {"family": "timing", "spec": {"profile": "8M"}}))
    assert pv["errors"] == {"length": "Uzunlik kerak (ochiq rulondan tashqari)"} and pv["designation"] is None
    assert ok(post(c, f"{A}/preview", {"family": "x"}))["errors"] == {"family": "Texnik oilani tanlang"}
    # o'zini tahrirlash — takror emas; faqat nom o'zgarsa texnik qism saqlanadi
    e = ok(
        post(
            c,
            f"{A}/items",
            {"id": a["id"], "group_id": groups["Tishli remenlar"], "name": "1040-8M NB", "brand": "NOVOBELT"},
        )
    )
    assert e["spec"] == {"profile": "8M", "length": 1040} and e["name"] == "1040-8M NB"


def test_duplicates_report_filters_brands(c, groups):
    from config.apps.erp.catalog.models import Item

    a = ok(
        item(
            c,
            groups,
            "Klinli remenlar",
            "vbelt",
            {"section": "SPB", "length": 1650, "lref": "Lp"},
            "PIX",
            sku="SPB1650",
        )
    )
    b = ok(
        item(
            c,
            groups,
            "Klinli remenlar",
            "vbelt",
            {"section": "SPB", "length": 1650, "lref": "Ld"},
            "PIX",
            sku="spb1650",
        )
    )
    Item.objects.filter(pk=b["id"]).update(match_key=Item.objects.get(pk=a["id"]).match_key)  # import'dan qolgan takror
    rep = ok(c.get(f"{A}/duplicates"))
    assert len(rep) == 1 and {x["id"] for x in rep[0]["items"]} == {a["id"], b["id"]}
    assert ok(c.get(f"{A}/brands")) == ["PIX"]
    ok(item(c, groups, "Poliklinli remenlar", "ribbed", {"profile": "PK", "ribs": 8, "length": 1795}, "GATES"))
    rows = ok(c.get(f"{A}/items", {"family": "ribbed"}))
    assert [r["designation"] for r in rows] == ["8PK-1795"] and rows[0]["family"] == "ribbed"
    assert {r["brand"] for r in ok(c.get(f"{A}/items", {"brand": "pix"}))} == {"PIX"}
    assert [r["id"] for r in ok(c.get(f"{A}/items", {"q": "spb-1650 lp"}))] == [a["id"]]


def test_legacy_payload_and_codes(c, groups):
    it = ok(
        post(
            c,
            f"{A}/items",
            {"group_id": groups["Klinli remenlar"], "profile": "spb", "length": 1650, "lstd": "lp", "brand": "pix"},
        )
    )
    assert it["family"] == "vbelt" and it["spec"] == {"section": "SPB", "length": 1650, "lref": "Lp"}
    assert it["name"] == "SPB-1650 Lp PIX"
    e = ok(
        post(
            c,
            f"{A}/items",
            {
                "id": it["id"],
                "group_id": groups["Klinli remenlar"],
                "barcode": "4780100000059",
                "hs_code": "4010 32",
                "ikpu": "04010001001000000",
            },
        )
    )
    assert e["barcode"] == "4780100000059" and e["hs_code"] == "401032" and e["ikpu"] == "04010001001000000"
    from config.apps.erp.catalog import services

    assert services.by_code("4780100000059")[0]["id"] == it["id"]  # ombor skaneri — o'sha shtrixkod

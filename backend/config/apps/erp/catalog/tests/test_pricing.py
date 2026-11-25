"""Narx siyosati (AppSheet): formula (AppSheet'dagi haqiqiy qiymatlar), kurs/qat'iyni o'rganish, Li/Lp tuzatish, jonli
ustun, katalog bilan bog'lash (moslik sinfi, uzunlik tizimi, brend, seriya), narx tartibi (qo'lda eni → AppSheet →
qo'lda), maxfiylik (tannarx faqat rahbariyatga), API ruxsatlari, jonli sinxron (soxta AppSheet)."""

from decimal import Decimal

import pytest

from config.apps.erp.catalog import pricing as R
from config.apps.erp.catalog.models import Char, Group, Item, PriceSource

pytestmark = pytest.mark.django_db
A = "/app/api/erp/cat"


def post(c, path, body=None):
    return c.post(path, body or {}, content_type="application/json")


def test_formula_matches_appsheet():
    pol = R.policy()  # kurs 13 500, qat'iy 2 000, yaxlitlash 1 000
    assert R.formula_price(pol, 0.07, 200, 20) == 59000  # «600 8M NOVOBELT», eni 20 — AppSheet 59 000
    assert R.formula_price(pol, 0.37, 30, 40) == 262000  # «430 H MEGADYNE», eni 40 — AppSheet 262 000
    assert R.formula_price(pol, 0.63, 50, 20) == 258000  # «1424 SLV8 MEGASYNC», eni 20 — AppSheet 258 000
    assert R.with_vat(pol, 59000) == 66080


def test_learn_live_and_lens():
    rows = [
        {
            "Goods/Sleeve": "Рукав",
            "Cost_per_mm": "0,07",
            "width": "20",
            "Net_cost_belt": "18900",
            "Margin": "200",
            "Selling_price": "59000",
        },
        {
            "Goods/Sleeve": "Рукав",
            "Cost_per_mm": "0,08",
            "width": "20",
            "Net_cost_belt": "21600",
            "Margin": "200",
            "Selling_price": "67000",
        },
        {"Goods/Sleeve": "Товар", "Net_cost_belt": "1"},
    ]
    assert R.learn(rows) == (13500, 2000)
    assert R.learn([]) is None
    r = {
        "Selling_price": "562000",
        "Selling_price_virtual": "584000",
        "Selling_price_VAT_virtual": "654080",
        "Net_cost_belt_virtual": "1",
    }
    assert R.prices(r)[:2] == (584000, 654080)  # jonli ustun (saqlangani eski kursda)
    assert R.norm_lens(1700, 1670) == (1700, 1730)  # Li-standart qatoridagi Lp ishorasi xatosi
    assert R.norm_lens(1570, 1600) == (1570, 1600)


@pytest.fixture
def cat():
    g = Group.objects.create(name="Remenlar")

    def item(name, family, spec, brand="", **kw):
        return Item.objects.create(group=g, name=name, family=family, spec=spec, brand=brand, **kw)

    def src(ext, mark, name, sleeve, family, spec, brand, **kw):
        return PriceSource.objects.create(
            src="t" if family in ("timing", "sleeve") else "v",
            ext_id=ext,
            mark=mark,
            name=name,
            sleeve=sleeve,
            family=family,
            spec=spec,
            brand=brand,
            **kw,
        )

    s_sleeve = src(
        "1",
        "1040 8M",
        "1040 8M 8M NOVOBELT",
        "Рукав",
        "timing",
        {"profile": "8M", "length": 1040},
        "NOVOBELT",
        cost_unit=0.07,
        margin=200,
        width=20,
        price=59000,
    )
    s_basic = src(
        "2",
        "A 650 Lp MEGADYNE BASIC",
        "Клиновой ремень A 650 Lp MEGADYNE BASIC",
        "Товар",
        "vbelt",
        {"section": "A", "length": 650},
        "MEGADYNE",
        li=620,
        lp=650,
        la=670,
        price=10000,
        price_vat=11200,
    )
    s_oleo = src(
        "3",
        "A 620",
        "Клиновой ремень A 620 Li MEGADYNE OLEOSTATIC",
        "Товар",
        "vbelt",
        {"section": "A", "length": 620},
        "MEGADYNE",
        li=620,
        lp=650,
        la=670,
        price=15000,
        price_vat=16800,
    )
    s_rib = src(
        "4",
        "PJ 610",
        "Поликлиновой ремень PJ 610 Le NOVOBELT",
        "Рукав",
        "ribbed",
        {"profile": "PJ", "length": 610},
        "NOVOBELT",
        cost_unit=0.05,
        margin=40,
        price=608000,
    )
    items = {
        "rpp": item("1040-RPP8 NOVOBELT", "timing", {"profile": "RPP8", "length": 1040}, "NOVOBELT"),
        "sleeve": item("Рукав 1040-8M NOVOBELT", "sleeve", {"profile": "8M", "length": 1040}, "NOVOBELT", unit="mm"),
        "w30": item("1040-8M-30 NOVOBELT", "timing", {"profile": "8M", "length": 1040, "width": 30}, "NOVOBELT"),
        "basic": item("A-650 Lp MEGADYNE BASIC", "vbelt", {"section": "A", "length": 650, "lref": "Lp"}, "MEGADYNE"),
        "oleo": item("A-650 MEGADYNE OLEOSTATIC", "vbelt", {"section": "A", "length": 650}, "MEGADYNE"),
        "li": item("A-620 Li PIX", "vbelt", {"section": "A", "length": 620, "lref": "Li"}, "PIX"),
        "rib": item("10PJ-610 NOVOBELT", "ribbed", {"profile": "PJ", "ribs": 10, "length": 610}, "NOVOBELT"),
        "other": item("Клей", "other", {}),
    }
    Char.objects.create(item=items["rpp"], name="20 mm", width_mm=20)
    R.link()
    for it in items.values():
        it.refresh_from_db()
    return items, {"sleeve": s_sleeve, "basic": s_basic, "oleo": s_oleo, "rib": s_rib}


def test_link_and_price(cat):
    it, s = cat
    assert it["rpp"].price_src == s["sleeve"] and it["sleeve"].price_src == s["sleeve"]  # 8M ≡ RPP8; rukav ham
    assert it["basic"].price_src == s["basic"]
    assert it["oleo"].price_src == s["oleo"]  # bir xil Lp 650 — seriya (OLEOSTATIC) bo'yicha
    assert it["li"].price_src is None  # PIX — AppSheet'da yo'q
    assert it["rib"].price_src == s["rib"] and it["other"].price_src is None
    ch = Char.objects.get(item=it["rpp"])
    assert R.price_of(it["rpp"], ch) == Decimal(59000)  # eni 20 (variant) — formula
    assert R.price_of(it["rpp"]) is None  # eni noma'lum — narx yo'q
    assert R.price_of(it["w30"]) == Decimal(R.formula_price(R.policy(), 0.07, 200, 30))
    assert R.price_of(it["basic"]) == Decimal(10000)
    assert R.price_of(it["rib"]) == Decimal(R.formula_price(R.policy(), 0.05, 40, 10))  # 10 qovurg'a
    # tartib: kenglik bo'yicha qo'lda → AppSheet; «manual» — qo'lda narx ustun
    it["rpp"].price = {"mode": "piece", "price": 1, "overrides": {"20": 70000}}
    assert R.price_of(it["rpp"], ch) == Decimal(70000)
    it["basic"].price = {"mode": "piece", "price": 9000, "overrides": {}, "source": "manual"}
    assert R.price_of(it["basic"]) == Decimal(9000)


def test_info_hides_cost(cat):
    it, _ = cat
    seller = R.info(it["rpp"], cost_ok=False)
    assert seller["source"] == "appsheet" and seller["rows"] == [
        {"label": "20 mm", "width": 20, "price": 59000, "price_vat": 66080}
    ]
    assert "cost" not in seller["linked"]
    lead = R.info(it["rpp"], cost_ok=True)
    assert lead["linked"]["cost"]["margin"] == 200 and lead["linked"]["cost"]["unit"] == "1 mm eni"
    sl = R.info(it["sleeve"], cost_ok=False)  # rukavning o'zi — standart eni (10 mm) uchun
    assert sl["rows"][0]["label"] == "10 mm (standart eni)"
    assert R.quote_width(it["sleeve"], 25) == {
        "price": R.formula_price(R.policy(), 0.07, 200, 25),
        "price_vat": R.with_vat(R.policy(), R.formula_price(R.policy(), 0.07, 200, 25)),
    }


def test_api_permissions(cat, client, make_user, depts):
    it, _ = cat
    acc = make_user(301, "employee", depts["it"])
    lead = make_user(302, "employee", depts["rahbariyat"])
    from unittest.mock import patch

    with patch("config.apps.staff.models.User.modules", return_value=["accounting"]):
        client.force_login(acc)
        p = client.get(f"{A}/pricing").json()
        assert "usd_rate" not in p and p["can_edit"] is False and p["sources"] == 4
        assert post(client, f"{A}/pricing", {"vat_pct": 15}).status_code == 403
        d = client.get(f"{A}/items/{it['rpp'].pk}").json()
        assert d["pricing"]["source"] == "appsheet" and "cost" not in d["pricing"]["linked"]
        assert client.get(f"{A}/items/{it['sleeve'].pk}/quote", {"width": 25}).json()["price"] > 0
        assert client.get(f"{A}/items/{it['sleeve'].pk}/quote", {"width": 0}).status_code == 400
        rows = client.get(f"{A}/items", {"q": "1040-RPP8"}).json()
        assert rows[0]["price_from"] == "appsheet" and rows[0]["price_by"] == "width"
        assert {r["mark"] for r in client.get(f"{A}/pricing/unmatched").json()} == set()
        client.force_login(lead)
        assert client.get(f"{A}/items/{it['rpp'].pk}").json()["pricing"]["linked"]["cost"]["margin"] == 200
        p = post(client, f"{A}/pricing", {"usd_rate": "12 800", "max_disc_seller": 5}).json()
        assert p["usd_rate"] == 12800 and p["learn"] is False and p["max_disc_seller"] == 5
        assert post(client, f"{A}/pricing", {"vat_pct": 150}).status_code == 400
        assert post(client, f"{A}/pricing/sync").status_code == 400  # kalitlar yo'q


def test_sync_live(cat, monkeypatch):
    monkeypatch.setenv("APPSHEET_VBELT_APP_ID", "a")
    monkeypatch.setenv("APPSHEET_VBELT_KEY", "k")
    monkeypatch.setenv("APPSHEET_VBELT_TABLE", "V")
    rows = [
        {
            "v-belts_id": "x1",
            "mark": "SPB 1650 Lp",
            "mark_name": "Клиновой ремень SPB 1650 Lp (Ld, Lw) PIX X'set",
            "Goods/Sleeve": "Товар",
            "Li": "1620",
            "Lp": "1650",
            "La": "1670",
            "Selling_price": "185000",
            "Selling_price_VAT": "207200",
            "Net_cost_belt": "120000",
            "Margin": "30",
            "Country_Origin": "Индия",
        },
    ]

    class Resp:
        def raise_for_status(self):
            return None

        def json(self):
            return rows

    monkeypatch.setattr("httpx.post", lambda *a, **k: Resp())
    g = Group.objects.first()
    spb = Item.objects.create(
        group=g,
        name="SPB-1650 Lp PIX",
        family="vbelt",
        spec={"section": "SPB", "length": 1650, "lref": "Lp"},
        brand="PIX",
    )
    st = R.sync_live()
    assert st["rows"] == 1 and PriceSource.objects.filter(src="v").count() == 1  # eski «v» qatorlari almashtirildi
    spb.refresh_from_db()
    assert spb.price_src is not None and spb.price_src.mark == "SPB 1650 Lp" and R.price_of(spb) == Decimal(185000)
    assert "AppSheet: 1 qator" in R.policy().sync_note and not R.stale()

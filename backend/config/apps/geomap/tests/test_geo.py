"""Jarvis tests/geomap/test_geomap.py (sof testlar): manzil tahlili, hududlar algoritmi, marshrut zaxirasi, kirish imzosi, ulashish paroli."""

from __future__ import annotations

import asyncio

import pytest

from config.apps.geomap.geo import services, territory
from config.apps.geomap.geo.geo import bounds, haversine, jitter, region_from_text, region_key, skeleton
from config.apps.geomap.geo.geocode import _clean
from config.apps.geomap.geo.names import name_key
from config.apps.geomap.sync import status_of


@pytest.mark.parametrize(
    "text,region,district",
    [
        ("АХМАД ЯССАВИЙТАШКЕНТСКАЯ ОБЛАСТЬ, ЗАНГИАТИНСКИЙ", "toshkent_v", "Zangiata"),
        ("Фергана вил., Кувасай шахри", "fargona", "Kuvasay city"),
        ("Andijon viloyati Asaka tumani", "andijon", "Asaka"),
        ("Сурхандарьинская обл., Денауский р-н", "surxondaryo", "Denau"),
        ("ГОРОД ТАШКЕНТ, МИРАБАДСКИЙ РАЙОН, FARG`ONA YO`LI, 12", "toshkent", "Mirabad"),
        ("Toshkent shahri, Yashnobod tumani Al-Buhoriy MFY", "toshkent", "Yashnobod"),
        ("Samarqand sh., Toshkent ko'chasi 5", "samarqand", "Samarkand city"),
        ("Farg'ona viloyati", "fargona", None),  # faqat viloyat — tuman taxmin qilinmaydi
        ("TAFAKKUR", None, None),
    ],
)
def test_address_parsing(text, region, district):
    b = bounds()
    r = region_from_text(text)
    assert r == region
    d = b.district_from_text(text, r)
    assert (b.districts[d]["name"] if d else None) == district


def test_boundaries_complete():
    b = bounds()
    assert len(b.regions) == 14 and len(b.districts) == 199
    tash = {d["name"] for d in b.districts.values() if d["region"] == "toshkent"}
    assert {"Yunusabad", "Mirabad", "Chilanzar", "Yashnobod"} <= tash
    assert b.region_at(39.654, 66.975) == "samarqand"  # Registon
    assert b.region_at(41.311, 69.279) == "toshkent"


def test_region_key_and_skeleton():
    assert region_key("Farg’ona viloyati") == "fargona"
    assert region_key("Toshkent") == "toshkent" and region_key("Toshkent viloyati") == "toshkent_v"
    assert region_key("Qozog'iston") == "xorij:kz" and region_key(None) is None
    assert skeleton("Zangiata") == skeleton("ЗАНГИАТА") == skeleton("Zangiota")


def test_clean_address():
    assert _clean("100015, U.NOSIR KO`CHASI, 12-UY, 5-XONADON") == "U.NOSIR KO'CHASI, 12"


def test_name_key_and_status():
    assert name_key('"ALMERRO GROUP" MCHJ') == name_key("ООО ALMERRO GROUP") == name_key("almerro group")
    assert name_key("ООО «Мега Текс»") == name_key("MEGA TEKS MChJ")
    assert status_of(None, 0) == "xaridsiz" and status_of(None, 2) == "yangi"
    from datetime import date, timedelta

    assert status_of(date.today() - timedelta(days=10), 0) == "faol"
    assert status_of(date.today() - timedelta(days=200), 0) == "sust"
    assert status_of(date.today() - timedelta(days=500), 0) == "yo'qotilgan"


def test_jitter_stable_and_close():
    a = jitter("crm:1", 41.3, 69.2, 1500)
    assert a == jitter("crm:1", 41.3, 69.2, 1500) != jitter("crm:2", 41.3, 69.2, 1500)
    assert 400 < haversine((41.3, 69.2), a) <= 1500


def test_auto_territories_balanced_and_complete():
    b = bounds()
    ids = [d for d, x in b.districts.items() if x["region"] in ("samarqand", "buxoro", "navoiy")]
    weights = {d: 1.0 + (i % 5) for i, d in enumerate(ids)}
    res = territory.auto(weights, 3)
    assert len(res) == 3
    assert sorted(d for t in res for d in t["districts"]) == sorted(ids)  # har tuman aynan bir hududda
    assert all(80 <= t["pct"] <= 120 for t in res)


def test_auto_hex_balanced_by_value():
    import random

    rnd = random.Random(7)
    pts = [(41.2 + rnd.random() * 0.3, 69.1 + rnd.random() * 0.4, float(rnd.choice([1, 1, 1, 50]))) for _ in range(400)]
    pts += [(39.6 + rnd.random() * 0.2, 66.9 + rnd.random() * 0.2, 1.0) for _ in range(80)]
    res = territory.auto_hex(pts, 4)
    assert len(res) == 4 and abs(sum(t["total"] for t in res) - sum(p[2] for p in pts)) < 1e-6
    assert max(t["pct"] for t in res) < 130


def test_local_route_visits_all_once():
    pts = [(41.31, 69.28), (41.35, 69.30), (41.29, 69.20), (41.33, 69.25), (41.30, 69.35)]
    r = services._local_route(pts, roundtrip=True)
    assert r["order"][0] == 0 and sorted(r["order"]) == list(range(5))
    assert r["geometry"]["coordinates"][0] == r["geometry"]["coordinates"][-1]
    with pytest.raises(services.ServiceError):
        asyncio.run(services.optimize_route([(41.3, 69.2)]))


def test_share_password_hash():
    from config.apps.geomap.views import pw_hash

    h = pw_hash("abc")
    salt = h.split("$", 1)[0]
    assert pw_hash("abc", salt) == h and pw_hash("abd", salt) != h


ORGINFO_CARD = """
<div class="mb-3"><div>
 <a href="/uz/organization/180defa9b70b/" class="text-decoration-none og-card" role="button">
 <div class="card"><div class="d-flex"><p>
 <span class="bg-success bg-opacity-25 text-success px-2 py-1 rounded-5">302114274</span></p></div>
 <div class="card-body pt-0"><h6 class="card-title">
 &quot;ALMERRO GROUP&quot; mas`uliyati cheklangan jamiyati
 </h6>
 <p class="text-body-tertiary mb-0">
 <img src="/static/assets/img/location.svg" alt="location">
 Toshkent shahri, Yunusobod tumani
 Yangi Yunusobod ko&#x27;chasi, 7A-uy
 </p></div></div></a></div></div>
"""


def test_orginfo_parse_card():
    from config.apps.geomap.geo.orginfo import parse_cards

    (c,) = parse_cards(ORGINFO_CARD)
    assert c["inn"] == "302114274" and c["url"].endswith("/uz/organization/180defa9b70b/")
    assert c["name"] == '"ALMERRO GROUP" mas`uliyati cheklangan jamiyati'
    assert c["locality"] == "Toshkent shahri, Yunusobod tumani" and c["street"] == "Yangi Yunusobod ko'chasi, 7A-uy"


def test_name_key_strict_legal_forms():
    assert (
        name_key('"ALMERRO GROUP" mas`uliyati cheklangan jamiyati')
        == name_key('"ALMERRO GROUP" MCHJ')
        == "almerro group"
    )
    assert name_key('"ALMARO GROUP" масъулияти чекланган жамияти') == "almaro group"
    assert name_key("SARRUNA TEXTILE") != name_key('"SARRUNA TEXTILES" маъсулияти чекланган жамият')  # taxmin yo'q
    assert name_key('"MOHINA SABRINA TEKSTILE" xususiy korxonasi') == "mohina sabrina tekstile"


@pytest.mark.django_db
def test_orginfo_by_name_requires_unique_exact(monkeypatch):
    from config.apps.geomap.geo import orginfo

    saved = {}
    monkeypatch.setattr(orginfo, "_cached", lambda k: None)
    monkeypatch.setattr(orginfo, "_remember", lambda k, c, note="": saved.update({k: c}))
    cards = [
        {
            "inn": "1",
            "name": '"BISKO MILK" mas`uliyati cheklangan jamiyati',
            "locality": "Namangan viloyati, Namangan sh.",
            "street": "",
            "url": "u1",
        },
        {"inn": "2", "name": '"BISKO MILKY" MCHJ', "locality": "Toshkent shahri", "street": "", "url": "u2"},
    ]

    async def fake(q):
        return cards

    monkeypatch.setattr(orginfo, "search", fake)
    hit = asyncio.run(orginfo.by_name("BISKO MILK", None))
    assert hit is not None and hit["inn"] == "1"
    assert asyncio.run(orginfo.by_name("BISKO MILK", "samarqand")) is None  # viloyat mos emas
    cards.append({**cards[0], "inn": "3"})  # ikki xil firma bir xil nomda
    assert asyncio.run(orginfo.by_name("BISKO MILK", None)) is None


def test_foreign_clients_placed():
    from config.apps.geomap.geo.geo import foreign_from_text
    from config.apps.geomap.geo.geocode import locate

    run = lambda *a, **k: asyncio.run(locate(*a, use_network=False, **k))
    shym = run("crm:1", None, "xorij:kz", name="SHIMKENT BOYTERAK")
    assert shym["quality"] == "district" and abs(shym["lat"] - 42.317) < 0.1 and shym["region"] == "xorij:kz"
    cap = run("crm:2", None, "xorij:tj", name="GAYUR PACK")
    assert cap["quality"] == "region" and abs(cap["lat"] - 38.56) < 0.2  # poytaxt, taxminiy
    assert run("crm:3", "ТАДЖИКИСТАН,САГДИЙЕСКАЯ ОБЛ.", None)["region"] == "xorij:tj"
    assert run("crm:4", None, None, name="MIX CLASSIC - TADJIKISTAN")["region"] == "xorij:tj"
    # o'zbek kompaniyasi xorijga tushmasin
    assert foreign_from_text("MAZALI OSH", cities=False) is None
    assert run("crm:5", "Toshkent sh., Yunusobod tumani", None)["region"] == "toshkent"

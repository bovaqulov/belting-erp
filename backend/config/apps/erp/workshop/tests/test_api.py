"""Sex API (/app/api/erp/shop/*): taxta, rukavdan kesish, lenta (giliotina), majburiy «material olindi», guruh sarfi,
tayyor → omborga, stiker; to'liq zanjir: CRM bitimi → sex → «Tayyor» → ombor yig'ish → jo'natish → «Jo'natildi»."""

from decimal import Decimal

import pytest

from config.apps.erp.crm.tests.test_api import C, as_
from config.apps.erp.warehouse import services as warehouse
from config.apps.erp.warehouse.models import Pick, Unit
from config.apps.erp.workshop import demo, shop
from config.apps.erp.workshop.models import Job

pytestmark = pytest.mark.django_db
S = "/app/api/erp/shop"
A = "/app/api/erp"


@pytest.fixture
def seed(db):
    return demo.seed()


@pytest.fixture
def c(admin_client, seed):
    return admin_client


def post(c, path, body=None):
    return c.post(path, body or {}, content_type="application/json")


def code_id(code):
    return Unit.objects.get(code=code).pk


def job_by(order):
    return Job.objects.get(order_number=order)


def test_board_columns_and_late(c, seed):
    b = c.get(f"{S}/board").json()["cols"]
    assert {k: len(v) for k, v in b.items()} == {"new": 3, "collecting": 0, "making": 0, "ready": 0}
    late = next(j for j in b["new"] if j["order_number"] == "BR-26-0099")
    assert late["late"] and late["route"] == "rukav" and late["qty"] == "25" and late["size"] == "25 mm"
    conv = next(j for j in b["new"] if j["order_number"] == "BR-26-0102")
    assert conv["route"] == "lenta" and conv["size"] == "650 × 2500 mm" and conv["left"] == "1.82"  # 650 × 2800


def test_rukav_flow_accept_take_collected_ready(c, seed):
    j = job_by("BR-26-0101")  # 2 × 50 mm rukavdan
    d = c.get(f"{S}/jobs/{j.pk}").json()
    assert d["plan"][0]["qty"] == "100" and d["plan"][0]["unit"] == "mm" and d["plan"][0]["candidates"]
    assert post(c, f"{S}/jobs/{j.pk}/accept").status_code == 200
    assert post(c, f"{S}/jobs/{j.pk}/accept").status_code == 400  # ikkinchi marta
    r = post(c, f"{S}/jobs/{j.pk}/take", {"batch_id": code_id("P00000107"), "qty": "100"})  # 150 mm rukav
    assert r.status_code == 200, r.json()
    assert Unit.objects.get(code="P00000107").width_mm == 50  # 50 mm qoldi, o'z stikeri bilan
    d = c.get(f"{S}/jobs/{j.pk}").json()
    assert d["plan"][0]["left"] == "0" and d["taken"][0]["code"] == "P00000107" and d["worker"]
    assert post(c, f"{S}/jobs/{j.pk}/collected").status_code == 200
    r = post(c, f"{S}/jobs/{j.pk}/ready").json()
    assert c.get(r["sticker"]["url"]).content[:4] == b"%PDF"
    j.refresh_from_db()
    assert j.phase == "ready" and j.product_code.startswith("P")
    assert warehouse.stock_of(j.item_id) == 2  # 2 dona remen omborda
    assert c.get(f"{S}/board").json()["cols"]["ready"][0]["id"] == j.pk


def test_wrong_material_is_400(c, seed):
    j = job_by("BR-26-0101")
    r = post(c, f"{S}/jobs/{j.pk}/take", {"batch_id": code_id("P00000104"), "qty": "1"})  # lenta EP200
    assert r.status_code == 400 and "kerakli material emas" in r.json()["detail"]


def test_collected_without_material_asks_then_force(c, seed):
    j = job_by("BR-26-0099")
    post(c, f"{S}/jobs/{j.pk}/accept")
    r = post(c, f"{S}/jobs/{j.pk}/collected")
    assert r.status_code == 400 and "baribir" in r.json()["detail"]
    assert post(c, f"{S}/jobs/{j.pk}/collected", {"force": True}).status_code == 200
    assert post(c, f"{S}/jobs/{j.pk}/ready").status_code == 200


def test_ready_before_collect_is_400(c, seed):
    j = job_by("BR-26-0099")
    assert post(c, f"{S}/jobs/{j.pk}/ready").status_code == 400


def test_lenta_cut_preview_and_take(c, seed):
    j = job_by("BR-26-0102")  # 650 × (2500 + 300)
    post(c, f"{S}/jobs/{j.pk}/accept")
    roll = code_id("P00000101")  # EP400 800 × 40000
    pv = post(c, f"{S}/cut-preview", {"batch_id": roll, "width_mm": "650", "length_mm": "2800"}).json()
    assert pv["piece"]["qty"] == "1.82" and len(pv["rests"]) == 2 and pv["rests"][0]["width_mm"] == "150"
    r = post(c, f"{S}/jobs/{j.pk}/take", {"batch_id": roll, "width_mm": "650", "length_mm": "2800"})
    assert r.status_code == 200, r.json()
    assert Unit.objects.get(code="P00000101").length_mm == 37200
    assert c.get(f"{S}/jobs/{j.pk}").json()["plan"][0]["left"] == "0"
    post(c, f"{S}/jobs/{j.pk}/collected")
    post(c, f"{S}/jobs/{j.pk}/ready")
    j.refresh_from_db()
    assert float(Unit.objects.get(pk=j.product_unit).qty) == pytest.approx(1.625)  # 650 × 2500, ulashsiz


def test_group_take_split_and_ready_many(c, seed):
    a, b = job_by("BR-26-0101"), job_by("BR-26-0099")  # 100 mm + 25 mm, bitta rukavdan
    ids = [a.pk, b.pk]
    g = post(c, f"{S}/group", {"ids": ids}).json()
    assert g["phase"] == "new" and g["plan"][0]["qty"] == "125"
    assert post(c, f"{S}/group/accept", {"ids": ids}).json()["done"] == ids
    r = post(c, f"{S}/group/take", {"ids": ids, "batch_id": code_id("P00000107"), "qty": "125"}).json()
    assert [x["qty"] for x in r["taken"]] == ["100", "25"]
    assert post(c, f"{S}/group/collected", {"ids": ids}).status_code == 200
    r = post(c, f"{S}/group/ready", {"ids": ids}).json()
    assert r["done"] == ids and c.get(r["sticker"]["url"]).content[:4] == b"%PDF"


def test_permissions(client, make_user, depts, seed):
    client.force_login(make_user(55, "employee", depts["sotuv"]))
    assert client.get(f"{S}/board").status_code == 403


def test_crm_deal_to_shop_to_warehouse_chain(client, team, seed, django_capture_on_commit_callbacks):
    """Bitim (rukavdan remen) → to'lov → sex zakazi → tayyor → bitim «Tayyor» → yig'ish → jo'natish → «Jo'natildi»."""
    as_(client, team["s1"])
    cst = post(
        client, f"{C}/customers", {"name": "Zanjir Zavod", "phones": ["90 000 00 77"], "inn": "301000077"}
    ).json()
    items = [
        {
            "item_id": seed["belt"],
            "char_id": seed["belt_chars"]["50 mm"],
            "name": "Tishli remen T10",
            "unit": "dona",
            "qty": 1,
            "price": 100000,
        },
    ]
    d = post(client, f"{C}/deals", {"counterparty_id": cst["id"], "items": items}).json()
    stage = lambda: client.get(f"{C}/deals/{d['id']}").json()["stage"]
    post(client, f"{C}/deals/{d['id']}/payment", {"amount": 100000, "via": "bank"})
    assert stage() == "production"
    j = Job.objects.get(source=f"crm:{d['id']}")
    assert j.route == "rukav" and j.customer == "Zanjir Zavod"
    # sex ishchisi (admin) — material va tayyor
    from config.apps.staff.models import User

    worker = User.objects.create_user(901, "Sexchi", "owner")
    shop.accept(j.pk, worker)
    shop.take([j.pk], {"batch_id": code_id("P00000107"), "qty": "50"}, worker)
    shop.collected([j.pk], False, worker)
    with django_capture_on_commit_callbacks(execute=True):
        shop.ready([j.pk], worker)
    assert stage() == "ready"
    p = Pick.objects.get(source=f"crm:{d['id']}", done=False)
    assert p.customer == "Zanjir Zavod" and p.lines[0]["item_id"] == seed["belt"]
    # omborchi: tayyor mahsulotni (stikeri bilan) yig'ib jo'natadi
    s = warehouse.free([seed["belt"]])
    assert s[(seed["belt"], seed["belt_chars"]["50 mm"])] == Decimal(0)  # bor 1, navbatda 1
    from config.apps.erp.warehouse import stock

    j.refresh_from_db()
    stock.pick_ship(p.pk, {"picks": [{"line_no": 1, "batch_id": j.product_unit, "qty": "1"}]}, 1)
    assert stage() == "shipping"
    acts = [a["text"] for a in client.get(f"{C}/deals/{d['id']}").json()["activity"]]
    assert any("Sexga 1 ta zakaz" in t for t in acts) and any("Omborga yig'ish" in t for t in acts)


def test_crm_lost_cancels_new_jobs(client, team, seed):
    as_(client, team["s1"])
    cst = post(client, f"{C}/customers", {"name": "Bekor Zavod", "phones": ["90 000 00 78"], "inn": "301000078"}).json()
    items = [
        {
            "item_id": seed["belt"],
            "char_id": seed["belt_chars"]["25 mm"],
            "name": "Remen",
            "unit": "dona",
            "qty": 3,
            "price": 10,
        }
    ]
    d = post(client, f"{C}/deals", {"counterparty_id": cst["id"], "items": items}).json()
    post(client, f"{C}/deals/{d['id']}/payment", {"amount": 30, "via": "bank"})
    assert Job.objects.get(source=f"crm:{d['id']}").pieces == 3
    post(client, f"{C}/deals/{d['id']}/stage", {"stage": "lost", "reason": "Narx"})
    assert Job.objects.get(source=f"crm:{d['id']}").phase == "cancelled"


def test_ledger_genealogy_and_untake(c, seed):
    """7-bosqich: sarf/ishlab chiqarish jurnalda hujjat va zakaz bilan; mahsulot — materiallari bilan (genealogiya);
    noto'g'ri olingan material omborga qaytadi (SQ-…), zakaz yig'ishga qaytadi."""
    from config.apps.erp.warehouse.models import Doc, StockMove

    j = job_by("BR-26-0102")  # 650 × 2800 lenta
    post(c, f"{S}/jobs/{j.pk}/accept")
    roll = code_id("P00000101")
    r = post(c, f"{S}/jobs/{j.pk}/take", {"batch_id": roll, "width_mm": "650", "length_mm": "2800"}).json()
    sr = r["number"]
    mv = StockMove.objects.filter(doc_number=sr)
    assert mv.exists() and all(m.op == "consume" and "BR-26-0102" in m.reason for m in mv)
    cons = Doc.objects.get(number=sr)
    assert cons.warehouse.kind != "production" and cons.lines[0]["data"]["code"] == "P00000101"

    # noto'g'ri olingan — qaytarish: bo'lak manba omborga, joysiz (joylash navbati)
    t = c.get(f"{S}/jobs/{j.pk}").json()["taken"][0]
    assert t["doc"] == sr
    post(c, f"{S}/jobs/{j.pk}/collected")
    q = post(c, f"{S}/jobs/{j.pk}/untake", {"take_id": t["id"]})
    assert q.status_code == 200, q.json()
    back = q.json()
    assert back["number"].startswith("SQ-") and len(back["codes"]) == 1
    piece = Unit.objects.get(code=back["codes"][0])
    assert float(piece.qty) == pytest.approx(1.82) and piece.loc is None and piece.src == back["number"]
    assert piece.warehouse_id == cons.warehouse_id
    assert StockMove.objects.filter(doc_number=back["number"], op="unconsume").exists()
    j.refresh_from_db()
    assert j.phase == "collecting" and not j.takes.exists()
    d = c.get(f"{S}/jobs/{j.pk}").json()
    assert d["plan"][0]["left"] == "1.82" and d["log"][-1]["action"] == "untake"
    assert post(c, f"{S}/jobs/{j.pk}/untake", {"take_id": t["id"]}).status_code == 404

    # qayta olib, tayyor: mahsulot materiallari bilan; material birligida — qayerda ishlatilgani
    r2 = post(c, f"{S}/jobs/{j.pk}/take", {"batch_id": roll, "width_mm": "650", "length_mm": "2800"}).json()
    post(c, f"{S}/jobs/{j.pk}/collected")
    post(c, f"{S}/jobs/{j.pk}/ready")
    j.refresh_from_db()
    prod = Unit.objects.get(pk=j.product_unit)
    made = prod.made or {}
    assert [x["doc"] for x in made["from"]] == [r2["number"]] and made["from"][0]["code"] == "P00000101"
    pm = StockMove.objects.get(unit_id=prod.pk, op="produce")
    assert pm.doc_number.startswith("IC-") and "BR-26-0102" in pm.reason
    tr = c.get(f"{A}/units/{prod.pk}/trace").json()
    assert tr["job"] == "BR-26-0102" and tr["from"][0]["code"] == "P00000101"
    up = c.get(f"{A}/units/{roll}/trace").json()["used"]
    assert [u["doc"] for u in up] == [r2["number"], sr]
    assert up[0]["products"][0]["code"] == prod.code and up[1]["returned"] == back["number"]

    # tayyor zakazdan material qaytarilmaydi
    t2 = c.get(f"{S}/jobs/{j.pk}").json()["taken"][0]
    r = post(c, f"{S}/jobs/{j.pk}/untake", {"take_id": t2["id"]})
    assert r.status_code == 400 and "qaytarilmaydi" in r.json()["detail"]


def test_group_untake_removes_all_shares(c, seed):
    a, b = job_by("BR-26-0101"), job_by("BR-26-0099")
    ids = [a.pk, b.pk]
    post(c, f"{S}/group/accept", {"ids": ids})
    post(c, f"{S}/group/take", {"ids": ids, "batch_id": code_id("P00000107"), "qty": "125"})
    t = c.get(f"{S}/jobs/{a.pk}").json()["taken"][0]
    r = post(c, f"{S}/jobs/{a.pk}/untake", {"take_id": t["id"]}).json()
    assert sorted(r["jobs"]) == sorted(ids)
    assert not a.takes.exists() and not b.takes.exists()

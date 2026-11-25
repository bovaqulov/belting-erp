"""Savdo hujjatlari: buyurtma (QQS hisobi, raqam), «asosida yaratish» zanjiri (hisob, yuk xati, to'lov, schyot-faktura),
o'tkazish / qaytarish / bekor, ombor yig'ish navbati va «jo'natildi», CRM bitimidan (navbat takrorlanmaydi), qarz,
ko'rinish (sotuvchi — o'zi), chegirma siyosati, shartnoma (STIR bo'yicha), PDF."""

from datetime import date
from decimal import Decimal

import pytest
from django.utils import timezone

from config.apps.erp.catalog.models import Group, Item
from config.apps.erp.crm.models import Customer, Deal, Stage
from config.apps.erp.finance.models import Contract, Counterparty
from config.apps.erp.sales.models import SaleDoc
from config.apps.erp.warehouse import services as wh
from config.apps.erp.warehouse.models import Firm, Pick, Warehouse, WhKind
from config.apps.staff.models import User
from config.apps.staff.services import set_departments

pytestmark = pytest.mark.django_db
S = "/app/api/erp/sales"
HEAD, S1, S2, ACC = 100, 201, 202, 300


def post(c, path, body=None):
    return c.post(path, body or {}, content_type="application/json")


def ok(r):
    assert r.status_code == 200, r.json()
    return r.json()


@pytest.fixture
def env(client, depts):
    from config.apps.erp.catalog.pricing import policy
    from config.apps.jarvis.models import Agent

    policy().__class__.objects.filter(pk=1).update(max_disc_seller=5, max_disc_head=15)
    buh = Agent.objects.create(
        key="buxgalteriya", kind="dept", name="Buxgalteriya", persona="p" * 25, parent=depts["rahbariyat"]
    )
    head = User.objects.create_user(HEAD, "Rahbar", "employee")
    set_departments(head, [depts["sotuv"].key])
    s1 = User.objects.create_user(S1, "Akmal", "employee", manager=head)
    s2 = User.objects.create_user(S2, "Dilshod", "employee", manager=head)
    acc = User.objects.create_user(ACC, "Buxgalter", "employee")
    for u in (s1, s2):
        set_departments(u, [depts["sotuv"].key])
    set_departments(acc, [buh.key])
    Warehouse.objects.get_or_create(name="Asosiy ombor", defaults={"kind": WhKind.STORE, "code": "AO"})
    firm = Firm.objects.order_by("id").first()
    assert firm is not None
    cust = Customer.objects.create(name="GERMES TEKS", inn="305112847", owner_tg=S1)
    other = Customer.objects.create(name="Boshqa mijoz", inn="300000001", owner_tg=S2)
    cp = Counterparty.objects.create(name="GERMES TEKS", inn="305112847")
    ctr = Contract.objects.create(number="834", date=date(2026, 11, 9), kind="sale", counterparty=cp, firm_id=firm.pk)
    g = Group.objects.create(name="Konus")
    it = Item.objects.create(
        group=g, name="NB/T3R/34 (KONUS)", unit="dona", price={"mode": "piece", "price": 660714.29, "overrides": {}}
    )

    def as_(u):
        client.force_login({"head": head, "s1": s1, "s2": s2, "acc": acc}[u])
        return client

    return as_, {"firm": firm, "cust": cust, "other": other, "ctr": ctr, "item": it}


def order(c, e, **kw):
    body = {
        "kind": "order",
        "firm": e["firm"].code,
        "customer_id": e["cust"].pk,
        "lines": [{"item_id": e["item"].pk, "name": e["item"].name, "unit": "dona", "qty": 2, "price": "740 000"}],
        **kw,
    }
    return ok(post(c, f"{S}/docs", body))


def test_order_vat_and_chain(env):
    as_, e = env
    c = as_("s1")
    o = order(c, e, contract_id=e["ctr"].pk)
    yy = timezone.now().strftime("%y")
    assert o["number"] == f"{e['firm'].code}-ZK-{yy}-00001" and o["status"] == "draft"
    assert (o["total"], o["vat"]) == ("1480000", "158571.43")  # QQS 12% ichida (1C: 1 657 600 → 177 600)
    assert o["contract"] == "№ 834 от 09.11.2026 (UZS)" and o["can"]["create"] == ["invoice", "shipment", "receipt"]
    assert ok(post(c, f"{S}/docs/{o['id']}/post"))["status"] == "posted"
    assert post(c, f"{S}/docs/{o['id']}", {"comment": "x"}).status_code == 409  # o'tkazilgan — tahrir yo'q
    inv = ok(post(c, f"{S}/docs/{o['id']}/create", {"kind": "invoice"}))
    assert (
        inv["base"]["number"] == o["number"]
        and inv["lines"] == o["lines"]
        and inv["number"].endswith("-HS-" + yy + "-00001")
    )
    assert post(c, f"{S}/docs/{o['id']}/create", {"kind": "vat_invoice"}).status_code == 400
    # yuk xati → ombor navbati → jo'natildi
    sh = ok(post(c, f"{S}/docs/{o['id']}/create", {"kind": "shipment"}))
    assert post(c, f"{S}/docs/{sh['id']}/post").json()["detail"] == "Omborni tanlang"
    store = Warehouse.objects.filter(kind=WhKind.STORE).first()
    assert store is not None
    wid = store.pk
    ok(post(c, f"{S}/docs/{sh['id']}", {"warehouse_id": wid}))
    sh = ok(post(c, f"{S}/docs/{sh['id']}/post"))
    assert sh["ship_state"] == "picking" and Pick.objects.get(source=f"sale:{sh['id']}").lines[0]["qty"] == 2
    from config.apps.erp.warehouse import hooks

    hooks.shipped(f"sale:{sh['id']}", "S-1")
    sh = ok(c.get(f"{S}/docs/{sh['id']}"))
    assert sh["ship_state"] == "shipped" and sh["can"]["unpost"] is False
    assert post(c, f"{S}/docs/{sh['id']}/unpost").status_code == 409
    # to'lov — qolgan qarz; schyot-faktura — bitta
    rc = ok(post(c, f"{S}/docs/{sh['id']}/create", {"kind": "receipt"}))
    assert rc["total"] == "1480000" and rc["pay_method"] == "bank"
    ok(post(c, f"{S}/docs/{rc['id']}", {"amount": "1 000 000", "pay_method": "cash"}))
    ok(post(c, f"{S}/docs/{rc['id']}/post"))
    assert ok(c.get(f"{S}/docs/{sh['id']}"))["due"] == "480000"
    ok(post(c, f"{S}/docs/{sh['id']}/create", {"kind": "vat_invoice"}))
    assert post(c, f"{S}/docs/{sh['id']}/create", {"kind": "vat_invoice"}).status_code == 400
    debts = ok(c.get(f"{S}/debts"))
    assert debts == [debts[0]] and (debts[0]["shipped"], debts[0]["paid"], debts[0]["balance"]) == (
        "1480000",
        "1000000",
        "480000",
    )
    # jurnal guruhlari
    j = ok(c.get(f"{S}/docs", {"groups": "orders"}))["rows"]
    assert {r["kind"] for r in j} == {"order", "invoice"} and next(r for r in j if r["kind"] == "order")["base"] is None
    assert [r["kind"] for r in ok(c.get(f"{S}/docs", {"groups": "receipts"}))["rows"]] == ["receipt"]
    r = c.get(f"{S}/docs/{sh['id']}/pdf")
    assert r.status_code == 200 and r["Content-Type"] == "application/pdf" and r.content[:4] == b"%PDF"


def test_unpost_cancel_and_scope(env):
    as_, e = env
    c = as_("s1")
    o = order(c, e)
    assert ok(post(c, f"{S}/docs/{o['id']}/post"))["can"]["unpost"] is True
    rc = ok(post(c, f"{S}/docs/{o['id']}/create", {"kind": "receipt"}))
    ok(post(c, f"{S}/docs/{rc['id']}/post"))
    assert post(c, f"{S}/docs/{o['id']}/unpost").status_code == 409  # asosida o'tkazilgan to'lov bor
    ok(post(c, f"{S}/docs/{rc['id']}/unpost"))
    assert ok(post(c, f"{S}/docs/{o['id']}/unpost"))["status"] == "draft"
    assert ok(post(c, f"{S}/docs/{o['id']}/cancel"))["status"] == "cancelled"
    assert ok(c.get(f"{S}/docs"))["rows"][0]["kind"] == "receipt"  # bekor qilingan jurnalda yo'q
    # ko'rinish: boshqa sotuvchi ko'rmaydi; rahbar va buxgalteriya — hammasi
    assert as_("s2").get(f"{S}/docs/{rc['id']}").status_code == 404
    assert as_("head").get(f"{S}/docs/{rc['id']}").status_code == 200
    assert as_("acc").get(f"{S}/docs/{rc['id']}").status_code == 200
    # begona mijoz
    assert post(as_("s1"), f"{S}/docs", {"kind": "order", "customer_id": e["other"].pk}).status_code == 403
    assert [x["id"] for x in ok(as_("s1").get(f"{S}/customers", {"q": "mijoz"}))] == []
    assert {x["id"] for x in ok(as_("head").get(f"{S}/customers"))} == {e["cust"].pk, e["other"].pk}


def test_discount_policy(env):
    as_, e = env
    line = {"item_id": e["item"].pk, "name": "Konus", "qty": 1, "price": 100}
    r = post(
        as_("s1"), f"{S}/docs", {"kind": "order", "customer_id": e["cust"].pk, "lines": [{**line, "discount": 10}]}
    )
    assert r.status_code == 403 and "5%" in r.json()["detail"]
    o = ok(
        post(
            as_("head"),
            f"{S}/docs",
            {"kind": "order", "customer_id": e["cust"].pk, "lines": [{**line, "discount": 10}]},
        )
    )
    assert o["total"] == "90"
    # rahbar qo'ygan chegirma — sotuvchi o'zgartirmay saqlay oladi (u rahbarniki — sotuvchi ko'rmaydi: owner — rahbar)
    assert (
        post(
            as_("head"),
            f"{S}/docs/{o['id']}",
            {"lines": [{**line, "discount": 10}, {"name": "X", "qty": 1, "price": 5}]},
        ).status_code
        == 200
    )


def test_from_deal_no_double_pick(env):
    as_, e = env
    t = timezone.now()
    d = Deal.objects.create(
        title="#1 Konus",
        customer=e["cust"],
        owner_tg=S1,
        amount=Decimal(0),
        stage=Stage.objects.get(code="new"),
        stage_since=t,
        created=t,
        updated=t,
        items=[
            {"item_id": e["item"].pk, "name": "Konus", "unit": "dona", "qty": "1", "price": "100000", "discount": "0"}
        ],
    )
    c = as_("s1")
    o = ok(post(c, f"{S}/from-deal", {"deal_id": d.pk}))
    assert o["deal_id"] == d.pk and o["lines"][0]["price"] == "112000" and o["customer"] == "GERMES TEKS"
    ok(post(c, f"{S}/docs/{o['id']}/post"))
    sh = ok(post(c, f"{S}/docs/{o['id']}/create", {"kind": "shipment"}))
    sh = ok(post(c, f"{S}/docs/{sh['id']}/post"))
    assert sh["ship_state"] == "deal" and not Pick.objects.filter(source=f"sale:{sh['id']}").exists()
    assert post(as_("s2"), f"{S}/from-deal", {"deal_id": d.pk}).status_code == 403


def test_refs_and_items(env):
    as_, e = env
    c = as_("s1")
    r = ok(c.get(f"{S}/refs", {"inn": "305112847", "firm": e["firm"].code}))
    assert [x["id"] for x in r["contracts"]] == [e["ctr"].pk] and r["disc_max"] == "5" and r["all"] is False
    assert {k["key"] for k in r["kinds"]} == {"order", "invoice", "shipment", "vat_invoice", "receipt"}
    hit = ok(c.get(f"{S}/items", {"q": "konus"}))[0]
    assert hit["price"] == "660714.29" and hit["price_vat"] == "740000"
    card = ok(c.get(f"{S}/customers/{e['cust'].pk}"))
    assert card["balance"] == "0" and card["contracts"][0]["number"] == "834"
    assert SaleDoc.objects.count() == 0
    assert wh.warehouses()

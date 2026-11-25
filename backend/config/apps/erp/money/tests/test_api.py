"""Pul: hisoblar va qoldiq, kirim / chiqim / o'tkazish (o'tkazish, qaytarish, bekor), kassada manfiy qoldiq yo'q,
valyutalararo o'tkazish, pul oqimi hisoboti, sotuv to'lovi ko'zgusi (tahrirlanmaydi, sotuvda qaytarilsa o'chadi),
ruxsat (sotuvchi — yo'q), 1C importi (hisoblar, qoldiq, asosiy hisob)."""

import sqlite3
from datetime import date

import pytest
from django.core.management import call_command
from django.utils import timezone

from config.apps.erp.crm.models import Customer
from config.apps.erp.finance.models import Counterparty
from config.apps.erp.money import ledger as L
from config.apps.erp.money.models import Account, MoneyDoc
from config.apps.erp.warehouse.models import Firm
from config.apps.staff.models import User
from config.apps.staff.services import set_departments

pytestmark = pytest.mark.django_db
M = "/app/api/erp/money"


def post(c, path, body=None):
    return c.post(path, body or {}, content_type="application/json")


def ok(r):
    assert r.status_code == 200, r.json()
    return r.json()


@pytest.fixture
def env(client, depts):
    from config.apps.jarvis.models import Agent

    buh = Agent.objects.create(
        key="buxgalteriya", kind="dept", name="Buxgalteriya", persona="p" * 25, parent=depts["rahbariyat"]
    )
    acc = User.objects.create_user(300, "Buxgalter", "employee")
    set_departments(acc, [buh.key])
    seller = User.objects.create_user(201, "Sotuvchi", "employee")
    set_departments(seller, [depts["sotuv"].key])
    firm = Firm.objects.order_by("id").first()
    assert firm is not None
    client.force_login(acc)
    return client, {"firm": firm.code, "seller": seller, "acc": acc}


def test_flow_and_balances(env):
    c, e = env
    kassa = ok(post(c, f"{M}/accounts", {"firm": e["firm"], "kind": "cash", "name": "Kassa", "opening": "1 000 000"}))
    bank = ok(
        post(
            c,
            f"{M}/accounts",
            {"firm": e["firm"], "kind": "bank", "name": "Bank", "number": "20208000800858759001", "bank": "Uznatsbank"},
        )
    )
    usd = ok(post(c, f"{M}/accounts", {"firm": e["firm"], "kind": "bank", "name": "USD", "currency": "USD"}))
    cust = Customer.objects.create(name="GERMES", inn="305112847")
    sup = Counterparty.objects.create(name="JINAN TIANQI", kind="supplier")
    k = ok(
        post(
            c,
            f"{M}/docs",
            {
                "kind": "in",
                "account_id": kassa["id"],
                "amount": "500000",
                "op": "customer",
                "party_kind": "customer",
                "party_id": cust.pk,
                "post": True,
            },
        )
    )
    yy = timezone.now().strftime("%y")
    assert (
        k["number"] == f"{e['firm']}-KR-{yy}-00001"
        and k["status"] == "posted"
        and k["item"] == "Mijozlardan to'lov"
        and k["party"] == "GERMES"
    )
    # kassadan qoldiqdan ko'p chiqim — yo'q
    big = ok(
        post(
            c,
            f"{M}/docs",
            {
                "kind": "out",
                "account_id": kassa["id"],
                "amount": "2000000",
                "op": "supplier",
                "party_kind": "supplier",
                "party_id": sup.pk,
            },
        )
    )
    r = post(c, f"{M}/docs/{big['id']}/post")
    assert r.status_code == 409 and "1500000" in r.json()["detail"]
    ok(post(c, f"{M}/docs/{big['id']}", {"amount": "400000"}))
    assert ok(post(c, f"{M}/docs/{big['id']}/post"))["party"] == "JINAN TIANQI"
    # o'tkazish: kassadan bankka; valyuta har xil — qabul summasi kerak
    t = ok(
        post(
            c,
            f"{M}/docs",
            {
                "kind": "transfer",
                "account_id": kassa["id"],
                "account_to_id": bank["id"],
                "amount": "300000",
                "post": True,
            },
        )
    )
    assert t["op"] == "transfer" and t["account_to"] == "Bank"
    t2 = ok(
        post(
            c,
            f"{M}/docs",
            {"kind": "transfer", "account_id": bank["id"], "account_to_id": usd["id"], "amount": "128000"},
        )
    )
    assert "USD" in post(c, f"{M}/docs/{t2['id']}/post").json()["detail"]
    ok(post(c, f"{M}/docs/{t2['id']}", {"amount_to": "10"}))
    ok(post(c, f"{M}/docs/{t2['id']}/post"))
    bal = {a["name"]: a["balance"] for a in ok(c.get(f"{M}/accounts"))}
    assert bal == {"Kassa": "800000", "Bank": "172000", "USD": "10"}
    # qaytarish qoldiqni manfiy qilmasin: bankka o'tkazilgan 300 000 dan 128 000 USD hisobga ketgan
    assert post(c, f"{M}/docs/{t['id']}/unpost").status_code == 409
    assert ok(post(c, f"{M}/docs/{k['id']}/unpost"))["status"] == "draft"  # kassada 800 000 — yetadi
    ok(post(c, f"{M}/docs/{k['id']}/post"))
    assert ok(post(c, f"{M}/docs/{t2['id']}/unpost"))["status"] == "draft"
    assert ok(post(c, f"{M}/docs/{t2['id']}/cancel"))["status"] == "cancelled"
    assert post(c, f"{M}/docs/{k['id']}", {"amount": 1}).status_code == 409  # o'tkazilgan — tahrir yo'q
    # pul oqimi
    today = timezone.localdate().isoformat()
    f = ok(c.get(f"{M}/flow", {"from": today, "to": today}))
    acc_rows = {a["name"]: a for a in f["accounts"]}
    assert (
        acc_rows["Kassa"]["start"],
        acc_rows["Kassa"]["in"],
        acc_rows["Kassa"]["out"],
        acc_rows["Kassa"]["end"],
    ) == ("1000000", "500000", "700000", "800000")
    assert {(x["direction"], x["item"], x["amount"]) for x in f["items"]} == {
        ("in", "Mijozlardan to'lov", "500000"),
        ("out", "Yetkazib beruvchilarga to'lov", "400000"),
    }
    j = ok(c.get(f"{M}/docs", {"account_id": bank["id"]}))["rows"]
    assert [x["kind"] for x in j] == ["transfer"]  # bekor qilingan ko'rinmaydi
    assert [x["name"] for x in ok(c.get(f"{M}/parties", {"kind": "supplier", "q": "jinan"}))] == ["JINAN TIANQI"]


def test_sales_receipt_mirror_and_access(env, client):
    c, e = env
    from config.apps.erp.sales import docs as S
    from config.apps.erp.sales.models import SaleDoc

    cust = Customer.objects.create(name="GERMES", inn="305112847", owner_tg=201)
    ctx = S.Ctx.of(e["acc"])
    o = S.save(
        ctx,
        {
            "kind": "order",
            "firm": e["firm"],
            "customer_id": cust.pk,
            "lines": [{"name": "Remen", "qty": 1, "price": 1000}],
        },
    )
    S.post(ctx, o["id"])
    rc = S.create_from(ctx, o["id"], "receipt")
    S.save(ctx, {"pay_method": "cash"}, rc["id"])
    S.post(ctx, rc["id"])
    m = MoneyDoc.objects.get(source=f"sales:{rc['id']}")
    assert (m.kind, m.status, m.amount, m.account.kind, m.party_name) == ("in", "posted", 1000, "cash", "GERMES")
    d = ok(c.get(f"{M}/docs/{m.pk}"))
    assert d["readonly"] is True and d["can"]["unpost"] is False and d["source_label"] == rc["number"]
    assert post(c, f"{M}/docs/{m.pk}", {"amount": 5}).status_code == 409
    assert ok(c.get(f"{M}/accounts"))[0]["balance"] == "1000"
    S.unpost(ctx, rc["id"])
    assert not MoneyDoc.objects.filter(source=f"sales:{rc['id']}").exists()
    assert SaleDoc.objects.get(pk=rc["id"]).status == "draft"
    client.force_login(e["seller"])
    assert client.get(f"{M}/accounts").status_code == 403


def test_import_1c(tmp_path, env):
    Firm.objects.get_or_create(code="BR1", defaults={"name": "Belting Rezina"})
    Firm.objects.get_or_create(code="NB1", defaults={"name": "Novobelt"})
    p = tmp_path / "office.db"
    con = sqlite3.connect(p)
    con.execute("CREATE TABLE onec_cash(base, tur, hisob, valyuta, summa, summa_som, as_of, synced)")
    con.executemany(
        "INSERT INTO onec_cash VALUES(?,?,?,?,?,?,?,?)",
        [
            (
                "NB",
                "Банк",
                "20208000800858759001, в Юнусабадский филиал Узнацбанка ",
                "сум",
                46099267523.65,
                0,
                "2026-11-07T18:16:00",
                "",
            ),
            (
                "NB",
                "Банк",
                "20208840000858759001, в Юнусабадский филиал Узнацбанка",
                "USD",
                13992.0,
                0,
                "2026-11-07T18:16:00",
                "",
            ),
            ("NB", "Касса", "Основная касса", "сум", 9111979401.98, 0, "2026-11-07T18:16:00", ""),
            ("NB", "Касса", "Основная касса", "сум", 38976.0, 0, "2026-11-07T18:16:00", ""),
            ("BR", "Касса", "Основная касса", "сум", 6045583436.49, 0, "2026-11-07T18:16:01", ""),
        ],
    )
    con.commit()
    call_command("money_import_1c", str(p))
    accs = {a.name: a for a in Account.objects.all()}
    bank = accs["20208000800858759001 — Юнусабадский филиал Узнацбанка"]
    assert (bank.kind, bank.currency, str(bank.opening), bank.opening_date, bank.main) == (
        "bank",
        "UZS",
        "46099267523.65",
        date(2026, 11, 7),
        True,
    )
    assert accs["20208840000858759001 — Юнусабадский филиал Узнацбанка"].currency == "USD"
    assert accs["Основная касса"].main and not accs["Основная касса (2)"].main
    assert {a.firm for a in Account.objects.filter(name="Основная касса")} >= {bank.firm}
    call_command("money_import_1c", str(p))
    assert Account.objects.count() == 5
    assert L.balances()[bank.pk] == bank.opening

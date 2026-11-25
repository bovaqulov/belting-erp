"""Moliya API (docs/api/accounting.md) — frontend demo (`src/erp/finance/demo/contracts.lib.ts`, `payroll.lib.ts`)
ssenariylari haqiqiy baza ustida: shartnoma holati va raqami, kontragent (INN, takror), maosh oyi (hisoblash, qoralama
tahriri, tasdiq, to'lov), ruxsatlar."""

from datetime import timedelta

import pytest
from django.utils import timezone

from config.apps.erp.finance.models import Employee
from config.apps.erp.warehouse.models import Firm

pytestmark = pytest.mark.django_db
E = "/app/api/erp"


def post(c, path, body=None):
    return c.post(path, body or {}, content_type="application/json")


def ok(r):
    assert r.status_code == 200, r.json()
    return r.json()


def err(r, status=400):
    assert r.status_code == status, r.json()
    return r.json()["detail"]


def day(n=0):
    return (timezone.localdate() + timedelta(days=n)).isoformat()


@pytest.fixture
def c(admin_client):
    return admin_client


@pytest.fixture
def firm(db):
    return Firm.objects.create(code="BR", name="Belting Rezina MChJ")


@pytest.fixture
def cp(c):
    return ok(
        post(
            c, f"{E}/counterparties", {"name": "Navoiy Konveyer Servis MChJ", "inn": "305 112 847", "kind": "customer"}
        )
    )


def new(c, firm, cp, **kw):
    body = {"kind": "sale", "counterparty_id": cp["id"], "firm_id": firm.pk, "date": day(), "signed": True, **kw}
    return ok(post(c, f"{E}/contracts", body))


# ------------------------------------------------------------------ kontragentlar va firmalar
def test_counterparties(c, cp, firm):
    assert cp["inn"] == "305112847"
    assert "bor" in err(post(c, f"{E}/counterparties", {"name": "navoiy konveyer servis mchj"}))
    assert "bor" in err(post(c, f"{E}/counterparties", {"name": "Boshqa", "inn": "305112847"}))
    assert "INN" in err(post(c, f"{E}/counterparties", {"name": "Y", "inn": "12345"}))
    assert (
        ok(post(c, f"{E}/counterparties", {"name": "Megadyne Rus OOO", "inn": "7714551230", "kind": "supplier"}))[
            "kind"
        ]
        == "supplier"
    )
    assert [x["name"] for x in ok(c.get(f"{E}/counterparties", {"q": "7714"}))] == ["Megadyne Rus OOO"]
    assert {"id": firm.pk, "code": "BR", "name": "Belting Rezina MChJ"} in ok(
        c.get(f"{E}/firms")
    )  # migratsiyadagi BLT, NOV bilan


# ------------------------------------------------------------------ shartnomalar
def test_contract_number_and_rules(c, firm, cp):
    a = new(c, firm, cp, amount="480 000 000", credit_limit=60_000_000, pay_days=30, valid_until=day(65))
    y = timezone.localdate().year
    assert a["number"] == f"BR-{y}/001" and a["firm"] == "BR" and a["counterparty"] == cp["name"]
    assert a["amount"] == 480_000_000 and a["state"] == "active" and a["days_left"] == 65
    assert new(c, firm, cp)["number"] == f"BR-{y}/002"
    assert "raqamli" in err(
        post(
            c,
            f"{E}/contracts",
            {"kind": "sale", "counterparty_id": cp["id"], "firm_id": firm.pk, "number": f"br-{y}/001"},
        )
    )
    base = {"kind": "sale", "counterparty_id": cp["id"], "firm_id": firm.pk}
    assert "oldin" in err(post(c, f"{E}/contracts", {**base, "date": day(), "valid_until": day(-1)}))
    assert "manfiy" in err(post(c, f"{E}/contracts", {**base, "amount": -5}))
    assert "Valyuta" in err(post(c, f"{E}/contracts", {**base, "currency": "GBP"}))
    assert "Sana" in err(post(c, f"{E}/contracts", {**base, "date": "2026-13-40"}))
    assert "Kontragentni" in err(post(c, f"{E}/contracts", {**base, "counterparty_id": 0}))
    assert "Firmani" in err(post(c, f"{E}/contracts", {**base, "firm_id": 0}))


def test_contract_states_and_filters(c, firm, cp):
    new(c, firm, cp, valid_until=day(18))  # tugayapti
    new(c, firm, cp, date=day(-380), valid_until=day(-15))  # muddati o'tgan
    draft = new(c, firm, cp, signed=False, note="Didox'ga yuborildi")
    long_ = new(c, firm, cp, valid_until=day(300), kind="purchase")
    states = {r["id"]: r["state"] for r in ok(c.get(f"{E}/contracts"))}
    assert sorted(states.values()) == ["active", "draft", "expired", "expiring"]
    assert len(ok(c.get(f"{E}/contracts", {"state": "attention"}))) == 3
    assert [r["id"] for r in ok(c.get(f"{E}/contracts", {"kind": "purchase"}))] == [long_["id"]]
    assert [r["id"] for r in ok(c.get(f"{E}/contracts", {"q": "didox"}))] == [draft["id"]]
    assert [r["id"] for r in ok(c.get(f"{E}/contracts", {"q": "305112"}))]  # INN bo'yicha
    # yopish → yopilgan, tahrirlanmaydi; qayta ochish
    closed = ok(post(c, f"{E}/contracts/{draft['id']}/close"))
    assert closed["state"] == "closed" and not closed["active"]
    assert ok(c.get(f"{E}/contracts"))[-1]["id"] == draft["id"]  # faollar oldin
    assert "Yopilgan" in err(post(c, f"{E}/contracts", {**closed, "note": "x"}))
    assert ok(post(c, f"{E}/contracts/{draft['id']}/reopen"))["state"] == "draft"
    assert ok(post(c, f"{E}/contracts", {**closed, "signed": True, "note": "imzolandi"}))["state"] == "active"
    assert err(c.get(f"{E}/contracts/999999"), 404) == "Shartnoma topilmadi"


# ------------------------------------------------------------------ maoshlar
def test_payroll_flow(c):
    month = timezone.localdate().isoformat()[:7]
    a = ok(
        post(
            c,
            f"{E}/payroll/staff",
            {
                "name": "Akmal Karimov",
                "position": "Sotuv menejeri",
                "dept": "Savdo",
                "salary": "7 000 000",
                "hired": "2025-01-10",
            },
        )
    )
    ok(
        post(c, f"{E}/payroll/staff", {"name": "Kelajakdagi", "salary": 5_000_000, "hired": "2099-01-01"})
    )  # hali ishga kirmagan
    ok(post(c, f"{E}/payroll/staff", {"name": "Ketgan", "salary": 5_000_000, "hired": "2024-01-01", "active": False}))
    assert "Oklad" in err(post(c, f"{E}/payroll/staff", {"name": "X"}))
    assert [e["name"] for e in ok(c.get(f"{E}/payroll/staff"))][-1] == "Ketgan"  # nofaollar oxirida

    assert ok(c.get(f"{E}/payroll/{month}")) == {"month": month, "state": "none", "rows": [], "approved_at": None}
    assert "Oy" in err(c.get(f"{E}/payroll/2026-13"))
    assert "Avval oyni hisoblang" in err(post(c, f"{E}/payroll/{month}/approve"))
    m = ok(post(c, f"{E}/payroll/{month}/calc"))
    assert m["state"] == "draft" and [r["name"] for r in m["rows"]] == ["Akmal Karimov"]
    row = f"{E}/payroll/{month}/rows/{a['id']}"
    m = ok(post(c, row, {"bonus": 1_000_000, "penalty": 200_000, "advance": "2 000 000", "note": "Reja"}))
    assert m["rows"][0] | {"paid_at": None} == m["rows"][0] and m["rows"][0]["advance"] == 2_000_000
    assert "oshib" in err(post(c, row, {"advance": 99_000_000}))
    assert "musbat" in err(post(c, row, {"bonus": -1}))

    # qayta hisoblash: oklad yangilanadi, bonus saqlanadi
    ok(post(c, f"{E}/payroll/staff", {**a, "salary": 8_000_000}))
    r = ok(post(c, f"{E}/payroll/{month}/calc"))["rows"][0]
    assert (r["base"], r["bonus"], r["note"]) == (8_000_000, 1_000_000, "Reja")

    m = ok(post(c, f"{E}/payroll/{month}/approve"))
    assert m["state"] == "approved" and m["approved_at"]
    assert "Tasdiqlangan" in err(post(c, row, {"bonus": 1}))
    assert "qayta hisoblanmaydi" in err(post(c, f"{E}/payroll/{month}/calc"))
    m = ok(post(c, f"{E}/payroll/{month}/pay", {"ids": [a["id"]]}))
    assert m["state"] == "paid" and m["rows"][0]["paid_at"]
    assert "bekor qilinmaydi" in err(post(c, f"{E}/payroll/{month}/unapprove"))


def test_payroll_unapprove_and_empty(c):
    assert "faol xodim yo'q" in err(post(c, f"{E}/payroll/2026-01/calc"))
    Employee.objects.create(name="B", salary=1, hired=timezone.localdate().replace(day=1))
    month = timezone.localdate().isoformat()[:7]
    ok(post(c, f"{E}/payroll/{month}/calc"))
    assert "Avval oyni tasdiqlang" in err(post(c, f"{E}/payroll/{month}/pay"))
    ok(post(c, f"{E}/payroll/{month}/approve"))
    assert ok(post(c, f"{E}/payroll/{month}/unapprove"))["state"] == "draft"


# ------------------------------------------------------------------ ruxsatlar
def test_permissions(client, make_user, depts):
    from config.apps.jarvis.models import Agent

    bux = Agent.objects.create(
        key="buxgalteriya", kind="dept", name="Buxgalteriya", persona="p" * 25, parent=depts["rahbariyat"]
    )
    client.force_login(make_user(20, "employee", bux))
    assert ok(client.get(f"{E}/contracts")) == []
    assert err(client.get(f"{E}/payroll/staff"), 403) == "Ruxsat yo'q: maoshlarni faqat rahbariyat ko'radi"
    client.force_login(make_user(21, "employee", depts["sotuv"]))
    assert err(client.get(f"{E}/contracts"), 403).startswith("Ruxsat yo'q")

"""Analitika: ruxsat (rahbariyat/admin — ha, oddiy xodim — yo'q), davr (7/30/90, noto'g'ri qiymat → 30), savdo —
yutilgan bitimlar summasi, oldingi teng davr bilan solishtirish, sotuvchilar; ombor va marketplace bo'limlari bor."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from config.apps.erp.crm.models import Customer, Deal, Stage

pytestmark = pytest.mark.django_db
URL = "/app/api/analytics"


def _won(customer, days_ago, amount, owner=101):
    t = timezone.now() - timedelta(days=days_ago)
    return Deal.objects.create(
        title="Buyurtma",
        customer=customer,
        owner_tg=owner,
        amount=Decimal(amount),
        stage=Stage.objects.get(code="won"),
        stage_since=t,
        created=t,
        updated=t,
        closed=t,
    )


@pytest.fixture
def env(client, make_user, depts):
    users = {
        "admin": make_user(1, "admin"),
        "leader": make_user(103, "employee", depts["rahbariyat"]),
        "seller": make_user(101, "employee", depts["sotuv"]),
    }
    c = Customer.objects.create(name="Almerro", owner_tg=101)
    _won(c, 2, 3_000_000)
    _won(c, 5, 1_000_000)
    _won(c, 40, 2_000_000)  # oldingi 30 kunlik davr

    def as_(who):
        client.force_login(users[who])
        return client

    return as_


def test_access(env):
    assert env("seller").get(URL).status_code == 403
    assert env("leader").get(URL).status_code == 200
    assert env("admin").get(URL).status_code == 200


def test_sales_and_period(env):
    d = env("admin").get(URL, {"days": 30}).json()
    s = d["sales"]
    assert d["period"]["days"] == 30
    assert s["won_sum"] == 4_000_000 and s["won_n"] == 2 and s["avg"] == 2_000_000
    assert s["prev_won_sum"] == 2_000_000 and s["delta_pct"] == 100.0
    assert s["sellers"][0] == {"tg_id": 101, "sum": 4_000_000, "n": 2, "name": "U101"}
    assert sum(x["sum"] for x in s["by_day"]) == 4_000_000
    w = env("admin").get(URL, {"days": 7}).json()["sales"]
    assert w["won_sum"] == 4_000_000 and w["delta_pct"] is None  # oldingi 7 kunda sotuv yo'q
    assert env("admin").get(URL, {"days": "x"}).json()["period"]["days"] == 30
    assert env("admin").get(URL, {"days": 365}).json()["period"]["days"] == 30


def test_sections_present(env):
    d = env("admin").get(URL).json()
    assert {"units", "items", "value", "low_n", "low", "accuracy", "picks"} <= set(d["warehouse"])
    assert {"orders_n", "by_channel", "by_stage", "active_n", "overdue_n", "channel_names"} <= set(d["marketplace"])

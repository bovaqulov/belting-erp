"""GeoMaps API (manba — CRM mijozlari): sinxron (holat, savdo, joy, o'chgan mijoz), ko'rinish doirasi (rahbariyat —
hammasi, xodim — o'zi mas'ul), qo'lda nuqta saqlanishi, ommaviy teg va mas'ul (CRM'ga yoziladi), hududlar, ulashish
(parol, maxfiy maydonlarsiz), ruxsatlar."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from config.apps.erp.crm.models import Customer, Deal, Stage
from config.apps.geomap import sync
from config.apps.geomap.models import Record, Territory

pytestmark = pytest.mark.django_db
G = "/app/api/geo"


def post(c, path, body=None):
    return c.post(path, body or {}, content_type="application/json")


def _deal(customer, stage, days_ago, amount=0, owner=101):
    t = timezone.now() - timedelta(days=days_ago)
    return Deal.objects.create(
        title="Buyurtma",
        customer=customer,
        owner_tg=owner,
        amount=Decimal(amount),
        stage=Stage.objects.get(code=stage),
        stage_since=t,
        created=t,
        updated=t,
        closed=t if stage in ("won", "shipping") else None,
    )


@pytest.fixture
def env(client, make_user, depts, settings):
    from config.apps.jarvis.models import Agent

    settings.CELERY_TASK_ALWAYS_EAGER = True
    sales_dept = Agent.objects.create(
        key="sotuv_b2b", kind="dept", name="Sotuv B2B", persona="p" * 25, parent=depts["rahbariyat"]
    )
    ombor = Agent.objects.create(key="ombor", kind="dept", name="Ombor", persona="p" * 25, parent=depts["rahbariyat"])
    users = {
        "admin": make_user(1, "admin"),
        "seller": make_user(101, "employee", sales_dept),
        "seller2": make_user(102, "employee", sales_dept),
        "leader": make_user(103, "employee", depts["rahbariyat"]),
        "ombor": make_user(201, "employee", ombor),
    }
    a = Customer.objects.create(
        name="Almerro Group MChJ", inn="302114274", address="Toshkent shahri, Yunusobod tumani", owner_tg=101
    )
    b = Customer.objects.create(name="Samarqand Don", address="Samarqand viloyati, Urgut tumani", owner_tg=102)
    c = Customer.objects.create(name="Manzilsiz mijoz", owner_tg=None)
    _deal(a, "won", 10, 5_000_000)
    _deal(a, "won", 500, 9_000_000)  # 12 oydan eski — summaga kirmaydi
    _deal(b, "new", 1, 0, owner=102)
    sync.run()

    def as_(who):
        client.force_login(users[who])
        return client

    return as_, {"a": a, "b": b, "c": c}


def test_sync_from_crm(env):
    _, cs = env
    a = Record.objects.get(pk=f"crm:{cs['a'].pk}")
    assert a.status == "faol" and a.sales_12m == 5_000_000 and a.sales_count == 1 and a.inn == "302114274"
    assert a.region == "toshkent" and a.geo_quality == "district" and a.lat is not None and a.owner_name == "U101"
    b = Record.objects.get(pk=f"crm:{cs['b'].pk}")
    assert b.status == "yangi" and b.deals_open == 1 and b.region == "samarqand"
    c = Record.objects.get(pk=f"crm:{cs['c'].pk}")
    assert c.geo_quality == "none" and c.lat is None and c.status == "xaridsiz"
    cs["c"].delete()
    assert sync.run()["deleted"] == 1 and Record.objects.count() == 2


def test_scope_and_detail(env):
    as_, cs = env
    rid = f"crm:{cs['a'].pk}"
    full = as_("leader").get(f"{G}/records").json()
    assert {r["id"] for r in full["records"]} == {f"crm:{c.pk}" for c in cs.values()}
    me = as_("seller").get(f"{G}/me").json()
    assert me == {"tgId": 101, "name": "U101", "role": "employee", "full": False, "ownerId": "101"}
    mine = as_("seller").get(f"{G}/records").json()["records"]
    assert [r["id"] for r in mine] == [rid] and mine[0]["owner"] == "101" and mine[0]["type"] == "Firma"
    d = as_("seller").get(f"{G}/records/{rid}").json()
    assert d["crmUrl"] == f"/app/erp/crm/?customer={cs['a'].pk}" and d["inn"] == "302114274" and d["checkins"] == []
    assert as_("seller").get(f"{G}/records/crm:{cs['b'].pk}").status_code == 404  # begona mijoz
    assert as_("seller").get(f"{G}/totals").status_code == 403
    assert as_("admin").get(f"{G}/totals").json()["sales_12m"] == 5_000_000
    assert as_("ombor").get(f"{G}/records").status_code == 403
    assert as_("seller").get("/app/api/me").json()["can_geo"] is True
    assert as_("ombor").get("/app/api/me").json()["can_geo"] is False


def test_manual_location_kept_and_checkin(env):
    as_, cs = env
    rid = f"crm:{cs['a'].pk}"
    c = as_("seller")
    assert post(c, f"{G}/records/{rid}/location", {"lat": 41.36, "lng": 69.29}).json() == {"ok": True}
    assert post(c, f"{G}/records/{rid}/location", {"lat": 10, "lng": 10}).status_code == 422
    sync.run()
    r = Record.objects.get(pk=rid)
    assert (r.lat, r.lng, r.geo_quality) == (41.36, 69.29, "manual")
    assert post(c, f"{G}/checkins", {"record_id": rid, "note": "uchrashuv"}).status_code == 200
    assert c.get(f"{G}/records/{rid}").json()["checkins"][0]["note"] == "uchrashuv"


def test_bulk_tag_and_owner(env):
    as_, cs = env
    ids = [f"crm:{cs['a'].pk}", f"crm:{cs['b'].pk}"]
    assert post(as_("seller"), f"{G}/bulk", {"ids": ids, "action": "tag", "value": "VIP"}).json()["updated"] == 1
    assert post(as_("seller"), f"{G}/bulk", {"ids": ids, "action": "owner", "value": 102}).status_code == 403
    r = post(as_("admin"), f"{G}/bulk", {"ids": ids, "action": "owner", "value": 102}).json()
    assert r["updated"] == 2
    cs["a"].refresh_from_db()
    assert cs["a"].owner_tg == 102  # asosiy manba — CRM
    assert Record.objects.get(pk=ids[0]).fields["teg"] == "VIP"
    owners = as_("admin").get(f"{G}/owners").json()
    assert owners[0] == {"id": "102", "name": "U102", "records": 2}


def test_territories(env):
    as_, cs = env
    a = as_("admin")
    tid = post(
        a, f"{G}/territories", {"kind": "radius", "center": {"lat": 41.33, "lng": 69.33}, "radius": 30_000}
    ).json()["id"]
    rows = {t["id"]: t for t in a.get(f"{G}/territories").json()}
    assert rows[tid]["n"] == 1 and rows[tid]["sales"] == 5_000_000
    assert Record.objects.get(pk=f"crm:{cs['a'].pk}").territory_id == tid
    assert post(a, f"{G}/territories", {"geometry": {"type": "Point", "coordinates": [1, 2]}}).status_code == 422
    assert post(as_("seller"), f"{G}/territories", {"kind": "radius"}).status_code == 403
    a = as_("admin")
    prev = post(a, f"{G}/territories/auto/preview", {"count": 2, "regions": ["toshkent", "samarqand"]}).json()
    assert len(prev["territories"]) == 2 and prev["used"] == 2
    assert a.delete(f"{G}/territories/{tid}").json() == {"ok": True}
    assert not Territory.objects.exists() and Record.objects.get(pk=f"crm:{cs['a'].pk}").territory_id is None


def test_share_public_hides_money(env, client):
    as_, cs = env
    rid = f"crm:{cs['a'].pk}"
    r = post(
        as_("seller"), f"{G}/shares", {"ids": [rid, f"crm:{cs['b'].pk}"], "password": "sir", "name": "Toshkent"}
    ).json()
    token = r["token"]
    assert r["path"] == f"/app/geo/share?t={token}"
    client.logout()
    assert client.get(f"{G}/public/{token}").json() == {"name": "Toshkent", "protected": True}
    assert post(client, f"{G}/public/{token}", {"password": "x"}).status_code == 401
    d = post(client, f"{G}/public/{token}", {"password": "sir"}).json()
    assert [x["id"] for x in d["records"]] == [rid]  # begona (crm:b) ulashilmaydi
    assert set(d["records"][0]) == {"id", "name", "lat", "lng", "region", "district", "status", "address"}
    assert client.get(f"{G}/public/yoq").status_code == 404

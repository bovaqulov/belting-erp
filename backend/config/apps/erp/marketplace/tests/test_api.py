"""Marketplace API: kanal API'lari httpx.MockTransport bilan (tarmoq yo'q), kontrakt shakllari — docs/api/marketplace.md."""

import base64
import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from config.apps.erp.marketplace import orders as O
from config.apps.erp.marketplace.models import Card, Issue, Log, Order
from config.apps.staff.models import User
from config.apps.staff.services import set_departments

pytestmark = pytest.mark.django_db
P = "/app/api/erp/mk"
PNG = base64.b64encode(b"\x89PNG-fake").decode()
NOW = datetime.now(UTC)


def ms(d: datetime) -> int:
    return int(d.timestamp() * 1000)


class Fake:
    """Kanal javoblari: (METHOD, yo'l) → JSON yoki (status, JSON). So'rovlar `calls` da."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict | None]] = []
        self.routes: dict[tuple[str, str], object] = {}

    def __call__(self, req: httpx.Request) -> httpx.Response:
        body = json.loads(req.content) if req.content else None
        path = req.url.path.removeprefix("/api/seller-openapi")  # Uzum asosiy yo'li
        self.calls.append((req.method, path, body))
        hit = self.routes.get((req.method, path))
        if hit is None:
            return httpx.Response(404, json={"message": "not found"})
        status, data = hit if isinstance(hit, tuple) else (200, hit)
        return httpx.Response(status, json=data)


@pytest.fixture
def fake(monkeypatch, settings):
    settings.WB_TOKEN, settings.OZON_ID, settings.OZON_TOKEN, settings.UZUM_TOKEN = "wb", "1", "oz", "uz"
    settings.MP_WRITE = False
    f = Fake()
    real = httpx.Client
    monkeypatch.setattr(httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(f), **kw))
    monkeypatch.setattr("config.apps.erp.marketplace.channels.time.sleep", lambda s: None)
    from django.core.cache import cache

    cache.clear()
    return f


@pytest.fixture
def user(db):
    from config.apps.jarvis.models import Agent

    mp = Agent.objects.create(key="sotuv_marketplace", kind="dept", name="Sotuv — Marketplace", persona="p" * 25)
    u = User.objects.create_user(7, "Omborchi", "employee")
    set_departments(u, [mp.key])
    return u


@pytest.fixture
def c(client, user):
    client.force_login(user)
    return client


def post(c, url, body=None):
    return c.post(url, json.dumps(body or {}), content_type="application/json")


def wb_orders(fake):
    fake.routes[("GET", "/api/v3/orders")] = {
        "orders": [
            {
                "id": 101,
                "nmId": 555,
                "article": "SPA-1250",
                "createdAt": (NOW - timedelta(hours=2)).isoformat(),
                "convertedPrice": 41200000,
                "skus": ["4600000000101"],
            },
            {
                "id": 102,
                "nmId": 556,
                "article": "SPB-2000",
                "createdAt": (NOW - timedelta(days=3)).isoformat(),
                "convertedPrice": 10000,
                "skus": [],
            },
        ],
        "next": 0,
    }
    fake.routes[("GET", "/api/v3/orders/new")] = {
        "orders": [
            {"id": 103, "nmId": 555, "article": "SPA-1250", "createdAt": NOW.isoformat(), "skus": ["4600000000101"]}
        ]
    }
    fake.routes[("POST", "/api/v3/orders/status")] = {
        "orders": [
            {"id": 101, "supplierStatus": "confirm", "wbStatus": "waiting"},
            {"id": 102, "supplierStatus": "complete", "wbStatus": "sold"},
            {"id": 103, "supplierStatus": "new", "wbStatus": "waiting"},
        ]
    }


# ---------------------------------------------------------------- sof mantiq
def test_stage_of():
    assert O.stage_of("wb", {"supplierStatus": "new", "wbStatus": "waiting"}) == "new"
    assert O.stage_of("wb", {"supplierStatus": "new", "wbStatus": "canceled_by_client"}) == "cancelled"
    assert O.stage_of("wb", {"supplierStatus": "complete", "wbStatus": "waiting"}) == "transit"
    assert O.stage_of("ozon", "awaiting_packaging") == "new"
    assert O.stage_of("ozon", "awaiting_deliver") == "assembly"
    assert O.stage_of("uzum", "CREATED") == "new"
    assert O.stage_of("uzum", "PACKING") == "assembly"
    assert O.stage_of("uzum", "RETURNED") == "cancelled"


def test_picking_groups_same_item():
    rows = [
        {"ext_id": "1", "price_uzs": 100.0, "lines": [{"vendor_code": "A", "title": "A", "qty": 1}]},
        {"ext_id": "2", "price_uzs": 300.0, "lines": [{"vendor_code": "A", "title": "A", "qty": 2}]},
    ]
    (a,) = O.picking(rows)
    assert a["qty"] == 3 and a["orders"] == ["1", "2"] and a["sum"] == 400 and a["prices"] == [100.0, 150.0]


# ---------------------------------------------------------------- kirish va ruxsat
def test_auth_required(client, fake):
    assert client.get(f"{P}/overview").status_code == 401
    client.force_login(User.objects.create_user(8, "Yangi", "pending"))  # tasdiqlanmagan — kirmagan hisoblanadi
    assert client.get(f"{P}/overview").status_code in (401, 403)


def test_modul_huquqi(client, user):
    """Marketplace — faqat shu bo'lim (yoki ega/admin, rahbariyat); boshqa bo'lim xodimi — 403."""
    from config.apps.jarvis.models import Agent

    other = User.objects.create_user(9, "Omborchi2", "employee")
    set_departments(other, [Agent.objects.create(key="ombor", kind="dept", name="Ombor", persona="p" * 25).key])
    client.force_login(other)
    assert client.get(f"{P}/overview").status_code == 403
    assert client.get("/app/api/erp/me").json()["modules"] == ["warehouse", "logistics"]
    client.force_login(User.objects.create_user(10, "Bo'limsiz", "employee"))
    assert client.get("/app/api/erp/me").json()["modules"] == []
    client.force_login(User.objects.create_user(11, "Admin", "admin"))
    assert "hr" in client.get("/app/api/erp/me").json()["modules"]


def test_erp_me(c):
    assert c.get("/app/api/erp/me").json() == {
        "tg_id": 7,
        "name": "Omborchi",
        "roles": ["employee"],
        "is_head": False,
        "modules": ["marketplace"],
        "warehouses": [],
        "firms": [],
        "kinds": [],
    }


# ---------------------------------------------------------------- sinxron, taxta, hisoblar
def test_sync_board_counts_overview(c, fake):
    wb_orders(fake)
    Card.objects.create(
        channel="wb",
        ext_id="555",
        title="Remen SPA 1250",
        vendor_code="SPA-1250",
        codes=["4600000000101"],
        ext={"photo": "https://img/555.webp"},
    )
    assert post(c, f"{P}/orders/wb/sync").json() == {"new": 3, "updated": 0, "imported": 2}
    assert post(c, f"{P}/orders/wb/sync").json() == {"new": 0, "updated": 3, "imported": 0}

    b = c.get(f"{P}/orders/wb/board").json()
    assert b["counts"] == {"assembly": 1, "done": 1, "new": 1}
    assert [o["ext_id"] for o in b["orders"]] == ["103", "101"]  # muddatsiz — yangisi oldin
    o = b["orders"][1]
    assert o["stage"] == "assembly" and o["price_uzs"] == 412000 and o["article"] == "SPA-1250" and o["need"] == 1
    assert o["lines"][0]["title"] == "Remen SPA 1250" and o["lines"][0]["codes"] == ["4600000000101"]
    assert o["lines"][0]["photo"] == "https://img/555.webp"
    assert 100 < o["age_min"] < 140 and o["left_min"] is None
    assert [x["ext_id"] for x in c.get(f"{P}/orders/wb/board?stage=done").json()["orders"]] == ["102"]
    assert c.get(f"{P}/orders/wb/board?stage=xx").status_code == 400
    assert c.get(f"{P}/orders/xx/board").status_code == 404

    assert c.get(f"{P}/orders-counts").json() == {
        "wb": {"new": 1, "assembly": 1},
        "ozon": {"new": 0, "assembly": 0},
        "uzum": {"new": 0, "assembly": 0},
    }
    ov = c.get(f"{P}/overview").json()
    assert ov["orders"] == {"n": 2, "soon": 0}
    assert ov["channels"]["wb"] == {
        "name": "Wildberries",
        "n": 1,
        "linked": 0,
        "off": 0,
        "ch_total": 0,
        "push_stock": False,
        "push_price": False,
    }
    assert set(ov) == {"channels", "sources", "orders", "reviews", "push_errors", "audit"}


def test_sync_uzum_deadline(c, fake):
    fake.routes[("GET", "/v1/shops")] = {"payload": [{"id": 77, "name": "Belting"}]}
    fake.routes[("GET", "/v2/fbs/orders/count")] = {"payload": 1}
    fake.routes[("GET", "/v2/fbs/orders")] = {
        "payload": {
            "orders": [
                {
                    "id": 9001,
                    "status": "CREATED",
                    "dateCreated": ms(NOW),
                    "acceptUntil": ms(NOW + timedelta(hours=2)),
                    "orderItems": [{"skuId": 31, "skuTitle": "Remen A-1000", "amount": 2, "barcode": "478000031"}],
                },
            ]
        }
    }
    assert post(c, f"{P}/orders/uzum/sync").json()["new"] == 1
    o = c.get(f"{P}/orders/uzum/board").json()["orders"][0]
    assert o["ext_status"] == "CREATED" and 100 < o["left_min"] <= 120 and o["need"] == 2
    assert c.get(f"{P}/overview").json()["orders"] == {"n": 1, "soon": 1}
    shops = [call for call in fake.calls if call[1] == "/v2/fbs/orders"]
    assert shops  # shopIds bilan so'raldi


def test_channel_error_is_502(c, fake):
    fake.routes[("GET", "/api/v3/orders")] = (401, {"message": "bad token"})
    r = post(c, f"{P}/orders/wb/sync")
    assert r.status_code == 502 and "WB buyurtmalar" in r.json()["detail"]


def test_not_configured(c, fake, settings):
    settings.OZON_TOKEN = ""
    r = post(c, f"{P}/orders/ozon/sync")
    assert r.status_code == 400 and "OZON_ID" in r.json()["detail"]


# ---------------------------------------------------------------- skaner bilan yig'ish
def test_scan_flow(c, fake):
    Card.objects.create(channel="wb", ext_id="555", title="Remen", codes=["111", "222"])
    Order.objects.create(channel="wb", ext_id="1", stage="assembly", payload={"nmId": 555, "skus": []})
    url = f"{P}/orders/wb/1/scan"
    bad = post(c, url, {"code": "999"})
    assert bad.status_code == 400 and bad.json()["detail"].startswith("NOTO'G'RI TOVAR: 999")
    assert post(c, url, {"code": "222"}).json() == {
        "ok": True,
        "line": 0,
        "title": "Remen",
        "picked": 1,
        "need": 1,
        "done": True,
    }
    assert "allaqachon" in post(c, url, {"code": "222"}).json()["detail"]
    assert post(c, f"{P}/orders/wb/1/reset").json() == {"ok": True}
    o = Order.objects.get(ext_id="1")
    assert o.picked == [] and o.assembled_at is None
    assert post(c, f"{P}/orders/wb/404/scan", {"code": "1"}).status_code == 404


def test_scan_overflow(c, fake):
    Order.objects.create(
        channel="uzum",
        ext_id="5",
        stage="assembly",
        payload={"orderItems": [{"skuId": 1, "amount": 2, "barcode": "B"}, {"skuId": 2, "barcode": "C"}]},
    )
    url = f"{P}/orders/uzum/5/scan"
    assert post(c, url, {"code": "B"}).json()["done"] is False
    assert post(c, url, {"code": "B"}).json()["picked"] == 2
    assert "yetarli" in post(c, url, {"code": "B"}).json()["detail"]
    assert post(c, url, {"code": "C"}).json()["done"] is True


# ---------------------------------------------------------------- kanalga yozish (MP_WRITE)
def test_write_blocked_by_default(c, fake):
    Order.objects.create(channel="wb", ext_id="101", stage="new", payload={})
    r = post(c, f"{P}/orders/wb/101/cancel", {"reason": "yo'q"})
    assert r.status_code == 403 and "MP_WRITE" in r.json()["detail"]
    assert not [x for x in fake.calls if x[0] == "PATCH"]  # kanalga hech narsa ketmadi
    assert Order.objects.get(ext_id="101").stage == "new"


def test_cancel_confirm_ship(c, fake, settings):
    settings.MP_WRITE = True
    fake.routes[("PATCH", "/api/v3/orders/101/cancel")] = (204, None)
    fake.routes[("POST", "/v1/fbs/order/9001/confirm")] = {"payload": {}}
    fake.routes[("POST", "/v4/posting/fbs/ship")] = {"result": ["ok"]}
    Order.objects.create(channel="wb", ext_id="101", stage="new", payload={})
    Order.objects.create(channel="uzum", ext_id="9001", stage="new", ext_status="CREATED", payload={})
    Order.objects.create(
        channel="ozon",
        ext_id="0123-1",
        stage="new",
        payload={"products": [{"sku": 77, "quantity": 2, "offer_id": "A"}]},
    )

    assert post(c, f"{P}/orders/wb/101/cancel", {"reason": "yo'q"}).json() == {"ok": True}
    assert Order.objects.get(ext_id="101").stage == "cancelled"
    assert post(c, f"{P}/orders/wb/101/cancel").status_code == 400  # endi faol emas

    assert post(c, f"{P}/orders/uzum/9001/confirm").json() == {"ok": True}
    o = Order.objects.get(ext_id="9001")
    assert (o.stage, o.ext_status) == ("assembly", "PACKING")

    assert post(c, f"{P}/orders/ozon/0123-1/ship").json()["ok"] is True
    ship = next(x for x in fake.calls if x[1] == "/v4/posting/fbs/ship")
    assert ship[2] == {"posting_number": "0123-1", "packages": [{"products": [{"product_id": 77, "quantity": 2}]}]}
    assert Log.objects.filter(action__in=["cancel", "confirm", "ship"]).count() == 3
    assert post(c, f"{P}/orders/wb/101/confirm").status_code == 404


def test_label_wb(c, fake):
    fake.routes[("POST", "/api/v3/orders/stickers")] = {"stickers": [{"orderId": 101, "file": PNG}]}
    r = c.get(f"{P}/orders/wb/101/label")
    assert r.status_code == 200 and r["Content-Type"] == "image/png" and r.content == b"\x89PNG-fake"


# ---------------------------------------------------------------- WB postavkalar
def test_supplies(c, fake, settings):
    fake.routes[("GET", "/api/v3/supplies")] = {
        "supplies": [
            {"id": "WB-GI-1", "name": "Ertalab", "createdAt": NOW.isoformat(), "closedAt": None, "done": False},
            {"id": "WB-GI-0", "name": "Eski", "createdAt": NOW.isoformat(), "closedAt": NOW.isoformat(), "done": True},
        ],
        "next": 0,
    }
    assert [s["id"] for s in c.get(f"{P}/wb/supplies").json()] == ["WB-GI-1"]

    Order.objects.create(
        channel="wb", ext_id="101", stage="new", payload={"nmId": 1, "skus": ["X"], "convertedPrice": 5000}
    )
    assert post(c, f"{P}/wb/supplies/WB-GI-1/add", {"orders": ["101"]}).status_code == 403  # yozish o'chiq
    settings.MP_WRITE = True
    fake.routes[("PATCH", "/api/marketplace/v3/supplies/WB-GI-1/orders")] = (204, None)
    assert post(c, f"{P}/wb/supplies/WB-GI-1/add", {"orders": ["101"]}).json() == {"ok": True}
    assert Order.objects.get(ext_id="101").supply_id == "WB-GI-1"

    fake.routes[("GET", "/api/v3/supplies/WB-GI-1")] = {
        "id": "WB-GI-1",
        "name": "Ertalab",
        "createdAt": NOW.isoformat(),
        "closedAt": None,
        "done": False,
    }
    fake.routes[("GET", "/api/marketplace/v3/supplies/WB-GI-1/order-ids")] = {"orderIds": [101]}
    fake.routes[("GET", "/api/v3/supplies/WB-GI-1/trbx")] = {"trbxes": [{"id": "T1", "orders": [101]}]}
    d = c.get(f"{P}/wb/supplies/WB-GI-1").json()
    assert d["step"] == 2 and d["picked_all"] is False and d["boxes"] == [{"id": "T1", "orders": ["101"]}]
    assert d["picking"][0]["orders"] == ["101"] and d["orders"][0]["price_uzs"] == 50

    fake.routes[("POST", "/api/v3/supplies/WB-GI-1/trbx")] = {"trbxIds": ["T2"]}
    assert post(c, f"{P}/wb/supplies/WB-GI-1/boxes", {"amount": 1}).json() == {"trbxIds": ["T2"]}
    fake.routes[("POST", "/api/v3/supplies/WB-GI-1/trbx/stickers")] = {"stickers": [{"file": PNG}]}
    assert post(c, f"{P}/wb/supplies/WB-GI-1/boxes/stickers", {"ids": ["T2"]}).json() == {"files": [PNG]}
    fake.routes[("PATCH", "/api/v3/supplies/WB-GI-1/deliver")] = (204, None)
    Order.objects.filter(ext_id="101").update(stage="assembly")
    assert post(c, f"{P}/wb/supplies/WB-GI-1/deliver").json() == {"ok": True}
    assert Order.objects.get(ext_id="101").stage == "transit"


# ---------------------------------------------------------------- audit
def test_audit_run_and_mute(client, fake, settings):
    settings.OZON_TOKEN = settings.UZUM_TOKEN = ""  # faqat WB
    client.force_login(User.objects.create_user(1, "Admin", "admin"))
    fake.routes[("POST", "/content/v2/get/cards/list")] = {
        "cards": [
            {
                "nmID": 555,
                "vendorCode": "SPA",
                "title": "Remen SPA",
                "photos": [],
                "sizes": [{"chrtID": 9, "skus": ["111"]}],
            },
            {"nmID": 556, "vendorCode": "SPB", "title": "Remen SPB", "photos": [{}], "sizes": [{"skus": []}]},
        ],
        "cursor": {"total": 2},
    }
    fake.routes[("POST", "/content/v2/cards/error/list")] = {
        "data": {"items": [{"vendorCode": "SPA", "errors": {"x": ["bad"]}}]}
    }
    fake.routes[("GET", "/api/v1/analytics/banned-products/blocked")] = {"report": [{"nmId": 556}]}

    Order.objects.create(channel="wb", ext_id="9", stage="assembly", payload={"nmId": 555}, lines=[])
    assert post(client, f"{P}/audit/run").json() == {"cards": 2}
    assert Order.objects.get(ext_id="9").lines is None  # kartochka yangilandi — qatorlar qayta hisoblanadi
    got = {(i["ext_id"], i["code"]) for i in client.get(f"{P}/audit").json()}
    assert got == {
        ("555", "photo_none"),
        ("555", "wb_error"),
        ("556", "no_barcode"),
        ("556", "no_chrt"),
        ("556", "blocked"),
    }
    summ = client.get(f"{P}/overview").json()["audit"]
    assert summ[0]["severity"] == "crit" and {s["code"] for s in summ} == {c for _, c in got}

    i = Issue.objects.get(ext_id="555", code="photo_none")
    assert post(client, f"{P}/audit/{i.pk}/mute").json() == {"ok": True}
    assert len(client.get(f"{P}/audit?code=photo_none").json()) == 0

    # rasm qo'shildi, blok olindi → keyingi tekshiruvda yopiladi
    fake.routes[("POST", "/content/v2/get/cards/list")]["cards"][1]["sizes"] = [{"chrtID": 1, "skus": ["9"]}]
    fake.routes[("GET", "/api/v1/analytics/banned-products/blocked")] = {"report": []}
    post(client, f"{P}/audit/run")
    assert {(i["ext_id"], i["code"]) for i in client.get(f"{P}/audit").json()} == {("555", "wb_error")}


def test_audit_admin_only(c, fake):
    assert post(c, f"{P}/audit/run").status_code == 403

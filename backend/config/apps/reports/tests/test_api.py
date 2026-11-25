"""Hisobotlar (Jarvis templates/reports qoidalari): boshlang'ich shablon, IT taklifi darhol faol, boshliq taklifi —
tasdiq kutadi, eskirgan taklif tasdiqlanmaydi, xodim formasi (qiymatlarni tozalash, o'chirish), /me report_depts."""

import pytest

from config.apps.audit.models import Event
from config.apps.reports.models import Template

pytestmark = pytest.mark.django_db
FIELDS = [
    {"key": "calls", "label": "Qo'ng'iroqlar", "type": "number"},
    {"key": "note", "label": "Izoh", "type": "text"},
]


def post(c, path, body=None):
    return c.post(path, body or {}, content_type="application/json")


@pytest.fixture
def org(depts, make_user):
    from config.apps.jarvis.models import Agent

    Agent.objects.create(key="sotuv_b2b", kind="dept", name="Sotuv B2B", persona="p" * 25, parent=depts["rahbariyat"])
    from config.apps.staff.services import sync_departments  # noqa: F401 — bo'limlar agentlardan sinxron

    seller = make_user(30, "employee", Agent.objects.get(key="sotuv_b2b"))
    head = make_user(31, "employee")
    head.heads = [{"dept_group": "sotuv_b2b", "perms": {}}]
    head.save()
    it = make_user(32, "employee", depts["it"])
    return {"seller": seller, "head": head, "it": it}


def test_seed_and_form(client, org):
    assert Template.objects.get(dept="sotuv_b2b").title == "SOTUVCHI"  # migratsiyadagi boshlang'ich shablon
    client.force_login(org["seller"])
    assert client.get("/app/api/me").json()["report_depts"] == ["sotuv_b2b"]
    r = client.get("/app/api/report", {"dept": "sotuv_b2b"}).json()
    assert r["template"]["title"] == "SOTUVCHI" and r["values"] == {}
    assert post(
        client,
        "/app/api/report",
        {"dept": "sotuv_b2b", "values": {"calls": "1 200", "sales": "5,5", "comment": " ok "}},
    ).json() == {"ok": True}
    assert client.get("/app/api/report", {"dept": "sotuv_b2b"}).json()["values"] == {
        "calls": 1200,
        "sales": 5.5,
        "comment": "ok",
    }
    post(client, "/app/api/report", {"dept": "sotuv_b2b", "values": {"calls": "", "sales": 7}})  # bo'sh — o'chadi
    assert client.get("/app/api/report", {"dept": "sotuv_b2b"}).json()["values"] == {"sales": 7, "comment": "ok"}
    assert (
        "raqam" in post(client, "/app/api/report", {"dept": "sotuv_b2b", "values": {"calls": "ko'p"}}).json()["detail"]
    )
    assert client.get("/app/api/report", {"dept": "it"}).status_code == 403
    assert Event.objects.filter(event="report_submitted", tg_id=30).count() == 2


def test_propose_and_approve(client, org):
    body = {"dept": "sotuv_b2b", "title": "Sotuv v2", "fields": FIELDS, "ask_at": "18:30"}
    client.force_login(org["head"])
    t = post(client, "/app/api/templates", body).json()["template"]
    assert t["status"] == "pending" and t["version"] == 2
    assert (
        post(
            client, "/app/api/templates", {**body, "fields": [{"key": "Bad Key", "label": "x", "type": "number"}]}
        ).status_code
        == 400
    )
    assert post(client, f"/app/api/templates/{t['id']}/approve").status_code == 403  # boshliq tasdiqlay olmaydi
    client.force_login(org["it"])
    data = client.get("/app/api/templates").json()
    assert data["is_approver"] and any(x["id"] == t["id"] and x["proposed_name"] == "U31" for x in data["templates"])
    a = post(client, f"/app/api/templates/{t['id']}/approve").json()["template"]
    assert a["status"] == "active" and a["decided_name"] == "U32"
    assert Template.objects.get(dept="sotuv_b2b", version=1).status == "archived"
    # IT taklifi — darhol faol; eskirgan taklif tasdiqlanmaydi
    client.force_login(org["head"])
    old = post(client, "/app/api/templates", {**body, "title": "Eski"}).json()["template"]
    client.force_login(org["it"])
    assert post(client, "/app/api/templates", {**body, "title": "Yangi"}).json()["template"]["status"] == "active"
    assert "eskirgan" in post(client, f"/app/api/templates/{old['id']}/approve").json()["detail"]


def test_category_and_permissions(client, org, make_user):
    client.force_login(org["it"])
    body = {"dept": "sotuv_b2b:monitoring", "title": "monitoring", "fields": FIELDS}
    assert post(client, "/app/api/templates", body).json()["template"]["status"] == "active"
    assert any(d["key"] == "sotuv_b2b:monitoring" for d in client.get("/app/api/templates").json()["depts"])
    assert post(client, "/app/api/templates", {**body, "dept": "yoq:x"}).status_code == 400
    client.force_login(make_user(40, "employee"))
    assert client.get("/app/api/templates").status_code == 403


def test_phone_options(admin_client):
    r = admin_client.get("/app/api/phone/options").json()
    assert r["yeastar"] == [] and r["moizvonki_enabled"] is False and r["errors"]

"""Logistika: ruxsat (logistika/ombor — ha, sotuv — yo'q), yaratish (raqam LG-yy-00001, tekshiruvlar), qidiruv va
holat soni, holat o'tishlari (faqat ruxsat etilgan, tarixga yoziladi), yopilgan jo'natma tahrirlanmaydi."""

import pytest
from django.utils import timezone

pytestmark = pytest.mark.django_db
U = "/app/api/erp/logistics"


def post(c, path, body=None):
    return c.post(path, body or {}, content_type="application/json")


@pytest.fixture
def env(client, make_user, depts):
    from config.apps.jarvis.models import Agent

    ombor = Agent.objects.create(key="ombor", kind="dept", name="Ombor", persona="p" * 25, parent=depts["rahbariyat"])
    users = {"ombor": make_user(201, "employee", ombor), "seller": make_user(101, "employee", depts["sotuv"])}

    def as_(who):
        client.force_login(users[who])
        return client

    return as_


BODY = {"carrier": "fargo", "recipient": "Almerro Group", "phone": "+998901234567", "city": "Samarqand", "places": 2}


def test_access(env):
    assert env("seller").get(f"{U}/shipments").status_code == 403
    m = env("ombor").get(f"{U}/meta").json()
    assert [c["key"] for c in m["carriers"]] == ["emu", "yandex_go", "bito", "fargo"]


def test_create_and_validate(env):
    c = env("ombor")
    r = post(c, f"{U}/shipments", {**BODY, "cost": "120 000", "weight_kg": "3,5"}).json()
    yy = timezone.localdate().strftime("%y")
    assert r["number"] == f"LG-{yy}-00001" and r["status"] == "new" and r["cost"] == 120000 and r["weight_kg"] == 3.5
    assert r["history"][0]["status"] == "new" and r["history"][0]["by"] == 201
    assert post(c, f"{U}/shipments", BODY).json()["number"] == f"LG-{yy}-00002"
    bad = post(c, f"{U}/shipments", {**BODY, "carrier": "dhl"})
    assert bad.status_code == 422 and "carrier" in bad.json()["detail"]
    assert post(c, f"{U}/shipments", {"carrier": "emu", "recipient": "X"}).json()["detail"] == {
        "address": "Shahar yoki manzilni yozing"
    }
    assert post(c, f"{U}/shipments", {**BODY, "cost": "abc"}).status_code == 422
    assert post(c, f"{U}/shipments", {**BODY, "places": 0}).status_code == 422


def test_list_search_counts(env):
    c = env("ombor")
    a = post(c, f"{U}/shipments", BODY).json()
    post(c, f"{U}/shipments", {**BODY, "carrier": "emu", "recipient": "Navoiy Azot", "city": "Navoiy"})
    post(c, f"{U}/shipments/{a['id']}/status", {"status": "handed"})
    d = c.get(f"{U}/shipments").json()
    assert len(d["shipments"]) == 2 and d["counts"]["new"] == 1 and d["counts"]["handed"] == 1 and d["active"] == 2
    assert [s["recipient"] for s in c.get(f"{U}/shipments", {"q": "navoiy"}).json()["shipments"]] == ["Navoiy Azot"]
    assert len(c.get(f"{U}/shipments", {"carrier": "fargo"}).json()["shipments"]) == 1
    assert len(c.get(f"{U}/shipments", {"status": "handed"}).json()["shipments"]) == 1


def test_status_flow(env):
    c = env("ombor")
    sid = post(c, f"{U}/shipments", BODY).json()["id"]
    bad = post(c, f"{U}/shipments/{sid}/status", {"status": "delivered"})
    assert bad.status_code == 409 and bad.json()["detail"] == "«Yangi» holatidan «Yetkazildi» ga o'tib bo'lmaydi"
    r = post(c, f"{U}/shipments/{sid}", {"track_no": "FG123"}).json()
    assert r["track_no"] == "FG123"
    assert post(c, f"{U}/shipments/{sid}/status", {"status": "handed"}).json()["next"] == [
        "transit",
        "delivered",
        "returned",
        "cancelled",
    ]
    r = post(c, f"{U}/shipments/{sid}/status", {"status": "delivered", "note": "Qabul qildi"}).json()
    assert (
        r["status"] == "delivered"
        and r["next"] == []
        and [h["status"] for h in r["history"]]
        == [
            "new",
            "handed",
            "delivered",
        ]
    )
    assert r["history"][-1]["note"] == "Qabul qildi"
    assert post(c, f"{U}/shipments/{sid}", {"note": "x"}).status_code == 409
    assert c.get(f"{U}/shipments/999").status_code == 404

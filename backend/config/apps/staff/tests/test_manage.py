"""Xodimlarni boshqarish: rol berish qoidalari, taklif havolasi (yaratish → bot → faol xodim), boshliq tayinlash."""

from datetime import timedelta

import pytest
from django.utils import timezone

from config.apps.bots.login import confirm_login
from config.apps.core.models import LoginToken
from config.apps.staff.manage import accept_invite
from config.apps.staff.models import Invite, PendingHead, User

pytestmark = pytest.mark.django_db


@pytest.fixture
def people(depts, settings):
    settings.TELEGRAM_BOT_USERNAME = "belting_bot"
    owner = User.objects.create_user(1, "Ega", "owner")
    admin = User.objects.create_user(2, "Admin", "admin")
    emp = User.objects.create_user(3, "Xodim", "employee")
    pend = User.objects.create_user(4, "Yangi", "pending")
    return {"owner": owner, "admin": admin, "emp": emp, "pend": pend}


def post(client, path, body=None):
    return client.post(path, body or {}, content_type="application/json")


def tg(i: int, username: str = "") -> dict:
    return {"id": i, "first_name": "Ali", "last_name": "Valiyev", "username": username}


def test_rol_va_bolim_berish(client, people):
    client.force_login(people["admin"])
    r = post(client, "/app/api/users/4", {"departments": ["sotuv"], "manager_id": 2})
    assert r.status_code == 200
    u = User.objects.get(tg_id=4)
    assert u.role == "employee" and u.dept_keys() == ["sotuv"] and u.manager_id == people["admin"].pk
    assert post(client, "/app/api/users/3", {"role": "blocked"}).status_code == 200
    assert User.objects.get(tg_id=3).role == "blocked"
    assert post(client, "/app/api/users/3", {"departments": ["yoq"]}).status_code == 400
    assert post(client, "/app/api/users/3", {"manager_id": 3}).status_code == 400


def test_huquq_cheklovlari(client, people):
    client.force_login(people["admin"])
    assert post(client, "/app/api/users/1", {"role": "employee"}).status_code == 403  # ega
    assert post(client, "/app/api/users/3", {"role": "admin"}).status_code == 403  # adminlik — faqat ega
    assert post(client, "/app/api/users/2", {"role": "employee"}).status_code == 403  # o'zini
    assert post(client, "/app/api/users/2", {"departments": ["it"]}).status_code == 200  # rolsiz saqlash — mumkin
    client.force_login(people["owner"])
    assert post(client, "/app/api/users/3", {"role": "admin"}).status_code == 200
    client.force_login(User.objects.create_user(9, "Oddiy", "employee"))
    assert post(client, "/app/api/users/4", {"departments": ["it"]}).status_code == 403


def test_boshliqlik_va_royxat(client, people):
    client.force_login(people["owner"])
    post(client, "/app/api/users/3", {"heads": [{"dept": "sotuv", "perms": {"tasks": True}}]})
    users = {u["tg_id"]: u for u in client.get("/app/api/users").json()["users"]}
    assert users[3]["heads"] == [{"dept_group": "sotuv", "perms": {"tasks": True}}]


def test_taklif_havolasi(client, people):
    client.force_login(people["admin"])
    assert post(client, "/app/api/invites", {"dept": "sotuv", "role": "admin"}).status_code == 403
    assert post(client, "/app/api/invites", {"dept": "yoq"}).status_code == 400
    inv = post(
        client, "/app/api/invites", {"dept": "sotuv", "name": "Yangi sotuvchilar", "max_uses": 2, "days": 3}
    ).json()
    assert inv["link"] == f"https://t.me/belting_bot?start=inv_{inv['code']}" and inv["uses"] == 0
    assert [i["code"] for i in client.get("/app/api/heads").json()["invites"]] == [inv["code"]]

    assert "Xush kelibsiz" in accept_invite(inv["code"], tg(500, "ali_v"))
    u = User.objects.get(tg_id=500)
    assert u.role == "employee" and u.dept_keys() == ["sotuv"] and u.username == "ali_v"
    # tasdiq kutayotgan odam ham taklif bilan faollashadi
    accept_invite(inv["code"], tg(4))
    assert User.objects.get(tg_id=4).role == "employee"
    assert "eskirgan" in accept_invite(inv["code"], tg(501))  # 2/2 ishlatildi
    assert not User.objects.filter(tg_id=501).exists()

    inv2 = post(client, "/app/api/invites", {"dept": "it"}).json()
    assert post(client, f"/app/api/invites/{inv2['code']}/revoke").status_code == 200
    assert "eskirgan" in accept_invite(inv2["code"], tg(502))
    inv3 = Invite.objects.create(code="old", dept="it", expires=timezone.now() - timedelta(minutes=1))
    assert "eskirgan" in accept_invite(inv3.code, tg(503))


def test_bloklangan_taklif_bilan_kirolmaydi(client, people):
    people["emp"].role = "blocked"
    people["emp"].save()
    i = Invite.objects.create(code="c1", dept="it", expires=timezone.now() + timedelta(days=1))
    assert "yopiq" in accept_invite("c1", tg(3))
    assert User.objects.get(tg_id=3).role == "blocked" and Invite.objects.get(pk=i.pk).uses == 0


def test_boshliq_username_orqali(client, people):
    client.force_login(people["owner"])
    assert post(client, "/app/api/heads", {"dept": "sotuv", "username": "@kelajak"}).status_code == 200
    pend = client.get("/app/api/users").json()["pending_heads"]
    assert pend[0]["username"] == "kelajak"
    # kelajak taklif orqali kirdi — boshliq bo'ldi, kutish ro'yxatidan o'chdi
    Invite.objects.create(code="c2", dept="sotuv", expires=timezone.now() + timedelta(days=1))
    accept_invite("c2", tg(600, "Kelajak"))
    assert User.objects.get(tg_id=600).heads == [{"dept_group": "sotuv", "perms": {}}]
    assert not PendingHead.objects.exists()
    # login orqali ham
    post(client, "/app/api/heads", {"dept": "it", "username": "xodim3"})
    User.objects.filter(tg_id=3).update(username="xodim3")
    t = LoginToken.objects.create()
    confirm_login(t.token, tg(3, "xodim3"))
    assert User.objects.get(tg_id=3).heads == [{"dept_group": "it", "perms": {}}]
    hid = PendingHead.objects.create(username="x", dept_group="it").pk
    assert client.delete(f"/app/api/heads/{hid}").status_code == 200

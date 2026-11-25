"""Rollar: boshlang'ich (tizim) rollari, rol berish → modullar va CRM rahbari, ruxsatlar katalogi, kim boshqaradi,
tizim rolini o'chirib bo'lmaydi, bloklangan xodimda rol ishlamaydi."""

import pytest

from config.apps.erp.crm.access import is_sales_head
from config.apps.staff.models import AccessRole, User

pytestmark = pytest.mark.django_db


def post(c, path, body=None):
    return c.post(path, body or {}, content_type="application/json")


@pytest.fixture
def people(depts):
    return {
        "admin": User.objects.create_user(2, "Admin", "admin"),
        "emp": User.objects.create_user(3, "Xodim", "employee"),
        "hr": User.objects.create_user(5, "Kadr", "employee"),
    }


def test_tizim_rollari_va_berish(client, people):
    keys = set(AccessRole.objects.filter(system=True).values_list("key", flat=True))
    assert {"sotuvchi", "sotuv_rahbari", "buxgalter", "omborchi", "rahbariyat"} <= keys
    emp = people["emp"]
    assert emp.modules() == [] and not is_sales_head(emp)
    client.force_login(people["admin"])
    assert post(client, "/app/api/users/3", {"roles": ["sotuvchi"]}).status_code == 200
    emp = User.objects.get(tg_id=3)
    assert set(emp.modules()) == {"crm", "tgcrm", "sales"} and not is_sales_head(emp)
    post(client, "/app/api/users/3", {"roles": ["sotuv_rahbari", "omborchi"]})
    emp = User.objects.get(tg_id=3)
    assert is_sales_head(emp) and "warehouse" in emp.modules() and "crm.head" in emp.perm_list()
    row = next(u for u in client.get("/app/api/users").json()["users"] if u["tg_id"] == 3)
    assert sorted(row["roles"]) == ["omborchi", "sotuv_rahbari"]
    assert post(client, "/app/api/users/3", {"roles": ["yoq"]}).status_code == 400
    # bloklangan — rol ishlamaydi
    post(client, "/app/api/users/3", {"role": "blocked"})
    emp = User.objects.get(tg_id=3)
    assert emp.modules() == [] and not is_sales_head(emp) and emp.perm_list() == []


def test_rollarni_boshqarish(client, people):
    c = client
    c.force_login(people["admin"])
    d = c.get("/app/api/roles").json()
    assert {"key": "crm.head", "group": "Sotuv"}.items() <= next(
        p for p in d["perms"] if p["key"] == "crm.head"
    ).items()
    r = post(c, "/app/api/roles", {"name": "Kassir", "note": "faqat pul", "perms": ["money"]}).json()
    assert r["key"] == "kassir" and r["perms"] == ["money"] and r["system"] is False
    assert post(c, "/app/api/roles", {"name": "kassir"}).status_code == 409
    assert post(c, f"/app/api/roles/{r['id']}", {"perms": ["nimadir"]}).status_code == 400
    # rahbar ruxsati CRM'ga kirishsiz bo'lmaydi; tartib — katalog bo'yicha
    assert post(c, f"/app/api/roles/{r['id']}", {"perms": ["money", "crm.head"]}).json()["perms"] == [
        "crm",
        "crm.head",
        "money",
    ]
    post(c, "/app/api/users/3", {"roles": ["kassir"]})
    assert next(x for x in c.get("/app/api/roles").json()["roles"] if x["key"] == "kassir")["members"] == [3]
    assert post(c, f"/app/api/roles/{r['id']}/delete").status_code == 200
    assert User.objects.get(tg_id=3).modules() == []
    sys_id = AccessRole.objects.get(key="sotuvchi").pk
    assert post(c, f"/app/api/roles/{sys_id}/delete").status_code == 409
    # kadrlar roli: ro'yxatni ko'radi, rollarni o'zgartira olmaydi
    post(c, "/app/api/users/5", {"roles": ["kadrlar"]})
    c.force_login(User.objects.get(tg_id=5))
    assert c.get("/app/api/users").status_code == 200 and c.get("/app/api/roles").status_code == 200
    assert post(c, "/app/api/roles", {"name": "X"}).status_code == 403
    assert post(c, "/app/api/users/3", {"roles": ["rahbariyat"]}).status_code == 403
    assert c.get("/app/api/erp/me").json()["perms"] == ["hr"]


def test_taklif_rol_bilan(client, people, settings):
    from config.apps.staff.manage import accept_invite

    settings.TELEGRAM_BOT_USERNAME = "belting_bot"
    client.force_login(people["admin"])
    body = {"dept": "sotuv", "roles": ["sotuvchi"], "max_uses": 2}
    assert post(client, "/app/api/invites", {**body, "roles": ["yoq"]}).status_code == 400
    inv = post(client, "/app/api/invites", body).json()
    assert inv["roles"] == ["sotuvchi"]
    msg = accept_invite(inv["code"], {"id": 777, "first_name": "Ali"})
    assert "Rol: Sotuvchi" in msg
    u = User.objects.get(tg_id=777)
    assert [r.key for r in u.access_roles.all()] == ["sotuvchi"] and "sales" in u.modules()

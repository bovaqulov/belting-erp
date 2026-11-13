import pytest

from config.apps.jarvis.runtime import system_prompt
from config.apps.memory.models import Fact
from config.apps.memory.services import facts_for

pytestmark = pytest.mark.django_db


def test_list_and_actions(admin_client, make_user):
    make_user(5, "employee")
    Fact.objects.create(text="Narxlar so'mda", scope="firma")
    p = Fact.objects.create(text="Akmal ertalab ishlaydi", scope="xodim", scope_key="5", status="pending")
    mem = admin_client.get("/app/api/memory").json()["memory"]
    assert {m["fact"] for m in mem} == {"Narxlar so'mda", "Akmal ertalab ishlaydi"}
    assert next(m for m in mem if m["scope"] == "xodim")["owner_name"] == "U5"
    assert admin_client.post(f"/app/api/memory/{p.pk}/approve").status_code == 200
    assert Fact.objects.get(pk=p.pk).status == "active"
    assert admin_client.post(f"/app/api/memory/{p.pk}/archive").status_code == 200
    assert admin_client.post(f"/app/api/memory/{p.pk}/yoq").status_code == 400
    assert admin_client.post(f"/app/api/memory/{p.pk}/delete").status_code == 200
    assert not Fact.objects.filter(pk=p.pk).exists()


def test_facts_scope_and_prompt(depts):
    Fact.objects.create(text="F1 firma", scope="firma")
    Fact.objects.create(text="F2 sotuv", scope="bolim", scope_key="sotuv")
    Fact.objects.create(text="F3 it", scope="bolim", scope_key="it")
    Fact.objects.create(text="F4 kutmoqda", scope="firma", status="pending")
    assert set(facts_for("sotuv", None)) == {"F1 firma", "F2 sotuv"}
    agent = depts["sotuv"]
    agent.tools = ["memory"]
    text = system_prompt(agent)
    assert "F2 sotuv" in text and "F3 it" not in text and "F4" not in text


def test_employee_cannot_manage(client, make_user, depts):
    client.force_login(make_user(6, "employee", depts["sotuv"]))
    f = Fact.objects.create(text="x", scope="firma")
    assert client.get("/app/api/memory").status_code == 403
    assert client.post(f"/app/api/memory/{f.pk}/delete").status_code == 403

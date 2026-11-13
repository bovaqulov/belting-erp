import json

import pytest

from config.apps.jarvis.models import Agent, AgentRun, AgentSchedule, AgentTask

pytestmark = pytest.mark.django_db

NEW = {
    "key": "instagram_ai",
    "kind": "free",
    "name": "Instagram AI",
    "name_ru": "",
    "parent": "sotuv",
    "owner_tg": None,
    "icon": "megaphone",
    "color": "#af52de",
    "model": "claude-sonnet-5-5",
    "tools": ["web", "kb"],
    "sees_all": False,
    "scopes": {"crm": "inherit", "leads": "all"},
    "audience": {"depts": ["sotuv"], "users": []},
    "channels": [{"id": "c1", "type": "instagram_direct", "ref": "@belting.uz", "mode": "approve"}],
    "persona": "Sen Instagram Direct'ga javob beruvchi agentsan.",
}


def post(c, url, body):
    return c.post(url, json.dumps(body), content_type="application/json")


def patch(c, url, body):
    return c.patch(url, json.dumps(body), content_type="application/json")


def test_overview_shape(admin_client):
    d = admin_client.get("/app/api/overview").json()
    assert {a["key"] for a in d["departments"]} == {"rahbariyat", "it", "sotuv"}
    assert len(d["agents"]) == 3
    it = next(a for a in d["agents"] if a["key"] == "it")
    assert it["parent"] == "rahbariyat" and it["kind"] == "dept" and it["schedules"] == []


def test_create_agent_and_subagent(admin_client):
    r = post(admin_client, "/app/api/agents", NEW)
    assert r.status_code == 201, r.content
    a = Agent.objects.get(key="instagram_ai")
    assert (
        a.parent is not None
        and a.parent.key == "sotuv"
        and a.scopes == {"leads": "all"}
        and a.name_ru == "Instagram AI"
    )
    sub = {**NEW, "key": "ig_direct", "name": "Direct javobchi", "parent": "instagram_ai", "channels": []}
    assert post(admin_client, "/app/api/agents/", sub).status_code == 201
    tree = {x["key"]: x["parent"] for x in admin_client.get("/app/api/overview").json()["agents"]}
    assert tree["ig_direct"] == "instagram_ai"


@pytest.mark.parametrize(
    ("change", "status", "word"),
    [
        ({"key": "Bad Key"}, 400, "Kalit"),
        ({"key": "it"}, 409, "band"),
        ({"persona": "qisqa"}, 400, "Persona"),
        ({"tools": ["yoq"]}, 400, "vosita"),
        ({"kind": "staff"}, 400, "xodimni"),
        ({"channels": [{"type": "instagram_direct", "ref": "", "mode": "auto"}]}, 400, "Kanal"),
        ({"parent": "yoq"}, 400, "topilmadi"),
        ({"color": "red"}, 400, "Rang"),
    ],
)
def test_create_validation(admin_client, change, status, word):
    r = post(admin_client, "/app/api/agents", {**NEW, **change})
    assert r.status_code == status and word in r.json()["detail"]


def test_dept_parent_must_be_dept_and_no_cycle(admin_client):
    post(admin_client, "/app/api/agents", NEW)
    r = post(admin_client, "/app/api/agents", {**NEW, "key": "servis", "kind": "dept", "parent": "instagram_ai"})
    assert r.status_code == 400 and "bo'lim agenti" in r.json()["detail"]
    r = patch(admin_client, "/app/api/agents/rahbariyat", {"parent": "it"})  # o'z avlodi ostiga
    assert r.status_code == 400 and "aylana" in r.json()["detail"]


def test_staff_agent_needs_owner(admin_client, make_user):
    make_user(2, "employee")
    body = {**NEW, "key": "bekzod_ai", "kind": "staff", "owner_tg": 2}
    assert post(admin_client, "/app/api/agents", body).status_code == 201
    owner = Agent.objects.get(key="bekzod_ai").owner
    assert owner is not None and owner.tg_id == 2


def test_patch_and_delete_reparents(admin_client):
    post(admin_client, "/app/api/agents", NEW)
    post(admin_client, "/app/api/agents", {**NEW, "key": "ig_direct", "parent": "instagram_ai", "channels": []})
    assert patch(admin_client, "/app/api/agents/instagram_ai", {"name": "IG AI", "tools": ["web"]}).status_code == 200
    assert Agent.objects.get(key="instagram_ai").name == "IG AI"
    assert admin_client.delete("/app/api/agents/instagram_ai").status_code == 200
    parent = Agent.objects.get(key="ig_direct").parent
    assert parent is not None and parent.key == "sotuv"  # bir daraja yuqoriga


def test_permissions(client, make_user, depts):
    emp = make_user(3, "employee", depts["sotuv"])
    client.force_login(emp)
    assert client.get("/app/api/overview").status_code == 403  # oddiy xodim — panel yo'q
    it_user = make_user(4, "employee", depts["it"])
    client.force_login(it_user)
    assert client.get("/app/api/overview").status_code == 200
    assert post(client, "/app/api/agents", NEW).status_code == 201  # IT boshqaradi


def test_schedule_crud(admin_client):
    body = {"id": "s1", "title": "Ertalabki hisobot", "instruction": "Kechagi savdoni jamla", "repeat": "weekly",
            "time": "09:00", "days": [1, 3], "day": 1, "date": "", "deliver": "owner", "enabled": True}  # fmt: skip
    r = post(admin_client, "/app/api/agents/sotuv/schedules", body)
    assert r.status_code == 201 and r.json()["id"] == "s1" and r.json()["next_run_at"]
    assert patch(admin_client, "/app/api/agents/sotuv/schedules/s1", {"enabled": False}).json()["next_run_at"] is None
    bad = post(admin_client, "/app/api/agents/sotuv/schedules", {**body, "id": "s2", "time": "25:00"})
    assert bad.status_code == 400
    assert admin_client.delete("/app/api/agents/sotuv/schedules/s1").status_code == 200


def test_tick_runs_due_schedule(admin_client):
    from django.utils import timezone

    from config.apps.jarvis.tasks import tick

    s = AgentSchedule.objects.create(
        agent=Agent.objects.get(key="sotuv"), title="T", instruction="Hisobot tayyorla", next_run_at=timezone.now()
    )
    assert tick() == 1
    s.refresh_from_db()
    assert s.last_run_at is not None and s.next_run_at is not None and s.next_run_at > timezone.now()
    run = AgentRun.objects.get(schedule=s)
    assert run.ok and "Hisobot tayyorla" in run.output


def test_task_runs_and_finishes(admin_client, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):  # topshiriq commit'dan keyin navbatga qo'yiladi
        r = post(
            admin_client,
            "/app/api/agents/sotuv/tasks",
            {"title": "Akt", "instruction": "Navoiy GMK akt sverka", "due": ""},
        )
    assert r.status_code == 201
    t = AgentTask.objects.get(uid=r.json()["id"])
    assert t.status == "done" and "Navoiy GMK" in t.result  # echo LLM, Celery eager


def test_task_permission(client, make_user, depts):
    client.force_login(make_user(5, "employee", depts["it"]))  # IT — boshqaruvchi
    ok = post(client, "/app/api/agents/sotuv/tasks", {"title": "A", "instruction": "bajarish kerak bo'lgan ish"})
    assert ok.status_code == 201
    client.force_login(make_user(6, "employee"))  # bo'limsiz xodim
    no = post(client, "/app/api/agents/sotuv/tasks", {"title": "A", "instruction": "bajarish kerak bo'lgan ish"})
    assert no.status_code == 403

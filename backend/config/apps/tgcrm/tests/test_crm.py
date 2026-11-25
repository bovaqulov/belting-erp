"""7-bosqich: CRM qatlami — mijoz kartasi, voronka, teglar, izohlar, vazifalar, tez javoblar, SLA hisobot, eslatmalar."""

from datetime import timedelta

import pytest
from django.utils import timezone

from config.apps.staff.models import User
from config.apps.staff.services import set_departments
from config.apps.tgcrm import crm
from config.apps.tgcrm.models import Account, Contact, Dialog, Kind, Message, Note, Peer, PeerKind, Task

pytestmark = pytest.mark.django_db
P = "/app/api/tgcrm"
HEAD, S1, S2 = 100, 201, 202


@pytest.fixture
def team(depts):
    head = User.objects.create_user(HEAD, "Rahbar", "employee")
    set_departments(head, [depts["sotuv"].key])
    out = {"head": head}
    for tg, name in ((S1, "Akmal"), (S2, "Dilshod")):
        u = User.objects.create_user(tg, name, "employee", manager=head)
        set_departments(u, [depts["sotuv"].key])
        out[name] = u
    return out


def chat(a, pid=5, kind=PeerKind.USER, **kw):
    p = Peer.objects.create(account=a, peer_id=pid, kind=kind, title=f"Mijoz {pid}", phone="+998901112233")
    return Dialog.objects.create(account=a, peer=p, top_msg_id=1, last_date=timezone.now(), **kw)


def as_(client, u):
    client.force_login(u)
    return client


def patch(c, path, body):
    return c.patch(path, body, content_type="application/json")


def post(c, path, body=None):
    return c.post(path, body or {}, content_type="application/json")


def test_contact_card_and_stage(client, team):
    comp = Account.objects.create(kind=Kind.COMPANY, owner_tg=HEAD, title="F")
    chat(comp)
    chat(comp, pid=-100500, kind=PeerKind.SUPERGROUP)
    c = as_(client, team["Akmal"])
    url = f"{P}/accounts/{comp.pk}/chats/5/contact"
    r = c.get(url).json()
    assert r["name"] == "Mijoz 5" and r["phone"] == "+998901112233" and r["stage"] == "new" and r["can_write"]
    assert len(r["stages"]) == 6
    assert c.get(f"{P}/accounts/{comp.pk}/chats/-100500/contact").status_code == 400  # guruh — mijoz emas
    assert patch(c, url, {"inn": "12345"}).status_code == 400
    r = patch(
        c,
        url,
        {
            "company": "Belting",
            "inn": "301234567",
            "amount": "12 500 000",
            "tags": ["ulgurji", "ulgurji", "tishli remen"],
            "owner_tg": S2,
        },
    )
    j = r.json()
    assert (
        r.status_code == 200
        and j["company"] == "Belting"
        and j["amount"] == "12500000.00"
        and j["owner"]["name"] == "Dilshod"
    )
    assert sorted(t["name"] for t in j["tags"]) == ["tishli remen", "ulgurji"]
    assert patch(c, url, {"owner_tg": 999}).status_code == 400
    r = patch(c, url, {"stage": "lost"})
    assert r.status_code == 400 and "sabab" in r.json()["detail"]
    assert Contact.objects.get().stage == "new"  # xatoda hech narsa o'zgarmaydi
    j = patch(c, url, {"stage": "offer"}).json()
    assert j["stage"] == "offer" and j["notes"][0]["text"] == "Bosqich: Yangi → Taklif berildi"
    # boshqa akkauntdagi o'sha mijoz — bitta karta
    other = Account.objects.create(kind=Kind.COMPANY, owner_tg=HEAD, title="G")
    chat(other)
    assert c.get(f"{P}/accounts/{other.pk}/chats/5/contact").json()["company"] == "Belting"
    rows = c.get(f"{P}/accounts/{comp.pk}/dialogs").json()["dialogs"]
    assert next(x for x in rows if x["peer_id"] == 5)["crm"]["stage"] == "offer"


def test_notes_tasks_permissions(client, team):
    own = Account.objects.create(kind=Kind.PERSONAL, owner_tg=S1)
    chat(own)
    base = f"{P}/accounts/{own.pk}/chats/5/contact"
    head = as_(client, team["head"])
    assert head.get(base).json()["can_write"] is False  # rahbar — kuzatuvchi
    assert post(head, f"{base}/notes", {"text": "x"}).status_code == 403
    akmal = as_(client, team["Akmal"])
    j = post(akmal, f"{base}/notes", {"text": "Narx so'radi, 50 m"}).json()
    nid = j["notes"][0]["id"]
    assert j["notes"][0]["author"] == "Akmal"
    due = (timezone.now() + timedelta(days=1)).isoformat()
    assert (
        post(akmal, f"{base}/tasks", {"title": "Qo'ng'iroq", "due_at": due, "assignee_tg": S2}).status_code == 400
    )  # operator emas
    j = post(akmal, f"{base}/tasks", {"title": "Qo'ng'iroq qilish", "due_at": due}).json()
    t = j["tasks"][0]
    assert t["assignee"]["name"] == "Akmal" and not t["overdue"]
    j = post(akmal, f"{base}/tasks/{t['id']}/done").json()
    assert j["tasks"][0]["done_at"]
    assert client.delete(f"{base}/notes/{nid}").status_code == 200


def test_quick_replies(client, team):
    comp = Account.objects.create(kind=Kind.COMPANY, owner_tg=HEAD, title="F")
    url = f"{P}/accounts/{comp.pk}/quick-replies"
    akmal = as_(client, team["Akmal"])
    r = post(akmal, url, {"title": "Narx", "text": "Narx: 1 metr — 120 000 so'm", "shared": True}).json()
    assert r["replies"][0]["shared"] is False  # umumiy — faqat admin
    head = as_(client, team["head"])
    post(head, url, {"title": "Manzil", "text": "Toshkent, …", "shared": True})
    other = Account.objects.create(kind=Kind.COMPANY, owner_tg=HEAD, title="G")
    titles = [x["title"] for x in head.get(f"{P}/accounts/{other.pk}/quick-replies").json()["replies"]]
    assert titles == ["Manzil"]  # umumiy boshqa akkauntda ham, akkauntga xosi — yo'q
    rid = next(x["id"] for x in as_(client, team["Dilshod"]).get(url).json()["replies"] if x["title"] == "Narx")
    assert client.delete(f"{url}/{rid}").status_code == 403  # Dilshod — muallif emas
    assert as_(client, team["Akmal"]).delete(f"{url}/{rid}").status_code == 200


def test_report_and_waiting(client, team):
    comp = Account.objects.create(kind=Kind.COMPANY, owner_tg=HEAD, title="F", sla_minutes=15)
    now = timezone.now()
    d1 = chat(comp, 5, assignee_tg=S1)
    d2 = chat(comp, 6, assignee_tg=S2)
    d3 = chat(comp, 7)

    def msg(d, mid, minutes_ago, out=False, by=None):
        Message.objects.create(
            account=comp, peer=d.peer, msg_id=mid, date=now - timedelta(minutes=minutes_ago), out=out, sent_by=by
        )

    # d1: mijoz 2 marta yozdi (60 va 58 daq oldin), Akmal 50 daqiqa oldin javob berdi → 10 daq (SLA ichida)
    msg(d1, 1, 60)
    msg(d1, 2, 58)
    msg(d1, 3, 50, out=True, by=S1)
    # d2: 120 daq oldin yozdi, javob 60 daq keyin telefondan (sent_by yo'q → mas'ul Dilshod) → 60 daq (SLA tashqarisi)
    msg(d2, 1, 120)
    msg(d2, 2, 60, out=True)
    # d3: 40 daqiqadan beri javobsiz
    msg(d3, 1, 40)
    Dialog.objects.filter(pk=d3.pk).update(last_out=False, last_date=now - timedelta(minutes=40))
    Dialog.objects.filter(pk__in=[d1.pk, d2.pk]).update(last_out=True)
    Contact.objects.create(tg_user_id=5, stage="won")
    c6 = Contact.objects.create(tg_user_id=6, stage="offer")
    Task.objects.create(contact=c6, title="x", due_at=now - timedelta(hours=1), assignee_tg=S2, created_by=S2)

    r = as_(client, team["head"]).get(f"{P}/accounts/{comp.pk}/report?days=7").json()
    assert r["incoming"] == 4 and r["replies"] == 2 and r["median_min"] == 35.0 and r["sla_pct"] == 50
    assert r["waiting_now"] == 1 and r["waiting"][0]["peer_id"] == 7 and r["waiting"][0]["minutes"] == 40
    by = {s["name"]: s for s in r["staff"]}
    assert by["Akmal"]["median_min"] == 10.0 and by["Akmal"]["sla_pct"] == 100
    assert by["Dilshod"]["median_min"] == 60.0 and by["Dilshod"]["assigned"] == 1
    assert {f["stage"]: f["count"] for f in r["funnel"]}["won"] == 1 and r["tasks_overdue"] == 1
    waiting = as_(client, team["Akmal"]).get(f"{P}/accounts/{comp.pk}/dialogs?who=waiting").json()["dialogs"]
    assert [x["peer_id"] for x in waiting] == [7] and waiting[0]["waiting_since"]
    assert patch(as_(client, team["Akmal"]), f"{P}/accounts/{comp.pk}/report", {"sla_minutes": 5}).status_code == 403
    assert (
        patch(as_(client, team["head"]), f"{P}/accounts/{comp.pk}/report", {"sla_minutes": 5}).json()["sla_minutes"]
        == 5
    )


def test_remind_due_once(team, monkeypatch):
    from config.apps.core import telegram

    sent = []
    monkeypatch.setattr(telegram, "send_message", lambda chat_id, text: sent.append((chat_id, text)) or True)
    c = Contact.objects.create(tg_user_id=5, name="Ali")
    Task.objects.create(
        contact=c, title="Qo'ng'iroq", due_at=timezone.now() - timedelta(minutes=1), assignee_tg=S1, created_by=S1
    )
    Task.objects.create(
        contact=c, title="Ertaga", due_at=timezone.now() + timedelta(days=1), assignee_tg=S1, created_by=S1
    )
    assert crm.remind_due() == 1 and sent[0][0] == S1 and "Qo'ng'iroq" in sent[0][1]
    assert crm.remind_due() == 0  # qayta eslatilmaydi
    assert Note.objects.count() == 0

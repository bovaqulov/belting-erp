"""6-bosqich: rollar (admin/operator/kuzatuvchi), a'zolar ro'yxati, chat biriktirish, avto-biriktirish, javob qulfi."""

import pytest
from django.utils import timezone

from config.apps.staff.models import User
from config.apps.staff.services import set_departments
from config.apps.tgcrm import bus
from config.apps.tgcrm.access import can_manage, can_write, role_of
from config.apps.tgcrm.models import Account, AccountEvent, AccountMember, Dialog, Kind, Message, Peer, PeerKind

pytestmark = pytest.mark.django_db
P = "/app/api/tgcrm"
HEAD, S1, S2, S3 = 100, 201, 202, 203


@pytest.fixture
def team(depts):
    head = User.objects.create_user(HEAD, "Rahbar", "employee")
    set_departments(head, [depts["sotuv"].key])
    out = {"head": head}
    for tg, name in ((S1, "Akmal"), (S2, "Dilshod"), (S3, "Sardor")):
        u = User.objects.create_user(tg, name, "employee", manager=head)
        set_departments(u, [depts["sotuv"].key])
        out[name] = u
    return out


@pytest.fixture
def sent(monkeypatch):
    calls = []

    def fake(op, account=None, args=None, *, actor=None, timeout=30):
        args = args or {}
        calls.append((op, args, actor))
        if op == "chats.send":
            d = Dialog.objects.select_related("peer").get(account_id=account, peer__peer_id=args["peer"])
            Message.objects.create(
                account_id=account,
                peer=d.peer,
                msg_id=900 + len(calls),
                date=timezone.now(),
                text=args["text"],
                out=True,
                sent_by=actor,
            )
            return {"msg_id": 900 + len(calls)}
        return {}

    monkeypatch.setattr(bus, "call", fake)
    monkeypatch.setattr(bus, "publish", lambda e: calls.append(("publish", e, None)))
    return calls


def chat(a, pid=5, kind=PeerKind.USER):
    p = Peer.objects.create(account=a, peer_id=pid, kind=kind, title=f"Mijoz {pid}")
    return Dialog.objects.create(account=a, peer=p, top_msg_id=1, last_date=timezone.now())


def as_(client, u):
    client.force_login(u)
    return client


def post(c, path, body=None):
    return c.post(path, body or {}, content_type="application/json")


def test_role_matrix(team):
    comp = Account.objects.create(kind=Kind.COMPANY, owner_tg=HEAD, title="F")
    own = Account.objects.create(kind=Kind.PERSONAL, owner_tg=S1)
    akmal, dilshod, head = team["Akmal"], team["Dilshod"], team["head"]
    assert role_of(akmal, comp) == "operator"  # ro'yxat bo'sh — hamma operator (oldingi xulq)
    AccountMember.objects.create(account=comp, staff_tg=S1, role="viewer")
    assert role_of(akmal, comp) == "viewer" and not can_write(akmal, comp)
    assert role_of(dilshod, comp) is None  # ro'yxat bor, unda yo'q — kirish yo'q
    assert role_of(head, comp) == "admin"
    assert role_of(akmal, own) == "admin"
    assert (
        role_of(head, own) == "viewer" and not can_write(head, own) and can_manage(head, own)
    )  # rahbar uza oladi, yozmaydi
    AccountMember.objects.create(account=own, staff_tg=S2, role="operator")  # sotuvchining yordamchisi
    assert can_write(dilshod, own) and not can_manage(dilshod, own)


def test_visibility_follows_members(client, team):
    comp = Account.objects.create(kind=Kind.COMPANY, owner_tg=HEAD, title="F")
    c = as_(client, team["Dilshod"])
    assert c.get(f"{P}/accounts/{comp.pk}").json()["role"] == "operator"
    AccountMember.objects.create(account=comp, staff_tg=S1, role="operator")
    assert c.get(f"{P}/accounts/{comp.pk}").status_code == 404
    assert comp.pk not in {a["id"] for a in c.get(f"{P}/accounts").json()["accounts"]}
    assert as_(client, team["Akmal"]).get(f"{P}/accounts/{comp.pk}").status_code == 200


def test_members_api(client, team, sent):
    comp = Account.objects.create(kind=Kind.COMPANY, owner_tg=HEAD, title="F")
    d = chat(comp)
    d.assignee_tg = S2
    d.save()
    c = as_(client, team["Akmal"])
    assert (
        c.put(
            f"{P}/accounts/{comp.pk}/members", {"tg_id": S2, "role": "admin"}, content_type="application/json"
        ).status_code
        == 403
    )
    h = as_(client, team["head"])
    r = h.get(f"{P}/accounts/{comp.pk}/members").json()
    assert r["open"] and r["can_manage"] and {x["tg_id"] for x in r["candidates"]} >= {S1, S2, S3}
    h.put(f"{P}/accounts/{comp.pk}/members", {"tg_id": S1, "role": "operator"}, content_type="application/json")
    r = h.put(
        f"{P}/accounts/{comp.pk}/members", {"tg_id": S2, "role": "operator"}, content_type="application/json"
    ).json()
    assert [m["name"] for m in r["members"]] == ["Akmal", "Dilshod"] and not r["open"]
    assert (
        h.put(
            f"{P}/accounts/{comp.pk}/members", {"tg_id": S3, "role": "boss"}, content_type="application/json"
        ).status_code
        == 400
    )
    h.put(f"{P}/accounts/{comp.pk}/members", {"tg_id": S2, "role": None}, content_type="application/json")
    d.refresh_from_db()
    assert d.assignee_tg is None  # chiqarilgan xodimning chatlari bo'shaydi
    assert AccountEvent.objects.filter(account=comp, kind="member", actor_tg=HEAD).count() == 3


def test_assign_rules(client, team, sent):
    comp = Account.objects.create(kind=Kind.COMPANY, owner_tg=HEAD, title="F")
    chat(comp)
    url = f"{P}/accounts/{comp.pk}/chats/5/assign"
    akmal = as_(client, team["Akmal"])
    assert post(akmal, url, {"tg_id": S2}).status_code == 403  # boshqaga — faqat admin
    r = post(akmal, url, {"tg_id": S1})
    assert r.status_code == 200 and r.json()["assignee"] == {"tg_id": S1, "name": "Akmal"}
    dilshod = as_(client, team["Dilshod"])
    assert post(dilshod, url, {"tg_id": S2}).status_code == 409  # band
    assert post(dilshod, url, {"tg_id": None}).status_code == 403  # birovnikini bo'shata olmaydi
    head = as_(client, team["head"])
    assert post(head, url, {"tg_id": S2}).json()["assignee"]["tg_id"] == S2
    assert post(head, url, {"tg_id": 999}).status_code == 400  # operator emas
    assert ("publish", {"type": "dialog", "account": comp.pk, "peer": 5}, None) in sent
    mine = as_(client, team["Dilshod"]).get(f"{P}/accounts/{comp.pk}/dialogs?who=mine").json()["dialogs"]
    assert [x["peer_id"] for x in mine] == [5]
    staff = as_(client, team["Dilshod"]).get(f"{P}/accounts/{comp.pk}/staff").json()["staff"]
    assert {s["tg_id"] for s in staff} >= {S1, S2, S3}


def test_auto_assign_and_lock(client, team, sent):
    comp = Account.objects.create(kind=Kind.COMPANY, owner_tg=HEAD, title="F")
    d = chat(comp)
    chat(comp, pid=-100500, kind=PeerKind.SUPERGROUP)
    base = f"{P}/accounts/{comp.pk}/chats"
    akmal = as_(client, team["Akmal"])
    free = akmal.get(f"{P}/accounts/{comp.pk}/dialogs?who=free").json()["dialogs"]
    assert [x["peer_id"] for x in free] == [5]  # guruh — biriktirilmaydi
    r = post(akmal, f"{base}/5/lock").json()
    assert r == {"holder": S1, "name": "Akmal", "mine": True}
    dilshod = as_(client, team["Dilshod"])
    st = dilshod.get(f"{base}/5/lock-state").json()
    assert st["holder"] == S1 and st["name"] == "Akmal" and not st["mine"]
    r = post(dilshod, f"{base}/5/send", {"text": "Salom"})
    assert r.status_code == 409 and "Akmal hozir" in r.json()["detail"]
    assert (
        post(dilshod, f"{base}/5/send", {"text": "Salom", "force": True}).status_code == 201
    )  # ogohlantirishdan keyin
    d.refresh_from_db()
    assert d.assignee_tg == S2  # birinchi javob bergan — mas'ul
    akmal = as_(client, team["Akmal"])
    post(akmal, f"{base}/5/lock", {"release": True})
    assert as_(client, team["Sardor"]).get(f"{base}/5/lock-state").json()["holder"] is None
    post(as_(client, team["Sardor"]), f"{base}/5/send", {"text": "Men ham"})
    d.refresh_from_db()
    assert d.assignee_tg == S2  # mas'ul o'zgarmaydi
    post(as_(client, team["Sardor"]), f"{base}/-100500/send", {"text": "guruhga"})
    assert Dialog.objects.get(peer__peer_id=-100500).assignee_tg is None


def test_personal_owner_not_candidate_and_readable_journal(client, team, sent):
    own = Account.objects.create(kind=Kind.PERSONAL, owner_tg=S1)
    chat(own)
    c = as_(client, team["Akmal"])
    r = c.get(f"{P}/accounts/{own.pk}/members").json()
    assert (
        S1 not in {x["tg_id"] for x in r["candidates"]}
        and S2 in {x["tg_id"] for x in r["candidates"]}
        and not r["open"]
    )
    post(c, f"{P}/accounts/{own.pk}/chats/5/assign", {"tg_id": S1})
    c.put(f"{P}/accounts/{own.pk}/members", {"tg_id": S2, "role": "operator"}, content_type="application/json")
    ev = {e["kind"]: e for e in c.get(f"{P}/accounts/{own.pk}/events").json()["events"]}
    assert ev["assign"]["detail"] == "Mijoz 5 → Akmal" and ev["assign"]["actor"] == "Akmal"
    assert ev["member"]["detail"] == "Dilshod: Operator"

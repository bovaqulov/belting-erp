"""TelegramCRM API: huquqlar (rahbar / xodim / modulsiz), akkaunt yaratish, kirish qadamlari, shlyuz yo'qligi."""

import pytest

from config.apps.staff.models import User
from config.apps.staff.services import set_departments
from config.apps.tgcrm import bus
from config.apps.tgcrm.models import Account, Kind, Status

pytestmark = pytest.mark.django_db
P = "/app/api/tgcrm"
HEAD, S1, S2, OTHER = 100, 201, 202, 300


@pytest.fixture
def team(depts):
    head = User.objects.create_user(HEAD, "Rahbar", "employee")
    set_departments(head, [depts["sotuv"].key])
    s1 = User.objects.create_user(S1, "Akmal", "employee", manager=head)
    s2 = User.objects.create_user(S2, "Dilshod", "employee", manager=head)
    for u in (s1, s2):
        set_departments(u, [depts["sotuv"].key])
    other = User.objects.create_user(OTHER, "Omborchi", "employee")
    set_departments(other, [depts["it"].key])
    return {"head": head, "s1": s1, "s2": s2, "other": other}


@pytest.fixture
def calls(monkeypatch, settings):
    settings.TGCRM_API_ID, settings.TGCRM_API_HASH = 1, "h"
    got = []

    def fake(op, account=None, args=None, *, actor=None, timeout=30):
        got.append((op, account, args, actor))
        return {"status": "code_sent"}

    monkeypatch.setattr(bus, "call", fake)
    monkeypatch.setattr(bus, "alive", lambda: True)
    return got


def as_(client, u):
    client.force_login(u)
    return client


def post(client, path, body=None):
    return client.post(path, body or {}, content_type="application/json")


def test_module_access(client, team):
    assert as_(client, team["other"]).get(f"{P}/status").status_code == 403
    r = as_(client, team["s1"]).get(f"{P}/status")
    assert r.status_code == 200 and r.json()["me"]["is_head"] is False
    assert as_(client, team["head"]).get(f"{P}/status").json()["me"]["is_head"] is True


def test_create_and_visibility(client, team):
    c = as_(client, team["s1"])
    assert post(c, f"{P}/accounts", {"kind": "company", "title": "Sotuv"}).status_code == 403
    mine = post(c, f"{P}/accounts", {"kind": "personal"}).json()
    assert mine["owner_tg"] == S1 and mine["status"] == Status.NEW and "auth_key" not in mine
    c = as_(client, team["head"])
    assert post(c, f"{P}/accounts", {"kind": "company"}).status_code == 400  # nomsiz
    comp = post(c, f"{P}/accounts", {"kind": "company", "title": "Sotuv bo'limi"}).json()
    Account.objects.create(kind=Kind.PERSONAL, owner_tg=S2)

    s2 = {a["id"] for a in as_(client, team["s2"]).get(f"{P}/accounts").json()["accounts"]}
    assert comp["id"] in s2 and mine["id"] not in s2  # boshqaning shaxsiy raqami ko'rinmaydi
    assert as_(client, team["s2"]).get(f"{P}/accounts/{mine['id']}").status_code == 404
    rows = as_(client, team["head"]).get(f"{P}/accounts").json()["accounts"]
    assert len(rows) == 3 and all(r["can_manage"] for r in rows)
    s1 = {r["id"]: r["can_manage"] for r in as_(client, team["s1"]).get(f"{P}/accounts").json()["accounts"]}
    assert s1 == {mine["id"]: True, comp["id"]: False}  # firma raqamini xodim boshqarmaydi


def test_login_steps(client, team, calls):
    a = Account.objects.create(kind=Kind.PERSONAL, owner_tg=S1)
    c = as_(client, team["s1"])
    r = post(c, f"{P}/accounts/{a.pk}/login", {"step": "phone", "phone": "+998901112233"})
    assert r.status_code == 200 and r.json()["result"]["status"] == "code_sent"
    assert calls[-1] == ("login.code", a.pk, {"phone": "+998901112233"}, S1)
    post(c, f"{P}/accounts/{a.pk}/login", {"step": "code", "code": "12345"})
    assert calls[-1][0] == "login.sign_in"
    assert post(c, f"{P}/accounts/{a.pk}/login", {"step": "hack"}).status_code == 400
    comp = Account.objects.create(kind=Kind.COMPANY, owner_tg=HEAD, title="F")
    assert post(c, f"{P}/accounts/{comp.pk}/login", {"step": "qr"}).status_code == 403
    a.status = Status.ACTIVE
    a.save()
    assert post(c, f"{P}/accounts/{a.pk}/login", {"step": "qr"}).status_code == 409


def test_not_configured_and_gateway_down(client, team, settings, monkeypatch):
    a = Account.objects.create(kind=Kind.PERSONAL, owner_tg=S1)
    c = as_(client, team["s1"])
    settings.TGCRM_API_ID = 0
    r = post(c, f"{P}/accounts/{a.pk}/login", {"step": "qr"})
    assert r.status_code == 503 and "TGCRM_API_ID" in r.json()["detail"]
    settings.TGCRM_API_ID, settings.TGCRM_API_HASH = 1, "h"
    monkeypatch.setattr(bus, "alive", lambda: False)
    monkeypatch.setattr(bus, "call", getattr(bus, "_real_call"))  # noqa: B009  # asl: alive() tekshiruvi (Redis'ga bormaydi)
    r = post(c, f"{P}/accounts/{a.pk}/login", {"step": "qr"})
    assert r.status_code == 503 and "tg_gateway" in r.json()["detail"]


def test_delete(client, team, calls):
    new = Account.objects.create(kind=Kind.PERSONAL, owner_tg=S1)
    live = Account.objects.create(kind=Kind.PERSONAL, owner_tg=S1, status=Status.ACTIVE, tg_user_id=5)
    c = as_(client, team["s1"])
    assert c.delete(f"{P}/accounts/{new.pk}").status_code == 200
    assert not calls  # sessiyasiz — shlyuzga bormaydi
    assert c.delete(f"{P}/accounts/{live.pk}").status_code == 200
    assert calls[-1][:2] == ("account.logout", live.pk)
    assert not Account.objects.exists()


def test_qr_image(client, team, calls, monkeypatch):
    a = Account.objects.create(kind=Kind.PERSONAL, owner_tg=S1)
    monkeypatch.setattr(bus, "call", lambda *a, **k: {"status": "qr", "url": "tg://login?token=abc", "expires": "x"})
    r = post(as_(client, team["s1"]), f"{P}/accounts/{a.pk}/login", {"step": "qr"}).json()
    assert r["result"]["qr"].startswith("data:image/svg+xml")


# ---------------------------------------------------------------------- 2-bosqich: chatlar API
def _chat(a, pid=5, kind="user", title="Mijoz", top=10, **kw):
    from config.apps.tgcrm.models import Dialog, Message, Peer

    p = Peer.objects.create(account=a, peer_id=pid, kind=kind, title=title)
    from django.utils import timezone

    d = Dialog.objects.create(account=a, peer=p, top_msg_id=top, last_date=timezone.now(), last_text="salom", **kw)
    Message.objects.create(account=a, peer=p, msg_id=top, date=timezone.now(), text="salom")
    return d


def test_dialogs_and_negative_peer(client, team, calls):
    a = Account.objects.create(kind=Kind.COMPANY, owner_tg=HEAD, title="F", status=Status.ACTIVE)
    _chat(a, 5)
    _chat(a, -1000000000042, kind="supergroup", title="Guruh")
    c = as_(client, team["s1"])
    r = c.get(f"{P}/accounts/{a.pk}/dialogs").json()
    assert {d["peer_id"] for d in r["dialogs"]} == {5, -1000000000042} and r["synced"]
    assert c.get(f"{P}/accounts/{a.pk}/chats/-1000000000042").json()["title"] == "Guruh"
    assert c.get(f"{P}/accounts/{a.pk}/dialogs?folder=999").status_code == 404
    assert c.get(f"{P}/accounts/{a.pk}/folders").json()["folders"][-1]["id"] == "archive"
    mine = Account.objects.create(kind=Kind.PERSONAL, owner_tg=S2)
    assert c.get(f"{P}/accounts/{mine.pk}/dialogs").status_code == 404  # boshqaning shaxsiy chatlari


def test_messages_lazy_and_stale(client, team, monkeypatch):
    from config.apps.core.http import ApiError
    from config.apps.tgcrm.models import Message

    a = Account.objects.create(kind=Kind.PERSONAL, owner_tg=S1, status=Status.ACTIVE)
    d = _chat(a, 5, top=10)
    got = []

    def fetch(op, account=None, args=None, *, actor=None, timeout=30):  # shlyuz tarixni yozadi
        got.append((op, args))
        from django.utils import timezone

        for i in range(1, 10):
            Message.objects.create(account=a, peer=d.peer, msg_id=i, date=timezone.now(), text=f"t{i}")
        d.history_min_id, d.history_complete = 1, True
        d.save()
        return {"loaded": 9}

    monkeypatch.setattr(bus, "call", fetch)
    c = as_(client, team["s1"])
    r = c.get(f"{P}/accounts/{a.pk}/chats/5/messages").json()
    assert got == [("chats.history", {"peer": 5})]
    assert [m["id"] for m in r["messages"]] == list(range(1, 11)) and not r["has_more"] and not r["stale"]
    c.get(f"{P}/accounts/{a.pk}/chats/5/messages")
    assert len(got) == 1  # to'liq — qayta so'ralmaydi

    d2 = _chat(a, 6, top=20)

    def down(*a_, **k):
        raise ApiError(503, "Telegram shlyuzi ishlamayapti.")

    monkeypatch.setattr(bus, "call", down)
    r = c.get(f"{P}/accounts/{a.pk}/chats/6/messages").json()
    assert r["stale"] and [m["id"] for m in r["messages"]] == [20] and "shlyuz" in r["notice"]
    assert d2.pk


def test_read_marks(client, team, calls):
    a = Account.objects.create(kind=Kind.PERSONAL, owner_tg=S1, status=Status.ACTIVE)
    _chat(a, 5, top=10, unread=2)
    c = as_(client, team["s1"])
    assert post(c, f"{P}/accounts/{a.pk}/chats/5/read", {"max_id": 10}).json() == {"ok": True}
    assert calls[-1] == ("chats.read", a.pk, {"peer": 5, "max_id": 10}, S1)
    assert post(c, f"{P}/accounts/{a.pk}/chats/404/read").status_code == 404


def test_live_filter_and_public():
    from config.apps.tgcrm import live

    ev = {"type": "account", "account": {"id": 3, "status": "active", "phone": "+998"}}
    assert live._account_id(ev) == 3 and live._public(ev) == {"type": "account", "account": 3}
    assert live._public({"type": "msg", "account": 3, "peer": 5, "text": "maxfiy"}) == {
        "type": "msg",
        "account": 3,
        "peer": 5,
    }
    assert live._account_id({"type": "x"}) is None
    assert live.origin_ok({"origin": "https://evil.example", "host": "localhost:3000"}) is False
    assert live.origin_ok({"origin": "http://localhost:3000", "host": "localhost:3000"})


def test_visible_ids(team):
    from config.apps.tgcrm import live

    comp = Account.objects.create(kind=Kind.COMPANY, owner_tg=HEAD, title="F")
    mine = Account.objects.create(kind=Kind.PERSONAL, owner_tg=S1)
    other = Account.objects.create(kind=Kind.PERSONAL, owner_tg=S2)
    assert live.visible_ids(S1) == {comp.pk, mine.pk}
    assert live.visible_ids(HEAD) == {comp.pk, mine.pk, other.pk}
    assert live.visible_ids(OTHER) == set()


def test_send_permissions(client, team, monkeypatch):
    from config.apps.core.http import ApiError
    from config.apps.tgcrm.models import Message

    own = Account.objects.create(kind=Kind.PERSONAL, owner_tg=S1, status=Status.ACTIVE)
    comp = Account.objects.create(kind=Kind.COMPANY, owner_tg=HEAD, title="F", status=Status.ACTIVE)
    d1, d2 = _chat(own, 5), _chat(comp, 6)
    sent = []

    def fake(op, account=None, args=None, *, actor=None, timeout=30):
        args = args or {}
        sent.append((op, account, args, actor))
        if op == "chats.typing":
            raise ApiError(503, "shlyuz yo'q")
        if op != "chats.send":
            return {}
        from django.utils import timezone

        peer = d1.peer if account == own.pk else d2.peer
        Message.objects.create(
            account_id=account, peer=peer, msg_id=99, date=timezone.now(), text=args["text"], out=True, sent_by=actor
        )
        return {"msg_id": 99}

    monkeypatch.setattr(bus, "call", fake)
    s1, head, s2 = team["s1"], team["head"], team["s2"]
    r = post(as_(client, s1), f"{P}/accounts/{own.pk}/chats/5/send", {"text": "Salom", "reply_to": 10})
    assert r.status_code == 201 and r.json()["message"]["sent_by"] == S1
    assert sent[-1] == ("chats.send", own.pk, {"peer": 5, "text": "Salom", "reply_to": 10}, S1)
    # rahbar sotuvchining shaxsiy raqamini ko'radi, lekin uning nomidan yozmaydi
    assert post(as_(client, head), f"{P}/accounts/{own.pk}/chats/5/send", {"text": "x"}).status_code == 403
    assert as_(client, head).get(f"{P}/accounts/{own.pk}/dialogs").json()["can_write"] is False
    # firma raqamidan — bo'lim xodimi yozadi
    assert (
        post(as_(client, s2), f"{P}/accounts/{comp.pk}/chats/6/send", {"text": "Assalomu alaykum"}).status_code == 201
    )
    assert post(as_(client, s2), f"{P}/accounts/{comp.pk}/chats/6/send", {"text": "  "}).status_code == 400
    # "yozmoqda" — shlyuz yo'q bo'lsa ham xato bermaydi
    assert post(as_(client, s2), f"{P}/accounts/{comp.pk}/chats/6/typing").status_code == 200
    msgs = as_(client, s2).get(f"{P}/accounts/{comp.pk}/chats/6/messages").json()
    assert msgs["staff"] == {str(S2): "Dilshod"}

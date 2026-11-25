"""Gateway va akkaunt ishchisi — soxta client bilan: kirish oqimlari, xatolar siyosati, sessiya saqlanishi, qulf."""

import asyncio
from typing import Any, cast

import pytest
from asgiref.sync import sync_to_async
from telethon import errors as te

from config.apps.tgcrm.gateway import store
from config.apps.tgcrm.gateway.errors import GatewayError
from config.apps.tgcrm.gateway.runner import Gateway
from config.apps.tgcrm.gateway.worker import AccountWorker
from config.apps.tgcrm.models import Account, AccountEvent, AccountSession, Kind, Status

from .fakes import FakeBus, FakeClient, user

pytestmark = pytest.mark.django_db(transaction=True)
FAKE = cast(Any, FakeClient)


@pytest.fixture(autouse=True)
def _reset():
    FakeClient.instances.clear()


async def mk(**kw) -> Account:
    return await Account.objects.acreate(owner_tg=kw.pop("owner_tg", 1), **kw)


async def fresh(a: Account) -> Account:
    return await Account.objects.aget(pk=a.pk)


def worker(a: Account, events: list | None = None, setup=None) -> AccountWorker:
    ev = events if events is not None else []

    async def pub(e):
        ev.append(e)

    def factory(session):
        c = FakeClient(session)
        if setup:
            setup(c)
        return c

    return AccountWorker(a.pk, factory, pub)


async def login(w: AccountWorker) -> None:
    await w.send_code("+998 90 111-22-33")
    await w.sign_in("12345")


async def test_code_login_persists_session_and_limits():
    a = await mk()
    events: list = []
    w = worker(a, events)
    res = await w.send_code("+998 90 111-22-33")
    assert res["status"] == Status.CODE_SENT and "ilovasiga" in res["via"]
    assert (await fresh(a)).phone == "+998901112233"
    with pytest.raises(GatewayError, match="Kod noto'g'ri"):
        await w.sign_in("00000")
    assert (await w.sign_in("12-345"))["status"] == Status.ACTIVE
    a = await fresh(a)
    assert a.status == Status.ACTIVE and a.tg_user_id == 777 and a.name == "Ali Valiyev"
    assert a.limits["caption"] == 1024 and a.limits["file_bytes"] == 4000 * 512 * 1024
    assert a.connected_at is not None
    snap = await sync_to_async(store.load_snapshot)(a.pk)
    assert snap is not None
    assert snap["auth_key"] == b"k" * 256 and snap["entities"]
    assert any(e["type"] == "account" and e["account"]["status"] == Status.ACTIVE for e in events)
    await w.close()


async def test_two_factor():
    a = await mk()
    w = worker(a, setup=lambda c: setattr(c, "password", "secret"))
    await w.send_code("+998901112233")
    res = await w.sign_in("12345")
    assert res == {"status": Status.PASSWORD, "hint": "it"}
    assert (await fresh(a)).status == Status.PASSWORD
    with pytest.raises(GatewayError, match="parol noto'g'ri"):
        await w.password("bad")
    assert (await w.password("secret"))["status"] == Status.ACTIVE
    await w.close()


async def test_login_flood_is_readable():
    a = await mk()
    w = worker(a, setup=lambda c: c.errors.update(send_code_request=te.FloodWaitError(request=None, capture=7200)))
    with pytest.raises(GatewayError) as e:
        await w.send_code("+998901112233")
    assert e.value.status == 429 and "soat" in e.value.detail


async def test_same_telegram_account_twice_rejected():
    await mk(tg_user_id=777, status=Status.ACTIVE)
    a = await mk()
    w = worker(a)
    await w.send_code("+998901112233")
    with pytest.raises(GatewayError) as e:
        await w.sign_in("12345")
    assert e.value.status == 409
    a = await fresh(a)
    assert a.status == Status.NEW and a.tg_user_id is None
    assert FakeClient.instances[-1].logged_out  # yangi sessiya Telegram'da yopildi
    assert not await AccountSession.objects.filter(account=a).aexists()


async def test_start_restores_and_unauthorized_logs_out():
    a = await mk()
    w = worker(a)
    await login(w)
    await w.close()
    w2 = worker(a)
    assert await w2.start() is True and w2.authorized
    assert FakeClient.instances[-1].session.get_input_entity(777).access_hash == 555  # entity keshi tiklandi
    await w2.close()
    w3 = worker(a, setup=lambda c: setattr(c, "authorized", False))
    assert await w3.start() is False
    a = await fresh(a)
    assert a.status == Status.LOGGED_OUT
    assert not await AccountSession.objects.filter(account=a).aexists()


async def test_call_flood_peerflood_and_fatal():
    a = await mk()
    w = worker(a)
    await login(w)

    async def flood(c):
        raise te.FloodWaitError(request=None, capture=300)

    with pytest.raises(GatewayError) as e:
        await w.call("send", flood)
    assert e.value.status == 429
    a = await fresh(a)
    assert a.status == Status.FLOOD and a.flood_until is not None
    with pytest.raises(GatewayError, match="kuting"):
        await w.call("send", flood)  # cheklagich — Telegram'ga bormaydi

    async def peer_flood(c):
        raise te.PeerFloodError(request=None)

    with pytest.raises(GatewayError):
        await w.call("history", peer_flood)
    assert (await fresh(a)).status == Status.LIMITED

    async def dup(c):
        raise te.AuthKeyDuplicatedError(request=None)

    with pytest.raises(GatewayError):
        await w.call("history", dup)
    a = await fresh(a)
    assert a.status == Status.LOGGED_OUT and "ikki joyda" in a.status_detail
    assert not await AccountSession.objects.filter(account=a).aexists()
    with pytest.raises(GatewayError, match="ulanmagan"):
        await w.call("history", dup)


async def test_logout_and_cancel():
    a = await mk()
    w = worker(a)
    await login(w)
    c = FakeClient.instances[-1]
    await w.logout(actor=5)
    a = await fresh(a)
    assert c.logged_out and a.status == Status.NEW and a.tg_user_id is None
    assert await AccountEvent.objects.filter(account=a, kind="logout", actor_tg=5).aexists()
    await w.send_code("+998901112233")
    await w.cancel()
    assert (await fresh(a)).status == Status.NEW


# ------------------------------------------------------------------ gateway
async def test_gateway_dispatch_and_single_instance():
    a = await mk(kind=Kind.COMPANY)
    bus = FakeBus()
    gw = Gateway(bus, factory=FAKE)
    task = asyncio.create_task(gw.run())
    await asyncio.sleep(0.1)
    assert bus.lock == gw.token
    with pytest.raises(RuntimeError, match="allaqachon"):
        await Gateway(bus, factory=FAKE).run()  # ikkinchi nusxa — yo'q

    await bus.queue.put(
        {"id": "1", "op": "login.code", "account": a.pk, "args": {"phone": "+998901112233"}, "actor": 9}
    )
    await bus.queue.put({"id": "2", "op": "login.code", "account": 99999, "args": {}})
    await bus.queue.put({"id": "3", "op": "nope", "account": a.pk})
    for _ in range(50):
        if len(bus.replies) == 3:
            break
        await asyncio.sleep(0.05)
    assert bus.replies["1"]["ok"] and bus.replies["1"]["data"]["status"] == Status.CODE_SENT
    assert bus.replies["2"] == {"ok": False, "status": 404, "detail": "Akkaunt topilmadi."}
    assert bus.replies["3"]["status"] == 400

    await bus.queue.put({"id": "4", "op": "login.sign_in", "account": a.pk, "args": {"code": "12345"}})
    for _ in range(50):
        if "4" in bus.replies:
            break
        await asyncio.sleep(0.05)
    assert bus.replies["4"]["ok"]
    gw.stop()
    await task
    assert bus.lock is None  # qulf bo'shatildi

    # qayta ishga tushganda ulangan akkaunt avtomatik ko'tariladi
    gw2 = Gateway(bus, factory=FAKE)
    task = asyncio.create_task(gw2.run())
    await asyncio.sleep(0.1)
    assert gw2.workers[a.pk].authorized
    gw2.stop()
    await task


async def test_lost_lock_stops_gateway(monkeypatch):
    from config.apps.tgcrm.gateway import runner

    monkeypatch.setattr(runner, "LOCK_EVERY", 0.05)
    bus = FakeBus()
    gw = Gateway(bus, factory=FAKE)
    task = asyncio.create_task(gw.run())
    await asyncio.sleep(0.05)
    bus.lock = "boshqa"
    await asyncio.wait_for(task, timeout=2)  # o'zi to'xtaydi


def test_user_fake_is_sane():
    assert user().id == 777

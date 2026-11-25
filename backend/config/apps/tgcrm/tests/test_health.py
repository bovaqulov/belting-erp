"""8-bosqich: ogohlantirishlar (takrorlanmaslik), tizim tekshiruvlari (kalit/sessiya mosligi), doctor, sog'liq API, shlyuz holati."""

import asyncio
from datetime import timedelta
from typing import Any, cast

import pytest
from cryptography.fernet import Fernet
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from config.apps.staff.models import User
from config.apps.staff.services import set_departments
from config.apps.tgcrm import alerts, bus, crypto, health
from config.apps.tgcrm.models import Account, AccountMember, AccountSession, Kind, Status

pytestmark = pytest.mark.django_db
HEAD, S1, S2 = 100, 201, 202


@pytest.fixture
def team(depts):
    head = User.objects.create_user(HEAD, "Rahbar", "employee")
    set_departments(head, [depts["sotuv"].key])
    s1 = User.objects.create_user(S1, "Akmal", "employee", manager=head)
    s2 = User.objects.create_user(S2, "Dilshod", "employee", manager=head)
    for u in (s1, s2):
        set_departments(u, [depts["sotuv"].key])
    return {"head": head, "s1": s1, "s2": s2}


@pytest.fixture
def outbox(monkeypatch):
    from config.apps.core import telegram

    sent: list[tuple[int, str]] = []
    monkeypatch.setattr(telegram, "send_message", lambda chat_id, text: sent.append((chat_id, text)) or True)
    return sent


def test_account_alerts_dedup(team, outbox):
    own = Account.objects.create(kind=Kind.PERSONAL, owner_tg=S1, title="Akmal raqami", status=Status.LOGGED_OUT)
    assert alerts.account_changed(own.pk, Status.LOGGED_OUT, "Qayta ulang") == 2
    assert {tg for tg, _ in outbox} == {S1, HEAD}  # egasi + rahbar; boshqa sotuvchiga emas
    assert "sessiya tugadi" in outbox[0][1]
    assert alerts.account_changed(own.pk, Status.LOGGED_OUT) == 0  # soatiga bir marta
    assert alerts.account_changed(own.pk, Status.OFFLINE) == 0  # vaqtinchalik — beat tekshiradi
    Account.objects.filter(pk=own.pk).update(flood_until=timezone.now() + timedelta(minutes=2))
    assert alerts.account_changed(own.pk, Status.FLOOD) == 0  # qisqa flood — shovqin qilmaymiz
    comp = Account.objects.create(kind=Kind.COMPANY, owner_tg=HEAD, title="Firma", status=Status.BANNED)
    AccountMember.objects.create(account=comp, staff_tg=S2, role="admin")
    outbox.clear()
    alerts.account_changed(comp.pk, Status.BANNED)
    assert {tg for tg, _ in outbox} == {S2, HEAD}


def test_beat_check_gateway_and_offline(team, outbox, settings, monkeypatch):
    settings.TGCRM_API_ID = 1

    class R:
        keys: set[str] = set()

        def set(self, k, v, nx=False, ex=None):
            if k in self.keys:
                return None
            self.keys.add(k)
            return True

    fake = R()
    monkeypatch.setattr(bus, "_redis", lambda: fake)
    Account.objects.create(kind=Kind.COMPANY, owner_tg=HEAD, title="F", status=Status.ACTIVE)
    assert alerts.check()["sent"] == 1 and "shlyuzi ishlamayapti" in outbox[-1][1]
    assert alerts.check()["sent"] == 0  # soatiga bir marta
    off = Account.objects.create(kind=Kind.PERSONAL, owner_tg=S1, title="X", status=Status.OFFLINE)
    Account.objects.filter(pk=off.pk).update(updated_at=timezone.now() - timedelta(minutes=15))
    outbox.clear()
    alerts.check()
    assert {tg for tg, _ in outbox} == {S1, HEAD} and "aloqa yo'q" in outbox[0][1]


def test_checks_detect_foreign_sessions(settings, monkeypatch):
    settings.TGCRM_API_ID, settings.TGCRM_API_HASH = 1, "h"
    settings.TGCRM_SESSION_KEY = Fernet.generate_key().decode()
    a = Account.objects.create(owner_tg=1, status=Status.ACTIVE)
    AccountSession.objects.create(account=a, auth_key=crypto.encrypt(b"k" * 256))
    names = {c["name"]: c for c in health.checks()}
    assert names["Sessiyalar"]["level"] == "ok" and names["Sessiya kaliti"]["level"] == "ok"
    settings.TGCRM_SESSION_KEY = Fernet.generate_key().decode()  # boshqa muhit kaliti — prod bazasi dev'ga nusxalangan
    names = {c["name"]: c for c in health.checks()}
    assert names["Sessiyalar"]["level"] == "error" and str(a.pk) in names["Sessiyalar"]["detail"]
    assert names["Shlyuz"]["level"] == "error"  # ulangan akkaunt bor, shlyuz yo'q
    with pytest.raises(CommandError):
        call_command("tgcrm_doctor")
    settings.TGCRM_SESSION_KEY = ""
    assert {c["name"]: c for c in health.checks()}["Sessiya kaliti"]["level"] == "warn"


def test_health_api(client, team, monkeypatch):
    a = Account.objects.create(kind=Kind.COMPANY, owner_tg=HEAD, title="F", status=Status.ACTIVE)
    monkeypatch.setattr(
        bus,
        "gateway_info",
        lambda: {"started_at": 0, "accounts": {str(a.pk): {"authorized": True, "last_update": None}}},
    )
    client.force_login(team["s1"])
    assert client.get("/app/api/tgcrm/health").status_code == 403
    client.force_login(team["head"])
    r = client.get("/app/api/tgcrm/health").json()
    assert {c["name"] for c in r["checks"]} >= {"Telegram API", "Redis", "Shlyuz", "Media kesh"}
    assert r["accounts"][0]["connected"] is True and r["accounts"][0]["status_label"] == "Ulangan"


@pytest.mark.django_db(transaction=True)
async def test_gateway_writes_info(monkeypatch):
    from config.apps.tgcrm.gateway import runner

    from .fakes import FakeBus, FakeClient

    monkeypatch.setattr(runner, "LOCK_EVERY", 0.05)
    bus_ = FakeBus()
    gw = runner.Gateway(bus_, factory=cast(Any, FakeClient))
    task = asyncio.create_task(gw.run())
    await asyncio.sleep(0.2)
    gw.stop()
    await task
    assert bus_.infos and bus_.infos[-1]["pid"] and "accounts" in bus_.infos[-1]

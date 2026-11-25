"""DbSession: snapshot ↔ yuklash, entity indeksi, faqat o'zgarganlar saqlanadi; shifrlash; bazaga yozish."""

import datetime as dt

import pytest
from telethon.crypto import AuthKey
from telethon.tl import types

from config.apps.tgcrm import crypto
from config.apps.tgcrm.gateway import store
from config.apps.tgcrm.gateway.session import DbSession
from config.apps.tgcrm.models import Account, AccountSession, SessionEntity

from .fakes import user


def _session() -> DbSession:
    s = DbSession()
    s.set_dc(2, "149.154.167.51", 443)
    s.auth_key = AuthKey(b"a" * 256)
    s.set_update_state(0, types.updates.State(10, 3, dt.datetime(2026, 11, 1, tzinfo=dt.UTC), 7, unread_count=0))
    s.set_update_state(-1001234, types.updates.State(55, 0, dt.datetime.now(dt.UTC), 0, unread_count=0))
    s.process_entities(types.contacts.ResolvedPeer(peer=types.PeerUser(777), chats=[], users=[user()]))
    return s


def test_snapshot_roundtrip():
    snap = _session().snapshot(full=True)
    s2 = DbSession(snap)
    assert (s2.dc_id, s2.server_address, s2.port) == (2, "149.154.167.51", 443)
    assert s2.auth_key.key == b"a" * 256
    st = s2.get_update_state(0)
    assert (st.pts, st.qts, st.seq) == (10, 3, 7)
    assert s2.get_update_state(-1001234).pts == 55
    peer = s2.get_input_entity(777)
    assert isinstance(peer, types.InputPeerUser) and peer.access_hash == 555
    assert s2.get_input_entity("ali").user_id == 777  # username — keshdan, resolve so'rovisiz


def test_dirty_only_and_update_replaces():
    s = _session()
    assert len(s.snapshot()["entities"]) == 1
    assert s.snapshot()["entities"] == []  # o'zgarmagan — qayta yozilmaydi
    u = user()
    u.username = "ali_new"
    s.process_entities(types.contacts.ResolvedPeer(peer=types.PeerUser(777), chats=[], users=[u]))
    ents = s.snapshot()["entities"]
    assert len(ents) == 1 and ents[0][2] == "ali_new"
    assert s.entity_count == 1  # dublikat yo'q
    assert s.get_entity_rows_by_username("ali") is None


@pytest.mark.django_db
def test_store_entity_without_username():
    """Ko'p foydalanuvchida username/telefon yo'q (None) — saqlash yiqilmasin (sessiya kaliti ham shu tranzaksiyada)."""
    a = Account.objects.create(owner_tg=1)
    s = _session()
    u = user(uid=900)
    u.username, u.phone = None, None
    s.process_entities(types.contacts.ResolvedPeer(peer=types.PeerUser(900), chats=[], users=[u]))
    store.save_snapshot(a.pk, s.snapshot(full=True))
    e = SessionEntity.objects.get(account=a, peer_id=900)
    assert (e.username, e.phone) == ("", "")
    snap = store.load_snapshot(a.pk)
    assert snap is not None
    assert DbSession(snap).get_entity_rows_by_username("") is None  # bo'sh qator — username deb topilmaydi


def test_failed_write_keeps_dirty():
    s = _session()
    snap = s.snapshot()
    assert snap["entities"] and s.snapshot()["entities"] == []
    s.mark_dirty(snap["entities"])
    assert len(s.snapshot()["entities"]) == 1


def test_save_calls_persist():
    got = []
    s = DbSession(persist=got.append)
    s.save()
    assert got and got[0]["auth_key"] is None


def test_crypto(settings):
    t = crypto.encrypt(b"secret")
    assert b"secret" not in t.encode() and crypto.decrypt(t) == b"secret"
    settings.TGCRM_SESSION_KEY = crypto.Fernet.generate_key().decode()
    assert crypto.decrypt(t) is None  # kalit almashdi — sessiya yaroqsiz (qayta ulash)


@pytest.mark.django_db
def test_store_encrypts_at_rest():
    a = Account.objects.create(owner_tg=1)
    store.save_snapshot(a.pk, _session().snapshot(full=True))
    row = AccountSession.objects.get(account=a)
    assert row.auth_key and "aaaa" not in row.auth_key
    snap = store.load_snapshot(a.pk)
    assert snap is not None
    assert snap["auth_key"] == b"a" * 256 and snap["states"]["0"][0] == 10
    assert snap["entities"][0][:3] == (777, 555, "ali")
    store.save_snapshot(a.pk, _session().snapshot(full=True))  # qayta — unique to'qnashuvsiz yangilanadi
    assert SessionEntity.objects.filter(account=a).count() == 1

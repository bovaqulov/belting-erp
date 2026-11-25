"""Gateway sinxroni soxta client bilan: dialoglar sahifalari, papkalar, dangasa tarix, o'qildi, jonli hodisalar."""

from types import SimpleNamespace
from typing import Any, cast

import pytest
from telethon.tl import types

from config.apps.tgcrm.gateway import limiter
from config.apps.tgcrm.gateway.worker import AccountWorker
from config.apps.tgcrm.models import Account, Dialog, Folder, Message, Peer

from .fakes import FakeClient
from .fakes import user as me_user
from .tl import T0, channel, dialog, msg, user

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def _fast(monkeypatch):
    FakeClient.instances.clear()
    monkeypatch.setattr(limiter, "INTERVAL", dict.fromkeys(limiter.INTERVAL, 0.0))


def _dialogs_pages() -> list[Any]:
    """2 sahifa: 100 ta (DialogsSlice) + 1 ta (kanal, arxivda)."""
    users: list[Any] = [user(1000 + i, f"Mijoz {i}") for i in range(100)]
    page1 = types.messages.DialogsSlice(
        count=101,
        dialogs=[
            dialog(types.PeerUser(1000 + i), 5000 - i, unread=1 if i == 0 else 0, pinned=i == 0) for i in range(100)
        ],
        messages=[msg(5000 - i, types.PeerUser(1000 + i), f"x{i}", minutes=-i) for i in range(100)],
        chats=[],
        users=users,
    )
    ch = channel(42, "Yangiliklar")
    page2 = types.messages.DialogsSlice(
        count=101,
        dialogs=[dialog(types.PeerChannel(42), 9, folder_id=1)],
        messages=[msg(9, types.PeerChannel(42), "post", minutes=-500)],
        chats=[ch],
        users=[],
    )
    return [page1, page2]


async def _connected(events: list | None = None) -> tuple[AccountWorker, FakeClient, Account]:
    a = await Account.objects.acreate(owner_tg=1)
    ev = events if events is not None else []

    async def pub(e):
        ev.append(e)

    def factory(session):
        c = FakeClient(session)
        c.responses["GetDialogsRequest"] = _dialogs_pages()
        f = types.DialogFilter(
            id=2,
            title=types.TextWithEntities("Ish", []),
            pinned_peers=[],
            include_peers=[types.InputPeerUser(1000, 10000)],
            exclude_peers=[],
        )
        c.responses["GetDialogFiltersRequest"] = types.messages.DialogFilters(filters=[types.DialogFilterDefault(), f])
        return c

    w = AccountWorker(a.pk, cast(Any, factory), pub)
    await w.send_code("+998901112233")
    await w.sign_in("12345")
    for t in list(w._bg):
        await t  # fon sinxroni
    return w, FakeClient.instances[-1], a


async def test_dialogs_sync_pages_and_folders():
    events: list = []
    w, c, a = await _connected(events)
    assert await Dialog.objects.filter(account=a).acount() == 101
    d = await Dialog.objects.select_related("peer").aget(peer__peer_id=1000)
    assert d.pinned and d.unread == 1 and d.last_text == "x0"
    ch = await Dialog.objects.select_related("peer").aget(peer__peer_id=-1000000000042)
    assert ch.archived and ch.peer.kind == "channel"
    reqs = [r for r in c.requests if type(r).__name__ == "GetDialogsRequest"]
    assert len(reqs) == 2 and reqs[1].offset_id == 4901 and reqs[1].exclude_pinned  # 2-sahifa — oxirgi dialogdan
    assert await Folder.objects.filter(account=a).acount() == 1
    assert {"type": "dialogs", "account": a.pk} in events and {"type": "folders", "account": a.pk} in events
    assert len(c.handlers) == 4  # yangi, tahrir, o'chirish, xom
    await w.close()


async def test_history_lazy_and_read():
    w, c, _ = await _connected()
    p = types.PeerUser(1000)
    c.responses["GetHistoryRequest"] = [
        types.messages.MessagesSlice(
            count=80,
            messages=[msg(i, p, minutes=i - 5000) for i in range(5000, 4950, -1)],
            chats=[],
            users=[me_user(), user(1000)],
            topics=[],
        ),
        types.messages.Messages(messages=[msg(i, p) for i in range(4950, 4920, -1)], chats=[], users=[], topics=[]),
    ]
    r = await w.sync.history(1000)
    assert r["loaded"] == 50 and r["min_id"] == 4951 and not r["complete"]
    r = await w.sync.history(1000)
    assert r["complete"] and r["min_id"] == 4921
    hist = [x for x in c.requests if type(x).__name__ == "GetHistoryRequest"]
    assert hist[0].offset_id == 0 and hist[1].offset_id == 4951
    assert (await w.sync.history(1000))["loaded"] == 0  # to'liq — Telegram'ga bormaydi
    assert len([x for x in c.requests if type(x).__name__ == "GetHistoryRequest"]) == 2
    await w.sync.read(1000, 5000)
    assert c.read_acks[-1][1] == 5000
    d = await Dialog.objects.aget(peer__peer_id=1000)
    assert d.unread == 0 and d.read_inbox_max == 5000
    await w.close()


async def test_live_events():
    events: list = []
    w, _, a = await _connected(events)
    events.clear()
    newcomer = user(2000, "Yangi mijoz")
    ev = SimpleNamespace(message=msg(6000, types.PeerUser(2000), "Assalomu alaykum"), _entities={2000: newcomer})
    await w.sync.on_new(cast(Any, ev))
    d = await Dialog.objects.select_related("peer").aget(peer__peer_id=2000)
    assert d.unread == 1 and d.peer.title == "Yangi mijoz" and d.last_text == "Assalomu alaykum"
    assert events[-1] == {"account": a.pk, "type": "msg", "op": "new", "peer": 2000, "msg_id": 6000, "out": False}

    await w.sync.on_raw(
        types.UpdateReadHistoryInbox(peer=types.PeerUser(2000), max_id=6000, still_unread_count=0, pts=1, pts_count=1)
    )
    assert (await Dialog.objects.aget(peer__peer_id=2000)).unread == 0
    await w.sync.on_raw(types.UpdateUserTyping(user_id=2000, action=types.SendMessageRecordAudioAction()))
    assert events[-1]["type"] == "typing" and events[-1]["action"] == "voice"
    await w.sync.on_raw(types.UpdateUserStatus(user_id=2000, status=types.UserStatusOnline(expires=T0)))
    assert (await Peer.objects.aget(account=a, peer_id=2000)).online
    await w.sync.on_raw(types.UpdateDialogPinned(peer=types.DialogPeer(types.PeerUser(2000)), pinned=True))
    assert (await Dialog.objects.aget(peer__peer_id=2000)).pinned
    await w.sync.on_raw(
        types.UpdateFolderPeers(folder_peers=[types.FolderPeer(types.PeerUser(2000), 1)], pts=1, pts_count=1)
    )
    assert (await Dialog.objects.aget(peer__peer_id=2000)).archived

    edited = SimpleNamespace(message=msg(6000, types.PeerUser(2000), "Assalomu alaykum!", edit_date=None), _entities={})
    await w.sync.on_edit(cast(Any, edited))
    assert (await Message.objects.aget(peer__peer_id=2000, msg_id=6000)).text == "Assalomu alaykum!"
    gone = SimpleNamespace(
        deleted_ids=[6000],
        chat_id=None,
        original_update=types.UpdateDeleteMessages(messages=[6000], pts=1, pts_count=1),
    )
    await w.sync.on_deleted(cast(Any, gone))
    assert (await Message.objects.aget(peer__peer_id=2000, msg_id=6000)).deleted
    # buzuq hodisa gateway'ni yiqitmaydi (guard)
    bad = w.sync._guard(w.sync.on_new)
    await bad(SimpleNamespace(message=None, _entities={}))
    await w.close()


async def test_send_text_audit_and_errors():
    from telethon import errors as te

    from config.apps.tgcrm.gateway.errors import GatewayError

    events: list = []
    w, c, a = await _connected(events)
    r = await w.sync.send(1000, "Narxi 120 000 so'm *aniq*", reply_to=4990, actor=201)
    m = await Message.objects.aget(peer__peer_id=1000, msg_id=r["msg_id"])
    assert m.out and m.sent_by == 201 and m.reply_to == 4990 and m.text == "Narxi 120 000 so'm *aniq*"
    assert c.sent[-1]["parse_mode"] is None  # markdown yo'q — yulduzchalar matnda qoladi
    d = await Dialog.objects.aget(peer__peer_id=1000)
    assert d.top_msg_id == r["msg_id"] and d.last_out and d.unread == 0
    # Telegram'ning jonli yangilanishi o'sha xabarni qayta yozsa ham sent_by saqlanadi
    from types import SimpleNamespace

    echo = SimpleNamespace(
        message=msg(r["msg_id"], types.PeerUser(1000), "Narxi 120 000 so'm *aniq*", out=True), _entities={}
    )
    await w.sync.on_new(cast(Any, echo))
    assert (await Message.objects.aget(pk=m.pk)).sent_by == 201

    with pytest.raises(GatewayError, match="Bo'sh"):
        await w.sync.send(1000, "  \n ", None, 201)
    with pytest.raises(GatewayError, match="juda uzun"):
        await w.sync.send(1000, "x" * 4097, None, 201)
    c.errors["send_message"] = te.ChatWriteForbiddenError(request=None)
    with pytest.raises(GatewayError) as e:
        await w.sync.send(1000, "salom", None, 201)
    assert e.value.status == 403 and "huquqi" in e.value.detail
    assert (await Account.objects.aget(pk=a.pk)).status == "active"  # akkaunt holati buzilmadi
    await w.close()

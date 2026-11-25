"""5-bosqich: xabar/chat amallari, profil, a'zolar, qidiruv, avatar — soxta client bilan; API huquqlari."""

from types import SimpleNamespace
from typing import Any

import pytest
from telethon import errors as te
from telethon.tl import types

from config.apps.tgcrm import files
from config.apps.tgcrm.gateway.errors import GatewayError
from config.apps.tgcrm.models import AccountEvent, Dialog, Message, Peer

from .test_sync import (
    _connected,
    _fast,  # noqa: F401
)
from .tl import T0, msg, user

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def _media_dir(settings, tmp_path):
    settings.TGCRM_MEDIA_DIR = tmp_path / "tgcrm"


async def test_edit_delete_forward_audit():
    w, c, a = await _connected()
    r = await w.sync.send(1000, "Narx 100", None, 201)
    mid = r["msg_id"]
    await w.actions.edit(1000, mid, "Narx 120", 201)
    m = await Message.objects.aget(peer__peer_id=1000, msg_id=mid)
    assert m.text == "Narx 120" and m.edit_date is not None and c.acts[-1][3] is None  # markdown'siz
    await w.actions.forward(1000, [mid], 1001, 202)
    fwd = await Message.objects.filter(peer__peer_id=1001).order_by("-msg_id").afirst()
    assert fwd is not None and fwd.sent_by == 202 and fwd.fwd
    await w.actions.delete(1000, [mid], True, 201)
    assert (await Message.objects.aget(pk=m.pk)).deleted  # tarix uchun saqlanadi
    kinds = [
        e
        async for e in AccountEvent.objects.filter(account=a, kind__startswith="msg_").values_list(
            "kind", "actor_tg", "detail"
        )
    ]
    assert ("msg_edit", 201, f"1000:{mid}") in kinds and ("msg_delete", 201, f"1000:{mid} (hamma uchun)") in kinds
    assert any(k == "msg_forward" and actor == 202 for k, actor, _ in kinds)
    c.errors["edit_message"] = te.MessageEditTimeExpiredError(request=None)
    with pytest.raises(GatewayError) as e:
        await w.actions.edit(1000, mid, "x", 201)
    assert e.value.status == 403 and "48 soat" in e.value.detail
    await w.close()


async def test_reaction_and_chat_flags():
    w, c, _ = await _connected()
    reactions = types.MessageReactions(
        results=[types.ReactionCount(reaction=types.ReactionEmoji("👍"), count=1, chosen_order=0)]
    )
    c.responses["SendReactionRequest"] = types.Updates(
        updates=[types.UpdateMessageReactions(peer=types.PeerUser(1000), msg_id=5000, reactions=reactions)],
        users=[],
        chats=[],
        date=T0,
        seq=0,
    )
    await w.actions.react(1000, 5000, "👍")
    req = [r for r in c.requests if type(r).__name__ == "SendReactionRequest"][-1]
    assert req.reaction[0].emoticon == "👍"
    m = await Message.objects.aget(peer__peer_id=1000, msg_id=5000)
    assert m.reactions == [{"emoji": "👍", "custom": None, "count": 1, "mine": True}]

    c.responses["ToggleDialogPinRequest"] = True
    c.responses["UpdateNotifySettingsRequest"] = True
    await w.actions.chat_pin(1001, True)
    await w.actions.chat_archive(1001, True)
    await w.actions.chat_mute(1001, 3600)
    d = await Dialog.objects.aget(peer__peer_id=1001)
    assert d.pinned and d.archived and d.muted_until is not None
    await w.actions.chat_mute(1001, None)
    assert (await Dialog.objects.aget(pk=d.pk)).muted_until is None
    assert ("folder", 1) in c.acts
    await w.actions.pin_message(1000, 5000, unpin=False)
    assert ("pin", 5000) in c.acts
    await w.close()


async def test_info_members_search_avatar():
    w, c, a = await _connected()
    d = await Dialog.objects.aget(peer__peer_id=1000)
    before = (d.history_min_id, d.history_complete)
    full = types.UserFull(
        id=1000, settings=types.PeerSettings(), notify_settings=types.PeerNotifySettings(), common_chats_count=2, about="Remen sotib oladi",
        pinned_msg_id=4000,
    )  # fmt: skip
    c.responses["GetFullUserRequest"] = types.users.UserFull(full_user=full, chats=[], users=[])
    c.stored[4000] = msg(4000, types.PeerUser(1000), "Shartnoma shu yerda")
    info = await w.actions.info(1000)
    assert info["about"] == "Remen sotib oladi" and info["pinned_msg_id"] == 4000 and info["common_chats"] == 2
    assert (await Message.objects.aget(peer__peer_id=1000, msg_id=4000)).text == "Shartnoma shu yerda"
    d = await Dialog.objects.aget(pk=d.pk)
    assert (d.history_min_id, d.history_complete) == before  # qadalgan xabar uzluksiz tarixni buzmaydi

    # a'zolar: ega → admin → onlayn → ism
    def member(uid, name, part, online=False):
        u: Any = user(uid, name, status=types.UserStatusOnline(expires=T0) if online else None)
        u.participant = part  # Telethon get_participants shunday qo'shadi
        return u

    c.participants = [
        member(1, "Zafar", types.ChannelParticipant(user_id=1, date=T0)),
        member(2, "Bek", types.ChannelParticipantCreator(user_id=2, admin_rights=types.ChatAdminRights())),
        member(3, "Ali", types.ChannelParticipant(user_id=3, date=T0), online=True),
    ]
    with pytest.raises(GatewayError):
        await w.actions.members(1000, "")  # shaxsiy chat
    w.sync.input_peer = _channel_peer  # type: ignore[method-assign]
    r = await w.actions.members(-100777, "")
    assert [(m["title"], m["role"]) for m in r["members"]][:2] == [("Bek", "owner"), ("Ali", "")]

    c.responses["SearchRequest"] = types.messages.Messages(
        messages=[msg(10, types.PeerChannel(777), "narx qancha"), msg(11, types.PeerUser(5), "begona")],
        chats=[],
        users=[],
        topics=[],
    )
    s = await w.actions.search(-1000000000777, "narx", "", 0)
    assert s["ids"] == [10]  # boshqa chatniki tashlanadi
    with pytest.raises(GatewayError):
        await w.actions.search(1000, "", "", 0)

    await Peer.objects.filter(account=a, peer_id=1000).aupdate(photo_id=55)
    w.sync.input_peer = _user_peer  # type: ignore[method-assign]
    r = await w.actions.avatar(1000)
    assert r["path"].endswith("avatars/1000_55.jpg") and ("avatar", False) in c.acts
    n = len(c.acts)
    await w.actions.avatar(1000)
    assert len(c.acts) == n  # keshdan
    await w.close()


async def _channel_peer(pid: int) -> Any:
    return types.InputPeerChannel(777, 7770)


async def _user_peer(pid: int) -> Any:
    return types.InputPeerUser(pid, pid * 10)


# ------------------------------------------------------------------ API
@pytest.mark.django_db
def test_actions_api(client, depts, monkeypatch, settings, tmp_path):
    from django.utils import timezone

    from config.apps.staff.models import User
    from config.apps.staff.services import set_departments
    from config.apps.tgcrm import bus
    from config.apps.tgcrm.models import Account, Kind

    head = User.objects.create_user(100, "Rahbar", "employee")
    set_departments(head, [depts["sotuv"].key])
    s1 = User.objects.create_user(201, "Akmal", "employee", manager=head)
    set_departments(s1, [depts["sotuv"].key])
    own = Account.objects.create(kind=Kind.PERSONAL, owner_tg=201, status="active")
    p = Peer.objects.create(account=own, peer_id=5, title="Mijoz", photo_id=9)
    Dialog.objects.create(account=own, peer=p, top_msg_id=3, last_date=timezone.now())
    Message.objects.create(account=own, peer=p, msg_id=2, date=timezone.now(), text="kiruvchi narx")
    Message.objects.create(account=own, peer=p, msg_id=3, date=timezone.now(), text="mening narxim", out=True)
    calls = []
    monkeypatch.setattr(bus, "call", lambda op, account=None, args=None, **k: calls.append((op, args)) or {"ok": True})
    base = f"/app/api/tgcrm/accounts/{own.pk}"

    def post(c, path, body):
        return c.post(path, body, content_type="application/json")

    client.force_login(head)
    assert post(client, f"{base}/chats/5/messages/delete", {"ids": [3]}).status_code == 403  # rahbar — faqat kuzatadi
    assert client.get(f"{base}/search?q=narx").json()["results"]  # lekin qidira oladi
    client.force_login(s1)
    assert post(client, f"{base}/chats/5/messages/2/edit", {"text": "x"}).status_code == 403  # birovning xabari
    assert post(client, f"{base}/chats/5/messages/3/edit", {"text": "yangi"}).status_code == 200
    assert calls[-1] == ("msg.edit", {"peer": 5, "msg_id": 3, "text": "yangi"})
    assert post(client, f"{base}/chats/5/messages/delete", {"ids": [2, 3], "revoke": True}).status_code == 200
    assert calls[-1] == ("msg.delete", {"peer": 5, "ids": [2, 3], "revoke": True})
    assert post(client, f"{base}/chats/5/messages/forward", {"ids": [2], "to": 404}).status_code == 404  # begona manzil
    assert post(client, f"{base}/chats/5/mute", {"seconds": None}).status_code == 200
    assert calls[-1] == ("chat.mute", {"peer": 5, "seconds": None})
    assert post(client, f"{base}/chats/5/hack", {}).status_code == 404
    r = client.get(f"{base}/search?q=narx").json()["results"]
    assert {x["message"]["id"] for x in r} == {2, 3} and r[0]["chat"]["title"] == "Mijoz"
    assert client.get(f"{base}/search?q=n").json()["results"] == []  # 2 harfdan kam

    settings.TGCRM_MEDIA_DIR = tmp_path
    av = files.avatar_path(own.pk, 5, 9)
    av.parent.mkdir(parents=True)
    av.write_bytes(b"\xff\xd8")
    r = client.get(f"{base}/peers/5/photo")
    assert r.status_code == 200 and r["Content-Type"] == "image/jpeg"
    assert SimpleNamespace  # import

"""2-bosqich: konvertor (haqiqiy TL turlari) va baza qatlami — uzluksiz tarix, o'qilmaganlar, o'chirish, papkalar."""

import datetime as dt
from typing import Any

import pytest
from telethon.tl import types

from config.apps.tgcrm import inbox
from config.apps.tgcrm.gateway import chats, convert
from config.apps.tgcrm.models import Account, Dialog, Folder, Message, Peer

from .tl import ME, T0, channel, dialog, msg, pid, user


def mf(m: Any) -> dict[str, Any]:
    f = convert.message_fields(m)
    assert f is not None
    return f


def pf(e: Any, self_id: int | None = None) -> dict[str, Any]:
    f = convert.peer_fields(e, self_id)
    assert f is not None
    return f


# ------------------------------------------------------------------ konvertor
def test_peer_fields():
    u = user(5, "Ali", username="ali", contact=True, status=types.UserStatusOffline(was_online=T0))
    f = pf(u, ME)
    assert f["peer_id"] == 5 and f["kind"] == "user" and f["contact"] and f["last_seen"] == T0 and not f["online"]
    assert pf(user(ME), ME)["is_self"]
    c = pf(channel(123, broadcast=False))
    assert c["peer_id"] == -1000000000123 and c["kind"] == "supergroup"
    assert pf(user(9, bot=True))["kind"] == "bot"
    assert convert.peer_fields(types.UserEmpty(id=1)) is None


def test_message_media_and_preview():
    p = types.PeerUser(5)
    photo = types.Photo(
        id=1, access_hash=1, file_reference=b"", date=T0, sizes=[types.PhotoSize("x", 800, 600, 1000)], dc_id=2
    )
    m = mf(msg(10, p, "narxi?", media=types.MessageMediaPhoto(photo=photo)))
    assert m["media"] == {
        "kind": "photo",
        "id": 1,
        "w": 800,
        "h": 600,
        "spoiler": False,
        "ttl": None,
        "mini": None,
        "thumb": True,
    }
    assert convert.preview(m) == "Rasm, narxi?"
    voice = types.Document(
        id=2, access_hash=1, file_reference=b"", date=T0, mime_type="audio/ogg", size=5000, dc_id=2,
        attributes=[types.DocumentAttributeAudio(duration=7, voice=True)],
    )  # fmt: skip
    v = mf(msg(11, p, "", media=types.MessageMediaDocument(document=voice, voice=True)))
    assert v["media"]["kind"] == "voice" and v["media"]["duration"] == 7
    assert convert.preview(v) == "Ovozli xabar"
    bold = mf(msg(12, p, "Salom", entities=[types.MessageEntityBold(0, 5)]))
    assert bold["entities"] == [{"type": "bold", "offset": 0, "length": 5}]
    assert bold["sender_id"] == 5  # kiruvchi shaxsiy xabar — yuboruvchi suhbatdosh


def test_stripped_thumb_and_waveform():
    stripped = types.PhotoStrippedSize("i", bytes([1, 40, 40]) + bytes(60))
    photo = types.Photo(
        id=1,
        access_hash=1,
        file_reference=b"",
        date=T0,
        sizes=[stripped, types.PhotoSize("x", 800, 600, 1000)],
        dc_id=2,
    )
    m = mf(msg(1, types.PeerUser(5), "", media=types.MessageMediaPhoto(photo=photo)))
    assert m["media"]["mini"].startswith("data:image/jpeg;base64,")
    wave = bytes([0xFF] * 40)  # 64 ta 5 bitli qiymat — hammasi 31
    voice = types.Document(
        id=2, access_hash=1, file_reference=b"", date=T0, mime_type="audio/ogg", size=10, dc_id=2,
        attributes=[types.DocumentAttributeAudio(duration=3, voice=True, waveform=wave)],
    )  # fmt: skip
    v = mf(msg(2, types.PeerUser(5), "", media=types.MessageMediaDocument(document=voice, voice=True)))
    assert len(v["media"]["wave"]) == 48 and set(v["media"]["wave"]) == {31}
    assert v["media"]["thumb"] is False


def test_service_reactions_fwd():
    p = types.PeerChat(50)
    s = types.MessageService(
        id=3, peer_id=p, date=T0, action=types.MessageActionChatEditTitle(title="Yangi"), from_id=types.PeerUser(5)
    )
    f = mf(s)
    assert f["action"] == {"type": "ChatEditTitle", "title": "Yangi"} and f["text"] == ""
    assert convert.preview(f) == "nom o'zgardi"
    r = types.MessageReactions(
        results=[types.ReactionCount(reaction=types.ReactionEmoji("👍"), count=3, chosen_order=0)]
    )
    fw = types.MessageFwdHeader(date=T0, from_name="Yashirin")
    m = mf(msg(4, types.PeerUser(5), reactions=r, fwd_from=fw))
    assert m["reactions"] == [{"emoji": "👍", "custom": None, "count": 3, "mine": True}]
    assert m["fwd"]["from_name"] == "Yashirin"
    assert convert.message_fields(types.MessageEmpty(id=1, peer_id=types.PeerUser(5))) is None


def test_dialog_and_folder_fields():
    future = dt.datetime.now(dt.UTC) + dt.timedelta(days=1)
    d = dialog(types.PeerUser(5), 10, unread=2, folder_id=1)
    d.notify_settings = types.PeerNotifySettings(mute_until=future)
    f = convert.dialog_fields(d)
    assert f["archived"] and f["unread"] == 2 and f["muted_until"] == future
    flt = types.DialogFilter(
        id=3, title=types.TextWithEntities("Mijozlar", []), pinned_peers=[], include_peers=[types.InputPeerUser(5, 1), types.InputPeerSelf()],
        exclude_peers=[], contacts=True, emoticon="💼",
    )  # fmt: skip
    ff = convert.folder_fields(flt, 0)
    assert ff is not None
    assert ff["title"] == "Mijozlar" and ff["include"] == [5] and ff["flags"]["contacts"]
    assert convert.folder_fields(types.DialogFilterDefault(), 0) is None


# ------------------------------------------------------------------ baza qatlami
pytestmark = pytest.mark.django_db


@pytest.fixture
def acc():
    return Account.objects.create(owner_tg=1, status="active")


def _seed(acc, n=3):
    """n ta shaxsiy chat (id 5…), har biri bitta oxirgi xabar bilan."""
    peers = [pf(user(5 + i, f"M{i}"), ME) for i in range(n)]
    dialogs = [convert.dialog_fields(dialog(types.PeerUser(5 + i), 100 + i, unread=i)) for i in range(n)]
    msgs = [mf(msg(100 + i, types.PeerUser(5 + i), f"m{i}", minutes=i)) for i in range(n)]
    chats.save_dialogs_page(acc.pk, peers, dialogs, msgs)


def test_save_dialogs_page(acc):
    _seed(acc)
    assert Dialog.objects.filter(account=acc).count() == 3
    d = Dialog.objects.get(peer__peer_id=7)
    assert d.top_msg_id == 102 and d.last_text == "m2" and d.unread == 2 and d.history_min_id is None
    _seed(acc)  # qayta — dublikat yo'q
    assert Peer.objects.filter(account=acc).count() == 3 and Message.objects.filter(account=acc).count() == 3


def test_history_contiguity(acc):
    _seed(acc, 1)
    p = types.PeerUser(5)
    page1 = [mf(msg(i, p, f"t{i}", minutes=i)) for i in range(100, 50, -1)]  # 50 ta: 100…51
    r = chats.save_history(acc.pk, 5, [], page1, 50, 0)
    assert r == {"loaded": 50, "complete": False, "min_id": 51}
    page2 = [mf(msg(i, p, minutes=i)) for i in range(50, 30, -1)]  # 20 ta — oxiri
    r = chats.save_history(acc.pk, 5, [], page2, 50, 51)
    assert r["complete"] and r["min_id"] == 31
    d = Dialog.objects.get(peer__peer_id=5)
    page = inbox.messages_page(d, None)
    assert [m["id"] for m in page["messages"]][-1] == 100 and len(page["messages"]) == 50
    older = inbox.messages_page(d, before=page["messages"][0]["id"])
    assert older["messages"][0]["id"] == 31 and not older["has_more"]


def test_new_message_unread_and_gap(acc):
    _seed(acc, 1)
    p = types.PeerUser(5)
    chats.save_history(acc.pk, 5, [], [mf(msg(100, p))], 50, 0)  # to'liq (1 ta)
    r = chats.on_new_message(acc.pk, mf(msg(101, p, "yana")), [])
    d = Dialog.objects.get(peer__peer_id=5)
    assert r["unread"] == 1 and d.top_msg_id == 101 and d.history_min_id == 100  # uzluksiz — saqlanadi
    chats.on_new_message(acc.pk, mf(msg(102, p, "javob", out=True)), [])
    d.refresh_from_db()
    assert d.unread == 0 and d.last_out and d.read_inbox_max == 102
    # shlyuz o'chiq paytida kelgan xabar (dialog sinxronida, jonli emas) — bo'shliq ehtimoli: tarix qayta boshlanadi
    peers = [pf(user(5), ME)]
    chats.save_dialogs_page(acc.pk, peers, [convert.dialog_fields(dialog(p, 150))], [mf(msg(150, p))])
    d.refresh_from_db()
    assert d.history_min_id is None and d.top_msg_id == 150


def test_read_and_delete(acc):
    _seed(acc, 1)
    p = types.PeerUser(5)
    for i in (101, 102, 103):
        chats.on_new_message(acc.pk, mf(msg(i, p)), [])
    d = Dialog.objects.get(peer__peer_id=5)
    assert d.unread == 3
    chats.on_read(acc.pk, 5, 102, outbox=False, still_unread=None)
    d.refresh_from_db()
    assert d.unread == 1 and d.read_inbox_max == 102
    chats.on_read(acc.pk, 5, 103, outbox=True, still_unread=None)
    d.refresh_from_db()
    assert d.read_outbox_max == 103
    # kanal xabari bilan bir xil id — shaxsiy chatga tegmasin
    ch = channel(9)
    chats.save_dialogs_page(acc.pk, [pf(ch)], [convert.dialog_fields(dialog(types.PeerChannel(9), 103))],
                            [mf(msg(103, types.PeerChannel(9)))])  # fmt: skip
    assert chats.on_delete(acc.pk, [103], channel_pid=None) == [5]
    assert Message.objects.get(peer__peer_id=5, msg_id=103).deleted
    assert not Message.objects.get(peer__peer_id=pid(types.PeerChannel(9)), msg_id=103).deleted


def test_dialog_list_folders_archive_search(acc):
    _seed(acc, 3)
    chats.set_dialog_flags(acc.pk, 6, archived=True)
    chats.set_dialog_flags(acc.pk, 5, pinned=True)
    Peer.objects.filter(peer_id=7).update(contact=True)
    page = inbox.dialogs_page(acc.pk, archived=False, folder=None, q="", cursor="")
    assert [d["peer_id"] for d in page["dialogs"]] == [5, 7] and page["dialogs"][0]["pinned"]
    assert [
        d["peer_id"] for d in inbox.dialogs_page(acc.pk, archived=True, folder=None, q="", cursor="")["dialogs"]
    ] == [6]
    assert [
        d["peer_id"] for d in inbox.dialogs_page(acc.pk, archived=False, folder=None, q="m2", cursor="")["dialogs"]
    ] == [7]
    f = Folder.objects.create(
        account=acc, folder_id=2, title="Kontaktlar", flags={"contacts": True}, include=[5], exclude=[]
    )
    assert {d["peer_id"] for d in inbox.dialogs_page(acc.pk, archived=False, folder=f, q="", cursor="")["dialogs"]} == {
        5,
        7,
    }
    fl = inbox.folders_json(acc.pk)
    assert fl[0]["title"] == "Kontaktlar" and fl[-1]["id"] == "archive" and fl[-1]["count"] == 1
    chats.save_dialogs_page(acc.pk, [pf(user(8, "M3"), ME)], [convert.dialog_fields(dialog(types.PeerUser(8), 103))],
                            [mf(msg(103, types.PeerUser(8), minutes=3))])  # fmt: skip
    small = inbox.dialogs_page(acc.pk, archived=False, folder=None, q="", cursor="", limit=1)
    assert [d["peer_id"] for d in small["dialogs"]] == [5, 8] and small["next"]  # qadalgan + 1 ta
    rest = inbox.dialogs_page(acc.pk, archived=False, folder=None, q="", cursor=small["next"], limit=1)
    assert [d["peer_id"] for d in rest["dialogs"]] == [7] and rest["next"] is None  # qadalgan qayta chiqmaydi

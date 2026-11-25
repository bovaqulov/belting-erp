"""Testlar uchun haqiqiy Telethon TL obyektlari (xom turlar)."""

from __future__ import annotations

import datetime as dt
from typing import Any

from telethon import utils
from telethon.tl import types

T0 = dt.datetime(2026, 11, 1, 9, 0, tzinfo=dt.UTC)
ME = 777


def user(
    uid: int, first: str = "Mijoz", username: str | None = None, contact: bool = False, bot: bool = False, **kw: Any
) -> types.User:
    return types.User(id=uid, access_hash=uid * 10, first_name=first, username=username, contact=contact, bot=bot, **kw)


def channel(cid: int, title: str = "Kanal", broadcast: bool = True) -> types.Channel:
    return types.Channel(
        id=cid,
        title=title,
        photo=types.ChatPhotoEmpty(),
        date=T0,
        access_hash=cid * 10,
        broadcast=broadcast,
        megagroup=not broadcast,
    )


def msg(
    mid: int, peer: Any, text: str = "salom", out: bool = False, minutes: int = 0, from_id: Any = None, **kw: Any
) -> types.Message:
    return types.Message(
        id=mid, peer_id=peer, date=T0 + dt.timedelta(minutes=minutes), message=text, out=out, from_id=from_id, **kw
    )


def dialog(
    peer: Any, top: int, unread: int = 0, pinned: bool = False, folder_id: int | None = None, **kw: Any
) -> types.Dialog:
    return types.Dialog(
        peer=peer,
        top_message=top,
        read_inbox_max_id=kw.pop("read_in", 0),
        read_outbox_max_id=kw.pop("read_out", 0),
        unread_count=unread,
        unread_mentions_count=0,
        unread_reactions_count=0,
        unread_poll_votes_count=0,
        notify_settings=types.PeerNotifySettings(),
        pinned=pinned,
        folder_id=folder_id,
        **kw,
    )


def pid(peer: Any) -> int:
    return utils.get_peer_id(peer)

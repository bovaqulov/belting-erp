"""Telethon sessiyasi — bazada (StringSession yangilanish holatini va entity'larni saqlamaydi → catch_up ishlamaydi).

Telethon sessiya metodlarini sinxron chaqiradi (async qo'llov "eksperimental", hamma joyda await yo'q), shuning uchun
`DbSession` — xotiradagi `MemorySession`; `save()` faqat snapshot oladi va `persist` qayta chaqiruviga beradi
(gateway uni asinxron bazaga yozadi). Entity'lar ID bo'yicha indekslangan (MemorySession — set, yangilanganda dublikat).

Snapshot: {dc_id, server_address, port, auth_key: bytes | None, takeout_id, states, entities: [(id, hash, user, phone, name)]}
— `entities` faqat oxirgi saqlashdan beri o'zgarganlari.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable, Iterable
from typing import Any

from telethon.crypto import AuthKey
from telethon.sessions import MemorySession
from telethon.tl import types

Row = tuple[int, int, str | None, str | None, str | None]
Snapshot = dict[str, Any]


class DbSession(MemorySession):
    def __init__(self, snapshot: Snapshot | None = None, persist: Callable[[Snapshot], None] | None = None):
        super().__init__()
        self._rows: dict[int, Row] = {}
        self._dirty: dict[int, Row] = {}
        self._persist = persist
        if snapshot:
            self._load(snapshot)

    # ------------------------------------------------------------------ yuklash / saqlash
    def _load(self, s: Snapshot) -> None:
        if s.get("server_address"):
            self.set_dc(s.get("dc_id") or 0, s["server_address"], s.get("port") or 443)
        key = s.get("auth_key")
        self._auth_key = AuthKey(key) if key else None
        self._takeout_id = s.get("takeout_id")
        for k, v in (s.get("states") or {}).items():
            cid = int(k)
            if cid == 0 and len(v) == 4:
                pts, qts, date, seq = v
                self._update_states[0] = types.updates.State(
                    pts, qts, dt.datetime.fromtimestamp(date, dt.UTC), seq, unread_count=0
                )
            elif v:
                self._update_states[cid] = types.updates.State(v[0], 0, dt.datetime.now(dt.UTC), 0, unread_count=0)
        for row in s.get("entities") or ():
            r = _row(row)
            self._rows[r[0]] = r

    def snapshot(self, full: bool = False) -> Snapshot:
        """Joriy holat. full=False — entity'lardan faqat o'zgarganlari (va ular "toza" deb belgilanadi)."""
        states: dict[str, list[int]] = {}
        for cid, st in self._update_states.items():
            if cid == 0:
                states["0"] = [st.pts, st.qts, int(st.date.timestamp()), st.seq]
            else:
                states[str(cid)] = [st.pts]
        ents = list(self._rows.values()) if full else list(self._dirty.values())
        self._dirty = {}
        return {
            "dc_id": self._dc_id,
            "server_address": self._server_address,
            "port": self._port,
            "auth_key": self._auth_key.key if self._auth_key else None,
            "takeout_id": self._takeout_id,
            "states": states,
            "entities": ents,
        }

    def mark_dirty(self, rows: Iterable[Any]) -> None:
        for r in rows:
            r = _row(r)
            if r[0] in self._rows:
                self._dirty.setdefault(r[0], self._rows[r[0]])

    def save(self) -> None:
        if self._persist is not None:
            self._persist(self.snapshot())

    def delete(self) -> None:
        self._auth_key = None
        self._update_states = {}
        self._rows = {}
        self._dirty = {}

    # ------------------------------------------------------------------ entity'lar (ID bo'yicha indeks)
    def process_entities(self, tlo: Any) -> None:
        for r in self._entities_to_rows(tlo):
            r = _row(r)
            if self._rows.get(r[0]) != r:
                self._rows[r[0]] = r
                self._dirty[r[0]] = r

    def get_entity_rows_by_id(self, id: int, exact: bool = True) -> tuple[int, int] | None:
        if exact:
            r = self._rows.get(id)
            return (r[0], r[1]) if r else None
        from telethon import utils
        from telethon.tl.types import PeerChannel, PeerChat, PeerUser

        for pid in (
            utils.get_peer_id(PeerUser(id)),
            utils.get_peer_id(PeerChat(id)),
            utils.get_peer_id(PeerChannel(id)),
        ):
            r = self._rows.get(pid)
            if r:
                return r[0], r[1]
        return None

    def _find(self, idx: int, value: str) -> tuple[int, int] | None:
        for r in self._rows.values():
            if r[idx] == value:
                return r[0], r[1]
        return None

    def get_entity_rows_by_username(self, username: str) -> tuple[int, int] | None:
        return self._find(2, username)

    def get_entity_rows_by_phone(self, phone: str) -> tuple[int, int] | None:
        return self._find(3, phone)

    def get_entity_rows_by_name(self, name: str) -> tuple[int, int] | None:
        return self._find(4, name)

    @property
    def entity_count(self) -> int:
        return len(self._rows)


def _row(r: Iterable[Any]) -> Row:
    pid, h, user, phone, name = r
    return int(pid), int(h or 0), user or None, phone or None, name or None

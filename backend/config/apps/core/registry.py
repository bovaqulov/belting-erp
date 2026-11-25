"""core kengaytma nuqtalari: domen applari o'z `apps.ready()` da ro'yxatdan o'tadi, core ularni import qilmaydi.

- `register_me_field(name, fn)` — `/app/api/erp/me` javobiga maydon: `fn(user) -> JSON qiymat`.
- `register_panel_field(name, fn)` — `/app/api/me` (Jarvis paneli, bosh sahifa) javobiga maydon: masalan `report_depts`
  (hisobotlar), `can_lenta` (konveyer), `can_geo` (xarita) — o'z applari to'ldiradi.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

me_fields: dict[str, Callable[[Any], Any]] = {}


def register_me_field(name: str, fn: Callable[[Any], Any]) -> None:
    me_fields[name] = fn


panel_fields: dict[str, Callable[[Any], Any]] = {}


def register_panel_field(name: str, fn: Callable[[Any], Any]) -> None:
    panel_fields[name] = fn

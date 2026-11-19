"""Ombor hodisalari tinglovchilari: boshqa applar (CRM, sex) `services.on_shipped(fn)` bilan `apps.ready()` da
ro'yxatdan o'tadi — ombor ularni import qilmaydi (bog'liqlik yo'nalishi buzilmaydi)."""

from __future__ import annotations

import logging
from collections.abc import Callable

log = logging.getLogger(__name__)

# fn(source, doc_number): yig'ish buyurtmasi to'liq jo'natildi; source — "crm:12" kabi (kim ochgan bo'lsa)
_shipped: list[Callable[[str, str], None]] = []


def on_shipped(fn: Callable[[str, str], None]) -> None:
    if fn not in _shipped:
        _shipped.append(fn)


def shipped(source: str, number: str) -> None:
    for fn in _shipped:
        try:
            fn(source, number)
        except Exception:  # tinglovchi xatosi jo'natishni buzmasin
            log.exception("on_shipped tinglovchisi xato berdi: %s", source)

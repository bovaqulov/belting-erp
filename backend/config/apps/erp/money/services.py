"""Pul appining ochiq interfeysi (boshqa applar faqat shu orqali): sotuv to'lovi → pul kirimi (ko'zgu)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from . import ledger


def mirror_receipt(
    source: str, *, label: str, firm: str, method: str, amount: Decimal, at: datetime, party: dict[str, Any]
) -> int:
    """Sotuv to'lovi o'tkazildi: firma + usul (bank / kassa / karta) bo'yicha asosiy hisobga kirim."""
    return ledger.mirror(source, label=label, firm=firm, method=method, amount=amount, at=at, party=party)


def unmirror(source: str) -> int:
    """Sotuv to'lovi qaytarildi — pul kirimi o'chadi."""
    return ledger.unmirror(source)

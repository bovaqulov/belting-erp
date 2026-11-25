"""Qulflar: asbobdan ajratish va lenta qalinligiga moslik — `lib/locks.ts` nusxasi."""

from __future__ import annotations

import math
import re
from typing import Any

# Nomidagi "1,5 - 3,2 MM" ko'rinishidagi oraliq (JS \d — faqat ASCII)
RANGE_RE = re.compile(r"([0-9]+(?:[.,][0-9]+)?)\s*[-–—]\s*([0-9]+(?:[.,][0-9]+)?)\s*MM", re.IGNORECASE)


def lock_thickness_range(lock: dict[str, Any]) -> dict[str, float] | None:
    """Qulf nomi/izohidan lenta qalinligi oralig'i; bo'lmasa None."""
    m = RANGE_RE.search(f"{lock.get('note') or ''} {lock['name']}")
    if not m:
        return None
    lo = float(m.group(1).replace(",", ".", 1))
    hi = float(m.group(2).replace(",", ".", 1))
    if not math.isfinite(lo) or not math.isfinite(hi) or hi < lo:
        return None
    return {"min": lo, "max": hi}


def is_lock_tool(lock: dict[str, Any]) -> bool:
    """Asbobmi (dona hisobidagi uskuna)."""
    return bool(lock.get("perPiece"))


def lock_fits(lock: dict[str, Any], thickness: float | None) -> bool | None:
    """Qulf shu qalinlikka mosmi; None — bilib bo'lmaydi."""
    r = lock_thickness_range(lock)
    if not r or thickness is None or thickness <= 0:
        return None
    return r["min"] <= thickness <= r["max"]


def lock_options_of(locks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Faqat qulflar (asbobsiz)."""
    return [lk for lk in locks if not is_lock_tool(lk)]


def tool_options_of(locks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Faqat asboblar."""
    return [lk for lk in locks if is_lock_tool(lk)]


def default_lock_for(locks: list[dict[str, Any]], thickness: float | None) -> str | None:
    """Qalinlikka mos birinchi qulf, topilmasa ro'yxatdagi birinchisi."""
    lst = lock_options_of(locks)
    if not lst:
        return None
    for lk in lst:
        if lock_fits(lk, thickness) is True:
            return lk["name"]
    return lst[0]["name"]

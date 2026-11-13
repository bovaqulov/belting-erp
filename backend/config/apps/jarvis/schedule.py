"""Jadval: keyingi ishga tushish vaqti (Toshkent). Frontend src/ai/agents/schedule.lib.ts nextRun bilan bir xil qoida."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Tashkent")


def next_run(
    *, repeat: str, at: str, days: list[int], day: int, on: date | None, enabled: bool, now: datetime
) -> datetime | None:
    """Keyingi vaqt (aware) yoki None — o'chiq / o'tib ketgan bir martalik / mos kun topilmadi (62 kun ichida)."""
    if not enabled:
        return None
    hh, mm = (int(x) for x in at.split(":"))
    if repeat == "once":
        if on is None:
            return None
        t = datetime.combine(on, time(hh, mm), tzinfo=TZ)
        return t if t > now else None
    today = now.astimezone(TZ).date()
    for i in range(62):
        d = today + timedelta(days=i)
        fits = (
            repeat == "daily"
            or (repeat == "weekly" and d.isoweekday() in days)
            or (repeat == "monthly" and d.day == day)
        )
        if not fits:
            continue
        t = datetime.combine(d, time(hh, mm), tzinfo=TZ)
        if t > now:
            return t
    return None

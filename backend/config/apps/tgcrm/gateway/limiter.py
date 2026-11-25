"""Akkaunt bo'yicha tezlik cheklagichi — Telegram flood limitlariga yetmaslik uchun (docs/tgcrm/PLAN.md §1.3).

Har amal turi (`kind`) uchun: so'rovlar orasidagi minimal oraliq, ixtiyoriy kunlik limit, va FloodWait'dan keyingi
blok (`on_flood`). Telethon `flood_sleep_threshold` (30 s) gacha o'zi kutadi — bizga undan uzunlari keladi.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from .errors import GatewayError, flood_text

# soniya: GetHistory ~10 so'rov / 30 s → 3 s; resolveUsername ~50 tadan keyin flood → sekin + kunlik limit
INTERVAL: dict[str, float] = {
    "history": 3.0,
    "search": 3.0,
    "send": 1.0,
    "resolve": 5.0,
    "dialogs": 2.0,
    "download": 0.2,
    "typing": 4.0,
    "members": 5.0,  # GetParticipants — og'ir so'rov  # "yozmoqda" ~5 s ko'rinadi — tez-tez yuborish shart emas
    "read": 1.0,
    "default": 0.3,
}
DAILY: dict[str, int] = {"resolve": 40}
DAY = 24 * 3600


@dataclass
class _Bucket:
    next_at: float = 0.0
    blocked_until: float = 0.0
    day_start: float = 0.0
    day_count: int = 0


class Limiter:
    def __init__(
        self,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ):
        self._clock = clock
        self._sleep = sleep
        self._b: dict[str, _Bucket] = {}
        self._lock = asyncio.Lock()

    def _bucket(self, kind: str) -> _Bucket:
        return self._b.setdefault(kind, _Bucket())

    async def slot(self, kind: str = "default") -> None:
        """Navbat: blok bo'lsa — darhol GatewayError(429); aks holda oraliq tugaguncha kutadi."""
        async with self._lock:
            b = self._bucket(kind)
            now = self._clock()
            if b.blocked_until > now:
                raise GatewayError(429, f"Telegram cheklovi: {flood_text(int(b.blocked_until - now) + 1)} kuting.")
            cap = DAILY.get(kind)
            if cap is not None:
                if now - b.day_start >= DAY:
                    b.day_start, b.day_count = now, 0
                if b.day_count >= cap:
                    raise GatewayError(429, f"Bugungi limit tugadi ({cap} ta). Ertaga davom etadi.")
                b.day_count += 1
            wait = b.next_at - now
            b.next_at = max(now, b.next_at) + INTERVAL.get(kind, INTERVAL["default"])
        if wait > 0:
            await self._sleep(wait)

    def on_flood(self, kind: str, seconds: int) -> None:
        b = self._bucket(kind)
        b.blocked_until = max(b.blocked_until, self._clock() + seconds)

    def blocked(self, kind: str) -> int:
        """Qolgan blok (soniya), 0 — erkin."""
        b = self._b.get(kind)
        return max(0, int((b.blocked_until - self._clock()) + 0.999)) if b else 0

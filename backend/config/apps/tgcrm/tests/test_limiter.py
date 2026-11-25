"""Cheklagich: oraliq, kunlik limit, flood bloki."""

import pytest

from config.apps.tgcrm.gateway.errors import GatewayError
from config.apps.tgcrm.gateway.limiter import DAILY, Limiter


class Clock:
    def __init__(self):
        self.t = 1000.0
        self.slept: list[float] = []

    def __call__(self) -> float:
        return self.t

    async def sleep(self, s: float) -> None:
        self.slept.append(s)
        self.t += s


async def test_interval_spacing():
    c = Clock()
    lim = Limiter(clock=c, sleep=c.sleep)
    for _ in range(3):
        await lim.slot("history")
    assert c.slept == [3.0, 3.0]


async def test_daily_cap():
    c = Clock()
    lim = Limiter(clock=c, sleep=c.sleep)
    for _ in range(DAILY["resolve"]):
        await lim.slot("resolve")
    with pytest.raises(GatewayError) as e:
        await lim.slot("resolve")
    assert e.value.status == 429
    c.t += 24 * 3600
    await lim.slot("resolve")  # yangi kun


async def test_flood_blocks_only_that_kind():
    c = Clock()
    lim = Limiter(clock=c, sleep=c.sleep)
    lim.on_flood("send", 120)
    with pytest.raises(GatewayError, match=r"daqiqa|soniya"):
        await lim.slot("send")
    await lim.slot("history")
    assert lim.blocked("send") > 0
    c.t += 121
    assert lim.blocked("send") == 0
    await lim.slot("send")

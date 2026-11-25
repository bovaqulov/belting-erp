"""AI yordamchi: 1C qoldig'i bo'yicha holat (bor / zakazga / noma'lum), yangilik nazorati, eng yaqin o'lchamlar."""

from datetime import timedelta
from typing import Any

import pytest
from django.utils import timezone

from config.apps.tgcrm import stock
from config.apps.tgcrm.belts import Spec
from config.apps.tgcrm.belts import parse as _parse


def parse(text: str) -> Spec:
    sp = _parse(text)
    assert sp is not None, text
    return sp


ROWS = [
    ("Ремень B 1450 Lp MEGADYNE BASIC", 3.0),
    ("Ремень B 1500 Lp PIX", 5.0),
    ("Ремень SPB 1650 PIX", 0.0),
    ("Рукав 1040 8M NB", 30.0),
    ("6PK2553 GATES", 2.0),
    ("Ремень B 1400 Lp", 0.0),
]


@pytest.fixture
def src(settings, monkeypatch):
    settings.JARVIS_ONEC_DB_URL = "postgres://fake/jarvis"
    settings.TGCRM_STOCK_MAX_AGE_H = 24
    state: dict[str, Any] = {"at": timezone.now() - timedelta(hours=2), "rows": ROWS, "calls": 0}

    def load():
        state["calls"] += 1
        return state["at"], state["rows"]

    monkeypatch.setattr(stock, "_load", load)
    stock.clear_cache()
    yield state
    stock.clear_cache()


def test_status(src):
    assert stock.check(parse("B 1450"))["status"] == stock.YES
    assert stock.check(parse("1040 8M 20"))["status"] == stock.YES  # rukav — kesib beriladi
    r = stock.check(parse("SPB 1650"))
    assert r["status"] == stock.ORDER and r["near"] == []
    assert stock.check(parse("8PK2553"))["status"] == stock.ORDER  # 6PK bor, 8PK emas


def test_near(src):
    r = stock.check(parse("B 1400"))
    assert r["status"] == stock.ORDER
    assert [n["label"] for n in r["near"]] == ["B 1450", "B 1500"]
    assert r["near"][0]["diff_mm"] == 50


def test_stale_or_missing_is_unknown(src, settings, monkeypatch):
    src["at"] = timezone.now() - timedelta(hours=30)
    stock.clear_cache()
    assert stock.check(parse("B 1450"))["status"] == stock.UNKNOWN
    assert stock.source()["ok"] is False
    settings.JARVIS_ONEC_DB_URL = ""
    assert stock.check(parse("B 1450"))["status"] == stock.UNKNOWN


def test_load_error_is_unknown(src, monkeypatch):
    def boom():
        raise OSError("ulanmadi")

    monkeypatch.setattr(stock, "_load", boom)
    stock.clear_cache()
    assert stock.check(parse("B 1450"))["status"] == stock.UNKNOWN


def test_cache(src):
    stock.check(parse("B 1450"))
    stock.check(parse("B 1500"))
    assert src["calls"] == 1
    assert stock.source()["ok"] is True

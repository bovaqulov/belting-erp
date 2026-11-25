"""Bloklovchi chegaralar (D13): kichik bukish burchagi, absurd o'lcham, tor lentadagi gofra; render yiqilmasligi."""

from __future__ import annotations

import math

import pytest

from config.apps.conveyor.lenta.catalog import available as catalog_available
from config.apps.conveyor.lenta.effective import (
    BEND_TINY_PREFIX,
    HARD_PREFIX,
    STRAIGHT_MAX_LENGTH,
    STRAIGHT_MAX_WIDTH,
    effective_config,
)
from config.apps.conveyor.lenta.model import revive
from config.apps.conveyor.lenta.render import render_drawing, to_svg

pytestmark = pytest.mark.skipif(not catalog_available(), reason="katalog yo'q (data/secret)")


def _errs(raw: dict) -> list[dict]:
    eff = effective_config(revive(raw))
    return [i for i in eff["issues"] if i["level"] == "error"]


# ------------------------------------------------------------------ 1. kichik bukish burchagi
@pytest.mark.parametrize(
    "raw",
    [
        {"width": 800, "length": 5000, "bendAngle": 1e-12},  # avval: ZeroDivisionError (_fit)
        {"width": 800, "length": 1e12, "bendAngle": 1e-300},  # avval: round(NaN) (_g1)
        {"width": 800, "length": 5000, "bendAngle": 0.49},
    ],
)
def test_tiny_bend_blocks_and_renders_message(raw: dict) -> None:
    errs = _errs(raw)
    assert any(e["field"] == "bendAngle" and e["message"].startswith(BEND_TINY_PREFIX) for e in errs)
    for lang in ("uz", "ru"):
        d = render_drawing(raw, lang, "01.01.2026")
        assert d.blocked and d.message and [s.key for s in d.sheets] == ["message"]
        for s in d.sheets:
            assert to_svg(s).startswith("<")


def test_min_bend_angle_not_tiny() -> None:
    errs = _errs({"width": 600, "length": 5000, "bendAngle": 90})
    assert not errs
    errs = _errs({"width": 600, "length": 5000, "bendAngle": 0.5})
    assert not any(e["message"].startswith(BEND_TINY_PREFIX) for e in errs)


def test_curve_sheet_guards() -> None:
    from config.apps.conveyor.lenta.render.common import Box
    from config.apps.conveyor.lenta.render.curve_sheet import _fit, _g1

    assert _g1(math.nan) == "—" and _g1(math.inf) == "—" and _g1(136.0) == "136"
    g = {"R": 1e30, "r": 1e30, "angle": 0.0}  # degenerat: gabarit 0 eniga
    f = _fit(g, Box(0, 0, 1000, 800))
    assert math.isfinite(f["k"]) and f["k"] > 0


# ------------------------------------------------------------------ 2. gofra tor lentada
@pytest.mark.parametrize(
    ("width", "qty", "bad"), [(100, 2, True), (129, 2, True), (129, 1, True), (130, 2, False), (600, 2, False)]
)
def test_gofro_too_narrow(width: float, qty: int, bad: bool) -> None:
    errs = _errs({"width": width, "length": 5000, "gofroOn": True, "gofroQty": qty})
    assert any(e["tab"] == "gofro" and e["field"] == "gofroQty" for e in errs) is bad


def test_gofro_off_no_error() -> None:
    assert not any(e["tab"] == "gofro" for e in _errs({"width": 50, "length": 5000, "gofroOn": False}))


# ------------------------------------------------------------------ 3. absurd o'lcham — xato
@pytest.mark.parametrize(
    ("raw", "field"),
    [
        ({"width": 10 * STRAIGHT_MAX_WIDTH + 1, "length": 5000}, "width"),
        ({"width": 600, "length": 10 * STRAIGHT_MAX_LENGTH + 1}, "length"),
        ({"width": 600, "length": 1e12}, "length"),
        ({"width": 16_000, "length": 50_000, "bendAngle": 180}, "width"),
        ({"width": 800, "length": 1e6, "bendAngle": 0.5}, "length"),  # tashqi diametr ~ 230 km
    ],
)
def test_absurd_sizes_block(raw: dict, field: str) -> None:
    errs = _errs(raw)
    assert any(e["field"] == field and e["message"].startswith(HARD_PREFIX) for e in errs)
    assert effective_config(revive(raw))["blocked"]


def test_unusual_but_plausible_only_warns() -> None:
    eff = effective_config(revive({"width": STRAIGHT_MAX_WIDTH + 500, "length": 5000}))
    assert not eff["blocked"]
    assert any(i["level"] == "warning" and i["tab"] == "belt" for i in eff["issues"])

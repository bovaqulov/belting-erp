"""Bukilgan lenta: kesish rejasi geometriyasi, teshik jadvali, ehtimollik ogohlantirishi va chizma mazmuni.

09_divergences.md — D9 (ogohlantirish), D10 (bukilgan lenta listlari), D11 (teshik o'lchamlari, "B" detal).
"""

from __future__ import annotations

import functools as _ft
import math

import pytest

from config.apps.conveyor.lenta.curve import curve_geom, curve_hole_table, cut_plan, ring_bounds
from config.apps.conveyor.lenta.effective import PLAUSIBLE_PREFIX, effective_config
from config.apps.conveyor.lenta.model import revive
from config.apps.conveyor.lenta.render import render_sheets

# 2026-11-09: standart chizma — bir varaqli ishlab chiqarish varag'i ("prod"). Bu testlar uning ichida qayta
# ishlatiladigan eski varaq qismlarini (general/plan/cross/perf/side) tekshiradi — ichki album=True rejimi.
render_sheets = _ft.partial(render_sheets, album=True)


CHOCO = {
    "beltName": "U10/0A-W (P 9/A - 1.0mm)",
    "width": 3000,
    "length": 12000,
    "bendAngle": 180,
    "curveHoleCount": 373,
    "curveHoleDia": 6,
    "curveHoleEdge": 15,
    "curveHoleRows": 1,
    "projectName": "CHOCOCREAM",
}
TURN = {
    "beltName": "U10/0A-W (P 9/A - 1.0mm)",
    "width": 600,
    "length": round(1100 * math.pi / 2),
    "bendAngle": 90,
    "curveHoleCount": 40,
    "curveHoleDia": 6,
    "curveHoleEdge": 15,
    "curveHoleRows": 2,
    "curveHoleRowPitch": 20,
    "curveHoleStagger": True,
}
STRAIGHT = {
    "beltName": "U13/0A-B (P 9/A/BL blue - 1,3mm)",
    "width": 1200,
    "length": 11000,
    "perfOn": True,
    "perfDia": 5,
    "perfQty": 156,
    "perfEdge": 10,
}


def _g(st: dict) -> dict:
    g = curve_geom(revive(st))
    assert g
    return g


def _sampled(R: float, r: float, a0: float, a1: float, n: int = 4000) -> tuple[float, float, float, float]:
    xs, ys = [], []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        for rr in (R, r):
            xs.append(rr * math.cos(a))
            ys.append(rr * math.sin(a))
    return min(xs), max(xs), min(ys), max(ys)


@pytest.mark.parametrize(
    "R,r,a0,a1",
    [
        (1400, 800, 45, 135),
        (5320, 2320, 0, 180),
        (900, 0, -30, 250),
        (3000, 2500, 80, 100),
        (1200, 400, -90, 270),
        (700, 300, 10, 11),
    ],
)
def test_ring_bounds_exact(R, r, a0, a1):
    got = ring_bounds(R, r, a0, a1)
    ref = _sampled(R, r, a0, a1)
    for a, b in zip(got, ref):
        assert a == pytest.approx(b, abs=0.05)


def test_cut_plan_turn_fits_one_piece():
    cp = cut_plan(_g(TURN))
    assert cp["pieces"] == 1 and cp["radialJoints"] == 0 and cp["ringJoints"] == 0
    q = cp["rings"][0]
    # vatar rulon eniga (1 980 ≤ 2 000), rulon bo'ylab sarf — balandlik R − r·cos45°
    assert q["across"] == pytest.approx(2 * 1400 * math.sin(math.radians(45)), abs=1)
    assert q["along"] == pytest.approx(1400 - 800 * math.cos(math.radians(45)), abs=1)
    assert cp["rollLen"] == pytest.approx(q["along"])
    assert cp["blankW"] == pytest.approx(1980, abs=1) and cp["blankH"] == pytest.approx(834, abs=1)


def test_cut_plan_choco_needs_rings_and_pieces():
    g = _g(CHOCO)
    cp = cut_plan(g)
    rings = cp["rings"]
    assert len(rings) == 2 and cp["ringJoints"] == 1
    assert [q["B"] for q in rings] == pytest.approx([1500, 1500])
    assert rings[0]["R"] == pytest.approx(g["R"]) and rings[-1]["r"] == pytest.approx(g["r"])
    assert [q["n"] for q in rings] == [4, 3] and cp["pieces"] == 7 and cp["radialJoints"] == 5
    for q in rings:
        assert q["across"] <= cp["roll"] + 1e-6
        assert q["n"] * q["phi"] == pytest.approx(180)
        # bitta kam bo'lak sig'masligi kerak (eng kam son)
        if q["n"] > 1:
            phi = 180 / (q["n"] - 1)
            for amid in (90, 0):
                x0, x1, y0, y1 = ring_bounds(q["R"], q["r"], amid - phi / 2, amid + phi / 2)
                assert y1 - y0 > cp["roll"]


def test_cut_plan_full_ring_joints_closed():
    g = _g({"width": 800, "length": 5000, "bendAngle": 360})
    cp = cut_plan(g)
    assert cp["full"] and cp["pieces"] == 2 and cp["radialJoints"] == 2
    small = cut_plan(_g({"width": 300, "length": 2000, "bendAngle": 360}))
    assert small["pieces"] == 1 and small["radialJoints"] == 0


def test_hole_table_first_holes():
    g = _g(TURN)
    t = curve_hole_table(g, per_row=4, max_rows=2)
    assert [r["row"] for r in t] == [1, 1, 1, 1, 2, 2, 2, 2]
    step_deg = 90 / 40
    assert t[0]["angle"] == pytest.approx(step_deg / 2)  # birinchisi — yarim qadam
    assert t[1]["angle"] - t[0]["angle"] == pytest.approx(step_deg)
    assert t[4]["angle"] == pytest.approx(step_deg)  # shaxmat: 2-qator yarim qadam siljigan
    assert t[0]["radius"] == pytest.approx(1400 - 15, abs=0.2)
    assert t[4]["radius"] == pytest.approx(1400 - 15 - 20, abs=0.2)
    assert t[0]["arc"] == pytest.approx(t[0]["radius"] * math.radians(t[0]["angle"]))


def _plaus(st: dict) -> list[dict]:
    return [i for i in effective_config(revive(st))["issues"] if i["message"].startswith(PLAUSIBLE_PREFIX)]


def test_plausibility_warning_choco():
    w = _plaus(CHOCO)
    assert len(w) == 1 and w[0]["level"] == "warning"
    assert "eni 3 000 mm" in w[0]["message"] and "10,6 m" in w[0]["message"]
    assert "300–1000 mm" in w[0]["message"] and w[0]["ru"].startswith("Необычные размеры")
    assert not effective_config(revive(CHOCO))["blocked"]


@pytest.mark.parametrize(
    "st,want",
    [
        (TURN, 0),
        ({"width": 600, "length": 520, "bendAngle": 90}, 1),  # ichki radius ≈ 31 < eni/10
        ({"width": 1200, "length": 11000}, 0),
        ({"width": 3200, "length": 11000}, 1),
        ({"width": 1000, "length": 250_000}, 1),
    ],
)
def test_plausibility_thresholds(st, want):
    assert len(_plaus(st)) == want


def _texts(sheet) -> str:
    return " ".join(sheet.texts)


def test_choco_curve_sheet_content():
    sh = render_sheets(CHOCO, today="07.11.2026")
    assert [s.key for s in sh] == ["curve", "cut"]
    t = _texts(sh[0])
    for want in (
        "R 5 320",
        "R 2 320",
        "θ = 180°",
        "tashqi yoy L = 16 712",
        "ichki yoy l = 7 288",
        "eni B = 3 000",
        "373 × Ø6",
        "hammasi ko'rsatilmagan",
        "Tashqi chetdan teshik markazigacha: 15 mm",
        "1-teshik boshlanish chetidan: 22,3 mm",
        "O'lchamlar g'ayrioddiy",
    ):
        assert want in t, want
    assert "A (M " in t
    c = _texts(sh[1])
    for want in (
        "7 bo'lak",
        "2 halqa",
        "5 ta radial ulash",
        "QANDAY O'QILADI",
        "θ, °",
        "R, mm",
        "s, mm",
        "5 304,7",
        "1.4",
        "2.3",
    ):
        assert want in c, want


def test_turn_sheets_ru():
    sh = render_sheets(TURN, lang="ru", today="")
    t = _texts(sh[0])
    assert "R 1 400" in t and "R 800" in t and "Отверстие Ø6 мм — всего 79 шт" in t
    assert "шахматный (½ шага)" in t
    c = _texts(sh[1])
    assert "✓ Помещается — 1 часть, без стыков" in c and "КАК ЧИТАТЬ" in c


def test_straight_hole_detail_on_every_perf_sheet():
    sheets = {s.key: s for s in render_sheets(STRAIGHT, today="")}
    assert "perf" not in sheets  # 1-varaq bilan bir xil bo'lardi
    for key in ("general", "plan"):
        t = _texts(sheets[key])
        assert "B — teshiklar joylashuvi" in t, key
        assert "Chetdan teshik markazigacha: chap 10 / o'ng 10 mm" in t, key
        assert "chetdan teshik" in t and "markazigacha" in t, key
        if key == "general":
            assert "Teshik Ø5 mm" in t and "chetdan 10 mm" in t, key  # izoh qutisi (lentadan tashqarida)
        for v in ("190", "295", "147,5", "Ø5"):
            assert v in sheets[key].texts, (key, v)

"""Chizma renderer testlari (06_drawing_sheets.md): listlar, SVG, vektor PDF.

Vizual moslik asl React chizmasi bilan `scripts/lenta_oracle/compare_render.py`
va `geom_diff.py` da tekshiriladi (node kerak); bu yerda — invariantlar.
"""

from __future__ import annotations

import functools as _ft
import importlib.util
import json
import random
import re
import xml.etree.ElementTree as ET
from datetime import date

import pytest
from django.conf import settings as _s

ROOT = _s.BASE_DIR
from config.apps.conveyor.lenta.catalog import available as catalog_available
from config.apps.conveyor.lenta.items import even_positions
from config.apps.conveyor.lenta.render import (
    DrawingBlocked,
    pdf_file_name,
    render_drawing,
    render_sheets,
    to_pdf,
    to_svg,
)
from config.apps.conveyor.lenta.render.marks import dim_chain_plan
from config.apps.conveyor.lenta.render.title_block import scale_text

# 2026-11-09: standart chizma — bir varaqli ishlab chiqarish varag'i ("prod"). Bu testlar uning ichida qayta
# ishlatiladigan eski varaq qismlarini (general/plan/cross/perf/side) tekshiradi — ichki album=True rejimi.
render_sheets = _ft.partial(render_sheets, album=True)
render_drawing = _ft.partial(render_drawing, album=True)

GOLDEN = ROOT / "data" / "secret" / "lenta_golden.json"
_GOLD = json.loads(GOLDEN.read_text(encoding="utf-8"))["cases"] if GOLDEN.exists() else []

pytestmark = pytest.mark.skipif(not catalog_available(), reason="katalog yo'q (data/secret)")

ALL_KEYS = {"general", "main", "plan", "cross", "side", "perf", "curve", "cut", "message"}


def _pages(pdf: bytes) -> int:
    return len(re.findall(rb"/Type\s*/Page(?![s\w])", pdf))


def _check_svg(svg: str) -> ET.Element:
    root = ET.fromstring(svg.encode())  # o'zimiz yasagan SVG — tashqi entity yo'q
    assert root.tag.endswith("svg")
    assert root.get("viewBox") == "0 0 1188 840"
    return root


def _texts(sheet) -> str:
    return "\n".join(sheet.texts)


def _all(st: dict, **kw) -> list:
    return render_sheets(st, today="", **kw)


# --------------------------------------------------------------- listlar soni
def test_empty_size_one_sheet() -> None:
    sh = _all({})
    assert [s.key for s in sh] == ["main"]
    assert "Chizma uchun lenta eni va uzunligini kiriting" in _texts(sh[0])
    assert sh[0].full


def test_sized_four_sheets() -> None:
    # tekis lenta (profil/yo'naltiruvchi/gofrobortsiz) — yon kesim bo'sh, chiqarilmaydi (2026-11-09)
    sh = _all({"width": 400, "length": 3000})
    assert [s.key for s in sh] == ["general", "main", "plan", "cross"]
    assert [s.page for s in sh] == [1, 2, 3, 4]
    assert all(s.pages == 4 for s in sh)
    assert [s.full for s in sh] == [True, True, False, False]
    assert [s.key for s in _all({"width": 400, "length": 3000, "crossOn": True})][-1] == "side"
    first = _texts(sh[0])
    assert "1. Umumiy chizma — ko'ndalang kesim" in first
    assert "3D" not in first


def test_perf_sixth_sheet_and_no_sheet_when_not_fit() -> None:
    # oddiy teshikli lenta: perforatsiya varag'i 1-varaqning takrori bo'lardi — chiqarilmaydi, B detal 1-varaqda
    sh = _all({"width": 800, "length": 6000, "perfOn": True, "perfDia": 10, "perfQty": 156})
    assert [s.key for s in sh] == ["general", "main", "plan", "cross"]
    assert "B — teshiklar joylashuvi" in _texts(sh[0])
    # profilli + teshikli — alohida perforatsiya varag'i bor
    sh = _all({"width": 800, "length": 6000, "perfOn": True, "perfDia": 10, "perfQty": 156, "crossOn": True})
    assert sh[-1].key == "perf" and f"{len(sh)}. Perforatsiya" in _texts(sh[-1])
    assert len(_all({"width": 400, "length": 3000, "perfOn": True, "perfDia": 200, "perfQty": 10})) == 4


def test_bent_sheets() -> None:
    sh = _all({"width": 300, "length": 2000, "bendAngle": 90, "curveHoleCount": 12})
    assert [s.key for s in sh] == ["curve", "cut"]  # D10: + kesish shabloni
    t = _texts(sh[0])
    assert "1. Bukilgan lenta — ustidan ko'rinish" in t
    assert "Tashqi diametr: Ø2 846 mm" in t
    assert "B = 300" in t


def test_bend_too_tight_message() -> None:
    dr = render_drawing({"width": 500, "length": 300, "bendAngle": 180})
    assert dr.message and "180° ga bukilmaydi" in dr.message
    assert [s.key for s in dr.sheets] == ["message"]
    assert "Лента не сгибается" in render_drawing({"width": 500, "length": 300, "bendAngle": 180}, lang="ru").message


# ------------------------------------------------------------ matn/o'lchamlar
def test_title_block_and_dims_plain() -> None:
    st = {
        "width": 400,
        "length": 3000,
        "projectName": "Megaplast",
        "customerPhone": "+998 90 123 45 67",
        "author": "A. Bovoqulov",
    }
    sh = render_sheets(st, today=date(2026, 1, 5))
    t1 = _texts(sh[0])
    for want in (
        "Konveyer lenta / Конвейерная лента",
        "Megaplast · +998 90 123 45 67",
        "3 000",
        "400",
        "Masshtabsiz",
        "List 1 / 4",
        "05.01.2026",
        "A. Bovoqulov",
        "Qalinligi / Толщина",
    ):
        assert want in t1, want
    assert "turlicha" in _texts(sh[1])
    mini = _texts(sh[2])
    assert "400 × 3 000 mm" in mini and "List 3 / 4" in mini and "Ustidan ko'rinish" in mini
    # sanasiz — "—"
    assert "—" in _texts(_all(st)[0])


def test_cross_section_chain_values() -> None:
    st = {
        "width": 860,
        "length": 11500,
        "guideOn": True,
        "guideName": "DKC17-P (TOOTHED) - M/NB",
        "guideBottomOn": True,
        "guideBottomQty": 2,
        "guideBottomInset": 25,
        "crossOn": True,
        "crossName": "Профиль L 30 XT30-P (PETROL)",
        "crossLen": 560,
        "crossPos": even_positions(11500, 48),
        "gofroOn": True,
        "gofroQty": 2,
        "perfOn": True,
        "perfDia": 12,
        "perfQty": 60,
    }
    sh = _all(st)
    cross = next(s for s in sh if s.key == "cross")
    t = cross.texts
    for want in ("860", "560", "810", "16,5", "H 50", "Ko'ndalang: uz. 560 mm", "Gofrobort: H 50 mm · 2 tomon"):
        assert want in t, want
    assert t.count("110") == 2 and t.count("30") >= 2


def test_wall_gap_not_negative() -> None:
    sh = _all(
        {
            "width": 2000,
            "length": 6000,
            "gofroOn": True,
            "gofroQty": 2,
            "gofroInsetL": 300,
            "gofroInsetR": 300,
            "crossOn": True,
            "crossPos": [3000],
            "crossWallGap": 10,
            "crossSegs": [[0, 280], [700, 900]],
        }
    )
    plan = _texts(next(s for s in sh if s.key == "plan"))
    assert "Gofra devorigacha: 20 mm" in plan
    assert "Gofra devorigacha: -" not in plan


def test_manual_grid_perf_counts() -> None:
    sh = _all(
        {
            "width": 90,
            "length": 900,
            "perfOn": True,
            "perfDia": 8,
            "perfGrid": True,
            "perfRows": 3,
            "perfCols": 3,
            "perfPitchL": 14,
            "perfPitchW": 14,
            "perfEdge": 31,
            "perfStart": 170,
            "perfStagger": True,
            "perfFill": False,
        }
    )
    allt = "\n".join(_texts(s) for s in sh)
    assert "Ø 8 mm · 8 ta" in allt
    assert "Enida: 3/2 ta (navbatma-navbat)" in allt  # shaxmat: qatorlar 3 va 2 tadan


def test_no_empty_cells_on_general() -> None:
    t = _texts(_all({"width": 90, "length": 900})[0])
    assert "Yo'naltiruvchi yo'q" not in t and "Ko'ndalang yo'q" not in t


def test_no_price_on_drawing() -> None:
    st = {"width": 800, "length": 6000, "crossOn": True, "crossPos": [1000, 3000], "lockOn": True}
    allt = "\n".join(_texts(s) for s in _all(st))
    assert "so'm" not in allt and "сум" not in allt


def test_scale_text_and_chain_plan() -> None:
    assert scale_text(-1) == "Masshtabsiz"
    assert scale_text(12.4) == "1 : 12"
    assert scale_text(0.4) == "2,5 : 1"
    assert scale_text(0) == "—"
    items, rows = dim_chain_plan([0, 20, 40, 60, 80], ["20", "20", "20", "20"])
    assert rows > 1 and items[0].outside == "left" and items[-1].outside == "right"


# ------------------------------------------------------------ SVG va PDF
def test_svg_and_pdf_valid() -> None:
    st = {
        "width": 800,
        "length": 6000,
        "guideOn": True,
        "gofroOn": True,
        "crossOn": True,
        "crossPos": [1000, 3000, 5000],
        "perfOn": True,
        "perfDia": 10,
        "perfQty": 50,
        "projectName": "Тест о‘g‘il ўғ",
    }
    sh = render_sheets(st)
    for s in sh:
        root = _check_svg(to_svg(s))
        assert root.get("aria-label") == f"Konveyer lenta chizmasi — {s.title}"
    pdf = to_pdf(sh)
    assert pdf.startswith(b"%PDF")
    assert _pages(pdf) == len(sh)


def test_pdf_blocked_raises() -> None:
    st = {
        "width": 200,
        "length": 3000,
        "guideOn": True,
        "guideName": "UDK10-W (TOOTHED) - Полиуретан",
        "guideBottomOn": True,
        "guideBottomQty": 3,
        "guideBottomInset": 120,
    }
    dr = render_drawing(st)
    assert dr.blocked and len(dr.sheets) == 5
    with pytest.raises(DrawingBlocked):
        to_pdf(dr.sheets)
    assert _pages(to_pdf(dr.sheets, allow_blocked=True)) == 5


def test_pdf_file_name() -> None:
    assert pdf_file_name({"width": 800, "length": 6000, "projectName": "Megaplast"}) == "Megaplast_800x6000.pdf"
    assert pdf_file_name({"width": 800, "length": 6000}) == "chizma_800x6000.pdf"
    assert pdf_file_name({"width": 400, "length": 3000, "projectName": "ООО Тест-1"}) == "_-1_400x3000.pdf"
    assert pdf_file_name({"width": 400.5, "length": 3000, "projectName": "a b"}) == "a_b_400.5x3000.pdf"


# ------------------------------------------------------- golden va tasodifiy
def _render_all(raw: dict) -> None:
    dr = render_drawing(raw, today="")
    assert dr.sheets
    for s in dr.sheets:
        assert s.key in ALL_KEYS
        _check_svg(to_svg(s))


@pytest.mark.slow
@pytest.mark.skipif(not _GOLD, reason="golden fayl yo'q (scripts/lenta_oracle/run.sh)")
@pytest.mark.parametrize("chunk", range(8))
def test_golden_states_render(chunk: int) -> None:
    for i in range(chunk, len(_GOLD), 8):
        c = _GOLD[i]
        if isinstance(c["out"], dict) and "__error" in c["out"]:
            continue
        try:
            _render_all(c["raw"])
        except Exception as e:
            raise AssertionError(f"golden case {i}: {json.dumps(c['raw'], ensure_ascii=False)[:300]}") from e


def _gen_cases():
    p = ROOT / "scripts" / "lenta_oracle" / "gen_cases.py"
    if not p.exists():
        return None
    spec = importlib.util.spec_from_file_location("lenta_gen_cases", p)
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


@pytest.mark.slow
def test_random_states_render_and_pdf() -> None:
    gen = _gen_cases()
    if gen is None:
        pytest.skip("gen_cases.py yo'q")
    r = random.Random(20261107)
    for k in range(60):
        raw = gen.rnd_case(r)
        try:
            dr = render_drawing(raw, today="")
        except Exception as e:
            raise AssertionError(f"random #{k}: {json.dumps(raw, ensure_ascii=False)[:300]}") from e
        for s in dr.sheets:
            _check_svg(to_svg(s))
        if k % 10 == 0:
            pdf = to_pdf(dr.sheets, allow_blocked=True)
            assert pdf.startswith(b"%PDF") and _pages(pdf) == len(dr.sheets)

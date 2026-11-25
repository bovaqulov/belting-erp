"""2026-11 ataylab farqlar (docs/lenta/09_divergences.md): simmetrik chet, ko'rinadigan teshik,
lenta ichidagi yozuvlar, uzilish chiziqlari, qulf belgisi, sarlavha jadvali to'ldirilishi."""

from __future__ import annotations

import functools as _ft

import pytest

from config.apps.conveyor.lenta.catalog import available as catalog_available
from config.apps.conveyor.lenta.drawing_model import (
    perf_hole_points,
    perf_layout,
    perf_layout_for,
)
from config.apps.conveyor.lenta.render import drawing_number, render_sheets
from config.apps.conveyor.lenta.render.marks import MIN_HOLE_R, short_lock_name
from config.apps.conveyor.lenta.render.pen import Node

# 2026-11-09: standart chizma — bir varaqli ishlab chiqarish varag'i ("prod"). Bu testlar uning ichida qayta
# ishlatiladigan eski varaq qismlarini (general/plan/cross/perf/side) tekshiradi — ichki album=True rejimi.
render_sheets = _ft.partial(render_sheets, album=True)


pytestmark = pytest.mark.skipif(not catalog_available(), reason="katalog yo'q (data/secret)")

LOCK = "KS - SE 90/10 пластик (Пластик замок FORBO)"
EXAMPLE = {
    "beltName": "U13/0A-B (P 9/A/BL blue - 1,3mm) ",
    "width": 1200,
    "length": 11000,
    "lockOn": True,
    "joinMethod": "lock",
    "lockName": LOCK,
    "lockQty": 2,
    "perfOn": True,
    "perfDia": 5,
    "perfQty": 156,
    "perfEdge": 10,
}


def _walk(n: Node):
    yield n
    for c in n.children:
        yield from _walk(c)


def _sheet(st: dict, key: str):
    return next(s for s in render_sheets(st, today="07.11.2026") if s.key == key)


# ------------------------------------------------------------------ D1 simmetrik chet
@pytest.mark.parametrize(
    "width,length,dia,qty,edge,stagger",
    [
        (1200, 11000, 5, 156, 10, True),
        (1000, 6000, 10, 100, 10, False),
        (800, 6000, 10, 156, 40, True),
        (1600, 1000, 30, 1000, 40, True),
        (500, 3000, 8, 30, 25, False),
        (1234, 7777, 12, 400, 33.5, True),
    ],
)
def test_symmetric_edges(width, length, dia, qty, edge, stagger):
    L = perf_layout(width, length, dia, qty, stagger, [], edge)
    assert L is not None and L["manualEdge"]
    cols = L["cols"]
    if cols > 1:
        last = L["edge"] + (cols - 1) * L["pitch"]
        assert L["edge"] == pytest.approx(edge) and width - last == pytest.approx(edge)
        assert L["edgeOffset"] == pytest.approx(edge + L["pitch"] / 2)
    tail = length - (L["start"] + (L["rows"] - 1) * L["pitchL"])
    assert L["start"] == pytest.approx(tail)  # bo'yiga ham markazlangan
    pts = perf_hole_points(L, length, width, 100000)
    us = [p["u"] for p in pts]
    assert (min(us) == pytest.approx(edge) and max(us) == pytest.approx(width - edge)) or cols == 1
    assert len(pts) == L["count"]  # chizilgan teshiklar soni = hisob (narx bilan bir xil)


def test_auto_edge_zero_unchanged():
    L = perf_layout(800, 6000, 10, 156, True, [], 0)
    assert (L["cols"], L["pitch"], L["edge"], L["start"]) == (5, 171, 58, 85.5)


def test_effective_qty_matches_drawn_holes():
    from config.apps.conveyor.lenta.effective import effective_config
    from config.apps.conveyor.lenta.model import revive

    es = effective_config(revive(EXAMPLE))["state"]
    L = perf_layout_for(es)
    assert es["perfQty"] == L["count"] == len(perf_hole_points(L, es["length"], es["width"], 100000))


# ------------------------------------------------------------------ D2 ko'rinadigan teshik
@pytest.mark.parametrize("key", ["general", "plan"])  # oddiy teshikli lentada alohida "perf" varag'i yo'q
def test_holes_visible_min_size(key):
    sh = _sheet(EXAMPLE, key)
    # D11: shtrix doira — "B" detal belgisi (teshik emas), hisobga olinmaydi
    circles = [n for n in _walk(sh.root) if n.tag == "circle" and not n.attrs.get("stroke-dasharray")]
    assert circles, key
    assert all(float(c.attrs["r"]) >= MIN_HOLE_R for c in circles)
    assert all(c.attrs.get("fill") not in ("#ffffff", "none") for c in circles)  # to'ldirilgan (to'q)
    dashed = [n for n in _walk(sh.root) if n.tag == "g" and n.attrs.get("stroke-dasharray") == "10 3 2 3"]
    assert dashed, "o'q chiziqlari (shtrix-punktir) yo'q"


# ------------------------------------------------------------------ D3 lenta ichidagi yozuv
def test_in_belt_annotation_text():
    # izoh qutisi 1-varaqda (lentadan tashqarida, teshiklarni yopmaydi); 3-varaqda u chap paneldagi PERFORATSIYA bo'limida
    t = " ".join(" ".join(_sheet(EXAMPLE, "general").texts).split())  # izoh qutisi qatorlarni o'raydi
    assert "Teshik Ø5 mm" in t and "chetdan 10 mm (ikkala chetdan)" in t
    # shaxmat: qatorlar navbatma-navbat 5 va 4 teshikdan (jami 167)
    assert "enida 5/4 ta (navbatma-navbat), qadam 295 mm" in t and "bo'yida qadam 295 mm" in t
    plan = " ".join(" ".join(_sheet(EXAMPLE, "plan").texts).split())
    assert "PERFORATSIYA" in plan and "Enida: 5/4 ta (navbatma-navbat) · qadam 295 mm" in plan
    assert "Teshik Ø5 mm" not in plan  # lenta ichida teshiklarni yopmaydi


def test_in_belt_annotation_ru():
    sh = next(s for s in render_sheets(EXAMPLE, lang="ru", today="") if s.key == "general")
    t = " ".join(sh.texts)
    assert "Отверстия Ø5 мм" in t and "с обеих сторон" in t


def test_spec_shows_both_edges_when_asymmetric_grid():
    st = {
        "width": 500,
        "length": 1000,
        "perfOn": True,
        "perfDia": 10,
        "perfGrid": True,
        "perfRows": 3,
        "perfCols": 2,
        "perfPitchW": 40,
        "perfPitchL": 100,
        "perfEdge": 60,
        "perfStart": 100,
    }
    t = "\n".join(_sheet(st, "plan").texts)
    assert "chap 60 / o'ng 400 mm" in t


def test_cross_and_guide_labels_in_belt():
    st = {
        "width": 1200,
        "length": 11000,
        "guideOn": True,
        "guideName": "UDK6-W (TOOTHED) - Полиуретан",
        "guideBottomOn": True,
        "guideBottomQty": 1,
        "crossOn": True,
        "crossName": "Профиль L 50",
        "crossLenAuto": True,
        "crossPos": [100 + 300 * i for i in range(37)],
    }
    gen = " ".join(_sheet(st, "general").texts)
    assert "37 ta · qadam 300 mm · birinchisi boshidan 100 mm" in gen
    assert "A — yo'naltiruvchi kesimi (kattalashtirilgan)" in gen
    assert "o'qigacha" in gen and "chetigacha" in gen  # ikki zanjir — izohli
    plan = " ".join(_sheet(st, "plan").texts)
    assert "Yo'naltiruvchi UDK6-W · ostidan 1 ta (markazda)" in plan


# ------------------------------------------------------------------ D4 uzilish va qulf
def _zigzags(sh) -> int:
    """Asosiy ko'rinishdagi uzilish chiziqlari ("B" detal — `data-view="detail"` — o'z uzilishlari bilan, hisobsiz)."""

    def walk(n):
        if n.attrs.get("data-view") == "detail":
            return
        yield n
        for ch in n.children:
            yield from walk(ch)

    return sum(1 for n in walk(sh.root) if n.tag == "polyline" and len(n.pts or []) >= 6)


def test_break_lines_on_long_belt():
    for key in ("plan", "general"):
        sh = _sheet(EXAMPLE, key)
        assert _zigzags(sh) >= 2, key
        assert any("uzilgan" in t for t in sh.texts), key
    short = {**EXAMPLE, "length": 900}
    assert _zigzags(_sheet(short, "plan")) == 0


def test_lock_symbol_and_callout():
    sh = _sheet(EXAMPLE, "plan")
    assert "Qulf: KS - SE 90/10 (FORBO) — ikkala uchida" in sh.texts
    weld = _sheet({**EXAMPLE, "joinMethod": "weld"}, "plan")
    assert any("Payvand" in t for t in weld.texts)
    meter = _sheet({**EXAMPLE, "joinMethod": "meter"}, "plan")
    assert not any(t.startswith(("Qulf:", "Payvand")) for t in meter.texts)
    assert short_lock_name(LOCK) == "KS - SE 90/10 (FORBO)"


# ------------------------------------------------------------------ D6 sarlavha jadvali
def test_title_block_fallbacks():
    sh = render_sheets(EXAMPLE, today="07.11.2026")[0]
    t = sh.texts
    assert "ko'rsatilmagan / не указан" in t
    no = next(x for x in t if x.startswith("L-261107-"))
    assert len(no) == len("L-261107-ABCD")
    assert render_sheets(EXAMPLE, today="07.11.2026")[0].texts.count(no) == 1  # deterministik
    assert drawing_number({"a": 1}, "07.11.2026") == drawing_number({"a": 1}, "07.11.2026")
    assert drawing_number({"a": 1}, "").startswith("L-") and drawing_number({"a": 2}, "") != drawing_number(
        {"a": 1}, ""
    )
    named = render_sheets({**EXAMPLE, "projectName": "Megaplast"}, today="")[0].texts
    assert "Megaplast" in named and "ko'rsatilmagan / не указан" not in named


def test_d12_cross_len_reduces_wall_gap():
    """D12: 400 mm, gofra ikki chetda 10 mm — 300 mm profil zazor 10 mm bilan sig'adi; 320 mm sig'maydi."""
    from config.apps.conveyor.lenta.effective import effective_config
    from config.apps.conveyor.lenta.model import revive

    base = {
        "width": 400,
        "length": 6000,
        "gofroOn": True,
        "gofroQty": 2,
        "gofroInsetL": 10,
        "gofroInsetR": 10,
        "crossOn": True,
        "crossLenAuto": False,
    }
    e = effective_config(revive({**base, "crossLen": 300}))
    assert e["state"]["crossLen"] == 300 and e["state"]["crossWallGap"] == 10
    assert "25 → 10 mm" in e["issues"][0]["message"]
    e = effective_config(revive({**base, "crossLen": 280}))
    assert e["state"]["crossLen"] == 280 and e["state"]["crossWallGap"] == 20
    e = effective_config(revive({**base, "crossLen": 320}))
    assert e["state"]["crossLen"] == 270 and e["state"]["crossWallGap"] == 25
    assert e["issues"][0]["message"].endswith("(gofra devorigacha zazor 10 mm bo'lsa — 300 mm gacha)")

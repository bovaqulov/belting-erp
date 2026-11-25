"""05_tests.md dagi narxdan tashqari qabul testlari + maxfiylik tekshiruvi."""

from __future__ import annotations

import json
import math
from datetime import UTC, date, datetime

import pytest

from config.apps.conveyor.lenta import catalog as cat_mod
from config.apps.conveyor.lenta import items as it
from config.apps.conveyor.lenta._js import jround, js_json, js_str, to_locale_ru
from config.apps.conveyor.lenta.calc import joint_case_of, joint_mm
from config.apps.conveyor.lenta.curve import (
    bend_too_tight,
    curve_default_holes,
    curve_geom,
    curve_holes_overlap,
    from_diameters,
    is_curve,
    perf_off_patch,
    sector_bounds,
    width_patch,
)
from config.apps.conveyor.lenta.drawing_model import (
    build_drawing_model,
    cross_free,
    cross_max_length,
    cross_max_length_for,
    cross_max_segment,
    cross_slot_at,
    cross_spans,
    cross_spans_of,
    cross_total_width,
    fit_cross_segs,
    gofro_bands,
    gofro_inset_patch,
    guide_positions,
    guide_side_of,
    perf_align_info,
    perf_alignment,
    perf_count_for_pitch,
    perf_grid_patch,
    perf_hole_points,
    perf_layout,
    perf_layout_for,
    perf_sides_for,
    perf_usable_width,
)
from config.apps.conveyor.lenta.effective import effective_config
from config.apps.conveyor.lenta.format import f1, format_date, money, uzs
from config.apps.conveyor.lenta.locks import (
    default_lock_for,
    lock_fits,
    lock_options_of,
    lock_thickness_range,
    tool_options_of,
)
from config.apps.conveyor.lenta.model import (
    decode_state,
    encode_state,
    initial_state,
    parse_project,
    project_file_name,
    project_json,
    revive,
    st,
)

GUIDE = "UDK10-W (TOOTHED) - Полиуретан"
K17 = "Профиль К 17"
T20 = "Профиль T(1)20-P (PETROL)"


def close(a: float, b: float, d: int = 2) -> bool:
    return abs(a - b) < 0.5 * 10**-d


# ------------------------------------------------------------------ maxfiylik


def test_public_catalog_has_no_secret_keys() -> None:
    pc = cat_mod.public_catalog()

    def walk(v: object) -> None:
        if isinstance(v, dict):
            for k, x in v.items():
                assert k not in cat_mod.SECRET_KEYS, k
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)

    walk(pc)
    assert set(pc) == {"belts", "locks", "guideProfiles", "crossProfiles", "gofroProfiles", "perforation"}
    assert len(pc["belts"]) == len(cat_mod.catalog()["belts"])
    assert all("name" in b for b in pc["belts"])
    # narx qiymatlari matnda ham yo'q
    text = json.dumps(pc, ensure_ascii=False)
    for k in ("pricePerM", "base", "markup", "rate", "services"):
        assert f'"{k}"' not in text


# ------------------------------------------------------------------ JS semantikasi


def test_js_helpers() -> None:
    assert jround(2.5) == 3 and jround(-2.5) == -2 and jround(0.49999999999999994) == 0
    assert js_str(860.0) == "860" and js_str(1e21) == "1e+21" and js_str(1.5e-7) == "1.5e-7"
    assert js_str(0.1 + 0.2) == "0.30000000000000004" and js_str(1e-6) == "0.000001"
    assert to_locale_ru(1234567.891, 0, 2) == "1 234 567,89"
    assert to_locale_ru(1.005, 0, 2) == "1,01" and to_locale_ru(-0.0, 0, 2) == "-0"
    assert js_json({"b": 1.0, "2": [1.5, None], "0": True}) == '{"0":true,"2":[1.5,null],"b":1}'


def test_format() -> None:
    assert uzs(1234567) == "1 234 567" and uzs(float("nan")) == "0"
    assert money(1234.5) == "1 235 so'm" and money(10, "ru") == "10 сум"
    assert f1(9.9) == "9,9" and f1(11) == "11" and f1(1.25) == "1,3"
    assert format_date(date(2026, 1, 5)) == "05.01.2026" and format_date(date(2026, 12, 31)) == "31.12.2026"


# ------------------------------------------------------------------ items (I1–I65)


def test_items_basic() -> None:
    assert it.even_positions(1000, 4) == [125, 375, 625, 875]
    assert it.even_positions(0, 4) == [] and it.even_positions(1000, 0) == []
    assert len(it.even_positions(10000, 1e9)) == 500
    assert it.normalize_positions([900, -50, 300, 1200], 1000) == [300, 900]
    assert it.normalize_positions([0, 1000], 1000) == [0, 1000]
    assert it.normalize_positions([500, 500.2], 1000) == [500]
    assert it.normalize_positions([500, 500.5], 1000) == [500, 500.5]
    assert it.normalize_positions("nimadir", 1000) == [] and it.normalize_positions([1, 2], 0) == []
    assert it.normalize_positions([100, "200", None, math.nan, 300], 1000) == [100, 300]
    assert it.add_position([100, 500], 300, 1000) == {"list": [100, 300, 500], "index": 1}
    assert it.add_position([100, 500], 110, 1000, 30)["list"] == [100, 130, 500]
    full = it.even_positions(10000, 500)
    assert it.add_position(full, 5, 10000)["list"] is full
    assert it.move_to([100, 300, 500], 0, 400, 1000) == {"list": [300, 400, 500], "index": 1}
    assert len(it.move_to([100, 300, 500], 0, 300, 1000)["list"]) == 3
    assert it.move_to([100, 300, 500], 0, 310, 1000, 30) == {"list": [300, 330, 500], "index": 1}
    assert it.move_to([100], 0, 5000, 1000)["list"] == [1000] and it.move_to([100], 0, -5, 1000)["list"] == [0]
    assert it.gaps_of([200, 500], 1000) == [200, 300, 500] and it.gaps_of([], 1000) == [1000]
    assert close(sum(it.gaps_of(it.even_positions(11500, 48), 11500)), 11500, 6)


def test_items_set_gap() -> None:
    xs = [100, 300, 500]
    assert it.set_gap(xs, 0, 200, 1000) == [200, 400, 600]
    assert it.gaps_of(it.set_gap(xs, 0, 200, 1000), 1000)[1:3] == [200, 200]
    assert it.set_gap(xs, 1, 300, 1000) == [100, 400, 600]
    assert it.set_gap(xs, 3, 200, 1000) == [400, 600, 800]
    assert it.set_gap(xs, 0, 5000, 1000) == [600, 800, 1000]
    assert it.set_gap(xs, 3, 5000, 1000) == [0, 200, 400]
    n = it.set_gap(xs, 1, 0, 1000)
    assert close(n[1] - n[0], 0.5)
    assert it.remove_at(xs, 1) == [100, 500]
    ys = [100, 300]
    assert it.remove_at(ys, 7) is ys
    assert it.uniform_pitch(it.even_positions(1000, 4), 1000) == 250
    assert it.uniform_pitch(it.set_gap(it.even_positions(1000, 4), 1, 300, 1000), 1000) is None
    assert it.uniform_pitch([500], 1000) is None and it.uniform_pitch([], 1000) is None


def test_items_local_and_slots() -> None:
    assert it.set_gap_local([150, 650], 2, 100, 800, 10, 790, 20) == [150, 700]
    assert it.set_gap_local([150, 650], 0, 100, 800, 10, 790, 20) == [100, 650]
    assert it.set_gap_local([100, 300, 500], 1, 150, 800, 10, 790, 20) == [100, 250, 500]
    assert it.set_gap_local([150, 650], 1, 5, 800, 10, 790, 20) == [150, 170]
    assert it.move_one([150, 650], 1, 900, 10, 790, 20) == [150, 790]
    assert it.mid_slot([], 123, 1000) == 500
    assert [it.mid_slot([200, 600], a, 1000) for a in (400, 50, 900)] == [400, 100, 800]
    assert it.mid_slot_fit([200, 225], 100, 800, 20) == 100
    assert it.mid_slot_fit([200, 225], 212, 800, 30) == 512.5
    assert it.nearest_allowed(200, [[50, 120]], 5, 795) == 200
    assert it.nearest_allowed(110, [[50, 120]], 5, 795) == 120
    assert it.nearest_allowed(60, [[50, 120]], 5, 795) == 50
    assert it.nearest_allowed(30, [[50, 120]], 5, 795) == 30
    assert it.nearest_allowed(125, [[50, 120], [115, 160]], 5, 795) == 160


def test_items_groups() -> None:
    xs = [100, 300, 500]
    assert it.group_count(xs, 5, 1000) == [100, 200, 300, 400, 500]
    assert it.group_pitch(xs, 150, 1000) == [100, 250, 400] and it.group_pitch(xs, 600, 1000) == [100, 700]
    assert it.group_start(xs, 50, 1000) == [50, 250, 450] and it.group_start(xs, 900, 1000) == [600, 800, 1000]
    assert it.group_end(xs, 100, 1000) == [100, 500, 900]
    assert it.move_many([100, 300, 500, 900], [1, 2], 50, 1000, 30) == {"list": [100, 350, 550, 900], "ids": [1, 2]}
    r = it.move_many([100, 300, 500, 900], [1, 2], 500, 1000, 30)
    assert r["list"] == [100, 800, 900, 1000] and [r["list"][i] for i in r["ids"]] == [800, 1000]
    r = it.move_many([100, 300, 500], [1, 2], 700, 600, 30)
    assert max(r["list"]) <= 600 and r["list"][2] > 595
    assert it.distribute_many([100, 150, 600, 700], [0, 1, 2, 3], 1000, 30)["list"] == [100, 300, 500, 700]
    assert it.pitch_many([100, 300, 500, 900], [0, 1, 2], 120, 1000, 30)["list"] == [100, 220, 340, 900]
    assert it.pitch_many([100, 300, 500, 900], [0, 1, 2, 3], 400, 1000, 30)["list"] == [100, 300, 500, 900]
    assert it.remove_many([100, 300, 500, 900], [0, 2]) == [300, 900]
    assert it.move_many([100, 300, 900, 905], [0, 1], 50, 1000, 30)["list"] == [150, 350, 900, 905]
    assert it.move_many([100, 300], [1, 5], 50, 1000, 30)["list"] == [100, 350]


def test_items_cleat_ends_and_gap_left() -> None:
    xs = [57.5, 173, 11400]
    assert it.fit_cleat_ends(xs, 11500, 20) is xs
    assert it.fit_cleat_ends([57.5, 11376.5, 11490.5], 11500, 20) == [57.5, 11376.5, 11490]
    assert it.fit_cleat_ends([3, 200], 1000, 20) == [10, 200]
    assert it.fit_cleat_ends([100, 985, 995], 1000, 20) == [100, 985]
    a = [100, 300, 500, 700]
    assert it.set_gap_left(a, 2, 150, 1000, 20) == [100, 350, 500, 700]
    assert it.set_gap_left(a, 0, 50, 1000, 20) == [50, 300, 500, 700]
    assert it.set_gap_left(a, 4, 100, 1000, 20) == [100, 300, 500, 900]
    assert it.set_gap_left(a, 2, 400, 1000, 20) == [100, 120, 500, 700]
    for k in (3, 2, 1):
        a = it.set_gap_left(a, k, 150, 1000, 20)
    assert a == [250, 400, 550, 700]


# ------------------------------------------------------------------ drawing (D, G, F, B)


def test_cross_max_length() -> None:
    assert cross_max_length(400, False) == 400 and cross_max_length(400, True) == 290
    assert cross_max_length(0, False) == 0 and cross_max_length(50, True) == 0
    assert cross_max_length(860, False, None) == 860
    assert cross_max_length(860, False, {"xs": [25, 835], "B": 10}) == 780
    assert cross_max_length(860, False, {"xs": [430], "B": 10}) == 0
    assert cross_max_length(860, False, {"xs": [25, 430, 835], "B": 10}) == 0
    assert cross_max_length(860, True, {"xs": [25, 835], "B": 10}) == 750
    assert cross_max_length(860, True, {"xs": [200, 660], "B": 10}) == 430
    assert cross_max_length_for(st(width=860)) == 860
    top = st(
        width=860, guideOn=True, guideName=GUIDE, guideTopOn=True, guideTopQty=2, guideTopInset=25, guideBottomOn=False
    )
    assert cross_max_length_for(top) == 780
    assert (
        cross_max_length_for(st(width=860, guideOn=True, guideName=GUIDE, guideBottomQty=2, guideBottomInset=25)) == 860
    )
    assert cross_max_length_for({**top, "guideTopQty": 1}) == 0


def test_cross_spans_and_segments() -> None:
    assert cross_spans(1500, 650, 2, 55) == [[72.5, 722.5], [777.5, 1427.5]]
    assert cross_spans(1000, 600, 1, 55) == [[200, 800]]
    assert cross_spans(0, 600, 2, 50) == [] and cross_spans(1000, 0, 2, 50) == []
    assert cross_total_width(650, 2, 55) == 1355
    assert cross_max_segment(1355, 2, 55) == 650 and cross_max_segment(800, 1, 55) == 800
    assert cross_max_segment(40, 2, 55) == 0


def test_drawing_cross_with_top_guides() -> None:
    d14 = st(
        width=860,
        length=2000,
        guideOn=True,
        guideName=GUIDE,
        guideTopOn=True,
        guideTopQty=2,
        guideTopInset=25,
        guideBottomOn=False,
        crossOn=True,
        crossName=T20,
        crossPos=it.even_positions(2000, 10),
        crossLen=860,
    )
    m = build_drawing_model(d14)
    assert m["cross"]["drawLength"] == m["cross"]["maxLength"]
    for u in m["guide"]["top"]["xs"]:
        assert abs(u - 430) >= m["cross"]["drawLength"] / 2 + 5 + 10
    assert any("maksimal" in w for w in m["warnings"])
    m2 = build_drawing_model({**d14, "guideTopQty": 1, "crossLen": 300})
    assert m2["cross"]["maxLength"] == 0 and any("joy yo'q" in w for w in m2["warnings"])


def test_guides() -> None:
    assert guide_positions(400, 0, 25) == [] and guide_positions(0, 2, 25) == []
    assert guide_positions(400, 1, 25) == [200] and guide_positions(400, 1, 90) == [200]
    assert guide_positions(400, 2, 25) == [25, 375] and guide_positions(400, 3, 50) == [50, 200, 350]
    assert guide_positions(400, 2, 250) == [0, 400] and guide_positions(200, 3, 120) == [0, 100, 200]
    assert guide_positions(200, 3, 25) == [25, 100, 175]
    b = st(width=860, guideOn=True, guideBottomOn=True, guideBottomQty=1)
    assert guide_side_of(b, "bottom")["xs"] == [430]
    assert guide_side_of({**b, "guideBottomAt": 300}, "bottom")["xs"] == [300]
    assert guide_side_of({**b, "guideBottomAt": 5000}, "bottom")["xs"] == [860]
    assert guide_side_of({**b, "guideBottomQty": 2, "guideBottomInset": 25, "guideBottomAt": 300}, "bottom")["xs"] == [
        25,
        835,
    ]
    g = st(
        width=800, guideOn=True, guideName=K17, guideBottomOn=False, guideTopOn=True, guideTopQty=2, guideTopInset=150
    )
    r = guide_side_of(g, "top")
    assert r["xs"] == [150, 650] and r["pitch"] == 500
    r = guide_side_of({**g, "guideTopQty": 3, "guideTopPos": [150, 300, 700]}, "top")
    assert r["xs"] == [150, 300, 700] and r["pitch"] is None and r["inset"] == 150
    assert guide_side_of({**g, "guideTopPos": [150, 300, 700]}, "top")["xs"] == [150, 650]
    assert guide_side_of({**g, "guideTopPos": [150, 900]}, "top")["xs"] == [150, 650]


def test_gofro() -> None:
    def g(**o: object) -> dict:
        return st(**{"width": 800, "gofroOn": True, "gofroQty": 2, "gofroInsetL": 0, "gofroInsetR": 0, **o})

    assert gofro_bands(g()) == [{"side": "left", "from": 10, "to": 65}, {"side": "right", "from": 735, "to": 790}]
    assert gofro_bands(g(gofroInsetL=40))[0] == {"side": "left", "from": 40, "to": 95}
    assert (
        cross_max_length_for(g()) == 670 and cross_max_length_for({**g(), "gofroInsetL": 40, "gofroInsetR": 40}) == 610
    )
    assert perf_sides_for(g(gofroInsetL=40)) == {"left": 95, "right": 65}
    assert perf_usable_width(800, 10, perf_sides_for(g(gofroInsetL=40))) < perf_usable_width(
        800, 10, perf_sides_for(g())
    )
    assert gofro_bands(g(gofroInsetL=5000))[0]["to"] <= 400
    w = st(width=500, gofroOn=True, gofroQty=2, gofroInsetL=30, gofroInsetR=30)
    assert [cross_max_length_for({**w, "crossWallGap": x}) for x in (25, 10, 2)] == [330, 360, 360]
    base = st(
        width=500,
        gofroOn=True,
        gofroQty=2,
        gofroInsetL=10,
        gofroInsetR=0,
        crossOn=True,
        crossLen=400,
        crossLenAuto=False,
        crossWallGap=10,
    )
    p = gofro_inset_patch(base, "right", 30)
    assert p["gofroInsetR"] == 30 and p["crossLen"] == 360
    p = gofro_inset_patch({**base, "gofroInsetR": 30, "crossLen": 360}, "right", 0, 400)
    assert p["crossLen"] == 400 and p["gofroInsetR"] == 10
    assert gofro_inset_patch(base, "left", 0)["gofroInsetL"] == 10
    assert gofro_inset_patch(base, "right", -50)["gofroInsetR"] == 10
    assert gofro_inset_patch(base, "left", 1000)["gofroInsetL"] == 195
    assert gofro_inset_patch({**base, "crossLenAuto": True}, "right", 30) == {"gofroInsetR": 30}


def test_manual_segments() -> None:
    s0 = st(width=500, guideOn=False, gofroOn=True, gofroQty=2, gofroInsetL=195, gofroInsetR=195, crossWallGap=10)
    free = cross_free(s0)
    assert free == [[0, 185], [235, 265], [315, 500]]
    assert cross_slot_at(free, [], 72, 10) == [0, 185]
    assert cross_slot_at(free, [[0, 100]], 150, 10) == [110, 185]
    assert cross_slot_at(free, [], 210, 10) is None and cross_slot_at(free, [[0, 100]], 50, 10) is None
    assert fit_cross_segs([[150, 250]], free) == [[150, 185]]
    assert fit_cross_segs([[0, 120], [100, 180]], free) == [[0, 120], [120, 180]]
    assert cross_spans_of({**s0, "crossOn": True, "crossSegs": [[0, 185]]}, 30) == [[0, 185]]
    assert cross_spans_of({**s0, "crossOn": True, "crossSegs": None, "crossParts": 1}, 30) == [[235, 265]]
    assert cross_spans_of({**s0, "crossOn": False, "crossSegs": [[0, 185]]}, 30) == []
    assert fit_cross_segs([[3.2, 8.2]], [[0, 100]]) == [[3.2, 8.2]]


def test_drawing_model_warnings() -> None:
    s = st(width=400, length=3000, crossOn=True, crossLen=500, gofroOn=False)
    assert build_drawing_model(s)["warnings"] == ["Ko'nd. profil 500 mm > maksimal 400 mm"]
    assert build_drawing_model({**s, "crossLen": 300})["warnings"] == []
    k = st(
        width=400, length=3000, guideOn=True, guideName=K17, guideBottomOn=True, guideBottomQty=2, guideBottomInset=2
    )
    assert build_drawing_model(k)["warnings"] == ["Chetdan qochish (ostidagi) kamida 8.5 mm bo'lishi kerak"]
    assert build_drawing_model({**k, "guideBottomInset": 250})["warnings"] == [
        "Chetdan qochish (ostidagi) lenta eniga sig'maydi"
    ]
    m = build_drawing_model(st(width=400, length=3000))
    assert m["guide"] is None and m["cross"] is None and m["gofro"] is None and m["perf"] is None
    m = build_drawing_model(st(width=400, length=3000, crossOn=True, crossLen=500, gofroOn=True))
    assert m["cross"]["length"] == 500 and m["cross"]["drawLength"] == 270
    m = build_drawing_model(st(width=400, length=3000, gofroOn=True, gofroQty=1, gofroSide="right"))
    assert m["gofro"]["sides"] == ["right"]
    m = build_drawing_model(
        st(
            width=400,
            length=3000,
            guideOn=True,
            guideBottomOn=True,
            guideBottomQty=1,
            guideTopOn=True,
            guideTopQty=2,
            guideTopInset=40,
        )
    )
    assert m["guide"]["count"] == 3 and m["guide"]["bottom"]["xs"] == [200] and m["guide"]["top"]["xs"] == [40, 360]
    m = build_drawing_model(st(width=400, length=3000, guideOn=True, guideBottomOn=False, guideTopOn=False))
    assert m["guide"] is None and any("tomon tanlanmagan" in w for w in m["warnings"])


# ------------------------------------------------------------------ perforatsiya (P)


def test_perf_auto() -> None:
    assert perf_usable_width(800, 10, []) == 760 and perf_usable_width(800, 30, []) == 740
    assert perf_usable_width(800, 30, ["left", "right"]) < perf_usable_width(800, 30, [])
    assert perf_count_for_pitch(800, 6000, 20, 19, False) == 0
    assert perf_count_for_pitch(0, 6000, 10, 50, False) == 0
    assert perf_count_for_pitch(800, 6000, 10, 50, False) == 1920
    assert perf_count_for_pitch(800, 6000, 10, 100, False) == 480
    assert perf_count_for_pitch(800, 6000, 10, 100, True) == 450
    L = perf_layout(800, 6000, 10, 156, True, [], 0)
    assert (L["cols"], L["pitch"], L["edge"], L["manualEdge"]) == (5, 171, 58, False)
    assert close(800 - (L["edge"] + 4 * L["pitch"]), 58) and close(L["edgeOffset"], L["edge"] + L["pitch"] / 2)
    L = perf_layout(800, 6000, 10, 156, True, [], 40)
    # D1 (09_divergences.md): chetdan 40 — ikkala chetdan; ustunlar soni o'zgarmaydi, qadam yoyiladi
    assert (L["edge"], L["cols"], L["pitchL"], L["manualEdge"]) == (40, 5, 171, True)
    assert close(L["pitch"], 180) and close(800 - (L["edge"] + 4 * L["pitch"]), 40)
    assert perf_layout(800, 6000, 10, 156, True, [], 4) is None
    assert perf_layout(40, 6000, 30, 10, False, [], 0) is None
    assert perf_layout(0, 6000, 10, 156, True) is None and perf_layout(800, 6000, 10, 0, True) is None
    L = perf_layout(800, 1000, 10, 40, True, [], 0)
    pts = perf_hole_points(L, 1000, 800)
    row0 = [p for p in pts if p["z"] == L["pitch"] / 2]
    row1 = [p for p in pts if p["z"] == 1.5 * L["pitch"]]
    assert len(row0) == L["cols"] and len(row1) == L["cols"] - 1 and close(row1[0]["u"], L["edgeOffset"])
    assert len(perf_hole_points(perf_layout(800, 6000, 10, 1000, False, [], 0), 6000, 800, 50)) == 50
    for ln, dia, q in ((24000, 10, 383), (6000, 10, 156), (1000, 8, 40)):
        L = perf_layout(1600, ln, dia, q, True, [], 0)
        assert L["start"] + (L["rows"] - 1) * L["pitchL"] + dia / 2 <= ln


def test_perf_grid() -> None:
    base = st(width=800, length=3000, perfOn=True, perfDia=20, perfQty=100, perfStagger=False)
    L = perf_layout_for(
        {
            **base,
            "perfGrid": True,
            "perfRows": 10,
            "perfCols": 4,
            "perfPitchL": 200,
            "perfPitchW": 150,
            "perfEdge": 100,
            "perfStart": 50,
        }
    )
    pts = perf_hole_points(L, 3000, 800)
    assert (L["count"], L["pitch"], L["pitchL"]) == (40, 150, 200)
    assert pts[0] == {"u": 100, "z": 50} and pts[4] == {"u": 100, "z": 250}
    L = perf_layout_for(
        {
            **base,
            "perfGrid": True,
            "perfRows": 3,
            "perfCols": 4,
            "perfPitchL": 100,
            "perfPitchW": 100,
            "perfStagger": True,
        }
    )
    assert L["count"] == 11
    auto = perf_layout_for(base)
    L = perf_layout_for({**base, **perf_grid_patch(base, {})})
    assert (L["count"], L["pitch"], L["start"]) == (auto["count"], auto["pitch"], auto["start"])
    s = st(
        width=700,
        length=3000,
        perfOn=True,
        perfDia=30,
        perfGrid=True,
        perfRows=10,
        perfCols=4,
        perfPitchL=250,
        perfPitchW=200,
        perfEdge=50,
        perfStart=100,
    )
    p = perf_grid_patch(s, {"perfCols": 6})
    assert p["perfCols"] == 6 and p["perfPitchW"] == 120
    assert perf_grid_patch(s, {"perfPitchL": 400})["perfRows"] == 8
    assert perf_grid_patch(s, {"perfCols": 3})["perfPitchW"] == 200


def test_perf_alignment_and_groups() -> None:
    a = st(
        width=800,
        length=3000,
        perfOn=True,
        perfDia=30,
        perfGrid=True,
        perfAlign=True,
        perfPerGap=1,
        perfCols=3,
        perfPitchW=200,
        perfEdge=200,
        perfStagger=False,
        crossOn=True,
        crossName=T20,
        crossPos=[150 + 300 * i for i in range(10)],
    )
    L = perf_layout_for(a)
    assert L["pitchL"] == 300 and L["start"] == 300
    L2 = perf_layout_for({**a, "perfPerGap": 2})
    assert L2["pitchL"] == 150
    assert perf_align_info(a)["maxPerGap"] == 5
    assert perf_alignment({**a, "perfPerGap": 99})["perGap"] == 5
    assert perf_alignment({**a, "crossPos": [100, 400, 900]}) is None
    g = st(
        width=600,
        length=2000,
        perfOn=True,
        perfGrid=True,
        perfDia=8,
        perfRows=5,
        perfCols=2,
        perfPitchW=20,
        perfPitchL=15,
        perfStagger=True,
        perfStart=50,
        perfFill=False,
    )
    L = perf_layout_for({**g, "perfGroups": 2, "perfEdge": 40, "perfGroupPitch": 300})
    pts = perf_hole_points(L, 2000, 600)
    assert L["groups"] == [0, 300] and L["count"] == 16 and len(pts) == 16
    assert min(p["u"] for p in pts) == 40 and any(p["u"] == 340 for p in pts)
    L = perf_layout_for({**g, "perfGroups": 2, "perfEdge": 40, "perfGroupPitch": 0})
    assert close(600 - (L["groups"][1] + L["edge"] + (L["cols"] - 1) * L["pitch"]), 40)
    assert perf_layout_for({**g, "perfGroups": 1, "perfEdge": 40})["groups"] == [0]
    pl = st(
        width=500,
        length=1000,
        perfGrid=True,
        perfDia=10,
        perfCols=2,
        perfPitchW=40,
        perfEdge=60,
        perfPitchL=100,
        perfStart=50,
        perfFill=True,
        perfGroups=2,
    )
    a0 = perf_layout_for(pl)
    L = perf_layout_for({**pl, "perfLines": [250]})
    assert L["lines"] == [250] and L["count"] == a0["count"] + L["rows"]
    assert perf_layout_for({**pl, "perfLines": [2, 250, 250, 600]})["lines"] == [250]
    s = st(
        width=500,
        length=2000,
        perfGrid=True,
        perfDia=15,
        perfCols=1,
        perfPitchW=15,
        perfEdge=100,
        perfPitchL=150,
        perfStart=60,
        perfFill=True,
        perfGroups=1,
    )
    assert perf_grid_patch(s, {"perfEdge": 602})["perfEdge"] == 492.5


# ------------------------------------------------------------------ curve (C)


def _sample(**o: object) -> dict:
    return st(
        **{
            **from_diameters(5800, 2000, 180),
            "bendAngle": 180,
            "curveHoleCount": 150,
            "curveHoleEdge": 15,
            "curveHoleDia": 8,
            **o,
        }
    )


def test_curve() -> None:
    assert from_diameters(5800, 2000, 180) == {"width": 1900, "length": jround(math.pi * 3900 / 2)}
    g = curve_geom(_sample())
    assert jround(2 * g["R"]) == 5800 and jround(2 * g["r"]) == 2000 and len(g["holes"]["angles"]) == 150
    assert jround(2 * g["holes"]["pcdR"]) == 5770
    assert close(g["holes"]["angles"][0], 0.6) and close(g["holes"]["angles"][-1], 179.4)
    assert not is_curve({"bendAngle": 0}) and curve_geom({**_sample(), "bendAngle": 0}) is None
    t = st(width=1000, length=500, bendAngle=180)
    assert bend_too_tight(t) and any(
        i["field"] == "bendAngle" and i["level"] == "error" for i in effective_config(t)["issues"]
    )
    e = effective_config({**_sample(), "crossOn": True, "gofroOn": True, "guideOn": True})["state"]
    assert e["perfOn"] and e["perfQty"] == 150 and not (e["crossOn"] or e["gofroOn"] or e["guideOn"])
    assert close(e["width"] * e["length"] / 1e6, math.pi * (2.9**2 - 1**2) / 2)
    b = sector_bounds({"R": 2000, "r": 1000, "angle": 47.3})
    assert close(b["maxX"] - b["minX"], 2 * 2000 * math.sin(math.radians(23.65)), 6)
    b = sector_bounds({"R": 2900, "r": 1000, "angle": 180})
    assert close(b["maxX"] - b["minX"], 5800) and close(b["maxY"] - b["minY"], 2900)
    g = curve_geom(_sample(curveHoleRows=3, curveHoleRowPitch=25))
    assert [jround(2 * r["pcdR"]) for r in g["holes"]["rows"]] == [5770, 5720, 5670] and g["holes"]["total"] == 450
    g = curve_geom(_sample(curveHoleCount=10, curveHoleRows=3, curveHoleRowPitch=25, curveHoleStagger=True))
    assert [len(r["angles"]) for r in g["holes"]["rows"]] == [10, 9, 10] and g["holes"]["total"] == 29
    assert close(g["holes"]["rows"][1]["angles"][0], 18) and g["holes"]["rows"][1]["angles"][8] < 180
    s = _sample(curveHoleRows=100, curveHoleRowPitch=20)
    assert curve_geom(s)["holes"] is None
    assert any(i["field"] == "curveHoleEdge" and i["tab"] == "perf" for i in effective_config(s)["issues"])
    assert curve_holes_overlap(_sample(curveHoleRows=2, curveHoleRowPitch=5))
    assert not curve_holes_overlap(_sample(curveHoleRows=2, curveHoleRowPitch=20))
    assert curve_default_holes(_sample(curveHoleCount=0)) == jround(2885 * math.pi / 50)
    assert perf_off_patch({"bendAngle": 180}) == {"curveHoleCount": 0} and perf_off_patch({"bendAngle": 0}) == {
        "perfOn": False
    }
    base = st(**from_diameters(10000, 4366, 180), bendAngle=180)
    p = width_patch(base, 2000)
    g = curve_geom({**base, **p})
    assert p["width"] == 2000 and close(2 * g["R"], 10000, 0) and close(2 * g["r"], 6000, 0)
    assert width_patch(st(width=500, length=3000), 800) == {"width": 800}


# ------------------------------------------------------------------ effective (E)


def _base(**o: object) -> dict:
    return st(
        **{
            "width": 860,
            "length": 11500,
            "guideOn": True,
            "guideName": GUIDE,
            "guideBottomOn": False,
            "guideTopOn": True,
            "guideTopQty": 2,
            "guideTopInset": 25,
            "crossOn": True,
            "crossName": "Профиль L 50",
            "crossPos": it.even_positions(11500, 48),
            **o,
        }
    )


def test_effective_cross() -> None:
    e = effective_config(_base(crossLen=830))
    assert e["crossMax"] == 780 and e["state"]["crossLen"] == 780
    assert build_drawing_model(e["state"])["cross"]["drawLength"] == 780
    assert any(i["field"] == "crossLen" for i in e["issues"])
    e = effective_config(_base(crossLen=500))
    assert e["state"]["crossLen"] == 500 and e["issues"] == []
    assert effective_config(_base(crossLen=780, crossLenAuto=True))["state"]["crossLen"] == 780
    e = effective_config(_base(width=200, crossLen=780, crossLenAuto=True))
    assert e["crossMax"] == 120 and e["state"]["crossLen"] == 120
    e = effective_config(_base(width=200, crossLen=780, crossLenAuto=False))
    assert e["state"]["crossLen"] == e["crossMax"] and any(i["field"] == "crossLen" for i in e["issues"])
    e = effective_config(_base(crossLen=500))
    assert close(e["crossPitch"], 239.5833, 3) and close(e["crossPitch"] * 48, 11500)
    assert effective_config(_base(crossPos=[]))["crossPitch"] == 0
    assert effective_config(_base(length=0))["crossPitch"] == 0
    e = effective_config(_base(crossLen=9999))
    m = build_drawing_model(e["state"])
    assert m["cross"]["drawLength"] == e["state"]["crossLen"] and m["cross"]["maxLength"] == e["crossMax"]
    assert effective_config(st(width=800, length=3000, crossOn=True))["crossMax"] == 800
    assert effective_config(st(width=800, length=3000, crossOn=True, gofroOn=True, gofroQty=2))["crossMax"] == 670


def test_effective_guides() -> None:
    bad = st(
        width=200,
        length=3000,
        guideOn=True,
        guideName=GUIDE,
        guideBottomOn=True,
        guideBottomQty=3,
        guideBottomInset=120,
    )
    e = effective_config(bad)
    assert e["blocked"] and any(
        i["field"] == "guideBottomInset" and i["level"] == "error" and i["tab"] == "guide" for i in e["issues"]
    )
    assert len(build_drawing_model(e["state"])["guide"]["bottom"]["xs"]) == 3
    assert not effective_config({**bad, "guideBottomInset": 25})["blocked"]
    assert effective_config({**bad, "guideBottomInset": 2})["blocked"]
    assert effective_config(st(width=400, length=3000, guideOn=True, guideBottomOn=False, guideTopOn=False))["blocked"]
    gs = st(
        width=800,
        length=3000,
        gofroOn=True,
        gofroQty=2,
        guideOn=True,
        guideName=GUIDE,
        guideBottomOn=False,
        guideTopOn=True,
        guideTopQty=2,
        guideTopInset=25,
    )
    e = effective_config(gs)
    assert any(i["field"] == "guideTopInset" and "gofrobort" in i["message"] for i in e["issues"]) and not e["blocked"]
    assert not any("gofrobort" in i["message"] for i in effective_config({**gs, "guideTopInset": 120})["issues"])
    e = effective_config({**gs, "guideTopOn": False, "guideBottomOn": True, "guideBottomQty": 2})
    assert not any("gofrobort" in i["message"] for i in e["issues"])
    assert any(
        i["field"] == "guideTopInset" for i in effective_config(_base(crossOn=False, guideTopPos=[100, 105]))["issues"]
    )
    e = effective_config(_base(crossOn=False, guideTopInset=9999, guideTopPos=[150, 700]))
    assert not any(i["tab"] == "guide" for i in e["issues"])


def test_joint_and_locks() -> None:
    c = cat_mod.catalog()
    s = initial_state()["settings"]
    j = next(b for b in c["belts"] if b["name"] == initial_state()["beltName"])["joint"]
    assert joint_mm(j, True, "meter", "oddiy", s) == 0 and joint_mm(j, True, "lock", "oddiy", s) == 0
    assert joint_mm(j, True, "weld", "oddiy", s) == j and joint_mm(j, True, "install", "oddiy", s) == j
    assert joint_mm(j, False, "weld", "oddiy", s) == 0
    assert joint_case_of("weld", "zinali") == "weldZinali" and joint_case_of("weld", "60") == "weld60"
    s2 = {**s, "jointFactor": {**s["jointFactor"], "weldZinali": 1.5}}
    assert joint_mm(110, True, "weld", "zinali", s2) == 165 and joint_mm(110, True, "weld", "oddiy", s2) == 110
    m = build_drawing_model(st(width=400, length=3000, lockOn=True, joinMethod="meter"))
    assert m["belt"]["joint"] == 0
    m = build_drawing_model(st(width=400, length=3000, lockOn=True, joinMethod="weld"))
    assert m["belt"]["joint"] == j
    opts = lock_options_of(c["locks"])
    assert not any(lk["perPiece"] for lk in opts) and not any("Инструмент" in lk["name"] for lk in opts)
    assert tool_options_of(c["locks"])
    init = initial_state()
    assert not next(lk for lk in c["locks"] if lk["name"] == init["lockName"])["perPiece"] and not init["lockToolOn"]
    mr = {"name": "MR01-G-1000 (MINI BELT 1,5 - 3,2 MM", "note": None}
    assert lock_thickness_range(mr) == {"min": 1.5, "max": 3.2}
    assert lock_fits(mr, 2.4) is True and lock_fits(mr, 4) is False and lock_fits(mr, None) is None
    assert lock_fits({"name": "MINI BELT", "note": None}, 2.4) is None
    thin = next((b["name"] for b in c["belts"] if b.get("thickness") == 2.4), None)
    if thin:
        e = effective_config(
            st(width=800, length=3000, beltName=thin, lockOn=True, lockName="MR02-G-1000 (MINI BELT 3,2 - 5,5 MM)")
        )
        assert any(i["tab"] == "lock" for i in e["issues"]) and not e["blocked"]
    assert default_lock_for(c["locks"], 2.4) == "MR01-G-1000 (MINI BELT 1,5 - 3,2 MM)"


def test_effective_perf_and_segments() -> None:
    p = st(width=1200, length=11500, perfOn=True, perfDia=30, perfQty=156, perfStagger=True)
    first = effective_config(p)
    lay = perf_layout_for(p)
    assert first["state"]["perfQty"] == lay["count"] != 156 and any(i["tab"] == "perf" for i in first["issues"])
    again = effective_config({**p, "perfQty": first["state"]["perfQty"]})
    assert again["state"]["perfQty"] == first["state"]["perfQty"] and not any(
        i["tab"] == "perf" for i in again["issues"]
    )
    e39 = st(
        width=800,
        length=3000,
        perfOn=True,
        perfDia=20,
        perfGrid=True,
        perfRows=10,
        perfCols=4,
        perfPitchL=200,
        perfPitchW=150,
        perfEdge=100,
        perfStart=50,
        perfStagger=False,
    )
    e = effective_config(e39)
    assert e["state"]["perfQty"] == 40 and not any(i["tab"] == "perf" for i in e["issues"])
    assert any(i["field"] == "perfCols" for i in effective_config({**e39, "perfCols": 10})["issues"])
    assert any(i["field"] == "perfRows" for i in effective_config({**e39, "perfRows": 30})["issues"])
    s = st(
        width=500,
        length=10000,
        crossOn=True,
        crossPos=[5000],
        gofroOn=True,
        gofroQty=2,
        gofroInsetL=195,
        gofroInsetR=195,
        crossWallGap=10,
    )
    e = effective_config({**s, "crossSegs": [[0, 185], [235, 265]]})["state"]
    assert e["crossParts"] == 2 and e["crossLen"] == 107.5
    assert effective_config({**s, "crossSegs": [[100, 220]]})["state"]["crossSegs"] == [[100, 185]]
    e = effective_config({**s, "gofroInsetL": 0, "gofroInsetR": 0, "crossSegs": [[5, 30]]})
    assert e["state"]["crossSegs"] is None and not any(
        i["tab"] == "cross" and i["level"] == "error" for i in e["issues"]
    )


# ------------------------------------------------------------------ revive, havola, loyiha


def test_revive_rules() -> None:
    s = revive({**initial_state(), "width": 400, "length": 10000, "crossOn": True, "crossQty": 1e9})
    m = build_drawing_model(effective_config(s)["state"])
    assert m["cross"]["count"] <= 500 and len(m["cross"]["ys"]) <= 500
    r = revive({"crossOn": "ha", "perfOn": 1, "guideOn": None})
    assert r["crossOn"] is False and r["perfOn"] is False and r["guideOn"] is False
    assert revive({"guideTopPos": [700, 150]})["guideTopPos"] == [150, 700]
    assert revive({"guideTopPos": [1, "x"]})["guideTopPos"] is None
    assert revive({"crossSegs": [[300, 400], [0, 100]]})["crossSegs"] == [[0, 100], [300, 400]]
    r = revive({"perfRows": 0, "snap": 50, "foo": 1, "width": True, "openCat": None})
    assert r["perfRows"] == 1 and r["snap"] == 1 and r["foo"] == 1 and r["width"] == 0 and r["openCat"] is None
    assert revive({"activeTab": "gofro"})["openCat"] == "gofro"
    assert revive({"guidePlace": "top", "guideQty": 3, "guideInset": 40})["guideTopQty"] == 3
    assert revive(None) == initial_state() and revive("x") == initial_state()


def test_share_and_project() -> None:
    s = _base(crossLen=500, projectName="Megaplast · Тошкент")
    assert decode_state(encode_state(s)) == json.loads(js_json(s))
    s = _base(projectName="Шарқ «Йўл» — №5")
    assert decode_state(encode_state(s))["projectName"] == "Шарқ «Йўл» — №5"
    assert decode_state("buzuq!!!") is None and decode_state("") is None
    p = st(
        projectName="Toshkent non zavodi",
        width=860,
        length=11500,
        crossOn=True,
        crossPos=[500, 1500, 2500],
        gofroOn=True,
        gofroHeight=60,
        perfOn=True,
        perfGrid=True,
        perfRows=4,
        perfCols=3,
        perfPitchL=100,
        perfPitchW=80,
        perfStart=50,
    )
    p["settings"]["discount"] = 7
    doc = json.loads(project_json(p, datetime(2026, 10, 8, 10, 0, tzinfo=UTC)))
    assert doc["format"] == "lentacud.project" and doc["version"] == 1
    assert doc["savedAt"] == "2026-10-08T10:00:00.000Z" and doc["name"] == "Toshkent non zavodi"
    back = parse_project(project_json(p))
    assert json.loads(js_json(back)) == json.loads(js_json({**p, "snap": 1}))
    r = parse_project(js_json(p))
    assert r["width"] == 860 and r["crossPos"] == [500, 1500, 2500]
    for t in ("{", "[]", "null", '{"hello":"world"}', '{"format":"lentacud.project","version":1}'):
        assert parse_project(t) is None
    r = parse_project(
        json.dumps(
            {
                "format": "lentacud.project",
                "version": 1,
                "state": {"width": -5, "length": "uzun", "gofroInsetL": 0, "lockQty": 1e9},
            }
        )
    )
    assert r["width"] == 0 and r["length"] == 0 and r["gofroInsetL"] >= 10 and r["lockQty"] <= 5000
    assert project_file_name(p) == "Toshkent_non_zavodi_860x11500.json"
    assert project_file_name(st(projectName="", width=0, length=0)) == "lenta.json"
    assert project_file_name(st(projectName="Лента №3", width=500, length=2000)) == "Лента_3_500x2000.json"


@pytest.mark.parametrize("raw", [None, 5, "x", [], [1, 2], {}, {"width": "800"}])
def test_pipeline_never_crashes(raw: object) -> None:
    from config.apps.conveyor.lenta import price_of

    e = effective_config(revive(raw))
    price_of(e)
    build_drawing_model(e["state"])

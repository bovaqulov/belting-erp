"""Ko'rik (review) regressiyalari: dushman holat/matn veb jarayonni band qilmasin, sirlar chiqmasin.

Har test aniq bir xatoni qaytadan tekshiradi (tuzatishdan oldin: cheksiz tsikl, o'nlab sekund CPU, 500 xato).
Osilib qolish o'rniga yiqilishi uchun — `_deadline` (SIGALRM).
"""

from __future__ import annotations

import asyncio
import json
import math
import signal
import time
import xml.etree.ElementTree as ET
from contextlib import contextmanager
from datetime import date

import pytest

from config.apps.conveyor.lenta import parse
from config.apps.conveyor.lenta.catalog import SECRET_KEYS, public_catalog
from config.apps.conveyor.lenta.catalog import available as catalog_available
from config.apps.conveyor.lenta.drawing_model import (
    ALIGN_LOOP_MAX,
    col_window,
    perf_alignment,
    perf_layout,
    perf_layout_for,
)
from config.apps.conveyor.lenta.effective import effective_config
from config.apps.conveyor.lenta.items import even_positions
from config.apps.conveyor.lenta.model import initial_state, revive, st
from config.apps.conveyor.lenta.parse import (
    MAX_ABS,
    MAX_KEYS,
    MAX_LIST,
    MAX_STR,
    clean_input,
    fallback_parse,
    parse_order,
    pitched,
    public_state,
)
from config.apps.conveyor.lenta.price import price_of
from config.apps.conveyor.lenta.render import (
    MAX_DRAW_CROSS_PARTS,
    MAX_DRAW_GUIDES,
    MAX_DRAW_PERF_COLS,
    NAME_MAX,
    DrawingBlocked,
    pdf_file_name,
    render_drawing,
    to_pdf,
    to_svg,
)
from config.apps.conveyor.lenta.render.perf import perf_width_chain
from config.apps.conveyor.lenta.render.spec import perf_margins

pytestmark = pytest.mark.skipif(not catalog_available(), reason="katalog yo'q (data/secret)")


@contextmanager
def _deadline(sec: int):
    """Shu vaqtdan oshsa — TimeoutError (test osilib qolmaydi)."""

    def _boom(*_a):
        raise TimeoutError(f"{sec} s dan oshdi")

    old = signal.signal(signal.SIGALRM, _boom)
    signal.alarm(sec)
    try:
        yield
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old)


def _api_state(raw: dict) -> dict:
    """web/lenta_api kabi kirish: revive(clean_input(raw))."""
    return revive(clean_input(raw))


# ------------------------------------------------------------------ cheksiz / juda uzun tsikllar
@pytest.mark.parametrize("size", [1e300, 2.0**60, float(2**53 + 2)])
def test_perf_layout_huge_size_terminates(size: float) -> None:
    # avval: `hi = mid - 1` 2^53 dan katta sonda o'zgarmaydi — binar qidiruv hech qachon tugamasdi
    with _deadline(5):
        perf_layout(size, size, 3000, 400, True)
        effective_config(st(width=1e6, length=size, perfOn=True, perfDia=3000, perfQty=400, perfEdge=20000))


def _align_ref(s: dict) -> tuple[float, float]:
    """Asl (tuzatishgacha) tsikl — faqat kichik qadamlar sonida ishlatiladi."""
    from config.apps.conveyor.lenta.drawing_model import perf_align_info

    info = perf_align_info(s)
    n = max(1, min(info["maxPerGap"], math.floor(s["perfPerGap"])))
    pitch_l = info["pitch"] / n
    r = s["perfDia"] / 2
    start = s["crossPos"][0] + pitch_l / 2
    while start - pitch_l - r >= 0:
        start -= pitch_l
    return start, max(0, math.floor((s["length"] - r - start) / pitch_l) + 1)


@pytest.mark.parametrize("first", [450.0, 30_000.0, 4_000_000.0])
def test_perf_alignment_matches_plain_loop(first: float) -> None:
    # 4 000 000 / 300 > ALIGN_LOOP_MAX emas, lekin (first/pitch_l) qadamlar — ikkala yo'l ham bir xil natija berishi shart
    s = st(
        width=800,
        length=first + 5000,
        crossOn=True,
        crossPos=[first, first + 300, first + 600],
        perfOn=True,
        perfGrid=True,
        perfAlign=True,
        perfDia=5,
        perfCols=3,
        perfPitchW=50,
        perfPerGap=3,
    )
    al = perf_alignment(s)
    start, rows = _align_ref(s)
    assert al and al["rows"] == rows and al["start"] == pytest.approx(start, abs=1e-6)
    assert 0 <= al["start"] - s["perfDia"] / 2 < al["pitchL"]  # birinchi qator lenta boshiga sig'adigan eng yaqin joyda


def test_perf_alignment_far_first_cleat_is_fast() -> None:
    # avval: birinchi profil 900 km da, qadam ~100 mm -> ~10^10 marta `start -= pitch_l`
    s = st(
        width=800,
        length=1e12,
        crossOn=True,
        crossPos=[9e11, 9e11 + 300, 9e11 + 600],
        perfOn=True,
        perfGrid=True,
        perfAlign=True,
        perfDia=5,
        perfCols=3,
        perfPitchW=50,
        perfPerGap=3,
    )
    assert ALIGN_LOOP_MAX < 9e11 / 100
    with _deadline(5):
        al = perf_alignment(s)
        eff = effective_config(s)
    assert al and 0 <= al["start"] - 2.5 < al["pitchL"] + 1e-3
    assert eff["state"]["perfQty"] > 0


def _grid(width: float, cols: float, groups: float, pitch_w: float, gp: float, edge: float, lines=()) -> dict:
    s = st(
        width=width,
        length=5000,
        perfOn=True,
        perfGrid=True,
        perfDia=4,
        perfCols=cols,
        perfRows=10,
        perfPitchW=pitch_w,
        perfPitchL=20,
        perfGroups=groups,
        perfGroupPitch=gp,
        perfEdge=edge,
        perfLines=list(lines),
    )
    L = perf_layout_for(s)
    assert L
    return L


def _margins_ref(L: dict, bw: float) -> tuple[float, float]:
    us = [g + L["edge"] + c * L["pitch"] for g in (L.get("groups") or [0]) for c in range(int(L["cols"]))]
    us += list(L.get("lines") or [])
    us = [u for u in us if 0 <= u <= bw]
    return (min(us), bw - max(us)) if us else (0.0, 0.0)


@pytest.mark.parametrize(
    ("width", "cols", "groups", "pitch_w", "gp", "edge", "lines"),
    [
        (800, 5, 1, 50, 0, 100, ()),  # oddiy to'r
        (800, 40, 3, 30, 250, 10, (5.0, 790.0)),  # guruhlar lentadan chiqib ketadi + yakka qatorlar
        (300, 200, 20, 7, 11, 2, ()),  # ko'pi lentadan tashqarida
        (800, 3, 2, 50, 300, 900, ()),  # hammasi lentadan tashqarida
    ],
)
def test_col_window_gives_same_result_as_full_scan(width, cols, groups, pitch_w, gp, edge, lines) -> None:
    L = _grid(width, cols, groups, pitch_w, gp, edge, lines)
    assert perf_margins(L, width) == _margins_ref(L, width)
    stops, labels = perf_width_chain(L, width)
    in_belt = sorted(
        {
            round(g + L["edge"] + c * L["pitch"], 6)
            for g in L["groups"]
            for c in range(int(L["cols"]))
            if 0 <= g + L["edge"] + c * L["pitch"] <= width
        }
    )
    assert stops[0] == 0 and stops[-1] == width and len(stops) == len(labels) + 1
    assert set(round(u, 6) for u in stops[1:-1]) <= set(in_belt) | {round(u, 6) for u in L["lines"]}
    for g in L["groups"]:  # oyna hech bir sig'adigan ustunni tashlab ketmaydi
        win = set(col_window(g, L["edge"], L["cols"], L["pitch"], 0, width))
        assert {c for c in range(int(L["cols"])) if 0 <= g + L["edge"] + c * L["pitch"] <= width} <= win


def test_perf_margins_and_chain_fast_on_5000x5000_grid() -> None:
    # avval: 5000 guruh × 5000 ustun = 25 mln nuqta (dict) — o'nlab sekund va gigabaytlab xotira
    L = _grid(400, 5000, 5000, 400, 2, 0)
    with _deadline(10):
        # u = 2i − 1 004 599 + 400c — toq sonlar: lentadagi eng chetki teshiklar 1 va 399 mm da
        assert perf_margins(L, 400) == (1.0, 1.0)
        stops, _ = perf_width_chain(L, 400)
    assert len(stops) < 20_000


# ------------------------------------------------------------------ chizma: element soni chegarasi
def _render(raw: dict):
    t = time.monotonic()
    d = render_drawing(_api_state(raw), "uz", date(2026, 11, 10))
    size = sum(len(to_svg(s)) for s in d.sheets)
    return d, size, time.monotonic() - t


@pytest.mark.parametrize(
    ("raw", "tab"),
    [
        (
            {
                "width": 3000,
                "length": 12000,
                "guideOn": True,
                "guideBottomOn": True,
                "guideBottomQty": 5000,
                "guideTopOn": True,
                "guideTopQty": 5000,
            },
            "guide",
        ),
        (
            {
                "width": 1e6,
                "length": 400,
                "perfOn": True,
                "perfGrid": True,
                "perfDia": 30,
                "perfCols": 5000,
                "perfPitchW": 150,
                "perfGroups": 5000,
                "perfGroupPitch": 2,
                "perfRows": 3,
            },
            "perf",
        ),
        (
            {
                "width": 1e6,
                "length": 200000,
                "crossOn": True,
                "crossPos": even_positions(200000, 500),
                "crossSegs": [[100 + i * 100, 180 + i * 100] for i in range(2000)],
            },
            "cross",
        ),
    ],
)
def test_too_many_elements_blocked_not_drawn(raw: dict, tab: str) -> None:
    # avval: 8–60+ s CPU va megabaytlab SVG (yoki umuman tugamasdi); endi — xabar varag'i va bloklovchi xato
    with _deadline(20):
        d, size, _dt = _render(raw)
    assert d.blocked and [s.key for s in d.sheets] == ["message"] and d.message
    assert d.issues[-1]["level"] == "error" and d.issues[-1]["tab"] == tab and d.issues[-1]["ru"]
    assert size < 20_000
    with pytest.raises(DrawingBlocked):
        to_pdf(d.sheets)
    msg_ru = render_drawing(_api_state(raw), "ru").message
    assert msg_ru and msg_ru != d.message


def test_complex_but_allowed_drawing_is_bounded() -> None:
    """Chegaradagi eng og'ir ruxsat etilgan holat: vaqt va hajm kichik (o'lchangan: < 1 s, SVG < 0,5 MB)."""
    segs = [[100 + i * 100, 180 + i * 100] for i in range(MAX_DRAW_CROSS_PARTS)]
    raw = {
        "width": 3000,
        "length": 200000,
        "lockOn": True,
        "gofroOn": True,
        "guideOn": True,
        "guideBottomOn": True,
        "guideBottomQty": MAX_DRAW_GUIDES // 2,
        "guideBottomInset": 5,
        "guideTopOn": True,
        "guideTopQty": MAX_DRAW_GUIDES // 2,
        "guideTopInset": 5,
        "crossOn": True,
        "crossPos": even_positions(200000, 500),
        "crossSegs": segs,
        "perfOn": True,
        "perfGrid": True,
        "perfDia": 1,
        "perfCols": MAX_DRAW_PERF_COLS - 60,
        "perfRows": 5000,
        "perfPitchW": 1.5,
        "perfPitchL": 1.2,
        "perfEdge": 20,
        "perfStart": 5,
        "perfLines": [2935 + i for i in range(50)],
        "projectName": "W" * 5000,
        "customerPhone": "9" * 5000,
        "customerAddress": "M" * 5000,
        "author": "Q" * 5000,
    }
    with _deadline(30):
        d, size, _dt = _render(raw)
        pdf = to_pdf(d.sheets, allow_blocked=True)
    assert [s.key for s in d.sheets] == ["prod"]
    assert size < 2_000_000 and len(pdf) < 2_000_000


def test_ordinary_drawing_not_gated() -> None:
    d, _size, _dt = _render(
        {
            "width": 800,
            "length": 12000,
            "guideOn": True,
            "guideBottomQty": 2,
            "crossOn": True,
            "crossPos": even_positions(12000, 40),
            "perfOn": True,
            "perfDia": 12,
            "perfQty": 60,
        }
    )
    assert [s.key for s in d.sheets] == ["prod"] and not d.blocked


# ------------------------------------------------------------------ clean_input chegaralari
def test_clean_input_bounds_everything() -> None:
    deep: list = []
    for _ in range(3000):
        deep = [deep]
    raw = {
        "width": 1e300,
        "length": 10**400,
        "perfDia": float("nan"),
        "crossGap": float("inf"),
        "lockQty": -MAX_ABS * 10,
        "installPrice": MAX_ABS,
        "gofroHeight": 60,
        "projectName": "x" * 100_000,
        "author": "a\ud800b",
        "crossPos": [1, 2, float("inf"), "3", None, [9] * 9, {"a": 1}] + [5.0] * 10_000,
        "crossSegs": [[10, 20], [1e300, 5], [1, 2, 3, 4, 5], "z"],
        "width2": [1, 2, 3],
        "junk": {"a": {"b": 1}},
        "deep": deep,
        7: "int kalit",
        "k" * 65: 1,
        "settings": {"rate": 1},
        "lockOn": True,
        "guideBottomAt": None,
    }
    c = clean_input(raw)
    assert set(c) == {
        "installPrice",
        "gofroHeight",
        "projectName",
        "author",
        "crossPos",
        "crossSegs",
        "lockOn",
        "guideBottomAt",
    }
    assert len(c["projectName"]) == MAX_STR and c["author"] == "ab"
    assert len(c["crossPos"]) == MAX_LIST and c["crossPos"][:7] == [1, 2, None, "3", None, None, None]
    assert c["crossSegs"] == [[10, 20], [None, 5], None, "z"]
    json.dumps(c, allow_nan=False)
    s = revive(c)  # avval: `deep` -> copy.deepcopy RecursionError (500)
    assert s["width"] == 0 and s["length"] == 0 and s["installPrice"] == MAX_ABS and s["crossSegs"] is None
    assert clean_input([1, 2]) == {} and clean_input("x") == {} and clean_input(None) == {}


def test_clean_input_caps_number_of_keys_and_state_size() -> None:
    raw = {f"k{i}": "v" * 500 for i in range(50_000)}
    raw.update(
        crossPos=[float(i) for i in range(50_000)],
        crossSegs=[[i, i + 0.5] for i in range(50_000)],
        guideTopPos=[float(i) for i in range(50_000)],
        perfLines=[float(i) for i in range(50_000)],
    )
    c = clean_input(raw)
    assert len(c) <= MAX_KEYS
    body = json.dumps(public_state(revive({**c, "width": 99_000, "length": 99_000})), ensure_ascii=False)
    assert len(body.encode()) < 300_000  # web/lenta_api.MAX_STATE_BYTES


def test_clean_input_keeps_valid_state_untouched() -> None:
    s = public_state(
        st(
            width=800,
            length=12000,
            crossOn=True,
            crossPos=even_positions(12000, 40),
            perfLines=[10.0, 20.5],
            guideBottomPos=[30.0, 770.0],
            crossSegs=[[10.0, 300.0], [400.0, 700.0]],
            projectName="Non zavodi",
        )
    )
    assert clean_input(s) == s
    assert public_state(revive(clean_input(s))) == public_state(revive(s))


def test_absurd_size_gives_finite_price() -> None:
    # avval: eni 1e300 -> narx inf -> jami NaN -> lenta_api `round(NaN)` ValueError (500)
    eff = effective_config(_api_state({"width": 1e300, "length": 400, "gofroOn": True}))
    assert eff["state"]["width"] == 0
    eff = effective_config(
        _api_state(
            {
                "width": MAX_ABS,
                "length": MAX_ABS,
                "gofroOn": True,
                "guideOn": True,
                "crossOn": True,
                "lockOn": True,
                "perfOn": True,
            }
        )
    )
    t = price_of(eff)["totals"]
    assert all(math.isfinite(t[k]) for k in ("netAfterDiscount", "vatAmount", "final"))


# ------------------------------------------------------------------ sirlar
def _keys(o, acc: set) -> set:
    if isinstance(o, dict):
        for k, v in o.items():
            acc.add(k)
            _keys(v, acc)
    elif isinstance(o, list):
        for v in o:
            _keys(v, acc)
    return acc


def test_client_settings_never_change_price_or_leak() -> None:
    base = {
        "width": 800,
        "length": 12000,
        "lockOn": True,
        "joinMethod": "weld",
        "guideOn": True,
        "crossOn": True,
        "crossPos": even_positions(12000, 20),
        "gofroOn": True,
        "perfOn": True,
    }
    hostile = {
        **base,
        "settings": {
            "rate": 1,
            "vat": 0,
            "discount": 100,
            "serviceGuide": 0,
            "serviceCross": 0,
            "serviceGofro": 0,
            "beltRoundPlus1000": False,
            "jointFactor": {k: 0 for k in ("lock", "meter", "install", "weldZinali", "weldOddiy", "weld60")},
        },
        "rate": 1,
        "discount": 100,
        "vat": 0,
        "markup": 0,
        "base": 0,
        "zapas": 0,
    }
    assert revive(hostile)["settings"]["discount"] == 100  # revive o'zi qabul qiladi — himoya clean_input'da
    want = price_of(effective_config(_api_state(base)))
    got_eff = effective_config(_api_state(hostile))
    got = price_of(got_eff)
    assert got["totals"] == want["totals"] and got["totals"]["final"] > 0
    assert {k: v["total"] for k, v in got["lines"].items()} == {k: v["total"] for k, v in want["lines"].items()}
    assert (
        got_eff["state"]["settings"] == initial_state()["settings"]
        and got_eff["joint"] == effective_config(_api_state(base))["joint"]
    )
    out = public_state(_api_state(hostile))
    assert "settings" not in out
    assert "settings" not in json.dumps(public_state(_api_state(hostile)))
    # chizma ham o'zgarmaydi (ulash zapasi jointFactor'dan olinadi): faqat `settings` qo'shilgan holat = asl holat
    only = {**base, "settings": hostile["settings"]}
    assert [to_svg(s) for s in render_drawing(_api_state(only), "uz", date(2026, 11, 10)).sheets] == [
        to_svg(s) for s in render_drawing(_api_state(base), "uz", date(2026, 11, 10)).sheets
    ]


def test_public_catalog_and_parse_result_have_no_secret_keys() -> None:
    assert not (_keys(public_catalog(), set()) & SECRET_KEYS)
    r = asyncio.run(
        parse_order("U13 ko'k 800x12000, MR01 qulf", {"settings": {"discount": 100}, "width": 500}, use_llm=False)
    )
    assert "settings" not in r["state"] and not (_keys(r, set()) & (SECRET_KEYS | {"settings"}))


# ------------------------------------------------------------------ matn tahlili (parse)
def test_num_rejects_non_finite_and_absurd() -> None:
    for v in ("nan", "inf", "-inf", "1e999", "Infinity", float("inf"), float("nan"), 10**400, 1e13, True, None, [], {}):
        assert parse._num(v) is None, v
    assert parse._num("12,5") == 12.5 and parse._num(" 3 000 ") == 3000 and parse._num(7) == 7.0


def test_pitched_tiny_pitch_does_not_overflow() -> None:
    xs = pitched(1e12, 1e-300, 0)  # avval: int(inf) -> OverflowError (500)
    assert len(xs) == 500


@pytest.mark.parametrize(
    "reply",
    [
        '{"fields": {"width": "inf", "length": 1e12, "crossOn": true, "gofroHeight": "1e999", "guideBottomFromRight": "nan",'
        ' "perfDia": [1], "lockOn": "ha", "projectName": {"a": 1}}, "cross": {"pitch": 1e-300, "first": "inf", "count": "nan"},'
        ' "notes": "matn", "unknown": 5}',
        '{"fields": {"length": 1000000000000, "crossOn": true}, "cross": {"pitch": 1e-300}}',
        '{"fields": [], "cross": [], "notes": [{"a": 1}, null, 5], "unknown": [[1]]}',
        '{"fields": {"width": 1e999}}',
        "[]",
        "",
        "{",
    ],
)
def test_parse_order_survives_hostile_llm_output(reply: str, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake(_prompt: str) -> str:
        return reply

    monkeypatch.setattr(parse, "ask_llm", fake)
    r = asyncio.run(parse_order("U13 ko'k 800x12000 har 300 mm da L50 profil", {"width": 800, "length": 12000}))
    json.dumps(r, allow_nan=False)
    assert "settings" not in r["state"] and len(r["state"]["crossPos"]) <= 500


def test_parse_order_client_state_with_text_from_right_does_not_crash() -> None:
    # avval: mijoz holatidagi noma'lum kalit (matn) merge() da float("12,5") -> ValueError (500)
    r = asyncio.run(
        parse_order(
            "eni 800 mm",
            {"width": 800, "length": 5000, "guideBottomFromRight": "12,5", "guideTopFromRight": "chapdan"},
            use_llm=False,
        )
    )
    assert r["state"]["guideBottomAt"] == 787.5 and r["state"]["guideTopAt"] is None
    assert "guideBottomFromRight" not in r["state"] and "guideTopFromRight" not in r["state"]


def test_prompt_size_is_bounded() -> None:
    seen: list[str] = []

    async def fake(prompt: str) -> str:
        seen.append(prompt)
        return "{}"

    orig = parse.ask_llm
    parse.ask_llm = fake
    try:
        big = {k: "я" * 50_000 for k in ("projectName", "customerPhone", "customerAddress", "author", "beltName")}
        asyncio.run(parse_order("x" * 1_000_000, {**big, "width": 800}))
        plain: list[str] = []
        seen2 = seen[:]
        seen.clear()
        asyncio.run(parse_order("x", None))
        plain = seen[:]
    finally:
        parse.ask_llm = orig
    assert len(seen2) == 1 and len(plain) == 1
    assert len(seen2[0]) - len(plain[0]) < 4000 + 4 * MAX_STR + 3000  # matn 4000 + 4 ta matn maydoni + joriy holat


@pytest.mark.parametrize(
    "text",
    [
        "0" * 4000,  # avval ~10 s
        " 000" * 1000,
        "800x" + "1" * 3000,
        "a" + " " * 3990 + "qulf",  # avval ~28 s
        "MR01chetdan" * 360,  # avval > 8 s
        "K1 " * 1300,
        "бортzamok" * 440,
    ],
)
def test_fallback_parse_is_fast_on_hostile_text(text: str) -> None:
    with _deadline(6):
        t = time.monotonic()
        fallback_parse(text[:4000])
        assert time.monotonic() - t < 5


def test_fallback_parse_numbers_still_read_the_same() -> None:
    p, h, _n, _u = fallback_parse(
        "U13 ko'k 1,3 mm, 800x12000 mm, har 300 mm da L50 profil, ikki chetiga 50 mm gofra, "
        "Ø12 teshik 60 ta, MR01 qulf 2 ta"
    )
    assert (p["width"], p["length"], p["gofroHeight"], p["gofroQty"], p["perfDia"], p["perfQty"]) == (
        800,
        12000,
        50,
        2,
        12,
        60,
    )
    assert h["crossPitch"] == 300 and p["lockOn"] and p["crossOn"]
    p, _h, _n, _u = fallback_parse("eni 1 200 mm, uzunligi 12 500 mm,   bitta   tomoniga 60 mm bort")
    assert (p["width"], p["length"], p["gofroHeight"], p["gofroQty"]) == (1200, 12500, 60, 1)
    p, _h, _n, _u = fallback_parse("600 × 5,5 m lenta")
    assert (p["width"], p["length"]) == (600, 5500)
    p, _h, _n, _u = fallback_parse("eni 12345678901234567890 mm")  # 15 xonadan uzun — son emas
    assert "width" not in p


# ------------------------------------------------------------------ fayl nomi va SVG
def test_pdf_file_name_is_short_and_safe() -> None:
    nm = pdf_file_name({"projectName": "../../etc/passwd " + "Ж" * 300 + "a" * 5000, "width": 800, "length": 12000})
    assert nm.endswith("_800x12000.pdf") and len(nm) <= NAME_MAX + len("_800x12000.pdf")
    assert "/" not in nm and ".." not in nm and nm.isascii()
    assert pdf_file_name({"projectName": "Toshkent non", "width": 860, "length": 11500}) == "Toshkent_non_860x11500.pdf"
    assert pdf_file_name({}) == "chizma_0x0.pdf"


def test_svg_is_well_formed_with_control_chars_and_markup_in_names() -> None:
    bad = "a\x00b\x0b\x1f￾<script>alert(1)</script>&\"'"
    d = render_drawing(
        _api_state({"width": 800, "length": 12000, "projectName": bad, "customerPhone": bad, "author": bad}),
        "uz",
        date(2026, 11, 10),
    )
    for s in d.sheets:
        svg = to_svg(s)
        ET.fromstring(svg.encode())  # o'zimiz yasagan SVG (tashqi entity yo'q); avval: "not well-formed"
        assert "<script" not in svg and "&lt;script&gt;" in svg
    assert to_pdf(d.sheets)[:5] == b"%PDF-"

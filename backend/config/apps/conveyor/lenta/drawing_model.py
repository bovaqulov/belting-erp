"""Chizma modeli (mm) — `lib/drawing.ts` nusxasi.

Yo'naltiruvchi joylari, ko'ndalang profil bo'laklari, gofra bandlari, perforatsiya
joylashuvi va teshik nuqtalari, bukilgan lenta geometriyasi. Narx/chizma/jadval
HAMMASI shu funksiyalardan oladi — bitta manba.
"""

from __future__ import annotations

import math
import re
from typing import Any

from ._js import jceil, jdiv, jfloor, jmax, jmin, jor, jround, js_str
from .calc import joint_mm
from .catalog import by_name, catalog
from .curve import curve_geom
from .items import uniform_pitch
from .specs import (
    CROSS_CLEARANCE_PER_SIDE,
    CROSS_TO_GUIDE_GAP,
    CROSS_TO_SIDEWALL_GAP,
    CROSS_TO_SIDEWALL_MIN,
    GOFRO_MIN_INSET,
    GUIDE_SPECS,
    SIDEWALL_SPEC,
    cleat_spec_for,
)

State = dict[str, Any]
Seg = list[float]

PERF_CLEAT_CLEARANCE = 5
ALIGN_LOOP_MAX = 100_000  # perf_alignment: shundan ko'p qadam tsiklda emas, bir yo'la


def _r01(v: float) -> float:
    return jround(v * 10) / 10


def _guide_b(name: Any) -> float:
    spec = GUIDE_SPECS.get(name) if isinstance(name, str) else None
    return spec["B"] if spec else 0


# ------------------------------------------------------------------ gofra


def gofro_bands(s: State) -> list[dict[str, Any]]:
    """Gofra bandlari: qirradan from..to, mm (chetdan kamida 10, lentadan chiqmaydi)."""
    if not s["gofroOn"] or s["width"] <= 0:
        return []
    band = SIDEWALL_SPEC["baseWidth"]
    sides = [s["gofroSide"]] if s["gofroQty"] == 1 else ["left", "right"]
    max_in = jmax(0, s["width"] / 2 - band)
    out = []
    for side in sides:
        inset = jmin(max_in, jmax(GOFRO_MIN_INSET, s["gofroInsetL"] if side == "left" else s["gofroInsetR"]))
        if side == "left":
            out.append({"side": side, "from": inset, "to": inset + band})
        else:
            out.append({"side": side, "from": s["width"] - inset - band, "to": s["width"] - inset})
    return out


def perf_sides_for(s: State) -> dict[str, float]:
    """Har tomonda qirradan gofra band oxirigacha egallangan en, mm."""
    left = 0.0
    right = 0.0
    for b in gofro_bands(s):
        if b["side"] == "left":
            left = b["to"]
        else:
            right = s["width"] - b["from"]
    return {"left": left, "right": right}


def gofro_cross_edge(s: State) -> float:
    """Ko'ndalang profil uchun gofra tomonidan qoldiriladigan joy, mm."""
    edge = 0.0
    wg = s.get("crossWallGap")
    gap = jmax(CROSS_TO_SIDEWALL_MIN, wg if wg is not None else CROSS_TO_SIDEWALL_GAP)
    for b in gofro_bands(s):
        wall_inner = (
            b["from"] + SIDEWALL_SPEC["width"] if b["side"] == "left" else s["width"] - b["to"] + SIDEWALL_SPEC["width"]
        )
        edge = jmax(edge, wall_inner + gap)
    return edge


# ------------------------------------------------------------------ perforatsiya


def _blocked_of(sides: Any) -> dict[str, float]:
    if isinstance(sides, list):
        return {
            "left": SIDEWALL_SPEC["baseWidth"] if "left" in sides else 0,
            "right": SIDEWALL_SPEC["baseWidth"] if "right" in sides else 0,
        }
    return sides


def _perf_min_edge(dia: float, blocked: float) -> float:
    return jmax(25, dia * 1.5, blocked + dia / 2 if blocked > 0 else 0)


def _perf_edges(dia: float, sides: Any, manual: float = 0) -> tuple[float, float]:
    if manual > 0:
        return manual, manual
    b = _blocked_of(sides)
    return _perf_min_edge(dia, b["left"]), _perf_min_edge(dia, b["right"])


def _perf_cols_at(width: float, dia: float, pitch: float, sides: Any, manual: float = 0) -> float:
    min_l, min_r = _perf_edges(dia, sides, manual)
    span = width - min_l - min_r
    return 0 if span < 0 else jfloor(jdiv(span, pitch)) + 1


def _perf_count_at(
    width: float, length: float, dia: float, pitch: float, stagger: bool, sides: Any, manual: float = 0
) -> float:
    cols = _perf_cols_at(width, dia, pitch, sides, manual)
    if cols < 1:
        return 0
    rows = jmax(1, jfloor(jdiv(length, pitch) + 1e-9))
    if not stagger or cols < 2:
        return rows * cols
    full = jceil(rows / 2)
    return full * cols + (rows - full) * (cols - 1)


def perf_count_for_pitch(
    width: float, length: float, dia: float, pitch: float, stagger: bool, sides: Any = None, manual: float = 0
) -> float:
    """Berilgan qadamda nechta teshik chiqadi."""
    sides = [] if sides is None else sides
    if width <= 0 or length <= 0 or dia <= 0 or pitch < dia:
        return 0
    return _perf_count_at(width, length, dia, pitch, stagger, sides, manual)


def col_window(g: float, u0: float, n: float, pitch: float, lo_u: float, hi_u: float) -> range:
    """`g + u0 + c * pitch` qiymati [lo_u, hi_u] ga tushishi MUMKIN bo'lgan ustunlar (±1 zaxira bilan).

    Chaqiruvchi aniq shartni o'zi tekshiradi — bu faqat sig'maydigan ustunlarni aylanmaslik uchun
    (5000 guruh × 5000 ustun = 25 mln nuqta o'rniga faqat lentaga tushadiganlari).
    """
    n_i = int(jceil(n)) if n > 0 and math.isfinite(n) else 0
    if n_i <= 0:
        return range(0)
    if pitch > 0 and math.isfinite(pitch) and math.isfinite(g + u0):
        lo = jmax(0, jfloor((lo_u - g - u0) / pitch) - 1)
        hi = jmin(n_i - 1, jceil((hi_u - g - u0) / pitch) + 1)
        if not (lo <= hi):
            return range(0)
        return range(int(lo), int(hi) + 1)
    return range(n_i)


def _row_us(groups: list[float], u0: float, n: float, pitch: float, r: float, width: float, limit: int) -> list[float]:
    """Bitta qatordagi lentaga sig'adigan teshiklar `u` lari (tartib saqlanadi, `limit` gacha).

    JS'dagi `for c < n` tsikli bilan AYNAN bir xil natija; faqat sig'maydigan ustunlar
    oralig'i hisoblab o'tkazib yuboriladi (ulkan to'rda Python sekin bo'lmasin).
    """
    out: list[float] = []
    n_i = int(jceil(n)) if n > 0 else 0
    for g in groups:
        if len(out) >= limit:
            break
        if pitch > 0 and math.isfinite(pitch):
            lo = int(jmax(0, jfloor((-r - g - u0) / pitch) - 1))
            hi = int(jmin(n_i - 1, jceil((width - r - g - u0) / pitch) + 1))
        else:
            lo, hi = 0, n_i - 1
        for c in range(lo, hi + 1):
            if len(out) >= limit:
                break
            u = g + u0 + c * pitch
            if u - r < 0 or u + r > width:
                continue
            out.append(u)
    return out


def perf_hole_points(L: dict[str, Any], length: float, width: float, max_: int = 3000) -> list[dict[str, float]]:
    """Teshik markazlari (u — en bo'ylab, z — uzunlik bo'ylab), `max_` gacha."""
    out: list[dict[str, float]] = []
    r = L["dia"] / 2
    groups = L.get("groups") or [0]
    lines = L.get("lines") or []
    # u qator raqamiga bog'liq emas — juft/toq qator uchun bir marta hisoblanadi
    even_us = _row_us(groups, L["edge"], L["cols"], L["pitch"], r, width, max_)
    odd_us = (
        _row_us(groups, L["edgeOffset"], jmax(1, L["cols"] - 1), L["pitch"], r, width, max_)
        if L["stagger"]
        else even_us
    )
    if not even_us and not odd_us and not lines:
        return out
    row = 0
    while row < L["rows"] and len(out) < max_:
        z = L["start"] + row * L["pitchL"]
        if z >= length:
            break
        us = odd_us if (L["stagger"] and row % 2 == 1) else even_us
        for u in [*us, *lines][: max_ - len(out)]:
            out.append({"u": u, "z": z})
        row += 1
    return out


def perf_usable_width(width: float, dia: float, sides: Any, manual: float = 0) -> float:
    """Teshik qo'yish mumkin bo'lgan en (gofra bandlarisiz)."""
    min_l, min_r = _perf_edges(dia, sides, manual)
    return width - min_l - min_r + dia


def perf_layout(
    width: float, length: float, dia: float, count: float, stagger: bool, sides: Any = None, manual: float = 0
) -> dict[str, Any] | None:
    """Avtomatik joylashuv: soniga eng yaqin butun qadam."""
    sides = [] if sides is None else sides
    if width <= 0 or length <= 0 or dia <= 0 or count <= 0:
        return None
    if manual > 0 and manual - dia / 2 < 0:
        return None
    min_l, min_r = _perf_edges(dia, sides, manual)
    if width - min_l - min_r < 0:
        return None
    min_pitch = jmax(1, jceil(dia * 1.2))
    lo = min_pitch
    hi = jmax(width, length, min_pitch)
    while lo < hi:
        mid = jceil((lo + hi) / 2)
        if not (lo < mid and mid - 1 < hi):
            break  # 2^53 dan katta o'lcham: `mid - 1 == mid` — oraliq toraymaydi, tsikl tugamas edi
        if _perf_count_at(width, length, dia, mid, stagger, sides, manual) >= count:
            lo = mid
        else:
            hi = mid - 1
    near = _perf_count_at(width, length, dia, lo + 1, stagger, sides, manual)
    here = _perf_count_at(width, length, dia, lo, stagger, sides, manual)
    pitch = lo + 1 if abs(near - count) < abs(here - count) else lo
    cols = _perf_cols_at(width, dia, pitch, sides, manual)
    if cols < 1:
        return None
    rows = jmax(1, jfloor(jdiv(length, pitch) + 1e-9))
    usable = width - min_l - min_r
    count = _perf_count_at(width, length, dia, pitch, stagger, sides, manual)
    if manual > 0:
        # DIVERGENCE D1 (09_divergences.md): "chetdan N mm" — IKKALA chetdan. Ustunlar soni
        # avvalgidek (butun qadam bo'yicha), lekin en bo'ylab qadam N..W-N oralig'iga teng
        # yoyiladi; bo'yiga qatorlar ham markazlanadi (boshidan = oxiridan).
        pitch_w = (width - 2 * manual) / (cols - 1) if cols > 1 else pitch
        edge = manual if cols > 1 else width / 2
        start = (length - (rows - 1) * pitch) / 2
    else:
        pitch_w = pitch
        edge = min_l + (usable - (cols - 1) * pitch) / 2
        start = pitch / 2
    bl = _blocked_of(sides)
    return {
        "dia": dia,
        "pitch": pitch_w,
        "pitchL": pitch,
        "start": start,
        "grid": False,
        "stagger": stagger,
        "cols": cols,
        "rows": rows,
        "edge": edge,
        "edgeOffset": edge + pitch_w / 2 if cols > 1 else edge,
        "count": count,
        "usableWidth": usable + dia,
        "blocked": [sd for sd in ("left", "right") if bl[sd] > 0],
        "manualEdge": manual > 0,
        "groups": [0],
        "lines": [],
    }


def _grid_count(rows: float, cols: float, stagger: bool) -> float:
    if not stagger or cols < 2:
        return rows * cols
    return jceil(rows / 2) * cols + jfloor(rows / 2) * (cols - 1)


def perf_layout_for(s: State) -> dict[str, Any] | None:
    """Perforatsiya joylashuvi — BITTA manba: avtomatik yoki qo'lda to'r."""
    if not s["perfGrid"]:
        return perf_layout(
            s["width"], s["length"], s["perfDia"], s["perfQty"], s["perfStagger"], perf_sides_for(s), s["perfEdge"]
        )
    dia = s["perfDia"]
    al = perf_alignment(s) if s["perfAlign"] else None
    p_l0 = jmax(dia, jor(s["perfPitchL"], dia))
    fill_start = s["perfStart"] if s["perfStart"] > 0 else p_l0 / 2
    if al:
        rows = al["rows"]
    elif s["perfFill"]:
        rows = jmax(1, jfloor(jdiv(s["length"] - fill_start - dia / 2, p_l0) + 1e-9) + 1)
    else:
        rows = jfloor(s["perfRows"])
    cols = jfloor(s["perfCols"])
    if s["width"] <= 0 or s["length"] <= 0 or dia <= 0 or rows < 1 or cols < 1:
        return None
    p_w = jmax(dia, s["perfPitchW"]) if cols > 1 else jmax(dia, jor(s["perfPitchW"], dia))
    if al:
        p_l = al["pitchL"]
    elif rows > 1 or s["perfFill"]:
        p_l = p_l0
    else:
        p_l = jmax(dia, jor(s["perfPitchL"], dia))
    groups_raw = s.get("perfGroups")
    n_g = jmax(1, jfloor(groups_raw if groups_raw is not None else 1))
    span = (cols - 1) * p_w
    gp_raw = s.get("perfGroupPitch")
    gp_set = (gp_raw if gp_raw is not None else 0) > 0
    if n_g < 2:
        gp = 0.0
    elif gp_set:
        gp = s["perfGroupPitch"]
    elif s["perfEdge"] > 0:
        gp = span + (s["width"] - 2 * s["perfEdge"] - n_g * span) / (n_g - 1)
    else:
        gp = s["width"] / n_g
    if s["perfEdge"] > 0:
        edge = s["perfEdge"]
    elif n_g > 1 and not gp_set:
        edge = gp / 2 - span / 2
    else:
        edge = (s["width"] - ((n_g - 1) * gp + span)) / 2
    if al:
        start = al["start"]
    elif s["perfFill"]:
        start = fill_start
    elif s["perfStart"] > 0:
        start = s["perfStart"]
    else:
        start = (s["length"] - (rows - 1) * p_l) / 2
    raw_lines = s.get("perfLines") or []
    uniq = list(dict.fromkeys(jround(u * 10) / 10 for u in raw_lines))
    lines = sorted(u for u in uniq if u - dia / 2 >= 0 and u + dia / 2 <= s["width"])
    sides = perf_sides_for(s)
    return {
        "dia": dia,
        "pitch": p_w,
        "pitchL": p_l,
        "start": start,
        "grid": True,
        "stagger": s["perfStagger"],
        "cols": cols,
        "rows": rows,
        "edge": edge,
        "edgeOffset": edge + p_w / 2 if cols > 1 else edge,
        "count": _grid_count(rows, cols, s["perfStagger"]) * n_g + rows * len(lines),
        "usableWidth": (n_g - 1) * gp + span + dia,
        "blocked": [sd for sd in ("left", "right") if sides[sd] > 0],
        "manualEdge": True,
        "groups": [jround(i * gp * 10) / 10 for i in range(int(n_g))],
        "lines": lines,
    }


def perf_align_info(s: State) -> dict[str, float] | None:
    """Ikki profil orasiga nechta qator sig'adi; profillar teng qadamda bo'lmasa None."""
    if not s["crossOn"] or len(s["crossPos"]) < 2 or s["perfDia"] <= 0:
        return None
    P = uniform_pitch(s["crossPos"], s["length"])
    if P is None or P <= 0:
        return None
    spec = cleat_spec_for(s["crossName"])
    B = spec["B"] if spec else 0
    max_per_gap = jmax(0, jfloor(P / (B + s["perfDia"] + 2 * PERF_CLEAT_CLEARANCE)))
    return {"pitch": P, "maxPerGap": max_per_gap}


def perf_alignment(s: State) -> dict[str, float] | None:
    """Qatorlarni ko'ndalang profillar oralig'iga moslash; bo'lmasa None."""
    info = perf_align_info(s)
    if not info or info["maxPerGap"] < 1:
        return None
    N = jmax(1, jmin(info["maxPerGap"], jfloor(s["perfPerGap"])))
    pitch_l = info["pitch"] / N
    r = s["perfDia"] / 2
    start = s["crossPos"][0] + pitch_l / 2
    # uzoqdagi birinchi profil: qadamlar bir yo'la (aks holda uzunlik/qadam marta aylanadi — million+ qadam)
    skip = jfloor((start - r) / pitch_l) - 2
    if skip > ALIGN_LOOP_MAX:
        start -= skip * pitch_l
    while start - pitch_l - r >= 0 and start - pitch_l < start:
        start -= pitch_l
    rows = jmax(0, jfloor((s["length"] - r - start) / pitch_l) + 1)
    return {"pitchL": pitch_l, "start": start, "rows": rows, "perGap": N}


def perf_grid_patch(s: State, changes: dict[str, Any]) -> dict[str, Any]:
    """Avtomatikdan qo'lda to'rga o'tish / to'rni tahrirlash (lentaga sig'adigan qilib)."""
    L = perf_layout_for(s)
    if s["perfGrid"] or not L:
        base: dict[str, Any] = {}
    else:
        base = {
            "perfRows": L["rows"],
            "perfCols": L["cols"],
            "perfPitchL": L["pitchL"],
            "perfPitchW": L["pitch"],
            "perfEdge": jround(L["edge"] * 10) / 10,
            "perfStart": L["start"],
            "perfFill": True,
        }
    m = {**s, **base, **changes, "perfGrid": True}

    def fit(n: float, pitch: float, near: float, total: float, dia: float) -> dict[str, float]:
        edge = near if near > 0 else dia / 2
        span = total - 2 * edge
        if n > 1 and (n - 1) * pitch > span:
            return {
                "n": n,
                "pitch": jmax(dia, jfloor((span / (n - 1)) * 10) / 10),
                "count": jmax(1, jfloor(jdiv(span, jmax(pitch, dia))) + 1),
            }
        return {"n": n, "pitch": pitch, "count": n}

    out: dict[str, Any] = {"perfGrid": True, **base, **changes}
    if "perfGroups" in changes and "perfGroupPitch" not in changes:
        out["perfGroupPitch"] = 0
    if "perfEdge" in changes and m["perfEdge"] > 0:
        L2 = perf_layout_for({**m, **out})
        if L2:
            tail = (L2["groups"][-1] if L2["groups"] else 0) + (L2["cols"] - 1) * L2["pitch"]
            max_edge = m["width"] - m["perfDia"] / 2 - tail
            if m["perfEdge"] > max_edge:
                out["perfEdge"] = jmax(m["perfDia"] / 2, jfloor(max_edge * 10) / 10)
    w = fit(m["perfCols"], m["perfPitchW"], m["perfEdge"], m["width"], m["perfDia"])
    lf = fit(m["perfRows"], m["perfPitchL"], m["perfStart"], m["length"], m["perfDia"])
    if "perfCols" in changes:
        out["perfPitchW"] = w["pitch"]
    elif "perfPitchW" in changes or "perfEdge" in changes or "perfDia" in changes:
        out["perfCols"] = jmin(m["perfCols"], w["count"])
    if "perfRows" in changes:
        out["perfPitchL"] = lf["pitch"]
    elif "perfPitchL" in changes or "perfStart" in changes or "perfDia" in changes:
        out["perfRows"] = jmin(m["perfRows"], lf["count"])
    if changes.get("perfFill") is False and s["perfFill"] and L:
        out["perfRows"] = L["rows"]
    groups_raw = m.get("perfGroups")
    n_g = jmax(1, jfloor(groups_raw if groups_raw is not None else 1))
    if "perfGroups" in changes and n_g > 1:
        e = m["perfEdge"] if m["perfEdge"] > 0 else m["perfDia"]
        per = (m["width"] - 2 * e) / n_g
        p_w = jmax(m["perfDia"], m["perfPitchW"])
        max_cols = jmax(1, jfloor(jdiv(per - p_w, p_w)) + 1)
        if m["perfCols"] > max_cols:
            out["perfCols"] = max_cols
    return out


# ------------------------------------------------------------------ yo'naltiruvchi


def guide_positions(width: float, count: float, inset: float) -> list[float]:
    """1 ta — markazda; 2+ — chetdan `inset` da boshlanib teng taqsimlanadi."""
    n = jmax(0, jfloor(count))
    if n == 0 or width <= 0:
        return []
    if n == 1:
        return [width / 2]
    n = int(n)
    a = jmax(0, jmin(inset, width / 2))
    b = width - a
    if b - a < 1e-9:
        a = 0
        b = width
    return [a + ((b - a) * i) / (n - 1) for i in range(n)]


def _manual_fits(xs: Any, count: float, width: float) -> bool:
    return (
        xs is not None
        and count > 1
        and isinstance(xs, list)
        and len(xs) == count
        and all(v >= 0 and v <= width for v in xs)
    )


def _pitch_of(xs: list[float]) -> float | None:
    if len(xs) < 2:
        return None
    step = (xs[-1] - xs[0]) / (len(xs) - 1)
    return step if all(abs(v - (xs[0] + step * i)) < 0.5 for i, v in enumerate(xs)) else None


def guide_side_of(s: State, place: str) -> dict[str, Any] | None:
    """Bitta tomondagi yo'naltiruvchilar qatori (o'chirilgan bo'lsa None)."""
    top = place == "top"
    on = s["guideTopOn"] if top else s["guideBottomOn"]
    if not s["guideOn"] or not on:
        return None
    count = jmax(0, jfloor(s["guideTopQty"] if top else s["guideBottomQty"]))
    if count == 0:
        return None
    inset = s["guideTopInset"] if top else s["guideBottomInset"]
    manual = s.get("guideTopPos") if top else s.get("guideBottomPos")
    single = s.get("guideTopAt") if top else s.get("guideBottomAt")
    is_manual = _manual_fits(manual, count, s["width"])
    if count == 1 and single is not None and s["width"] > 0:
        xs = [jmin(s["width"], jmax(0, single))]
    elif is_manual:
        xs = manual
    else:
        xs = guide_positions(s["width"], count, inset)
    return {"place": place, "count": count, "inset": xs[0] if is_manual else inset, "xs": xs, "pitch": _pitch_of(xs)}


def guide_total_qty(s: State) -> float:
    """Ikkala tomondagi profillar jami soni."""
    b = guide_side_of(s, "bottom")
    t = guide_side_of(s, "top")
    return (b["count"] if b else 0) + (t["count"] if t else 0)


# ------------------------------------------------------------------ ko'ndalang profil


def cross_spans(width: float, seg_len: float, parts: float, gap: float) -> list[Seg]:
    """Bo'laklar markazga simmetrik: chet · bo'lak · tirqish · bo'lak · chet."""
    n = jmax(1, jfloor(parts))
    ln = jmax(0, seg_len)
    g = jmax(0, gap) if n > 1 else 0
    if width <= 0 or ln <= 0:
        return []
    total = n * ln + (n - 1) * g
    x0 = (width - total) / 2
    out = []
    for i in range(int(n)):
        a = x0 + i * (ln + g)
        out.append([a, a + ln])
    return out


def cross_free(s: State) -> list[Seg]:
    """Ko'ndalang profil turishi mumkin bo'lgan bo'sh oraliqlar (ustki yuza)."""
    if s["width"] <= 0:
        return []
    wg = s.get("crossWallGap")
    gap = jmax(CROSS_TO_SIDEWALL_MIN, wg if wg is not None else CROSS_TO_SIDEWALL_GAP)
    blocked: list[Seg] = []
    for b in gofro_bands(s):
        w0 = b["from"] if b["side"] == "left" else b["to"] - SIDEWALL_SPEC["width"]
        blocked.append([w0 - gap, w0 + SIDEWALL_SPEC["width"] + gap])
    top = guide_side_of(s, "top")
    if top:
        half = _guide_b(s["guideName"]) / 2 + CROSS_TO_GUIDE_GAP
        for x in top["xs"]:
            blocked.append([x - half, x + half])
    free: list[Seg] = [[0, s["width"]]]
    for a, b in blocked:
        nxt: list[Seg] = []
        for x, y in free:
            if b <= x or a >= y:
                nxt.append([x, y])
                continue
            if a > x:
                nxt.append([x, a])
            if b < y:
                nxt.append([b, y])
        free = nxt
    return [[_r01(a), _r01(b)] for a, b in free if b - a >= 1]


def fit_cross_segs(segs: list[Seg], free: list[Seg], min_len: float = 5) -> list[Seg]:
    """Qo'lda qo'yilgan bo'laklarni bo'sh joyga moslash."""
    out: list[Seg] = []
    for a0, b0 in sorted(segs, key=lambda p: p[0]):
        c = (a0 + b0) / 2
        room = next((f for f in free if c >= f[0] and c <= f[1]), None)
        if room is None and free:
            # markazi to'siqda — eng ko'p ustma-ust tushadigan oraliq (tengda birinchisi)
            room = max(free, key=lambda p, a0=a0, b0=b0: jmin(p[1], b0) - jmax(p[0], a0))
        if room is None:
            continue
        a = jmax(a0, room[0])
        b = jmin(b0, room[1])
        if out and a < out[-1][1]:
            a = out[-1][1]
        if b - a >= min_len - 1e-6:
            out.append([_r01(a), _r01(b)])
    return out


def cross_slot_at(free: list[Seg], cur: list[Seg], w: float, gap: float, min_len: float = 5) -> Seg | None:
    """Tashlangan nuqta uchun yangi bo'lak (bo'sh joy to'liq), joy bo'lmasa None."""
    room = next((f for f in free if w >= f[0] and w <= f[1]), None)
    if room is None:
        return None
    if any(w >= a and w <= b for a, b in cur):
        return None
    a, b = room[0], room[1]
    for p, q in cur:
        if q <= w and q + gap > a:
            a = jmax(a, q + gap)
        if p >= w and p - gap < b:
            b = jmin(b, p - gap)
    return [_r01(a), _r01(b)] if b - a >= min_len - 1e-6 else None


def cross_spans_of(s: State, seg_len: float) -> list[Seg]:
    """Kesimdagi bo'laklar — BITTA manba."""
    if not s["crossOn"]:
        return []
    if s.get("crossSegs") is not None:  # bo'sh ro'yxat ham (JS: [] truthy)
        return s["crossSegs"]
    return cross_spans(s["width"], seg_len, s["crossParts"], s["crossGap"])


def cross_len_text(c: dict[str, Any], fmt: Any) -> str:
    """Listlardagi "uzunligi" yozuvi: "n × L" yoki "a + b + c"."""
    if not c["manual"]:
        return f"{js_str(c['parts'])} × {fmt(c['drawLength'])}" if c["parts"] > 1 else fmt(c["drawLength"])
    ls = [b - a for a, b in c["spans"]]
    if not ls:
        return fmt(0)
    if all(abs(x - ls[0]) < 0.05 for x in ls):
        return f"{len(ls)} × {fmt(ls[0])}" if len(ls) > 1 else fmt(ls[0])
    return " + ".join(fmt(x) for x in ls)


def cross_total_width(seg_len: float, parts: float, gap: float) -> float:
    """Bo'laklar va tirqishlar bilan umumiy en, mm."""
    n = jmax(1, jfloor(parts))
    return n * jmax(0, seg_len) + (n - 1) * (jmax(0, gap) if n > 1 else 0)


def cross_max_segment(cross_max: float, parts: float, gap: float) -> float:
    """Bitta bo'lakning eng katta uzunligi."""
    n = jmax(1, jfloor(parts))
    return jmax(0, (cross_max - (n - 1) * (jmax(0, gap) if n > 1 else 0)) / n)


def cross_max_length(width: float, gofro: bool | float, top_guide: dict[str, Any] | None = None) -> float:
    """Lenta markazidagi eng uzun ko'ndalang profil (pastga butun)."""
    if width <= 0:
        return 0
    mid = width / 2
    if isinstance(gofro, bool):
        sub = CROSS_CLEARANCE_PER_SIDE if gofro else 0
    else:
        sub = gofro
    half = mid - sub
    for u in (top_guide or {}).get("xs") or []:
        half = jmin(half, abs(u - mid) - top_guide["B"] / 2 - CROSS_TO_GUIDE_GAP)
    return jmax(0, jfloor(half * 2))


def cross_max_length_for(s: State) -> float:
    """Ko'ndalang profilning eng katta uzunligi forma holatidan."""
    top = guide_side_of(s, "top")
    return cross_max_length(
        s["width"], gofro_cross_edge(s), {"xs": top["xs"], "B": _guide_b(s["guideName"])} if top else None
    )


def gofro_inset_patch(s: State, side: str, v: float, len0: float | None = None) -> dict[str, Any]:
    """Gofraning chetdan masofasini o'zgartirish (profil kerak bo'lsa qisqaradi)."""
    if len0 is None:
        len0 = s["crossLen"]
    max_in = jmax(0, s["width"] / 2 - SIDEWALL_SPEC["baseWidth"])
    safe = jmin(max_in, jmax(GOFRO_MIN_INSET, v))
    inset = {"gofroInsetL": safe} if side == "left" else {"gofroInsetR": safe}
    segs = s.get("crossSegs")
    if not s["crossOn"] or s["crossLenAuto"] or (len(segs) if segs else 0) > 0:
        return inset
    fit = cross_max_segment(cross_max_length_for({**s, **inset}), s["crossParts"], s["crossGap"])
    return {**inset, "crossLen": jmax(0, jmin(len0, jfloor(fit * 10) / 10))}


_GOFRO_RE = re.compile(r"\s*[-–]\s*[0-9]+(?:[.,][0-9]+)?\s*(?:ММ|MM|мм|mm)\s*\Z", re.IGNORECASE)


def gofro_label(name: str, height_mm: float) -> str:
    """Gofra nomi: material + haqiqiy balandlik."""
    base = _GOFRO_RE.sub("", name, count=1).strip()
    return f"{base} - {js_str(jround(height_mm * 10) / 10)} ММ" if height_mm > 0 else base


# ------------------------------------------------------------------ model


def build_drawing_model(s: State) -> dict[str, Any]:
    """Chizma modeli (mm) — `buildDrawingModel` ekvivalenti."""
    cat = catalog()
    belt = by_name(cat["belts"], s["beltName"])
    unverified: list[str] = []
    warnings: list[str] = []

    guide_spec = (
        (dict(GUIDE_SPECS[s["guideName"]]) if s["guideName"] in GUIDE_SPECS else None) if s["guideOn"] else None
    )
    if guide_spec and guide_spec["src"] == "taxminiy":
        unverified.append(s["guideName"])
    cross_spec = cleat_spec_for(s["crossName"]) if s["crossOn"] else None
    if cross_spec and cross_spec["src"] == "taxminiy":
        unverified.append(s["crossName"])
    gofro_item = by_name(cat["gofroProfiles"], s["gofroName"]) if s["gofroOn"] else None

    cross_max = cross_max_length_for(s)
    cross_seg = cross_max_segment(cross_max, s["crossParts"], s["crossGap"])
    manual_segs = bool(s.get("crossSegs"))
    if s["crossOn"] and s["width"] > 0 and not manual_segs and s["crossLen"] > cross_seg:
        warnings.append(
            "Ustidagi yo'naltiruvchi markazni egallagan — ko'ndalang profilga joy yo'q"
            if cross_max <= 0
            else f"Ko'nd. profil {js_str(s['crossLen'])} mm > maksimal {js_str(jround(cross_seg))} mm"
        )
    perf_sides = perf_sides_for(s)
    if s["perfOn"] and s["bendAngle"] <= 0 and s["width"] > 0 and s["perfDia"] > 0:
        fits = perf_layout_for(s)
        if not fits:
            if s["perfEdge"] > 0:
                warnings.append(f"Chetdan {js_str(s['perfEdge'])} mm bilan Ø{js_str(s['perfDia'])} mm teshik sig'maydi")
            elif s["gofroOn"]:
                free_w = jmax(0, perf_usable_width(s["width"], s["perfDia"], perf_sides))
                warnings.append(
                    f"Ø{js_str(s['perfDia'])} mm teshik gofrobort orasiga sig'maydi (bo'sh en {js_str(free_w)} mm)"
                )
            else:
                warnings.append(f"Ø{js_str(s['perfDia'])} mm teshik lenta eniga sig'maydi")
        elif s["perfEdge"] > 0:
            need = jmax(perf_sides["left"], perf_sides["right"]) + s["perfDia"] / 2
            if (perf_sides["left"] > 0 or perf_sides["right"] > 0) and s["perfEdge"] < need:
                warnings.append(
                    f"Chetdan {js_str(s['perfEdge'])} mm — teshik gofrobortga tegadi, "
                    f"kamida {js_str(jceil(need))} mm kerak"
                )
    guide_bottom = guide_side_of(s, "bottom")
    guide_top = guide_side_of(s, "top")
    for row in (guide_bottom, guide_top):
        if not row or s["width"] <= 0 or row["count"] < 2:
            continue
        where = "ustidagi" if row["place"] == "top" else "ostidagi"
        if row["inset"] * 2 >= s["width"]:
            warnings.append(f"Chetdan qochish ({where}) lenta eniga sig'maydi")
        elif guide_spec and row["inset"] < guide_spec["B"] / 2:
            warnings.append(f"Chetdan qochish ({where}) kamida {js_str(guide_spec['B'] / 2)} mm bo'lishi kerak")
    guide_count = (guide_bottom["count"] if guide_bottom else 0) + (guide_top["count"] if guide_top else 0)
    if s["guideOn"] and guide_count == 0:
        warnings.append("Yo'naltiruvchi yoqilgan, lekin tomon tanlanmagan")

    seg_len = jmin(s["crossLen"], cross_max_segment(cross_max, s["crossParts"], s["crossGap"]))
    if not s["lockOn"]:
        join = None
    elif s["joinMethod"] == "lock":
        join = f"Qulf: {s['lockName']}"
    elif s["joinMethod"] == "weld":
        join = "Payvand (ulab berish)"
    elif s["joinMethod"] == "install":
        join = "O'rnatib berish"
    else:
        join = "Metraj (ulanmaydi)"

    return {
        "belt": {
            "name": s["beltName"],
            "width": s["width"],
            "length": s["length"],
            "thickness": belt["thickness"] if belt and belt.get("thickness") is not None else None,
            "joint": joint_mm(
                belt["joint"] if belt and belt.get("joint") is not None else 0,
                s["lockOn"],
                s["joinMethod"],
                s["weldType"],
                s["settings"],
            ),
            "bend": s["bendAngle"],
        },
        "guide": {
            "name": s["guideName"],
            "count": guide_count,
            "spec": guide_spec,
            "bottom": guide_bottom,
            "top": guide_top,
        }
        if guide_count > 0
        else None,
        "cross": {
            "name": s["crossName"],
            "count": len(s["crossPos"]),
            "length": s["crossLen"],
            "parts": s["crossParts"],
            "gap": s["crossGap"] if s["crossParts"] > 1 and not manual_segs else 0,
            "manual": manual_segs,
            "spans": cross_spans_of(s, seg_len),
            "maxLength": cross_max,
            "drawLength": s["crossLen"] if manual_segs else seg_len,
            "spec": cross_spec,
            "ys": s["crossPos"],
            "pitch": uniform_pitch(s["crossPos"], s["length"]),
        }
        if s["crossOn"]
        else None,
        "gofro": {
            "name": gofro_label(gofro_item["name"], s["gofroHeight"]),
            "height": s["gofroHeight"] if s["gofroHeight"] > 0 else (gofro_item.get("height") or 0),
            "rows": s["gofroQty"],
            "sides": [s["gofroSide"]] if s["gofroQty"] == 1 else ["left", "right"],
            "bands": gofro_bands(s),
        }
        if gofro_item
        else None,
        "perf": {
            "diameter": s["perfDia"],
            "count": s["perfQty"],
            "stagger": s["perfStagger"],
            "layout": None if s["bendAngle"] > 0 else perf_layout_for(s),
        }
        if s["perfOn"]
        else None,
        "curve": curve_geom(s),
        "join": join,
        "projectName": s["projectName"].strip(),
        "customerPhone": s["customerPhone"].strip(),
        "author": s["author"].strip(),
        "unverified": unverified,
        "warnings": warnings,
    }

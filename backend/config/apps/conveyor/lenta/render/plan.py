"""Ustidan ko'rinish listi — `drawing/planSheet.tsx` nusxasi (06 §8)."""

from __future__ import annotations

import math

from ..drawing_model import perf_hole_points
from ..format import f1, uzs
from ..specs import SIDEWALL_SPEC
from .common import SIDE_ZONES, Box, C, is_ru
from .layout import info_lines, zone
from .marks import break_line_h, dim_chain, dim_x, dim_y, hole_mark, lock_band, note_box
from .pen import Pen
from .perf import callout_circle, edge_caption, perf_detail, perf_width_chain
from .spec import (
    cross_note_line,
    guide_note_line,
    join_note,
    perf_note_lines,
    spec_lines,
)


def plan_sheet(p: Pen, m: dict, n: int, main: Box | None = None, det_box: Box | None = None) -> None:
    """main berilsa — bir varaqli ishlab chiqarish chizmasi ichidagi ko'rinish: chap info ustuni chizilmaydi,
    "B" detal det_box ga (bo'lsa) chiziladi."""
    bw = m["belt"]["width"]
    ln = m["belt"]["length"]
    Z = SIDE_ZONES
    prod = main is not None
    MAIN = main or Z["main"]
    g = m.get("guide")
    gs = g["spec"] if g else None
    cr = m.get("cross")
    cs = cr["spec"] if cr else None
    gofro = m.get("gofro")
    band = SIDEWALL_SPEC["width"]

    padL, padR, padT, padB = 112, 96, 96, 34
    if m.get("perf") and ((m.get("cross") or {}).get("spans") or m.get("gofro")):
        padB = 92  # teshik zanjiri pastda
    avail_w = max(60, MAIN.w - padL - padR)
    avail_h = max(60, MAIN.h - padT - padB)
    kx = avail_w / bw if bw > 0 else 0
    px = MAIN.x + padL
    y0 = MAIN.y + padT

    if cr and cr["pitch"] is not None:
        pitch_mm = cr["pitch"]
    elif cr and len(cr["ys"]) > 1:
        pitch_mm = cr["ys"][1] - cr["ys"][0]
    else:
        pitch_mm = 0
    want_head = max(ln * 0.2, pitch_mm * 3.2, bw * 1.1)
    broken = ln > want_head * 1.15
    head_mm = min(ln, want_head) if broken else ln
    tail_mm = min(ln - head_mm, max(bw * 0.5, pitch_mm * 1.2)) if broken else 0
    gap_u = avail_h * 0.09 if broken else 0
    ky = (avail_h - gap_u) / (head_mm + tail_mm) if head_mm + tail_mm > 0 else 0
    head_h = head_mm * ky
    tail_h = tail_mm * ky
    y_tail = y0 + head_h + gap_u
    squeeze = kx / ky if kx > 0 and ky > 0 else 1

    def y_at(mm: float) -> float:
        return y0 + mm * ky if mm <= head_mm else y_tail + (mm - (ln - tail_mm)) * ky

    def shown(mm: float) -> bool:
        return mm <= head_mm + 0.001 or mm >= ln - tail_mm - 0.001

    def x_at(u: float) -> float:
        return px + u * kx

    plan_bot = y_tail + tail_h if broken else y0 + head_h
    rows = [r for r in ((g["bottom"], g["top"]) if g else ()) if r]
    guide_w = max(1.5, gs["B"] * kx) if gs else 0
    half_b = cs["B"] / 2 if cs else 0
    cleat_ys = [
        z
        for z in (cr["ys"] if cr else [])
        if (not broken and shown(z)) or z + half_b <= head_mm or z - half_b >= ln - tail_mm
    ]
    cleat_w = max(3.5, cs["B"] * ky) if cs else 0
    pitch = cr["pitch"] if cr else None
    wall_faces = [
        (
            {"side": bd["side"], "outer": bd["from"], "inner": bd["from"] + band}
            if bd["side"] == "left"
            else {"side": bd["side"], "outer": bd["to"], "inner": bd["to"] - band}
        )
        for bd in (gofro["bands"] if gofro else [])
    ]
    spans = cr["spans"] if cr else []
    perf = (m.get("perf") or {}).get("layout") if m.get("perf") else None
    if perf:
        if perf.get("grid"):
            perf_rows = min(120, perf["rows"], math.floor((head_mm - perf["start"]) / perf["pitchL"]) + 1)
        else:
            perf_rows = min(120, math.floor(head_mm / perf["pitch"]))
    else:
        perf_rows = 0
    perf_draw = perf if perf and perf["cols"] * perf_rows * (len(perf.get("groups") or []) or 1) <= 900 else None

    det_ok = False
    if prod:
        if perf_draw and det_box is not None:
            det_ok = det_box.h >= 190 and perf_detail(p, m, perf_draw, det_box)
    else:
        zone(p, Z["info"], f"{n}. Ustidan ko'rinish")
        y_end = info_lines(
            p,
            Z["info"].x + 14,
            Z["info"].y + 54,
            [
                *spec_lines(m),
                " ",
                "O'lchamlar haqiqiy, mm",
                f"Uzunlik eniga nisbatan {f1(squeeze)}× siqilgan" if squeeze > 1.05 else None,
                "Uzunligi uzib ko'rsatilgan" if broken else None,
                "Teshiklar shartli ko'rsatilmagan" if perf and not perf_draw else None,
                "Lentaga tepadan qaralgan ko'rinish",
                "Ostidagi yo'naltiruvchi uzuq chiziq bilan" if any(r["place"] == "bottom" for r in rows) else None,
            ],
        )

        if perf_draw:
            det = Box(Z["info"].x + 10, y_end + 26, Z["info"].w - 20, Z["info"].y + Z["info"].h - y_end - 34)
            det_ok = det.h >= 190 and perf_detail(p, m, perf_draw, det)
    if not prod:
        zone(p, MAIN)
    bx2 = px + bw * kx
    # lenta: to'ldirish + konturi (uzilgan tomonda kontur yo'q — o'rnida uzilish chizig'i)
    with p.group(fill=C.belt, fill_opacity=0.12, stroke="none"):
        p.rect(px, y0, bw * kx, head_h)
        if broken:
            p.rect(px, y_tail, bw * kx, tail_h)
    with p.group(fill="none", stroke=C.beltEdge, stroke_width=1.4):
        if broken:
            p.polyline([(px, y0 + head_h), (px, y0), (bx2, y0), (bx2, y0 + head_h)])
            p.polyline([(px, y_tail), (px, plan_bot), (bx2, plan_bot), (bx2, y_tail)])
        else:
            p.rect(px, y0, bw * kx, head_h)
    if broken:
        break_line_h(p, y0 + head_h, px, bx2)
        break_line_h(p, y_tail, px, bx2)
        cut_mm = ln - head_mm - tail_mm
        p.text(
            (px + bx2) / 2,
            y0 + head_h + gap_u / 2 + 4,
            f"uzilgan · {uzs(cut_mm)} mm ko'rsatilmagan",
            11.5,
            fill=C.thin,
            anchor="middle",
        )
    hole_pts: list[tuple[float, float, bool]] = []
    if perf_draw:
        dia = perf_draw["dia"]
        pts = [
            h
            for h in perf_hole_points(perf_draw, head_mm + 0.001, bw, 3000)
            if not broken or h["z"] + dia / 2 <= head_mm
        ]
        if broken:
            pts += [h for h in perf_hole_points(perf_draw, ln, bw, 40000) if h["z"] - dia / 2 >= ln - tail_mm]
        z_first = min((h["z"] for h in pts), default=0)
        many = len(pts) > 80
        hole_pts = [(x_at(h["u"]), y_at(h["z"]), not many or h["z"] == z_first) for h in pts]
        for hx, hy, ax in hole_pts:
            hole_mark(p, hx, hy, (dia / 2) * kx, axes=ax)
    if gofro:
        with p.group(fill=C.wall, stroke=C.wallEdge, stroke_width=1, opacity=0.75):
            for bd in gofro["bands"]:
                x = px + (bd["from"] if bd["side"] == "left" else bd["to"] - band) * kx
                p.rect(x, y0, max(2, band * kx), head_h)
                if broken:
                    p.rect(x, y_tail, max(2, band * kx), tail_h)
    if gs:
        for row in rows:
            hidden = row["place"] == "bottom"
            style = {
                "fill": "none" if hidden else C.guide,
                "stroke": C.guideEdge,
                "stroke_width": 1,
                "stroke_dasharray": "7 4" if hidden else None,
            }
            for u in row["xs"]:
                p.rect(x_at(u) - guide_w / 2, y0, guide_w, head_h, **style)
                if broken:
                    p.rect(x_at(u) - guide_w / 2, y_tail, guide_w, tail_h, **style)
    if cs and cr:
        for z in cleat_ys:
            for u0, u1 in cr["spans"]:
                p.rect(
                    x_at(u0),
                    y_at(z) - cleat_w / 2,
                    max(2, (u1 - u0) * kx),
                    cleat_w,
                    fill=C.cleat,
                    stroke=C.cleatEdge,
                    stroke_width=0.9,
                )

    jn = m.get("_join")
    if jn and jn["kind"] in ("lock", "install", "weld"):
        kind = "weld" if jn["kind"] == "weld" else "lock"
        depth = min(14.0, max(7.0, (m["belt"]["joint"] or 0) * ky))
        lock_band(p, px, bx2, y0, depth, kind, down=True)
        lock_band(p, px, bx2, plan_bot, depth, kind, down=False)
        txt = join_note(m)
        if txt:
            lx = bx2 - min(60, bw * kx * 0.15)
            with p.group(stroke=C.thin, stroke_width=0.8, fill="none"):
                p.line(lx, plan_bot - depth / 2, lx + 10, plan_bot + 12)
                p.line(lx + 10, plan_bot + 12, bx2 + 4, plan_bot + 12)
            p.text(bx2 + 4, plan_bot + 25, txt, 12, weight=600, fill=C.line, anchor="end")
    # perforatsiya yozuvlari chap paneldagi "PERFORATSIYA" bo'limida bor — lenta ichida teshiklarni yopmasin
    notes = [*([] if perf else perf_note_lines(m)), cross_note_line(m), guide_note_line(m)]
    notes = [t for t in notes if t]
    if notes and not prod:  # bir varaqli chizmada bu ma'lumot "Texnik talablar"da — profil/teshikni yopmasin
        _in_belt_note(
            p,
            notes,
            px,
            bx2,
            y0 + 10,
            y0 + head_h - (16 if broken else 10),
            [hy for _, hy, _ in hole_pts] + [y_at(z) for z in cleat_ys],
        )
    dim_x(p, px, px + bw * kx, y0 - 80, uzs(bw))
    if rows and len(rows[0]["xs"]) > 0:
        _guide_chain(p, rows[0], bw, x_at, y0 - 48)
        p.text(px - 8, y0 - 48 + 4, "o'qigacha", 10.5, fill=C.thin, anchor="end")
    only_full = not wall_faces and len(spans) == 1 and spans[0][0] < 0.5 and spans[0][1] > bw - 0.5
    if (spans or wall_faces) and not only_full:
        raw = sorted(
            [0, bw, *[u for sp in spans for u in sp], *[v for f in wall_faces for v in (f["outer"], f["inner"])]]
        )
        stops = [u for i, u in enumerate(raw) if i == 0 or u - raw[i - 1] > 0.5]
        for i, u in enumerate(stops[1:]):
            prev = stops[i]
            # tor chetki oraliq yozuvi lentadan TASHQARIGA chiqadi (ichkariga chiqsa qo'shni o'lchamni yopadi)
            out = "left" if prev < 0.5 else "right" if u > bw - 0.5 else None
            dim_x(p, x_at(prev), x_at(u), y0 - 16, f1(u - prev), outside=out)
    if perf:
        # teshik joylashuvi grafik o'lchanadi (D11): chetdan markazigacha zanjir, boshidan 1-qator, qatorlar qadami, Ø
        st, labels = perf_width_chain(perf, bw)
        top_free = not spans and not wall_faces
        cy = (y0 - (24 if det_ok else 16)) if top_free else plan_bot + (52 if jn else 30)  # "B" belgisiga joy
        dim_chain(p, [x_at(s) for s in st], labels, cy, up=top_free)
        edge_caption(p, px - 8, cy, is_ru(m), above=top_free and det_ok)  # "B" belgisi bilan ustma-ust tushmasin
        if hole_pts:
            zs = sorted({h["z"] for h in pts if h["z"] <= head_mm})
            if zs:
                xr = bx2 + 24  # shtrixlangan ulash zonasidan uzoqroq
                _dim_y_r(p, y0, y_at(zs[0]), xr, f1(zs[0]))
                if len(zs) > 1:
                    _dim_y_r(p, y_at(zs[0]), y_at(zs[1]), xr, f1(zs[1] - zs[0]))
                first = [h for h in pts if h["z"] == zs[0]]
                hx = x_at(max(h["u"] for h in first))
                hy = y_at(zs[0])
                rr = max(4.0, (perf["dia"] / 2) * kx)
                with p.group(stroke=C.dim, stroke_width=0.9):
                    p.line(hx + rr, hy, bx2 + 100, hy)
                p.text(bx2 + 70, hy - 4, f"Ø{f1(perf['dia'])}", 12.5, weight=700, fill=C.dim)
                if det_ok:
                    callout_circle(p, x_at(min(h["u"] for h in first)), hy, "B")
    dim_y(p, y0, plan_bot, px - 28, uzs(ln))
    if len(cleat_ys) >= 2 and pitch is not None:
        dim_y(p, y_at(cleat_ys[0]), y_at(cleat_ys[1]), px + bw * kx + (88 if perf else 46), f1(pitch))


def _dim_y_r(p: Pen, y1: float, y2: float, x: float, label: str) -> None:
    """Vertikal o'lcham, yozuvi o'ngda (lenta ustiga tushmasin)."""
    with p.group(stroke=C.dim, stroke_width=1.1, fill="none"):
        p.line(x, y1, x, y2)
        p.line(x - 5, y1, x + 5, y1)
        p.line(x - 5, y2, x + 5, y2)
        p.text(x + 7, (y1 + y2) / 2 + 4, label, 12, weight=600, fill=C.dim, stroke="none")


def _guide_chain(p: Pen, row: dict, bw: float, x_at, y: float) -> None:
    xs = row["xs"]
    first = xs[0]
    last = xs[-1]
    steps = len(xs) - 1
    pitch = (last - first) / steps if steps > 0 else 0
    if steps > 1 and row["pitch"] is None:
        stops = [0, *xs, bw]
        for i, u in enumerate(stops[1:]):
            dim_x(p, x_at(stops[i]), x_at(u), y, f1(u - stops[i]))
        return
    dim_x(p, x_at(0), x_at(first), y, f1(first))
    if steps > 1:
        dim_x(p, x_at(first), x_at(last), y, f"{uzs(steps)} × {f1(pitch)}")
    elif steps == 1:
        dim_x(p, x_at(first), x_at(last), y, f1(pitch))
    dim_x(p, x_at(last), x_at(bw), y, f1(bw - last))


def _in_belt_note(p: Pen, lines: list[str], x1: float, x2: float, ya: float, yb: float, obstacles: list[float]) -> None:
    """Yozuvni lenta ichida, teshik/profil qatorlari orasidagi eng katta bo'sh joyga qo'yadi."""
    ys = sorted({round(y, 1) for y in obstacles if ya < y < yb} | {ya, yb})
    best = max(((b - a, (a + b) / 2) for a, b in zip(ys, ys[1:])), default=(yb - ya, (ya + yb) / 2))
    note_box(p, (x1 + x2) / 2, best[1], lines, min(x2 - x1 - 16, 560), max_h=best[0] - 16)

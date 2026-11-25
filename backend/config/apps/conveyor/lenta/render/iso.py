"""Izometrik (3D) ko'rinish — `components/IsoView.tsx` nusxasi (06 §6)."""

from __future__ import annotations

import math
from collections.abc import Callable

from .._js import jround, js_str
from ..drawing_model import cross_len_text, perf_hole_points
from ..format import f1, uzs
from ..specs import SIDEWALL_SPEC, cleat_outline, fold_points, sidewall_pitch
from .common import ISO as C
from .pen import Pen

COS30 = math.cos(math.pi / 6)
SIN30 = 0.5
ELL_X = math.sqrt(2) * COS30
ELL_Y = math.sqrt(2) * SIN30
MAX_FOLD_LOOPS = 4000

Pt = tuple[float, float]
Proj = Callable[[float, float, float], Pt]


def mix(a: str, b: str, t: float) -> str:
    def h(c: str) -> list[int]:
        return [int(c[i : i + 2], 16) for i in (1, 3, 5)]

    r1, g1, b1 = h(a)
    r2, g2, b2 = h(b)
    k = max(0.0, min(1.0, t))

    def v(x: int, y: int) -> int:
        return int(jround(x + (y - x) * k))

    return f"rgb({v(r1, r2)},{v(g1, g2)},{v(b1, b2)})"


def clamp_u(center: float, width: float, belt_w: float) -> float:
    return max(0, min(center - width / 2, belt_w - width))


def iso_geometry(m: dict, box_w: float, box_h: float) -> dict:
    bw = m["belt"]["width"]
    ln = m["belt"]["length"]
    g = m.get("guide")
    gs = g["spec"] if g else None
    cr = m.get("cross")
    cs = cr["spec"] if cr else None
    gofro = m.get("gofro")

    pitch0 = ln / cr["count"] if cr and cr["count"] > 0 else 0
    broken = ln > bw * 2.0
    head_mm = min(ln, max(bw * 1.1, pitch0 * 1.7 if pitch0 > 0 else 0)) if broken else ln
    tail_mm = bw * 0.6 if broken else 0
    gap_mm = bw * 0.18 if broken else 0
    drawn_v = head_mm + gap_mm + tail_mm

    th_real = m["belt"]["thickness"] if m["belt"]["thickness"] is not None else 2
    th = max(th_real, bw * 0.016)
    guide_h_real = gs["H"] if gs else 0
    guide_h = max(guide_h_real, bw * 0.028) if gs else 0
    guide_b = max(gs["B"], bw * 0.026) if gs else 0
    guide_s = guide_b * (gs["S"] / max(gs["B"], 0.1)) if gs else 0
    bottom_row = g["bottom"] if g else None
    top_row = g["top"] if g else None

    def outline_of(up: bool) -> list[dict]:
        if not gs:
            return []
        hh = guide_h if up else -guide_h
        return [
            {"u": 0, "w": 0},
            {"u": guide_b, "w": 0},
            {"u": guide_b - (guide_b - guide_s) / 2, "w": hh},
            {"u": (guide_b - guide_s) / 2, "w": hh},
        ]

    cleat_h = cs["H"] if cs else 0
    cleat_t = max((cs.get("T") if cs and cs.get("T") is not None else 6), bw * 0.01)
    wall_h = gofro["height"] if gofro else 0
    wall_band = SIDEWALL_SPEC["baseWidth"]
    wall_w = max(SIDEWALL_SPEC["thickness"], bw * 0.012)
    wall_offset = (wall_band - wall_w) / 2
    wall_amp = max(min(SIDEWALL_SPEC["width"], wall_band) - wall_w, 1)
    wall_pitch = max(sidewall_pitch(wall_amp, SIDEWALL_SPEC["developedFactor"]), bw * 0.01)
    bands = gofro["bands"] if gofro else []
    band_l = next((b for b in bands if b["side"] == "left"), None)
    band_r = next((b for b in bands if b["side"] == "right"), None)
    wall_in0 = (band_l["from"] if band_l else 0) + wall_w / 2
    wall_out0 = wall_in0 + wall_amp
    wall_out1 = (band_r["to"] if band_r else bw) - wall_w / 2
    wall_in1 = wall_out1 - wall_amp
    cross_len = min(cr["drawLength"], bw) if cr else 0
    cross_side = (bw - cross_len) / 2 if cr else 0
    pitch = ln / cr["count"] if cr and cr["count"] > 0 else 0

    top_up = max(cleat_h, wall_h, guide_h if top_row is not None else 0)
    raw_x = (bw + drawn_v) * COS30
    raw_y = (bw + drawn_v) * SIN30 + th + (guide_h if bottom_row is not None else 0) + top_up
    len_out = 120 if cs and pitch > 0 else 58
    pad_x = max(78, len_out * COS30 + 18)
    pad_y = 96
    k = min((box_w - pad_x * 2) / raw_x, (box_h - pad_y) / raw_y) if raw_x > 0 and raw_y > 0 else 0
    return {
        "bw": bw,
        "len": ln,
        "broken": broken,
        "headMm": head_mm,
        "tailMm": tail_mm,
        "gapMm": gap_mm,
        "drawnV": drawn_v,
        "th": th,
        "thReal": th_real,
        "guideH": guide_h,
        "guideB": guide_b,
        "cleatH": cleat_h,
        "cleatT": cleat_t,
        "wallH": wall_h,
        "wallW": wall_w,
        "wallOffset": wall_offset,
        "crossLen": cross_len,
        "crossSide": cross_side,
        "pitch": pitch,
        "wallPitch": wall_pitch,
        "wallIn0": wall_in0,
        "wallOut0": wall_out0,
        "wallIn1": wall_in1,
        "wallOut1": wall_out1,
        "topUp": top_up,
        "rawX": raw_x,
        "rawY": raw_y,
        "k": k,
        "PAD_X": pad_x,
        "lenOut": len_out,
        "guideUp": top_row is not None,
        "guideDown": bottom_row is not None,
        "guideBottomRow": bottom_row,
        "guideTopRow": top_row,
        "guideOutlineUp": outline_of(True),
        "guideOutlineDown": outline_of(False),
    }


# ------------------------------------------------------------ jismlar
def _box(
    p: Pen, P: Proj, u: float, v: float, w: float, du: float, dv: float, dw: float, fill: dict, sw: float = 0.9
) -> None:
    top = [P(u, v, w + dw), P(u + du, v, w + dw), P(u + du, v + dv, w + dw), P(u, v + dv, w + dw)]
    right = [P(u + du, v, w + dw), P(u + du, v + dv, w + dw), P(u + du, v + dv, w), P(u + du, v, w)]
    left = [P(u, v + dv, w + dw), P(u + du, v + dv, w + dw), P(u + du, v + dv, w), P(u, v + dv, w)]
    with p.group(stroke=C.line, stroke_width=sw, stroke_linejoin="round"):
        p.polygon(left, fill=fill["left"])
        p.polygon(right, fill=fill["right"])
        p.polygon(top, fill=fill["top"])


def _extrude(
    p: Pen, P: Proj, outline: list[dict], u0: float, du: float, v0: float, w0: float, fill: dict, sw: float = 0.9
) -> None:
    pts = [{"v": v0 + q["v"], "w": w0 + q["w"]} for q in outline]
    faces: list[tuple[float, list[Pt], str, bool]] = []
    area = 0.0
    n = len(pts)
    for i in range(n):
        a = pts[i]
        b = pts[(i + 1) % n]
        area += a["v"] * b["w"] - b["v"] * a["w"]
    dr = 1 if area >= 0 else -1
    LV, LW = 0.45, 0.89
    for i in range(n):
        a = pts[i]
        b = pts[(i + 1) % n]
        dv = b["v"] - a["v"]
        dw = b["w"] - a["w"]
        ln = math.hypot(dv, dw) or 1
        nv = (dw / ln) * dr
        nw = (-dv / ln) * dr
        lit = max(0, nv * LV + nw * LW)
        faces.append(
            (
                (a["v"] + b["v"]) / 2 + (a["w"] + b["w"]) / 2 + u0 + du / 2,
                [P(u0, a["v"], a["w"]), P(u0 + du, a["v"], a["w"]), P(u0 + du, b["v"], b["w"]), P(u0, b["v"], b["w"])],
                mix(fill["side"], fill["top"], 0.12 + 0.88 * lit),
                False,
            )
        )
    mv = sum(q["v"] / n for q in pts)
    mw = sum(q["w"] / n for q in pts)
    for u in (u0, u0 + du):
        faces.append((u + mv + mw, [P(u, q["v"], q["w"]) for q in pts], fill["end"], True))
    faces.sort(key=lambda f: f[0])
    with p.group(stroke_linejoin="round"):
        for _d, fp, col, end in faces:
            p.polygon(fp, fill=col, stroke=C.line if end else col, stroke_width=sw if end else 0.5)


def _corrugated_wall(
    p: Pen, P: Proj, u_in: float, u_out: float, v0: float, dv: float, w0: float, h: float, pitch: float, fill: dict
) -> None:
    pts: list[dict] = []
    n_loops = max(1, math.ceil(dv / pitch) + 1)
    start_loop = math.floor(v0 / pitch)
    shape = fold_points(u_out - u_in, pitch, 8)
    # Himoya (aslda yo'q): absurd uzunlikda (1e12 mm) asl ilova xotirani to'ldirib
    # yiqiladi. Burmalar baribir pikseldan zich — tekis devor chiziladi.
    if n_loops > MAX_FOLD_LOOPS:
        n_loops = -1
    for nn in range(n_loops + 1):
        vc = (start_loop + nn) * pitch
        for q in shape:
            pts.append({"u": u_in + q["u"], "v": vc + q["v"] - pitch / 2})
    inside = [q for q in pts if v0 - 1 <= q["v"] <= v0 + dv + 1]
    use = inside if len(inside) > 1 else [{"u": u_in, "v": v0}, {"u": u_in, "v": v0 + dv}]
    faces = []
    for i in range(len(use) - 1):
        a = use[i]
        b = use[i + 1]
        faces.append(
            (
                (a["u"] + b["u"]) / 2 + (a["v"] + b["v"]) / 2,
                [P(a["u"], a["v"], w0), P(b["u"], b["v"], w0), P(b["u"], b["v"], w0 + h), P(a["u"], a["v"], w0 + h)],
                fill["a"] if b["u"] > a["u"] else fill["b"],
            )
        )
    faces.sort(key=lambda f: f[0])
    with p.group(stroke=C.line, stroke_width=0.7, stroke_linejoin="round"):
        for _d, fp, col in faces:
            p.polygon(fp, fill=col)
        p.polyline([P(q["u"], q["v"], w0 + h) for q in use], fill="none", stroke=C.line, stroke_width=1)


def _extrude_along_v(
    p: Pen, P: Proj, outline: list[dict], v0: float, dv: float, u0: float, w0: float, fill: dict, sw: float = 0.9
) -> None:
    pts = [{"u": u0 + q["u"], "w": w0 + q["w"]} for q in outline]
    n = len(pts)
    faces = []
    for i in range(n):
        a = pts[i]
        b = pts[(i + 1) % n]
        horizontal = abs(b["w"] - a["w"]) < abs(b["u"] - a["u"])
        faces.append(
            (
                (a["u"] + b["u"]) / 2 + (a["w"] + b["w"]) / 2 + v0 + dv / 2,
                [P(a["u"], v0, a["w"]), P(a["u"], v0 + dv, a["w"]), P(b["u"], v0 + dv, b["w"]), P(b["u"], v0, b["w"])],
                fill["top"] if horizontal else fill["side"],
            )
        )
    mu = sum(q["u"] / n for q in pts)
    mw = sum(q["w"] / n for q in pts)
    for v in (v0, v0 + dv):
        faces.append((v + mu + mw, [P(q["u"], v, q["w"]) for q in pts], fill["end"]))
    faces.sort(key=lambda f: f[0])
    with p.group(stroke=C.line, stroke_width=sw, stroke_linejoin="round"):
        for _d, fp, col in faces:
            p.polygon(fp, fill=col)


def _leader(p: Pen, frm: Pt, to: Pt, text: str, sub: str | None = None, anchor: str = "start") -> None:
    dx = 6 if anchor == "start" else -6
    with p.group():
        p.line(frm[0], frm[1], to[0], to[1], stroke=C.dim, stroke_width=1.1)
        p.circle(frm[0], frm[1], 2.1, fill=C.dim, stroke="none")
        p.text(to[0] + dx, to[1] + 3, text, 13, weight=600, fill=C.dim, anchor=anchor, halo=True)
        if sub:
            p.text(to[0] + dx, to[1] + 16, sub, 10.5, fill=C.thin, anchor=anchor, halo=True)


def _iso_dim(p: Pen, a: Pt, b: Pt, off: Pt, text: str, sub: str | None = None, at: float = 0.5) -> None:
    a2 = (a[0] + off[0], a[1] + off[1])
    b2 = (b[0] + off[0], b[1] + off[1])
    mid = (a2[0] + (b2[0] - a2[0]) * at, a2[1] + (b2[1] - a2[1]) * at)
    tick = (off[0] * 0.12, off[1] * 0.12)
    with p.group(stroke=C.dim, stroke_width=1.1, fill="none"):
        p.line(a[0], a[1], a2[0] + tick[0], a2[1] + tick[1], opacity=0.45)
        p.line(b[0], b[1], b2[0] + tick[0], b2[1] + tick[1], opacity=0.45)
        p.line(a2[0], a2[1], b2[0], b2[1])
        p.text(mid[0], mid[1] - 6, text, 13, weight=600, fill=C.dim, stroke="none", anchor="middle", halo=True)
        if sub:
            p.text(mid[0], mid[1] + 8, sub, 10.5, fill=C.thin, stroke="none", anchor="middle", halo=True)


# ------------------------------------------------------------- asosiy
def iso_view(p: Pen, m: dict, x: float, y: float, w: float, h: float) -> None:
    bw = m["belt"]["width"]
    if bw <= 0 or m["belt"]["length"] <= 0:
        return
    G = iso_geometry(m, w, h)
    g = m.get("guide")
    gs = g["spec"] if g else None
    cr = m.get("cross")
    cs = cr["spec"] if cr else None
    gofro = m.get("gofro")
    k = G["k"]

    model_h = G["rawY"] * k
    slack_x = max(0, (w - G["PAD_X"] * 2 - G["rawX"] * k) / 2)
    ox = x + G["PAD_X"] + slack_x + G["drawnV"] * COS30 * k
    oy = y + max(0, (h - model_h) / 2) + G["topUp"] * k

    def vv(z: float) -> float:
        return z if z <= G["headMm"] else z - (G["len"] - G["tailMm"]) + G["headMm"] + G["gapMm"]

    def P(u: float, v: float, ww: float) -> Pt:
        return (ox + (u - v) * COS30 * k, oy + ((u + v) * SIN30 - ww) * k)

    segs = [(0, G["headMm"]), (G["headMm"] + G["gapMm"], G["tailMm"])] if G["broken"] else [(0, G["headMm"])]

    def draw_guides(sg: tuple[float, float], up: bool) -> None:
        row = G["guideTopRow"] if up else G["guideBottomRow"]
        if not row or not gs:
            return
        for cx in row["xs"]:
            _extrude_along_v(
                p,
                P,
                G["guideOutlineUp"] if up else G["guideOutlineDown"],
                sg[0],
                sg[1],
                clamp_u(cx, G["guideB"], bw),
                G["th"] if up else 0,
                {"top": C.guideTop, "side": C.guideSide, "end": C.guideEnd},
            )

    with p.group():
        for sg in segs:
            draw_guides(sg, False)
            _box(p, P, 0, sg[0], 0, bw, sg[1], G["th"], {"top": C.beltTop, "right": C.beltSide, "left": C.beltEnd}, 1.2)

        cleat_zs: list[float] = []
        outline = cleat_outline(cs) if cr and cs else None
        oW = max(q["v"] for q in outline) if outline else 0
        if cr and cs:
            for z in cr["ys"]:
                if G["broken"] and G["headMm"] < z < G["len"] - G["tailMm"]:
                    continue
                cleat_zs.append(z)
        cleat_segs = cr["spans"] if cr and cr["spans"] else [[G["crossSide"], G["crossSide"] + G["crossLen"]]]

        def under_cleat(u: float, z: float, r: float) -> bool:
            if not outline or not cleat_zs:
                return False
            half_v = oW / 2 + r
            if not any(u + r >= u0 and u - r <= u1 for u0, u1 in cleat_segs):
                return False
            return any(abs(z - cz) < half_v for cz in cleat_zs)

        perf_l = (m.get("perf") or {}).get("layout") if m.get("perf") else None
        if perf_l:
            r = perf_l["dia"] / 2
            n_dots = 0
            with p.group():
                for hp in perf_hole_points(perf_l, G["len"], bw, 3000):
                    if n_dots >= 1200:
                        break
                    u, z = hp["u"], hp["z"]
                    if G["broken"] and G["headMm"] < z < G["len"] - G["tailMm"]:
                        continue
                    if under_cleat(u, z, r):
                        continue
                    q = P(u, vv(z), G["th"])
                    # D2: kamida ~Ø2 mm qog'ozda (ellips nisbati saqlanadi), to'q — ko'k fonda ko'rinsin
                    f = max(1.0, 4.0 / max(ELL_X * r * k, 1e-6))
                    p.ellipse(
                        q[0], q[1], ELL_X * r * k * f, ELL_Y * r * k * f, fill=C.line, stroke=C.hole, stroke_width=0.6
                    )
                    n_dots += 1

        if G["guideUp"]:
            for sg in segs:
                draw_guides(sg, True)

        sides = gofro["sides"] if gofro else []
        wall_fill = {"a": C.wallTop, "b": C.wallSide}
        if "left" in sides:
            for sg in segs:
                _corrugated_wall(
                    p, P, G["wallIn0"], G["wallOut0"], sg[0], sg[1], G["th"], G["wallH"], G["wallPitch"], wall_fill
                )
        if cr and cs and outline:
            for z in cleat_zs:
                for u0, u1 in cleat_segs:
                    _extrude(
                        p,
                        P,
                        outline,
                        u0,
                        u1 - u0,
                        vv(z) - oW / 2,
                        G["th"],
                        {"top": C.cleatTop, "side": C.cleatSide, "end": C.cleatEnd},
                    )
        if "right" in sides:
            for sg in segs:
                _corrugated_wall(
                    p, P, G["wallIn1"], G["wallOut1"], sg[0], sg[1], G["th"], G["wallH"], G["wallPitch"], wall_fill
                )

        if G["guideBottomRow"] and gs:
            with p.group():
                for sg in segs:
                    for cx in G["guideBottomRow"]["xs"]:
                        cu = clamp_u(cx, G["guideB"], bw) + G["guideB"] / 2
                        a = P(cu, sg[0], G["th"])
                        b = P(cu, sg[0] + sg[1], G["th"])
                        p.line(
                            a[0],
                            a[1],
                            b[0],
                            b[1],
                            stroke=C.line,
                            stroke_width=1.1,
                            stroke_dasharray="9 5",
                            opacity=0.65,
                        )

        if G["broken"]:
            for v_at in (G["headMm"], G["headMm"] + G["gapMm"]):
                pts = []
                for i in range(10):
                    u = (bw * i) / 9
                    pts.append(P(u, v_at, G["th"] + (-bw * 0.012 if i % 2 == 0 else bw * 0.012)))
                p.polyline(pts, fill="none", stroke=C.line, stroke_width=1.4)

        # ---------------------------------------------------- o'lchamlar
        top_w = G["th"] + G["topUp"]
        OUT_W = (0.5, -0.866)
        OUT_L = (-0.5, -0.866)
        OUT_EDGE = (-COS30, -SIN30)

        def mul(v: Pt, d: float) -> Pt:
            return (v[0] * d, v[1] * d)

        rows_with_span = [r for r in (G["guideBottomRow"], G["guideTopRow"]) if r and len(r["xs"]) >= 2]
        same_both = (
            len(rows_with_span) == 2
            and len(rows_with_span[0]["xs"]) == len(rows_with_span[1]["xs"])
            and all(abs(u - rows_with_span[1]["xs"][i]) < 0.5 for i, u in enumerate(rows_with_span[0]["xs"]))
        )
        span_rows = [rows_with_span[0]] if same_both else rows_with_span
        both_sides = not same_both and G["guideBottomRow"] is not None and G["guideTopRow"] is not None
        for ri, row in enumerate(span_rows):
            first = row["xs"][0]
            last = row["xs"][-1]
            step = (last - first) / (len(row["xs"]) - 1)
            if same_both:
                where = "ost va ust bir xil · "
            elif both_sides:
                where = "ustidagi · " if row["place"] == "top" else "ostidagi · "
            else:
                where = ""
            sub = (
                f"{where}{len(row['xs']) - 1} × {uzs(step)} · profillar orasi"
                if len(row["xs"]) > 2 and row["pitch"] is not None
                else f"{where}profillar orasi"
            )
            _iso_dim(p, P(first, 0, top_w), P(last, 0, top_w), mul(OUT_W, 34 + ri * 44), uzs(last - first), sub)

        _iso_dim(
            p,
            P(0, 0, top_w),
            P(bw, 0, top_w),
            mul(OUT_W, 34 + len(span_rows) * 44 if span_rows else 36),
            uzs(bw),
            "eni",
        )
        _iso_dim(
            p,
            P(0, 0, G["th"]),
            P(0, G["drawnV"], G["th"]),
            mul(OUT_EDGE, G["lenOut"]),
            uzs(G["len"]),
            "uzunligi (to'liq)" if G["broken"] else "uzunligi",
            at=0.16,
        )

        pitch_a = P(0, vv(cleat_zs[0]), G["th"]) if cr and cs and len(cleat_zs) >= 2 else None
        pitch_b = P(0, vv(cleat_zs[1]), G["th"]) if cr and cs and len(cleat_zs) >= 2 else None
        pitch_long = bool(pitch_a and pitch_b and math.hypot(pitch_b[0] - pitch_a[0], pitch_b[1] - pitch_a[1]) > 34)
        pitch_txt: Pt | None = None
        if (
            cr
            and cs
            and cr["pitch"] is not None
            and G["pitch"] > 0
            and pitch_a
            and pitch_b
            and vv(cleat_zs[1]) <= G["headMm"]
            and pitch_long
        ):
            off = mul(OUT_L, 56)
            pitch_txt = ((pitch_a[0] + pitch_b[0]) / 2 + off[0], (pitch_a[1] + pitch_b[1]) / 2 + off[1])
            _iso_dim(p, pitch_a, pitch_b, off, f1(cr["pitch"]), "qadam")  # D5: haqiqiy qadam

        if cr and cs and cleat_zs:
            head_zs = [z for z in cleat_zs if z <= G["headMm"]]
            anchor_z = head_zs[-1] if pitch_txt and len(head_zs) > 1 else cleat_zs[0]
            q = P(G["crossSide"], vv(anchor_z), G["th"] + G["cleatH"])
            to = (q[0] - 54, q[1] - 62)
            if pitch_txt:
                gap_need = 58
                d = math.hypot(to[0] - pitch_txt[0], to[1] - pitch_txt[1])
                if d < gap_need:
                    s = gap_need - d
                    to = (to[0] - COS30 * s, to[1] + SIN30 * s)
            qadam = f"qadam {uzs(cr['pitch'])} · " if not pitch_txt and cr["pitch"] is not None else ""
            uz = cross_len_text(cr, lambda v: uzs(v)) if cr["manual"] else uzs(G["crossLen"])
            _leader(p, q, to, f"H {f1(G['cleatH'])} mm", f"ko'ndalang · {qadam}uz. {uz} mm", anchor="end")

        if gofro:
            on_right = "right" in gofro["sides"]
            q = P(bw - G["wallOffset"] if on_right else G["wallOffset"], G["headMm"] * 0.75, G["th"] + G["wallH"])
            side_txt = ("o'ng" if on_right else "chap") if len(gofro["sides"]) == 1 else "2 tomon"
            _leader(
                p,
                q,
                (q[0] + (54 if on_right else -54), q[1] - 14),
                f"{js_str(gofro['height'])} mm",
                f"gofrobort · {side_txt}",
                anchor="start" if on_right else "end",
            )

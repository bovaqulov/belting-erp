"""Bukilgan lenta listlari: ko'rinish va kesish shabloni (09 §D10).

Asos: `drawing/curveSheet.tsx` (06 §12); 2026-11 dan mustaqil:
- ko'rinish: markazdan R (tashqi/ichki) radial o'lchamlari, θ, yoy uzunligi o'lcham yoylari bilan,
  eni B radial o'lcham, teshiklar ko'rinadigan (zich bo'lsa har N-chisi, izoh bilan), bitta teshik
  chiqarma yozuvi va kattalashtirilgan "A" detal (Ø, yoy bo'ylab qadam, chetdan markazgacha, qatorlar);
- kesish shabloni: tekis rulondan kesish (zagotovka, rulonga joylash, bo'laklar/ulashlar soni),
  teshiklar jadvali (№, θ, R, s) va "Qanday o'qiladi" izohi.
"""

from __future__ import annotations

import math

from .._js import jround
from ..curve import curve_hole_table, cut_plan, sector_bounds
from ..format import f1, uzs
from .common import CURVE_ZONES, SIDE_ZONES, Box, C, break_v, is_ru, vchain
from .layout import info_fit, wrap_line, zone
from .marks import MIN_HOLE_R, break_line_h, dim_chain, dim_x, dim_y, note_box
from .pen import Pen
from .spec import main_notes

RAD = math.pi / 180
DET_W = 300  # o'ng ustun detal (ixcham sektor uchun)
DET_H = 214  # pastki detal (keng sektor uchun)
PAD_X, PAD_TOP, PAD_BOT = 84, 100, 62
# qog'ozdagi detal masshtablari (qog'oz mm / haqiqiy mm)
NICE = (10, 5, 4, 2.5, 2, 1, 0.5, 0.4, 0.25, 0.2, 0.1, 0.05, 0.04, 0.025, 0.02, 0.01)


def _f3(v: float) -> str:
    return f"{v:.3f}".rstrip("0").rstrip(".").replace(".", ",")


def _g1(v: float) -> str:
    """5304.66 -> "5 304,7" · 136.0 -> "136" (minglar ajratilgan, 1 kasr)."""
    if not math.isfinite(v):  # degenerat geometriya (cheksiz radius) — yiqilmasin
        return "—"
    r = round(v, 1)
    return uzs(r, 1 if abs(r - round(r)) >= 0.05 else 0)


def _tr(m: dict, uz: str, ru: str) -> str:
    return ru if is_ru(m) else uz


def _scale_txt(s: float) -> str:
    return f"M {f1(s)}:1" if s >= 1 else f"M 1:{f1(1 / s)}"


def _nice(kd: float) -> float:
    """Birlik/mm -> standart masshtabga yaxlitlangan birlik/mm (4 birlik = qog'ozda 1 mm)."""
    s = kd / 4
    for v in NICE:
        if v <= s + 1e-12:
            return v * 4
    return kd


# ------------------------------------------------------------------ joylashuv
def _bounds(g: dict) -> dict:
    """Sektor gabariti; O markaz arzon bo'lsa (balandlikni ≤ 80% oshirsa) ko'rinishga qo'shiladi."""
    f = dict(sector_bounds(g))
    h = f["maxY"] - f["minY"]
    with_o = f["minY"] <= 1e-6
    if not with_o and f["minY"] <= 0.8 * h:
        f["minY"] = 0.0
        with_o = True
    f["withO"] = with_o
    return f


def _fit(g: dict, box: Box) -> dict:
    f = _bounds(g)
    # juda kichik burchakda gabarit 0 yoki cheksiz bo'lishi mumkin — nolga bo'linmasin
    dx, dy = max(f["maxX"] - f["minX"], 1e-9), max(f["maxY"] - f["minY"], 1e-9)
    k = min((box.w - 2 * PAD_X) / dx, (box.h - PAD_TOP - PAD_BOT) / dy)
    if not math.isfinite(k):
        k = 1e-9
    cx = box.x + box.w / 2 - ((f["minX"] + f["maxX"]) / 2) * k
    cy = box.y + PAD_TOP + f["maxY"] * k
    return {**f, "k": max(k, 1e-9), "cx": cx, "cy": cy}


def _foot_count(m: dict) -> int:
    g = m["curve"]
    return (1 if g.get("holes") else 0) + len(main_notes(m))


def _layout(m: dict) -> dict:
    """Ko'rinish va detal joyi: detal o'ngda yoki pastda — sektor kattaroq chiqadiganini tanlaydi."""
    g = m["curve"]
    zm = CURVE_ZONES["main"]
    nf = _foot_count(m)
    area = Box(zm.x, zm.y + 34, zm.w, zm.h - 34 - (nf * 15 + 8 if nf else 0))
    if not g.get("holes"):
        return {"sec": area, "det": None, "wide": False, "F": _fit(g, area)}
    right = Box(area.x, area.y, area.w - DET_W, area.h)
    bottom = Box(area.x, area.y, area.w, area.h - DET_H)
    fr, fb = _fit(g, right), _fit(g, bottom)
    if fb["k"] >= fr["k"]:
        return {"sec": bottom, "det": Box(area.x, bottom.y + bottom.h, area.w, DET_H), "wide": True, "F": fb}
    return {"sec": right, "det": Box(area.x + right.w, area.y, DET_W, area.h), "wide": False, "F": fr}


def curve_scale(m: dict) -> float:
    g = m.get("curve")
    if not g:
        return 0
    return 4 / _layout(m)["F"]["k"]


def hole_info(g: dict) -> dict | None:
    """Teshiklar: qadam (yoy bo'ylab, 1-qator), qatorlar orasi, shaxmat, chetlardan masofa."""
    h = g.get("holes")
    if not h:
        return None
    n_row = max(1, len(h["angles"]))
    full = g["angle"] >= 359.999
    rows = h["rows"]
    stagger = len(rows) > 1 and abs(rows[1]["angles"][0] - rows[0]["angles"][0]) > 1e-9
    dphi = (360.0 if full else g["angle"]) / n_row
    step = h["pcdR"] * dphi * RAD
    rp = (rows[0]["pcdR"] - rows[1]["pcdR"]) if len(rows) > 1 else 0
    return {
        "step": step,
        "dphi": dphi,
        "rows": len(rows),
        "rowPitch": rp,
        "stagger": stagger,
        "edge": g["R"] - h["pcdR"],
        "inner": rows[-1]["pcdR"] - g["r"],
        "dia": h["dia"],
        "total": h["total"],
        "first": h["pcdR"] * rows[0]["angles"][0] * RAD,
        "pcdR": h["pcdR"],
    }


# ------------------------------------------------------------------ primitivlar
def _arrow(p: Pen, x: float, y: float, ux: float, uy: float, size: float = 8) -> None:
    """Uchi (x, y) da, (ux, uy) yo'nalishiga qaragan o'q uchi."""
    nx, ny = -uy, ux
    p.polygon(
        [
            (x, y),
            (x - ux * size + nx * size * 0.35, y - uy * size + ny * size * 0.35),
            (x - ux * size - nx * size * 0.35, y - uy * size - ny * size * 0.35),
        ],
        fill=C.dim,
        stroke="none",
    )


def _arc(p: Pen, cx: float, cy: float, rr: float, a0: float, a1: float, **st) -> None:
    large = 1 if a1 - a0 > 180 else 0
    x0, y0 = cx + rr * math.cos(a0 * RAD), cy - rr * math.sin(a0 * RAD)
    x1, y1 = cx + rr * math.cos(a1 * RAD), cy - rr * math.sin(a1 * RAD)
    p.path([("M", x0, y0), ("A", rr, rr, 0, large, 0, x1, y1)], fill="none", **st)


def _tag(p: Pen, x: float, y: float, label: str, fs: float = 12.5) -> None:
    """Fonli o'lcham yozuvi (chiziqlar ustida o'qiladi)."""
    w = len(label) * fs * 0.6 + 12
    p.rect(x - w / 2, y - fs * 0.8, w, fs * 1.55, fill=C.paper, stroke=C.dim, stroke_width=0.6, rx=3)
    p.text(x, y + fs * 0.36, label, fs, weight=700, fill=C.dim, anchor="middle")


def _radial(p: Pen, cx: float, cy: float, r0_px: float, r1_px: float, a: float, label: str, at_px: float) -> None:
    """Markazdan radius bo'ylab o'lcham: o'q uchi `r1_px` da (yoyda), yozuv `at_px` radiusda."""
    ux, uy = math.cos(a * RAD), -math.sin(a * RAD)
    x0, y0 = cx + ux * r0_px, cy + uy * r0_px
    x1, y1 = cx + ux * r1_px, cy + uy * r1_px
    p.line(x0, y0, x1, y1, stroke=C.dim, stroke_width=1)
    _arrow(p, x1, y1, ux, uy)
    _tag(p, cx + ux * at_px, cy + uy * at_px, label)


def _arc_dim(
    p: Pen, cx: float, cy: float, edge_px: float, rad_px: float, a0: float, a1: float, label: str, outside: bool
) -> None:
    """Yoy uzunligi o'lchami: konsentrik o'lcham yoyi + chiqarish chiziqlari + o'qlar, yozuv o'rtada.

    `outside` — o'lcham yoyi chetdan tashqarida (yozuv undan ham tashqarida); aks holda lenta ichida (yozuv ichkariroq).
    """
    if outside:
        with p.group(stroke=C.dim, stroke_width=0.6, opacity=0.7):
            for a in (a0, a1):
                ux, uy = math.cos(a * RAD), -math.sin(a * RAD)
                p.line(cx + ux * (edge_px + 4), cy + uy * (edge_px + 4), cx + ux * (rad_px + 6), cy + uy * (rad_px + 6))
    _arc(p, cx, cy, rad_px, a0, a1, stroke=C.dim, stroke_width=1)
    for a, sgn in ((a0, 1), (a1, -1)):
        x, y = cx + rad_px * math.cos(a * RAD), cy - rad_px * math.sin(a * RAD)
        # o'q uchi yoy chetiga qaraydi (burchak kamayish/oshish yo'nalishida)
        _arrow(p, x, y, sgn * math.sin(a * RAD), sgn * math.cos(a * RAD))
    mid = (a0 + a1) / 2
    lr = rad_px + 14
    p.text(
        cx + lr * math.cos(mid * RAD),
        cy - lr * math.sin(mid * RAD),
        label,
        12.5,
        weight=700,
        fill=C.dim,
        anchor="middle",
        halo=True,
    )


# ------------------------------------------------------------------ 1-list: ko'rinish
def curve_sheet(p: Pen, m: dict, n: int) -> None:
    g = m["curve"]
    Z = CURVE_ZONES
    zm = Z["main"]
    lay = _layout(m)
    F = lay["F"]
    cx0, cy0, k = F["cx"], F["cy"], F["k"]

    def P(rr: float, a: float) -> tuple[float, float]:
        return (cx0 + rr * k * math.cos(a * RAD), cy0 - rr * k * math.sin(a * RAD))

    full = g["angle"] >= 359.999
    large = 1 if g["angle"] > 180 else 0
    a0, a1 = F["a0"], F["a1"]
    mid = (a0 + a1) / 2
    span = g["angle"] if not full else 360
    with_o = F["withO"] or full
    o0x, o0y = P(g["R"], a0)
    o1x, o1y = P(g["R"], a1)
    i1x, i1y = P(g["r"], a1)
    i0x, i0y = P(g["r"], a0)
    Ro, Ri = g["R"] * k, g["r"] * k
    if full:
        d: list[tuple] = [
            ("M", cx0 + Ro, cy0),
            ("A", Ro, Ro, 0, 1, 0, cx0 - Ro, cy0),
            ("A", Ro, Ro, 0, 1, 0, cx0 + Ro, cy0),
            ("Z",),
        ]
        if Ri > 0:
            d += [
                ("M", cx0 + Ri, cy0),
                ("A", Ri, Ri, 0, 1, 1, cx0 - Ri, cy0),
                ("A", Ri, Ri, 0, 1, 1, cx0 + Ri, cy0),
                ("Z",),
            ]
    else:
        d = [
            ("M", o0x, o0y),
            ("A", Ro, Ro, 0, large, 0, o1x, o1y),
            ("L", i1x, i1y),
            ("A", Ri, Ri, 0, large, 1, i0x, i0y),
            ("Z",),
        ]

    h = g.get("holes")
    hi = hole_info(g)
    notes = main_notes(m)
    left = cx0 + F["minX"] * k
    top = cy0 - F["maxY"] * k
    sb = sector_bounds(g)
    bottom = cy0 - sb["minY"] * k
    Wd = (F["maxX"] - F["minX"]) * k

    zone(p, zm, _tr(m, f"{n}. Bukilgan lenta — ustidan ko'rinish", f"{n}. Гнутая лента — вид сверху"))
    p.path(d, fill=C.belt, fill_opacity=0.1, fill_rule="evenodd", stroke=C.line, stroke_width=1.6)

    # teshiklar: ko'rinadigan o'lchamda; zich bo'lsa har N-chisi; qatorlar ajralmasa — faqat tashqi qator
    every = 1
    drawn: list[tuple[float, float, float]] = []  # (x, y, burchak) — 1-qator
    if h and hi:
        hr = max(MIN_HOLE_R * 0.8, (h["dia"] / 2) * k)
        every = max(1, math.ceil((hr * 2 + 5) / max(hi["step"] * k, 1e-6)))
        rows = h["rows"] if hi["rowPitch"] * k >= hr * 2 + 2 else h["rows"][:1]
        with p.group(fill=C.line, stroke="none"):
            for j, row in enumerate(rows):
                for i, a in enumerate(row["angles"]):
                    if i % every:
                        continue
                    hx, hy = P(row["pcdR"], a0 + a)
                    p.circle(hx, hy, hr)
                    if j == 0:
                        drawn.append((hx, hy, a0 + a))

    # o'q chiziqlari (markazdan uchlarga) va markaz O
    if with_o:
        if not full:
            with p.group(stroke=C.thin, stroke_width=0.8, stroke_dasharray="10 4 2 4", fill="none"):
                p.line(cx0, cy0, i0x, i0y)
                p.line(cx0, cy0, i1x, i1y)
        p.circle(cx0, cy0, 3, fill=C.line)
        p.text(cx0 + 7, cy0 + 16, "O", 12, weight=700, fill=C.line)
    # burchak θ
    if not full:
        if with_o:
            rr = max(26.0, min(Ri * 0.36, 48))
            _arc(p, cx0, cy0, rr, a0, a1, stroke=C.dim, stroke_width=1)
            tx, ty = cx0 + (rr + 15) * math.cos(mid * RAD), cy0 - (rr + 15) * math.sin(mid * RAD)
            p.text(tx, ty + 4, f"θ = {f1(g['angle'])}°", 13, weight=700, fill=C.dim, anchor="middle", halo=True)
        else:
            ix, iy = P(g["r"], mid)
            p.text(ix, iy + 34, f"θ = {f1(g['angle'])}°", 13, weight=700, fill=C.dim, anchor="middle", halo=True)

    # R (tashqi va ichki) — markazdan radial o'lchamlar
    aR = mid + span * 0.22 if not full else 62
    ar = mid - span * 0.30 if not full else 118
    r0 = 0.0 if with_o else max(0.0, Ri - 46)
    _radial(p, cx0, cy0, r0, Ro, aR, f"R {uzs(jround(g['R']))}", Ro - 0.3 * (Ro - Ri))
    if g["r"] > 0:
        _radial(
            p,
            cx0,
            cy0,
            r0,
            Ri,
            ar,
            f"R {uzs(jround(g['r']))}",
            max(r0 + 0.5 * (Ri - r0), Ri * 0.74) if with_o else Ri - 22,
        )
    if not with_o:
        for a in (aR, ar):
            bx, by = cx0 + r0 * math.cos(a * RAD), cy0 - r0 * math.sin(a * RAD)
            p.line(bx - 5, by - 5, bx + 5, by + 5, stroke=C.dim, stroke_width=1)

    # yoy uzunliklari — konsentrik o'lcham yoylari
    if not full:
        _arc_dim(
            p,
            cx0,
            cy0,
            Ro,
            Ro + 22,
            a0,
            a1,
            _tr(m, f"tashqi yoy L = {uzs(jround(g['outerArc']))}", f"наружная дуга L = {uzs(jround(g['outerArc']))}"),
            True,
        )
        if (Ro - Ri) > 60 and Ri > 20:
            _arc_dim(
                p,
                cx0,
                cy0,
                Ri,
                Ri + 14,
                a0,
                a1,
                _tr(m, f"ichki yoy l = {uzs(jround(g['innerArc']))}", f"внутр. дуга l = {uzs(jround(g['innerArc']))}"),
                False,
            )

    # eni B — chekka bo'ylab radial o'lcham
    b_txt = _tr(m, f"eni B = {uzs(jround(g['R'] - g['r']))}", f"ширина B = {uzs(jround(g['R'] - g['r']))}")
    ab = a0 if not full else -28
    ax, ay = P(g["r"], ab)
    bx, by = P(g["R"], ab)
    nx, ny = math.cos((ab - 90) * RAD), -math.sin((ab - 90) * RAD)
    off = 22 if not full else 0
    with p.group(stroke=C.dim, stroke_width=1):
        p.line(ax + nx * off, ay + ny * off, bx + nx * off, by + ny * off)
        if off:
            p.line(ax + nx * 4, ay + ny * 4, ax + nx * (off + 6), ay + ny * (off + 6), opacity=0.6)
            p.line(bx + nx * 4, by + ny * 4, bx + nx * (off + 6), by + ny * (off + 6), opacity=0.6)
    ux, uy = (bx - ax), (by - ay)
    ln = math.hypot(ux, uy) or 1
    _arrow(p, bx + nx * off, by + ny * off, ux / ln, uy / ln)
    _arrow(p, ax + nx * off, ay + ny * off, -ux / ln, -uy / ln)
    p.text(
        (ax + bx) / 2 + nx * (off + 16),
        (ay + by) / 2 + ny * (off + 16) + 4,
        b_txt,
        12.5,
        weight=700,
        fill=C.dim,
        anchor="middle",
        halo=True,
    )

    # bitta teshik chiqarma yozuvi + "A" detal belgisi
    if h and hi and drawn:
        want = (a0 + span * 0.14) if not full else 30
        hx, hy, ha = min(drawn, key=lambda q: abs(q[2] - want))
        ux, uy = math.cos(ha * RAD), -math.sin(ha * RAD)
        ext = (g["R"] - h["pcdR"]) * k + 52
        ex, ey = hx + ux * ext, hy + uy * ext
        lab1 = f"{uzs(hi['total'])} × Ø{f1(hi['dia'])}"
        sw = len(lab1) * 8 + 10
        sx = ex - sw if ux < 0 else ex + sw
        sec = lay["sec"]
        if sx < sec.x + 8 or sx > sec.x + sec.w - 8:
            sx = ex + sw if sx < ex else ex - sw
        with p.group(stroke=C.dim, stroke_width=0.9, fill="none"):
            p.line(hx, hy, ex, ey)
            p.line(ex, ey, sx, ey)
        p.circle(hx, hy, 2.2, fill=C.dim)
        tx = (ex + sx) / 2
        p.text(tx, ey - 5, lab1, 13, weight=700, fill=C.dim, anchor="middle", halo=True)
        if lay["det"]:
            a_d = (a1 - span * 0.13) if not full else 160
            vr = h["pcdR"] - (hi["rows"] - 1) * hi["rowPitch"] / 2
            dx, dy = P(vr, a_d)
            cr = max(16.0, min(26.0, (g["R"] - g["r"]) * k * 0.45))
            p.circle(dx, dy, cr, fill="none", stroke=C.line, stroke_width=1, stroke_dasharray="5 3")
            ux, uy = math.cos(a_d * RAD), -math.sin(a_d * RAD)
            p.text(
                dx + ux * (cr + 14),
                dy + uy * (cr + 14) + 6,
                "A",
                16,
                weight=700,
                fill=C.line,
                anchor="middle",
                halo=True,
            )

    dim_x(
        p,
        left,
        left + Wd,
        top - 72,
        _tr(m, f"gabarit {uzs(jround(F['maxX'] - F['minX']))}", f"габарит {uzs(jround(F['maxX'] - F['minX']))}"),
    )
    dim_y(p, top, bottom, left - 44, uzs(jround(sb["maxY"] - sb["minY"])))
    foot: list[str] = []
    if h and hi:
        base = _tr(
            m,
            f"Teshiklar: {uzs(hi['total'])} ta Ø{f1(hi['dia'])}, qadam {f1(hi['step'])} mm",
            f"Отверстия: {uzs(hi['total'])} шт Ø{f1(hi['dia'])}, шаг {f1(hi['step'])} мм",
        )
        rows_hidden = len(h["rows"]) > 1 and hi["rowPitch"] * k < max(MIN_HOLE_R * 0.8, (h["dia"] / 2) * k) * 2 + 2
        if every > 1:
            base += _tr(
                m,
                f" — hammasi ko'rsatilmagan (har {every}-chisi; joylashuvi — A detalda)",
                f" — показаны не все (каждое {every}-е; расположение — вид A)",
            )
        elif rows_hidden:
            base += _tr(
                m,
                " — faqat tashqi qator ko'rsatilgan (qatorlar — A detalda)",
                " — показан только наружный ряд (ряды — вид A)",
            )
        foot.append(base)
    foot += [f"⚠ {t}" for t in notes]
    for i, t in enumerate(foot):
        p.text(
            zm.x + 14, zm.y + zm.h - 12 - (len(foot) - 1 - i) * 15, t, 11.5, fill=C.dim if t.startswith("⚠") else C.thin
        )

    if h and hi and lay["det"]:
        with p.group(data_view="detail"):
            _curve_detail(p, m, g, hi, lay["det"], lay["wide"])

    area = ((g["R"] * g["R"] - g["r"] * g["r"]) * g["angle"] * RAD) / 2 / 1e6
    lines: list[str | None] = [
        "§" + _tr(m, "BUKILGAN LENTA", "ГНУТАЯ ЛЕНТА"),
        f"  {m['belt']['name']}",
        f"  {_tr(m, 'Qalinligi', 'Толщина')}: {f1(m['belt']['thickness'])} mm" if m["belt"]["thickness"] else None,
        f"  {_tr(m, 'Tashqi radius R', 'Наружный радиус R')}: {uzs(jround(g['R']))} mm",
        f"  {_tr(m, 'Ichki radius R', 'Внутренний радиус R')}: {uzs(jround(g['r']))} mm",
        f"  {_tr(m, 'Eni B = R − r', 'Ширина B = R − r')}: {_g1(g['R'] - g['r'])} mm",
        f"  {_tr(m, 'Burchak θ', 'Угол θ')}: {f1(g['angle'])}°",
        f"  {_tr(m, 'Tashqi diametr', 'Наружный диаметр')}: Ø{uzs(jround(g['R'] * 2))} mm",
        f"  {_tr(m, 'Ichki diametr', 'Внутренний диаметр')}: Ø{uzs(jround(g['r'] * 2))} mm",
        f"  {_tr(m, 'Tashqi yoy L', 'Наружная дуга L')}: {uzs(jround(g['outerArc']))} mm",
        f"  {_tr(m, 'Ichki yoy l', 'Внутренняя дуга l')}: {uzs(jround(g['innerArc']))} mm",
        f"  {_tr(m, 'O`rta chiziq', 'Средняя линия').replace('`', chr(39))}: {uzs(jround(m['belt']['length']))} mm",
        f"  {_tr(m, 'Maydon', 'Площадь')}: {f1(area)} m²",
        " ",
        "§" + _tr(m, "PERFORATSIYA", "ПЕРФОРАЦИЯ"),
        (
            f"  {uzs(hi['total'])} {_tr(m, 'ta', 'шт')} · Ø {f1(hi['dia'])} mm"
            if hi
            else f"  {_tr(m, 'yo`q', 'нет').replace('`', chr(39))}"
        ),
        f"  {_tr(m, 'Tashqi chetdan', 'От наружного края')}: {f1(hi['edge'])} mm" if hi else None,
        f"  {_tr(m, 'Qadam (yoy bo`ylab)', 'Шаг (по дуге)').replace('`', chr(39))}: {f1(hi['step'])} mm"
        if hi
        else None,
        (
            f"  {_tr(m, 'Qatorlar', 'Рядов')}: {hi['rows']} · {_tr(m, 'orasi', 'шаг')} {f1(hi['rowPitch'])} mm"
            f"{_tr(m, ' · shaxmat', ' · шахматный') if hi['stagger'] else ''}"
        )
        if hi and hi["rows"] > 1
        else None,
        *([" ", "§" + _tr(m, "ULANISH", "СОЕДИНЕНИЕ"), f"  {m['join']}"] if m["join"] else []),
        " ",
        _tr(m, "O'lchamlar mm da · kesish: keyingi list", "Размеры в мм · раскрой: следующий лист"),
    ]
    zone(p, Z["spec"], _tr(m, "Texnik tavsif", "Техническое описание"))
    info_fit(p, Z["spec"], lines)


def _curve_detail(p: Pen, m: dict, g: dict, hi: dict, box: Box, wide: bool) -> None:
    """ "A" — tashqi chet yonidagi teshiklar kattalashtirilgan (yoy to'g'rilangan): barcha o'lchamlar chiziqlar bilan."""
    step, edge, dia, rows, rp = hi["step"], hi["edge"], hi["dia"], hi["rows"], hi["rowPitch"]
    B = g["R"] - g["r"]
    show_rows = min(rows, 3)
    last_v = edge + (show_rows - 1) * rp
    near = last_v + max(3 * dia, 0.8 * step, 20) >= B
    depth = B if near else last_v + max(2.2 * dia, 0.45 * step, 12)
    s0 = hi["first"]
    span_u = s0 + (2.6 if wide else 2.2) * step
    if wide:
        p.line(
            box.x + 14,
            box.y + 2,
            box.x + box.w - 14,
            box.y + 2,
            stroke=C.thin,
            stroke_width=0.6,
            stroke_dasharray="4 3",
        )
        draw = Box(box.x + 96, box.y + 92, min(box.w * 0.52, 470) - 96, box.h - 92 - 52)
        text_x, text_y = box.x + min(box.w * 0.52, 470) + 40, box.y + 46
    else:
        draw = Box(box.x + 64, box.y + 100, box.w - 92, 170)
        text_x, text_y = box.x + 10, box.y + 100 + 170 + 92
    kd = _nice(min(draw.w / span_u, draw.h / depth, 40))
    x0, y0 = draw.x, draw.y
    wpx, hpx = span_u * kd, depth * kd
    title_y = box.y + 26 if wide else box.y + 22
    p.text(
        box.x + 14,
        title_y,
        _tr(
            m, f"A ({_scale_txt(kd / 4)}) — teshiklar joylashuvi", f"A ({_scale_txt(kd / 4)}) — расположение отверстий"
        ),
        14,
        weight=700,
        fill=C.line,
    )
    p.text(
        box.x + 14,
        title_y + 16,
        _tr(m, "tashqi chet yoni, yoy to'g'rilangan holda", "у наружного края, дуга выпрямлена"),
        11,
        fill=C.thin,
    )

    p.rect(x0, y0, wpx, hpx, fill=C.belt, fill_opacity=0.1, stroke="none")
    with p.group(stroke=C.line, stroke_width=1.6):
        p.line(x0, y0, x0 + wpx, y0)  # tashqi chet
        p.line(x0, y0, x0, y0 + hpx)  # boshlanish (radial kesik) cheti
        if near:
            p.line(x0, y0 + hpx, x0 + wpx, y0 + hpx)  # ichki chet
    break_v(p, x0 + wpx, y0, y0 + hpx, ext=6, amp=7)
    if not near:
        break_line_h(p, y0 + hpx, x0, x0 + wpx, over=4)
    hr = max(3.0, dia / 2 * kd)
    pts: dict[int, list[float]] = {}
    for j in range(show_rows):
        yy = y0 + (edge + j * rp) * kd
        shift = step / 2 if hi["stagger"] and j % 2 == 1 else 0
        us = [s0 + shift + i * step for i in range(4)]
        pts[j] = []
        for u in us:
            xx = x0 + u * kd
            if xx + hr > x0 + wpx - 8:
                continue
            p.circle(xx, yy, hr, fill=C.line)
            with p.group(stroke=C.thin, stroke_width=0.45, stroke_dasharray="6 2 1.5 2"):
                p.line(xx - hr - 5, yy, xx + hr + 5, yy)
                p.line(xx, yy - hr - 5, xx, yy + hr + 5)
            pts[j].append(xx)
    row_y = [y0 + (edge + j * rp) * kd for j in range(show_rows)]
    p0 = pts.get(0, [])
    # yuqorida: boshlanish chetidan 1-teshikkacha va qadam (yoy bo'ylab)
    if p0:
        xs = [x0, *p0[:2]]
        with p.group(stroke=C.dim, stroke_width=0.6, opacity=0.6):
            for x in xs[1:]:
                p.line(x, row_y[0] - hr - 2, x, y0 - 24)
        dim_chain(p, xs, [f1(s0), f1(step)][: len(xs) - 1], y0 - 18, up=True)
        # Ø chiqarma
        hx = p0[min(2, len(p0) - 1)]
        lx = min(hx + 30, box.x + box.w - 52)
        with p.group(stroke=C.dim, stroke_width=0.9):
            p.line(hx + hr * 0.7, row_y[0] - hr * 0.7, lx, y0 - 34)
            p.line(lx, y0 - 34, lx + 32, y0 - 34)
        p.text(lx + 4, y0 - 38, f"Ø{f1(dia)}", 13, weight=700, fill=C.dim)
    # chapda: tashqi chetdan markazgacha, qatorlar orasi, ichki chetgacha
    ys = [y0, *row_y]
    labels = [f1(edge)] + [f1(rp)] * (len(row_y) - 1)
    if near:
        ys.append(y0 + hpx)
        labels.append(f1(B - last_v))
    with p.group(stroke=C.dim, stroke_width=0.6, opacity=0.6):
        for y in row_y:
            p.line(x0 + (p0[0] - x0 if p0 else 0) - hr - 2, y, x0 - 24, y)
    vchain(p, x0 - 18, ys, labels, last_below=True)
    # pastda: shaxmat siljishi
    yb = y0 + hpx + (22 if near else 28)
    if hi["stagger"] and len(pts.get(1, [])) and p0:
        xa, xb = p0[0], pts[1][0]
        with p.group(stroke=C.dim, stroke_width=0.6, opacity=0.6):
            p.line(xa, row_y[0] + hr + 2, xa, yb + 5)
            p.line(xb, row_y[1] + hr + 2, xb, yb + 5)
        dim_x(p, xa, xb, yb, f1(step / 2), up=False)
    inner_txt = _tr(m, f"ichki chetgacha {uzs(jround(B - last_v))} mm", f"до внутр. края {uzs(jround(B - last_v))} мм")
    if not near:
        p.text(
            x0 + wpx / 2,
            (yb + 34) if hi["stagger"] and rows > 1 else y0 + hpx + 20,
            inner_txt,
            11,
            fill=C.thin,
            anchor="middle",
        )

    lines = [
        _tr(
            m,
            f"Teshik Ø{f1(dia)} mm — jami {uzs(hi['total'])} ta",
            f"Отверстие Ø{f1(dia)} мм — всего {uzs(hi['total'])} шт",
        ),
        _tr(m, f"Tashqi chetdan teshik markazigacha: {f1(edge)} mm", f"От наружного края до центра: {f1(edge)} мм"),
        _tr(
            m,
            f"Ichki chetdan oxirgi qatorgacha: {_g1(B - (edge + (rows - 1) * rp))} mm",
            f"От внутреннего края до посл. ряда: {_g1(B - (edge + (rows - 1) * rp))} мм",
        ),
        _tr(
            m,
            f"Qadam yoy bo'ylab: {f1(step)} mm (har {_f3(hi['dphi'])}°)",
            f"Шаг по дуге: {f1(step)} мм (через {_f3(hi['dphi'])}°)",
        ),
        _tr(m, f"1-teshik boshlanish chetidan: {f1(s0)} mm", f"1-е отверстие от торца: {f1(s0)} мм"),
        (
            _tr(m, f"Qatorlar: {rows} · orasi {f1(rp)} mm", f"Рядов: {rows} · шаг {f1(rp)} мм")
            + (_tr(m, " · shaxmat (½ qadam)", " · шахматный (½ шага)") if hi["stagger"] else "")
        )
        if rows > 1
        else _tr(m, "Qatorlar: 1", "Рядов: 1"),
        _tr(m, "O'lchamlar haqiqiy, mm", "Размеры действительные, мм"),
    ]
    lh = 17
    max_chars = int((box.x + box.w - text_x - 8) / (12 * 0.53))
    yy = text_y
    for i, t in enumerate(lines):
        for part in wrap_line(t, max_chars):
            p.text(
                text_x + (0 if part == part.lstrip() else 6),
                yy,
                part.strip(),
                12 if i else 12.5,
                weight=700 if i == 0 else 400,
                fill=C.line if i == 0 else C.thin,
            )
            yy += lh


# ------------------------------------------------------------------ 2-list: kesish shabloni
def _sector_path(cx: float, cy: float, k: float, R: float, r: float, a0: float, a1: float) -> list[tuple]:
    def P(rr: float, a: float) -> tuple[float, float]:
        return (cx + rr * k * math.cos(a * RAD), cy - rr * k * math.sin(a * RAD))

    large = 1 if a1 - a0 > 180 else 0
    o0, o1, i1, i0 = P(R, a0), P(R, a1), P(r, a1), P(r, a0)
    if r <= 0:
        return [("M", *o0), ("A", R * k, R * k, 0, large, 0, *o1), ("L", cx, cy), ("Z",)]
    return [
        ("M", *o0),
        ("A", R * k, R * k, 0, large, 0, *o1),
        ("L", *i1),
        ("A", r * k, r * k, 0, large, 1, *i0),
        ("Z",),
    ]


def _table(
    p: Pen, x: float, y: float, widths: list[float], head: list[str], rows: list[list[str]], lh: float = 18
) -> float:
    """Oddiy jadval; qaytaradi: pastki y."""
    W = sum(widths)
    n = len(rows) + 1
    p.rect(x, y, W, lh * n, fill="none", stroke=C.line, stroke_width=0.9)
    p.rect(x, y, W, lh, fill=C.guide, fill_opacity=0.35, stroke=C.line, stroke_width=0.9)
    with p.group(stroke=C.line, stroke_width=0.5):
        for i in range(1, n):
            p.line(x, y + i * lh, x + W, y + i * lh)
        cx = x
        for w in widths[:-1]:
            cx += w
            p.line(cx, y, cx, y + lh * n)
    for ri, row in enumerate([head, *rows]):
        cx = x
        for w, t in zip(widths, row):
            p.text(
                cx + w / 2,
                y + ri * lh + lh * 0.7,
                t,
                11.5,
                weight=700 if ri == 0 else 400,
                fill=C.line if ri == 0 else C.thin,
                anchor="middle",
            )
            cx += w
    return y + lh * n


def cut_sheet(p: Pen, m: dict, n: int) -> None:
    g = m["curve"]
    Z = SIDE_ZONES
    cp = cut_plan(g)
    h = g.get("holes")
    hi = hole_info(g)
    Rt, rt = uzs(jround(g["R"])), uzs(jround(g["r"]))
    zone(p, Z["info"], _tr(m, f"{n}. Kesish shabloni", f"{n}. Шаблон раскроя"))
    rings = cp["rings"]
    if cp["pieces"] == 1:
        fit = [_tr(m, "✓ Rulonga sig'adi — 1 bo'lak, ulashsiz", "✓ Помещается — 1 часть, без стыков")]
    elif cp["pieces"]:
        fit = [
            _tr(
                m, f"⚠ Bitta bo'lakdan chiqmaydi: {cp['pieces']} bo'lak", f"⚠ Целиком не выходит: {cp['pieces']} частей"
            )
        ]
        if len(rings) > 1:
            fit.append(
                _tr(
                    m,
                    f"  {len(rings)} halqa, har biri eni {uzs(jround(rings[0]['B']))} mm "
                    f"({cp['ringJoints']} ta aylana bo'ylab ulash)",
                    f"  {len(rings)} кольца шириной {uzs(jround(rings[0]['B']))} мм ({cp['ringJoints']} стык по дуге)",
                )
            )
        if cp["radialJoints"]:
            fit.append(_tr(m, f"  {cp['radialJoints']} ta radial ulash", f"  {cp['radialJoints']} радиальных стыка"))
    else:
        fit = [
            _tr(
                m, "⚠ Rulondan kesib bo'lmaydi — o'lchamlarni tekshiring", "⚠ Из рулона не вырезать — проверьте размеры"
            )
        ]
    lines: list[str | None] = [
        "§" + _tr(m, "ZAGOTOVKA", "ЗАГОТОВКА"),
        _tr(m, "Tekis lentadan kesiladigan halqa bo'lagi", "Кольцевой сектор из плоской ленты"),
        f"{_tr(m, 'Gabarit', 'Габарит')}: {uzs(jround(cp['blankW']))} × {uzs(jround(cp['blankH']))} mm",
        _tr(m, "  (vatar × balandlik)", "  (хорда × высота)"),
        f"R {Rt} · R {rt} · B {uzs(jround(cp['B']))} · θ {f1(g['angle'])}°",
        f"{_tr(m, 'Rulon eni', 'Ширина рулона')}: {uzs(cp['roll'])} mm {_tr(m, '(taxminiy)', '(ориент.)')}",
        *fit,
        (f"{_tr(m, 'Rulon sarfi ≈', 'Расход рулона ≈')} {uzs(jround(cp['rollLen']))} mm" if cp["rollLen"] else None),
        " ",
        "§" + _tr(m, "QANDAY O'QILADI", "КАК ЧИТАТЬ"),
        _tr(m, "O — markaz: hamma radiuslar shundan", "O — центр: все радиусы от него"),
        _tr(m, f"R {Rt} — O dan tashqi chetgacha", f"R {Rt} — от O до наружного края"),
        _tr(m, f"R {rt} — O dan ichki chetgacha", f"R {rt} — от O до внутреннего края"),
        _tr(m, "B — lenta eni (tashqi R − ichki R)", "B — ширина ленты (нар. R − внутр. R)"),
        _tr(m, "θ — burilish burchagi (ikki radial kesik orasi)", "θ — угол поворота (между торцами)"),
        _tr(m, "s — boshlanish kesigidan yoy bo'ylab", "s — от начального торца по дуге"),
        " ",
        "§" + _tr(m, "QANDAY BELGILANADI", "КАК РАЗМЕТИТЬ"),
        _tr(m, "1) O nuqtani belgilang", "1) Отметьте центр O"),
        _tr(m, f"2) O dan R {Rt} va R {rt} yoylarini chizing", f"2) Из O дуги R {Rt} и R {rt}"),
        _tr(m, f"3) θ = {f1(g['angle'])}° li ikki radial chiziq", f"3) Два радиуса под углом θ = {f1(g['angle'])}°"),
        _tr(m, "4) Teshiklar — jadval bo'yicha (θ, R)", "4) Отверстия — по таблице (θ, R)") if h else None,
    ]
    info_fit(p, Box(Z["info"].x, Z["info"].y + 14, Z["info"].w, Z["info"].h - 14), lines, top=40)

    zone(p, Z["main"])
    zb = Z["main"]
    p.text(
        zb.x + 16,
        zb.y + 26,
        _tr(
            m, "Rulonga joylash (taxminiy, joylashtirish optimallashtirilmagan)", "Раскладка на рулоне (ориентировочно)"
        ),
        13,
        weight=600,
        fill=C.line,
    )
    table = curve_hole_table(g, per_row=4 if hi and hi["rows"] > 1 else 6, max_rows=2)
    table_h = (len(table) + 1) * 18 + 30 if table else 0
    strips_top = zb.y + 48
    strips_bot = zb.y + zb.h - 70 - table_h
    if rings:
        gap = cp["gap"]
        lens = [q["n"] * q["along"] + (q["n"] - 1) * gap for q in rings]
        draw_len = [max(L_, cp["roll"] * 1.3) for L_ in lens]
        per_h = (strips_bot - strips_top) / len(rings)
        k = min((zb.w - 260) / max(draw_len), (per_h - 62) / cp["roll"])
        every = 1
        if hi:
            every = max(1, math.ceil((MIN_HOLE_R * 1.6 + 4) / max(hi["step"] * k, 1e-6)))
        y = strips_top
        for ri, q in enumerate(rings):
            sx = zb.x + 110
            sy = y + 24
            sh = cp["roll"] * k
            sw = draw_len[ri] * k
            label = (
                _tr(
                    m,
                    f"{ri + 1}-halqa: R {uzs(jround(q['R']))} … R {uzs(jround(q['r']))}, {q['n']} × {f1(q['phi'])}°",
                    f"Кольцо {ri + 1}: R {uzs(jround(q['R']))} … R {uzs(jround(q['r']))}, {q['n']} × {f1(q['phi'])}°",
                )
                if len(rings) > 1
                else _tr(
                    m,
                    f"{q['n']} × {f1(q['phi'])}° — R {uzs(jround(q['R']))} … R {uzs(jround(q['r']))}",
                    f"{q['n']} × {f1(q['phi'])}° — R {uzs(jround(q['R']))} … R {uzs(jround(q['r']))}",
                )
            )
            p.text(sx, y + 14, label, 12, weight=600, fill=C.line)
            p.rect(
                sx, sy, sw, sh, fill=C.guide, fill_opacity=0.16, stroke=C.thin, stroke_width=0.9, stroke_dasharray="8 4"
            )
            break_v(p, sx + sw, sy, sy + sh, ext=6, amp=7)
            p.text(sx + sw - 6, sy + sh + 14, _tr(m, "rulon →", "рулон →"), 10.5, fill=C.thin, anchor="end")
            x0b, x1b, y0b, y1b = q["bounds"]
            for i in range(q["n"]):
                off = i * (q["along"] + gap)
                ox = sx + (off - x0b) * k
                oy = sy + sh - ((cp["roll"] - q["across"]) / 2 - y0b) * k
                pa0, pa1 = q["amid"] - q["phi"] / 2, q["amid"] + q["phi"] / 2
                p.path(
                    _sector_path(ox, oy, k, q["R"], q["r"], pa0, pa1),
                    fill=C.belt,
                    fill_opacity=0.18,
                    stroke=C.line,
                    stroke_width=1.3,
                )
                # teshiklar shu bo'lakka tushganlari
                if h and hi:
                    hr = max(MIN_HOLE_R * 0.7, h["dia"] / 2 * k)
                    lo, hi_a = i * q["phi"], (i + 1) * q["phi"]  # burchak boshlanish kesigidan
                    with p.group(fill=C.line, stroke="none"):
                        for row in h["rows"][:1]:
                            if not (q["r"] < row["pcdR"] < q["R"]):
                                continue
                            for j, a in enumerate(row["angles"]):
                                if j % every or not (lo - 1e-9 <= a < hi_a - 1e-9):
                                    continue
                                la = pa0 + (a - lo)
                                p.circle(
                                    ox + row["pcdR"] * k * math.cos(la * RAD),
                                    oy - row["pcdR"] * k * math.sin(la * RAD),
                                    hr,
                                )
                mx = ox + (q["R"] + q["r"]) / 2 * k * math.cos(q["amid"] * RAD)
                my = oy - (q["R"] + q["r"]) / 2 * k * math.sin(q["amid"] * RAD)
                p.text(
                    mx,
                    my + 5,
                    f"{ri + 1}.{i + 1}" if len(rings) > 1 else f"{i + 1}",
                    13,
                    weight=700,
                    fill=C.line,
                    anchor="middle",
                    halo=True,
                )
            # o'lchamlar (1-bo'lak): rulon bo'ylab uzunligi, eni bo'ylab balandligi; rulon eni
            px0 = sx + 0
            dim_x(p, px0, px0 + q["along"] * k, sy + sh + 20, uzs(jround(q["along"])), up=False)
            ptop = sy + sh - ((cp["roll"] - q["across"]) / 2 + q["across"]) * k
            pbot = sy + sh - ((cp["roll"] - q["across"]) / 2) * k
            dim_y(p, ptop, pbot, sx - 14, uzs(jround(q["across"])))
            with p.group(stroke=C.dim, stroke_width=1.1, fill="none"):
                xr = sx + sw + 26
                p.line(xr, sy, xr, sy + sh)
                p.line(xr - 5, sy, xr + 5, sy)
                p.line(xr - 5, sy + sh, xr + 5, sy + sh)
            p.text(
                sx + sw + 33,
                sy + sh / 2 + 4,
                _tr(m, f"rulon {uzs(cp['roll'])}", f"рулон {uzs(cp['roll'])}"),
                12,
                weight=600,
                fill=C.dim,
            )
            y += min(per_h, sh + 96)
    else:
        note_box(
            p,
            zb.x + zb.w / 2,
            (strips_top + strips_bot) / 2,
            [
                _tr(
                    m,
                    f"Eni B = {uzs(jround(cp['B']))} mm — rulondan kesish rejasi tuzilmadi; o'lchamlarni tekshiring",
                    f"Ширина B = {uzs(jround(cp['B']))} мм — раскрой не построен; проверьте размеры",
                )
            ],
            zb.w - 80,
            color=C.dim,
        )

    if table:
        ty = zb.y + zb.h - 60 - table_h + 22
        p.text(
            zb.x + 16,
            ty - 8,
            _tr(m, "Teshiklar (birinchilari) — O markazdan", "Отверстия (первые) — от центра O"),
            12.5,
            weight=700,
            fill=C.line,
        )
        multi = hi and hi["rows"] > 1
        head = ["№", *([_tr(m, "qator", "ряд")] if multi else []), "θ, °", "R, mm", "s, mm"]
        widths = [36, *([50] if multi else []), 84, 84, 84]
        rows = [
            [str(t["no"]), *([str(t["row"])] if multi else []), _f3(t["angle"]), _g1(t["radius"]), _g1(t["arc"])]
            for t in table
        ]
        _table(p, zb.x + 16, ty, widths, head, rows)
        tx = zb.x + 16 + sum(widths) + 24
        info = [
            _tr(m, "θ — boshlanish kesigidan burchak", "θ — угол от начального торца"),
            _tr(m, "R — O markazdan teshik markazigacha", "R — от центра O до центра отверстия"),
            _tr(m, "s — kesikdan yoy bo'ylab (R da)", "s — от торца по дуге (на радиусе R)"),
            _tr(
                m,
                f"… keyingilari har {_f3(hi['dphi'])}° ({f1(hi['step'])} mm), jami {uzs(hi['total'])} ta",
                f"… далее через {_f3(hi['dphi'])}° ({f1(hi['step'])} мм), всего {uzs(hi['total'])} шт",
            )
            if hi
            else None,
        ]
        for i, t in enumerate([t for t in info if t]):
            p.text(tx, ty + 14 + i * 18, t, 11.5, fill=C.thin)
    note_box(
        p,
        zb.x + zb.w / 2,
        zb.y + zb.h - 26,
        [
            _tr(
                m,
                "Kesishdan oldin R va θ ni shablon bo'yicha tekshiring; rulon enini ombordan aniqlang.",
                "Перед раскроем проверьте R и θ по шаблону; ширину рулона уточните на складе.",
            )
        ],
        zb.w - 60,
        fs=11.5,
    )

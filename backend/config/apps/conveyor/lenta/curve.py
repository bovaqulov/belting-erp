"""BUKILGAN (burilish) lenta — halqa bo'lagi. `lib/curve.ts` nusxasi.

`width` — radial en, `length` — o'rta chiziq yoyi, `bendAngle` — θ (°).
R_o'rta = L/θ, R = R_o'rta + B/2, r = R_o'rta − B/2. Narx o'zgarmaydi (eni × uzunligi).
"""

from __future__ import annotations

import math
from typing import Any

from ._js import jfloor, jmax, jmin, jround

MAX_CURVE_HOLES = 5000


def _rad(deg: float) -> float:
    return (deg * math.pi) / 180


def is_curve(s: dict[str, Any]) -> bool:
    """Bukilgan lentami (bendAngle > 0)."""
    return s["bendAngle"] > 0


def curve_geom(s: dict[str, Any]) -> dict[str, Any] | None:
    """Bukilgan lenta geometriyasi; to'g'ri lenta yoki noto'g'ri o'lcham — None."""
    angle = jmin(360, s["bendAngle"])
    if not (angle > 0) or not (s["width"] > 0) or not (s["length"] > 0):
        return None
    mid = s["length"] / _rad(angle)
    R = mid + s["width"] / 2
    r = mid - s["width"] / 2
    if r < 0:
        return None
    n = int(jmin(MAX_CURVE_HOLES, jmax(0, jfloor(s["curveHoleCount"]))))
    k = int(jmax(1, jfloor(s["curveHoleRows"])))
    pcd_r = R - s["curveHoleEdge"]
    inner = pcd_r - (k - 1) * jmax(0, s["curveHoleRowPitch"])
    rows: list[dict[str, Any]] = []
    left = MAX_CURVE_HOLES
    j = 0
    while j < k and left > 0:
        shift = bool(s["curveHoleStagger"]) and j % 2 == 1
        m = int(jmin(left, (n if angle >= 359.999 else n - 1) if shift else n))
        if m > 0:
            off = 1 if shift else 0.5
            rows.append(
                {
                    "pcdR": pcd_r - j * s["curveHoleRowPitch"],
                    "angles": [(angle * (i + off)) / n for i in range(m)],
                }
            )
            left -= m
        j += 1
    holes = None
    if n > 0 and rows and inner > r and pcd_r < R and s["curveHoleDia"] > 0:
        holes = {
            "pcdR": pcd_r,
            "dia": s["curveHoleDia"],
            "angles": rows[0]["angles"],
            "rows": rows,
            "total": sum(len(q["angles"]) for q in rows),
        }
    return {"R": R, "r": r, "angle": angle, "outerArc": _rad(angle) * R, "innerArc": _rad(angle) * r, "holes": holes}


def sector_bounds(g: dict[str, Any]) -> dict[str, float]:
    """Halqa bo'lagining gabariti (burchak o'rtasi tepaga qaragan)."""
    a0 = 90 - g["angle"] / 2
    a1 = 90 + g["angle"] / 2
    angs = [a0, a1]
    for k in range(-360, 721, 90):
        if a0 < k < a1:
            angs.append(k)
    xs: list[float] = []
    ys: list[float] = []
    for a in angs:
        for rr in (g["R"], g["r"]):
            xs.append(rr * math.cos(_rad(a)))
            ys.append(rr * math.sin(_rad(a)))
    return {"minX": jmin(*xs), "maxX": jmax(*xs), "minY": jmin(*ys), "maxY": jmax(*ys), "a0": a0, "a1": a1}


def curve_holes_overlap(s: dict[str, Any]) -> bool:
    """Teshiklar bir-birining ustiga chiqadimi (yoy bo'ylab yoki qatorlar orasida)."""
    g = curve_geom(s)
    if not g or not g["holes"]:
        return False
    n = jmax(1, jfloor(s["curveHoleCount"]))
    rad1 = g["angle"] * (math.pi / 180)
    d = g["holes"]["dia"]
    step = (g["holes"]["rows"][-1]["pcdR"] * rad1) / n
    if n > 1 and step < d:
        return True
    if len(g["holes"]["rows"]) < 2:
        return False
    dr = s["curveHoleRowPitch"]
    gap = math.hypot(dr, step / 2) if s["curveHoleStagger"] else dr
    return gap < d


def curve_default_holes(s: dict[str, Any]) -> float:
    """Yangi perforatsiya: tashqi chet bo'ylab ~50 mm qadam."""
    g = curve_geom({**s, "curveHoleCount": 0})
    if not g:
        return 0
    arc = (g["R"] - s["curveHoleEdge"]) * g["angle"] * (math.pi / 180)
    return jmax(2, jmin(MAX_CURVE_HOLES, jround(arc / 50)))


def bend_too_tight(s: dict[str, Any]) -> bool:
    """Ichki radius manfiy — lenta shu burchakka bukilmaydi."""
    return (
        is_curve(s)
        and s["width"] > 0
        and s["length"] > 0
        and s["length"] / _rad(jmin(360, s["bendAngle"])) < s["width"] / 2
    )


def from_diameters(outer_d: float, inner_d: float, angle: float) -> dict[str, float]:
    """Tashqi/ichki diametr + burchak -> eni va o'rta chiziq uzunligi."""
    R = outer_d / 2
    r = inner_d / 2
    return {
        "width": jmax(0, jround((R - r) * 10) / 10),
        "length": jmax(0, jround(_rad(angle) * ((R + r) / 2))),
    }


def width_patch(s: dict[str, Any], v: float) -> dict[str, Any]:
    """Lenta enini o'zgartirish: bukilgan lentada TASHQI Ø saqlanadi."""
    g = curve_geom(s) if is_curve(s) and v > 0 else None
    if not g:
        return {"width": v}
    D = g["R"] * 2
    return from_diameters(D, D - 2 * v, g["angle"]) if D - 2 * v >= 0 else {"width": v}


def perf_off_patch(s: dict[str, Any]) -> dict[str, Any]:
    """Perforatsiyani olib tashlash: bukilgan lentada teshiklar soni 0."""
    return {"curveHoleCount": 0} if is_curve(s) else {"perfOn": False}


def apply_curve(s: dict[str, Any]) -> dict[str, Any]:
    """Hisob uchun holat: teshiklar perforatsiyaga aylanadi, profil/gofra/yo'naltiruvchi o'chadi."""
    if not is_curve(s):
        return s
    g = curve_geom(s)
    holes = g["holes"] if g else None
    return {
        **s,
        "guideOn": False,
        "crossOn": False,
        "gofroOn": False,
        "perfOn": bool(holes),
        "perfGrid": False,
        "perfDia": holes["dia"] if holes else s["perfDia"],
        "perfQty": holes["total"] if holes else 0,
    }


# ------------------------------------------------------------------ kesish shabloni (09 §D10, LentaCUD'da yo'q)
DEFAULT_ROLL_WIDTH = 2000  # mm — tekis lenta rulonining taxminiy eni (ombordan aniqlanadi)
CUT_GAP = 50  # mm — rulonda bo'laklar orasidagi zapas
MAX_PIECES_PER_RING = 72


def ring_bounds(R: float, r: float, a0: float, a1: float) -> tuple[float, float, float, float]:
    """Halqa bo'lagi (r..R, a0..a1 gradus, markaz O=(0,0), y tepaga) ning ANIQ gabariti: (minX, maxX, minY, maxY).

    Ekstremumlar faqat burchak chetlarida yoki 0/90/180/270° o'q kesishmalarida (tashqi yoyda) bo'ladi.
    """
    pts: list[tuple[float, float]] = []
    for a in (a0, a1):
        for rr in (R, r):
            pts.append((rr * math.cos(_rad(a)), rr * math.sin(_rad(a))))
    k = math.ceil(a0 / 90 - 1e-12) * 90
    while k < a1 - 1e-12:
        pts.append((R * math.cos(_rad(k)), R * math.sin(_rad(k))))
        k += 90
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), max(xs), min(ys), max(ys)


def _piece_fit(R: float, r: float, phi: float, roll: float) -> dict[str, Any] | None:
    """`phi` burchakli bo'lak rulonga sig'adimi: ikki yo'nalish (vatar rulon bo'ylab / ko'ndalang); qisqasi."""
    best: dict[str, Any] | None = None
    for amid in (90.0, 0.0):  # 90: vatar rulon bo'ylab (gorizontal), 0: vatar rulon eniga
        x0, x1, y0, y1 = ring_bounds(R, r, amid - phi / 2, amid + phi / 2)
        along, across = x1 - x0, y1 - y0  # x — rulon uzunligi bo'ylab, y — rulon eni bo'ylab
        if across <= roll + 1e-6 and (best is None or along < best["along"] - 1e-9):
            best = {"amid": amid, "along": along, "across": across, "bounds": (x0, x1, y0, y1)}
    return best


def cut_plan(g: dict[str, Any], roll: float = DEFAULT_ROLL_WIDTH, gap: float = CUT_GAP) -> dict[str, Any]:
    """Tekis lenta rulonidan halqa bo'lagini kesish rejasi (oddiy, joylashtirish optimallashtirilmagan).

    1) Eni B rulondan katta bo'lsa — teng enli konsentrik halqalarga bo'linadi (aylana bo'ylab ulash).
    2) Har halqa — rulonga sig'adigan eng kam teng burchakli bo'laklarga (radial ulash).
    Qaytaradi: zagotovka gabariti, halqalar, bo'laklar soni, ulashlar soni, rulon uzunligi (taxminiy).
    """
    R, r = g["R"], g["r"]
    ang = min(360.0, g["angle"])
    full = ang >= 359.999
    B = R - r
    x0, x1, y0, y1 = ring_bounds(R, r, 90 - ang / 2, 90 + ang / 2)
    out: dict[str, Any] = {
        "blankW": x1 - x0,
        "blankH": y1 - y0,
        "B": B,
        "roll": roll,
        "gap": gap,
        "angle": ang,
        "full": full,
    }
    rings_n = max(1, math.ceil(B / roll - 1e-9)) if roll > 0 else 1
    while rings_n <= 40 and roll > 0:
        b = B / rings_n
        rings: list[dict[str, Any]] = []
        for i in range(rings_n):
            Ro = R - i * b
            ri = Ro - b
            got = None
            for n in range(1, MAX_PIECES_PER_RING + 1):
                fit = _piece_fit(Ro, ri, ang / n, roll)
                if fit:
                    got = {"R": Ro, "r": ri, "B": b, "n": n, "phi": ang / n, **fit}
                    break
            if not got:
                break
            rings.append(got)
        if len(rings) == rings_n:
            pieces = sum(q["n"] for q in rings)
            radial = sum((q["n"] if full else q["n"] - 1) if q["n"] > 1 else 0 for q in rings)
            roll_len = sum(q["n"] * q["along"] + (q["n"] - 1) * gap for q in rings) + (rings_n - 1) * gap
            return {
                **out,
                "rings": rings,
                "pieces": pieces,
                "radialJoints": radial,
                "ringJoints": rings_n - 1,
                "rollLen": roll_len,
            }
        rings_n += 1
    return {**out, "rings": [], "pieces": None, "radialJoints": 0, "ringJoints": 0, "rollLen": None}


def curve_hole_table(g: dict[str, Any], per_row: int = 4, max_rows: int = 2) -> list[dict[str, Any]]:
    """Birinchi teshiklar jadvali: №, qator, burchak (boshlanish radial chetidan, °), radius, yoy bo'ylab masofa."""
    h = g.get("holes")
    if not h:
        return []
    out: list[dict[str, Any]] = []
    for j, row in enumerate(h["rows"][:max_rows]):
        for a in row["angles"][:per_row]:
            out.append(
                {"no": len(out) + 1, "row": j + 1, "angle": a, "radius": row["pcdR"], "arc": row["pcdR"] * _rad(a)}
            )
    return out

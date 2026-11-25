"""Profil detallari — `drawing/details.tsx` (ProfileDetail, CleatSection) nusxasi (06 §11)."""

from __future__ import annotations

import math

from .._js import js_str
from ..format import f1
from ..specs import SOURCE_LABEL, cleat_outline
from .common import C
from .marks import dim, dim_x, dim_y
from .pen import Pen

COS30 = math.cos(math.pi / 6)


def profile_detail(
    p: Pen, x: float, y: float, name: str, spec: dict, heading: str | None = None, k: float = 4.2
) -> None:
    B = spec["B"] * k
    S = spec["S"] * k
    Hh = spec["H"] * k
    cx = x + 120
    top = y + 44
    p.text(x, y - 16, heading or "3. Profil kesimi", 16, weight=600, fill=C.line)
    p.text(x, y + 5, name, 12.5, weight=600, fill=C.line)
    p.text(x, y + 19, "B — yuqori eni · H — balandligi · S — pastki eni", 10.5, fill=C.thin)
    p.polygon(
        [(cx - B / 2, top), (cx + B / 2, top), (cx + S / 2, top + Hh), (cx - S / 2, top + Hh)],
        fill=C.guide,
        stroke=C.guideEdge,
        stroke_width=1.4,
    )
    dim(p, cx - B / 2, top - 9, cx + B / 2, top - 9, f1(spec["B"]), small=True)
    dim(p, cx - S / 2, top + Hh + 20, cx + S / 2, top + Hh + 20, f1(spec["S"]), small=True)
    with p.group(stroke=C.dim, fill=C.dim, stroke_width=1.25):
        p.line(cx + B / 2 + 16, top, cx + B / 2 + 16, top + Hh)
        p.line(cx + B / 2 + 11, top, cx + B / 2 + 21, top)
        p.line(cx + B / 2 + 11, top + Hh, cx + B / 2 + 21, top + Hh)
        p.text(cx + B / 2 + 28, top + Hh / 2 + 4, f1(spec["H"]), 12, weight=600, stroke="none")
    note = "Tishli (TOOTHED)" if spec.get("toothed") else "Tekis"
    if spec.get("minRoller"):
        note += f" · eng kichik rolik Ø {js_str(spec['minRoller'])} mm"
    p.text(x, top + Hh + 44, note, 12, fill=C.thin)
    if spec.get("src") == "taxminiy":
        p.text(x, top + Hh + 60, "⚠ O'lchami tasdiqlanmagan", 11, fill=C.dim)


def cleat_section(p: Pen, x: float, y: float, name: str, spec: dict, box_h: float = 150) -> None:
    outline = cleat_outline(spec)
    oW = max(q["v"] for q in outline)
    oH = max(q["w"] for q in outline)
    k = min(80 / max(oW, 1), (box_h - 26) / max(oH, 1))
    sx = x + 34
    base = y + 44 + oH * k
    depth = max(oW, oH) * 1.2
    iso_k = min(150 / ((depth + oW) * COS30), (box_h - 10) / ((depth + oW) * 0.5 + oH), k * 0.9)
    iso_x = x + 180 + oW * COS30 * iso_k
    iso_y = y + 30 + oH * iso_k
    iso_bottom = iso_y + (depth + oW) * 0.5 * iso_k
    info_y = max(base + 41, iso_bottom) + 22

    def P(u: float, v: float, w: float) -> tuple[float, float]:
        return (iso_x + (u - v) * COS30 * iso_k, iso_y + ((u + v) * 0.5 - w) * iso_k)

    faces = []
    for i, a in enumerate(outline):
        b = outline[(i + 1) % len(outline)]
        faces.append(
            (
                a["v"] + a["w"] + b["v"] + b["w"],
                [P(0, a["v"], a["w"]), P(depth, a["v"], a["w"]), P(depth, b["v"], b["w"]), P(0, b["v"], b["w"])],
                C.cleat if b["w"] >= a["w"] else C.cleatEdge,
            )
        )
    faces.sort(key=lambda f: f[0])
    end_face = [P(depth, q["v"], q["w"]) for q in outline]

    kind = spec.get("kind")
    kind_label = (
        "X — egilgan kurakcha"
        if kind == "scooped"
        else "W — ilmoqsimon kurakcha"
        if kind == "wave"
        else "V-profil"
        if kind == "vguide"
        else "T — tik tig'"
    )
    p.text(x, y - 16, "Ko'ndalang profil kesimi", 16, weight=600, fill=C.line)
    p.text(x, y, name, 12, weight=600, fill=C.line)
    p.text(x, y + 15, f"{kind_label} · b — asos eni · h — balandligi", 10.5, fill=C.thin)

    p.polygon(
        [(sx + q["v"] * k, base - q["w"] * k) for q in outline],
        fill=C.cleat,
        stroke=C.cleatEdge,
        stroke_width=1.6,
        stroke_linejoin="round",
    )
    p.line(sx - 14, base, sx + oW * k + 20, base, stroke=C.line, stroke_width=1.4)
    dim_y(p, base - oH * k, base, sx - 8, f"h {f1(spec['H'])}")
    dim_x(p, sx, sx + oW * k, base + 26, f"b {f1(spec['B'])}", up=False)

    for _d, pts, col in faces:
        p.polygon(pts, fill=col, stroke=C.line, stroke_width=0.5, stroke_linejoin="round")
    p.polygon(end_face, fill=C.cleat, stroke=C.line, stroke_width=0.7, stroke_linejoin="round")

    if spec.get("minRoller"):
        p.text(x, info_y, f"eng kichik rolik Ø {js_str(spec['minRoller'])} mm", 11, fill=C.thin)
    p.text(x, info_y + 14, f"manba: {SOURCE_LABEL.get(spec.get('src'), '')}", 11, fill=C.thin)

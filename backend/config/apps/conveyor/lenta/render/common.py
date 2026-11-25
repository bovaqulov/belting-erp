"""Varaq geometriyasi va palitra — `drawing/sheet.ts`, `drawing/palette.ts` nusxasi."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .pen import Pen


@dataclass(frozen=True)
class Box:
    x: float
    y: float
    w: float
    h: float


# ------------------------------------------------------------- palitra
DRAW = {"line": "#0f1720", "thin": "#44505f", "dim": "#b22017", "hole": "#ffffff"}


class C:
    line = "#0f1720"
    thin = "#44505f"
    dim = "#b22017"
    hole = "#ffffff"
    belt = "#2f5d7c"
    beltEdge = "#142d3f"
    guide = "#b9c0c8"
    guideEdge = "#4d555e"
    cleat = "#c98b3a"
    cleatEdge = "#6f4916"
    wall = "#4f9d69"
    wallEdge = "#235234"
    paper = "#ffffff"


class ISO:
    line = "#0f1720"
    thin = "#44505f"
    dim = "#b22017"
    hole = "#ffffff"
    beltTop = "#3a6d90"
    beltSide = "#28506b"
    beltEnd = "#1d3c52"
    guideTop = "#cdd4db"
    guideSide = "#9aa4ad"
    guideEnd = "#808a93"
    cleatTop = "#d79b4c"
    cleatSide = "#a97223"
    cleatEnd = "#8c5d1a"
    wallTop = "#5fae79"
    wallSide = "#3d7f55"


# ------------------------------------------------------------- varaq
W = 1188
H = 840
PAD = 22
BRAND_W = 40
CONTENT_X = PAD + BRAND_W
TITLE_H = 132
CONTENT_BOT = H - PAD - TITLE_H

FRAME = Box(CONTENT_X, PAD, W - PAD - CONTENT_X, H - 2 * PAD)

MAIN_HEAD_H = 52
MAIN_ZONE = Box(FRAME.x, FRAME.y + MAIN_HEAD_H, FRAME.w, CONTENT_BOT - FRAME.y - MAIN_HEAD_H)

CS_TOP_H = 250
CS_INFO_W = 300
CS_GUIDE_W = 322
CS_ZONES = {
    "info": Box(FRAME.x, FRAME.y, CS_INFO_W, CS_TOP_H),
    "guide": Box(FRAME.x + CS_INFO_W, FRAME.y, CS_GUIDE_W, CS_TOP_H),
    "cleat": Box(FRAME.x + CS_INFO_W + CS_GUIDE_W, FRAME.y, FRAME.w - CS_INFO_W - CS_GUIDE_W, CS_TOP_H),
    "main": Box(FRAME.x, FRAME.y + CS_TOP_H, FRAME.w, FRAME.h - CS_TOP_H - 30),
}

SIDE_INFO_W = 300
SIDE_ZONES = {
    "info": Box(FRAME.x, FRAME.y, SIDE_INFO_W, FRAME.h - 30),
    "main": Box(FRAME.x + SIDE_INFO_W, FRAME.y, FRAME.w - SIDE_INFO_W, FRAME.h - 30),
}

GEN_SPEC_W = 260
_GEN_LEFT_W = FRAME.w - GEN_SPEC_W
GEN_ZONES = {
    "main": Box(FRAME.x, FRAME.y, _GEN_LEFT_W, CONTENT_BOT - FRAME.y),
    "spec": Box(FRAME.x + _GEN_LEFT_W, FRAME.y, GEN_SPEC_W, CONTENT_BOT - FRAME.y),
}
GEN_MAIN_VIEW = Box(GEN_ZONES["main"].x, GEN_ZONES["main"].y + 30, GEN_ZONES["main"].w, GEN_ZONES["main"].h - 30)

CURVE_ZONES = {
    "main": Box(FRAME.x, FRAME.y, FRAME.w - GEN_SPEC_W, CONTENT_BOT - FRAME.y),
    "spec": Box(FRAME.x + FRAME.w - GEN_SPEC_W, FRAME.y, GEN_SPEC_W, CONTENT_BOT - FRAME.y),
}

NO_SCALE = -1


def is_ok(m: dict) -> bool:
    return m["belt"]["width"] > 0 and m["belt"]["length"] > 0


# ------------------------------------------------------------- umumiy chizish yordamchilari (perf, curve_sheet, spec)
def is_ru(m: dict) -> bool:
    return m.get("_lang") == "ru"


def break_v(p: Pen, x: float, y1: float, y2: float, ext: float = 0, amp: float = 6) -> None:
    """Vertikal uzilish chizig'i (siniqli). ext — uchlari tashqariga uzayishi, amp — siniq kengligi."""
    ym = (y1 + y2) / 2
    p.polyline(
        [(x, y1 - ext), (x, ym - 6), (x - amp, ym - 2), (x + amp, ym + 2), (x, ym + 6), (x, y2 + ext)],
        fill="none",
        stroke=C.line,
        stroke_width=0.8,
    )


def vchain(p: Pen, x: float, ys: list[float], labels: list[str], left: bool = True, last_below: bool = False) -> None:
    """Vertikal o'lcham zanjiri; yozuvlar chapda (yoki o'ngda). Qisqa bo'lakda yozuv tashqarida:
    last_below=False — birinchisi tepada, qolganlari pastda; True — oxirgisi pastda, qolganlari tepada."""
    with p.group(stroke=C.dim, stroke_width=1.1, fill="none"):
        p.line(x, ys[0], x, ys[-1])
        for y in ys:
            p.line(x - 5, y, x + 5, y)
    for i, t in enumerate(labels):
        y1, y2 = ys[i], ys[i + 1]
        if abs(y2 - y1) >= 16:
            ty = (y1 + y2) / 2 + 4
        elif (i == len(labels) - 1) if last_below else (i != 0):
            ty = max(y1, y2) + 14
        else:
            ty = min(y1, y2) - 4
        p.text(x - 8 if left else x + 8, ty, t, 12, weight=600, fill=C.dim, anchor="end" if left else "start")

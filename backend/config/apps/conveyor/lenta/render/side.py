"""Yon kesim listi — `drawing/sideSheet.tsx` nusxasi (06 §9)."""

from __future__ import annotations

import math

from .._js import jround, js_str
from ..format import f1, uzs
from ..items import gaps_of
from ..specs import SIDEWALL_SPEC, cleat_outline, sidewall_pitch
from .common import SIDE_ZONES, C
from .layout import info_lines, zone
from .marks import break_mark, dim_chain, dim_chain_height, dim_chain_plan, dim_x, dim_y
from .pen import Pen


def side_section_sheet(p: Pen, m: dict, n: int) -> None:
    ln = m["belt"]["length"]
    cr = m.get("cross")
    cs = cr["spec"] if cr else None
    g = m.get("guide")
    gs = g["spec"] if g else None
    gofro = m.get("gofro")
    ys = cr["ys"] if cr else []
    pitch = (cr["pitch"] or 0) if cr else 0
    custom = bool(cr) and cr["pitch"] is None and len(ys) > 0
    Z = SIDE_ZONES
    zm = Z["main"]

    plan_w = min(zm.w - 130, 830) if custom else min(zm.w - 150, 760)
    px = zm.x + (zm.w - plan_w) / 2
    fold_pitch = sidewall_pitch(SIDEWALL_SPEC["width"], SIDEWALL_SPEC["developedFactor"]) if gofro else 0
    if custom:
        win_mm = ln
    else:
        win_mm = min(ln, pitch * 1.6 if pitch > 0 else fold_pitch * 12 if gofro else max(ln / 8, 200))
    sc = plan_w / win_mm
    partial = win_mm < ln - 1
    fold_step = fold_pitch * sc
    fold_lines = min(400, math.floor(win_mm / max(fold_pitch, 1))) if fold_step >= 3.5 else 0

    g_bot = g["bottom"] if g else None
    g_top = g["top"] if g else None
    up_mm = max(gofro["height"] if gofro else 0, cs["H"] if cs else 0, (gs["H"] if gs else 0) if g_top else 0, 4)
    down_mm = (gs["H"] if gs else 0) if g_bot else 0
    th_mm = m["belt"]["thickness"] if m["belt"]["thickness"] is not None else 2
    TOP_ROOM = 70
    BOT_ROOM = 54
    avail_h = zm.h - TOP_ROOM - BOT_ROOM
    vsc = min(sc * (8 if custom else 6), avail_h * 0.6 / (up_mm + down_mm + th_mm))
    vex = vsc / sc
    zs = [z for z in ys if z <= win_mm + 1e-6]

    chain_xs: list[float] = []
    chain_labels: list[str] = []
    if custom:
        chain_xs, chain_labels = run_chain(zs, ln)
    chain_rows = dim_chain_plan(chain_xs, chain_labels)[1] if custom else 1
    chain_room = dim_chain_height(chain_rows) + 26 if custom else 0

    belt_th = max(5, th_mm * vsc)
    section_h = (up_mm + down_mm) * vsc + belt_th
    block_h = TOP_ROOM + section_h + BOT_ROOM + chain_room
    y_belt = zm.y + max(0, (zm.h - block_h) / 2) + TOP_ROOM + up_mm * vsc
    outline = cleat_outline(cs) if cs else []
    oW = max(q["v"] for q in outline) if outline else 0

    sides = " + ".join(s for s in ("ostidan" if g_bot else "", "ustidan" if g_top else "") if s)
    if vex < 0.99 or vex > 1.01:
        vex_line = (
            f"Balandliklar {f1(1 / vex)}× kichraytirilgan" if vex < 1 else f"Balandliklar {f1(vex)}× kattalashtirilgan"
        )
    else:
        vex_line = None
    zone(p, Z["info"], f"{n}. Yon kesim")
    info_lines(
        p,
        Z["info"].x + 14,
        Z["info"].y + 54,
        [
            f"To'liq uzunligi: {uzs(ln)} mm",
            f"Qalinligi: {f1(th_mm)} mm"
            if m["belt"]["thickness"] is not None
            else f"⚠ Qalinligi ko'rsatilmagan (chizmada {f1(th_mm)} mm)",
            None,
            f"Ko'ndalang: {uzs(cr['count'])} dona" if cr else "Ko'ndalang profil: yo'q",
            "Qadam: har xil — zanjirga qarang" if custom else f"Qadam: {uzs(jround(pitch))} mm" if pitch > 0 else None,
            f"Balandligi: {f1(cs['H'])} mm" if cs else None,
            None,
            f"Yo'naltiruvchi: {g['name']}" if gs else "Yo'naltiruvchi: yo'q",
            f"Balandligi: {f1(gs['H'])} mm · {sides}" if gs else None,
            None,
            f"Gofrobort: {gofro['name']}" if gofro else "Gofrobort: yo'q",
            f"Burma qadami: {f1(fold_pitch)} mm" if gofro else None,
            f"Yoyilgan uzunlik: ×{js_str(SIDEWALL_SPEC['developedFactor'])}" if gofro else None,
            None,
            "O'lchamlar haqiqiy, mm",
            "Takrorlanuvchi qismi ko'rsatilgan" if partial else None,
            vex_line,
        ],
    )

    zone(p, zm)
    if gofro:
        with p.group():
            p.rect(
                px,
                y_belt - gofro["height"] * vsc,
                plan_w,
                gofro["height"] * vsc,
                fill=C.wall,
                stroke=C.wallEdge,
                stroke_width=1.4,
                opacity=0.45,
            )
            for i in range(fold_lines):
                fx = px + (i + 0.5) * fold_pitch * sc
                p.line(fx, y_belt - gofro["height"] * vsc, fx, y_belt, stroke=C.wallEdge, stroke_width=0.8, opacity=0.7)
    if cs:
        for z in zs:
            p.polygon(
                [(px + (z - oW / 2 + q["v"]) * sc, y_belt - q["w"] * vsc) for q in outline],
                fill=C.cleat,
                stroke=C.cleatEdge,
                stroke_width=1.4,
            )
    p.rect(px, y_belt, plan_w, belt_th, fill=C.belt, stroke=C.beltEdge, stroke_width=1.4)
    if gs:
        gh = max(10, gs["H"] * vsc)
        if g_bot:
            p.rect(px, y_belt + belt_th, plan_w, gh, fill=C.guide, stroke=C.guideEdge, stroke_width=1.2)
        if g_top:
            p.rect(px, y_belt - gh, plan_w, gh, fill=C.guide, stroke=C.guideEdge, stroke_width=1.2, opacity=0.45)
    if partial:
        y1 = y_belt - up_mm * vsc - 10
        y2 = y_belt + belt_th + down_mm * vsc + 10
        break_mark(p, px, y1, y2)
        break_mark(p, px + plan_w, y1, y2)
    if not custom and len(zs) >= 2:
        dim_x(p, px + zs[0] * sc, px + zs[1] * sc, y_belt - up_mm * vsc - 30, f"{uzs(jround(pitch))} qadam")
    if gofro:
        dim_y(p, y_belt - gofro["height"] * vsc, y_belt, px - 22, f"H {uzs(gofro['height'])}")
    if cs:
        dim_y(p, y_belt - cs["H"] * vsc, y_belt, px + plan_w + 56, f"H {f1(cs['H'])}")
    if custom:
        dim_chain(p, [px + z * sc for z in chain_xs], chain_labels, y_belt + belt_th + down_mm * vsc + 26)
    if gofro:
        p.text(
            px + 24,
            y_belt - gofro["height"] * vsc - 16,
            "gofrobort — lenta chetida (shaffof ko'rsatilgan)",
            10.5,
            fill=C.thin,
        )
    note = "lenta uzunligi bo'ylab kesim"
    if g_top:
        note += " · ustidagi yo'naltiruvchi shaffof ko'rsatilgan"
    p.text(px + 24, y_belt + belt_th + down_mm * vsc + 34 + chain_room, note, 11, fill=C.thin)


def run_chain(zs: list[float], ln: float) -> tuple[list[float], list[str]]:
    stops = [0, *zs, ln]
    gaps = gaps_of(zs, ln)
    xs: list[float] = [0]
    labels: list[str] = []
    i = 0
    while i < len(gaps):
        edge = i == 0 or i == len(gaps) - 1
        j = i + 1
        if not edge:
            while j < len(gaps) - 1 and abs(gaps[j] - gaps[i]) <= 0.15:
                j += 1
        k = j - i
        mean = sum(gaps[i:j]) / k
        labels.append(f"{uzs(k)} × {f1(mean)}" if k > 1 else f1(gaps[i]))
        xs.append(stops[j])
        i = j
    keep = [nn == 0 or x - xs[nn - 1] > 0.5 for nn, x in enumerate(xs)]
    return [x for nn, x in enumerate(xs) if keep[nn]], [lb for nn, lb in enumerate(labels) if keep[nn + 1]]

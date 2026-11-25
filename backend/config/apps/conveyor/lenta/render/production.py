"""Bir varaqli ISHLAB CHIQARISH chizmasi (2026-11-09): sex xodimi faqat shu varaqqa qarab lentani kesadi, teshik
ochadi, profil qo'yadi va ulaydi.

Joylashuv (A4 albom, 1188×840):
  chapda  — ustidan ko'rinish (plan_sheet, prod rejimi) + pastida ko'ndalang kesim (cross_section_view);
  o'ngda  — TEXNIK TALABLAR: ish tartibi bo'yicha raqamlangan bandlar (kesish → teshik → profil → ulash → nazorat)
            va ostida detallar ("B" teshiklar joylashuvi, yo'naltiruvchi / ko'ndalang profil kesimi);
  pastda  — sarlavha jadvali (render loop chizadi).
Toleranslar — kv `lenta_tolerances` (JSON: width, length, hole_pos, hole_dia, profile → "±1 mm" kabi matn);
kiritilmagan bo'lsa chizmada tolerans yozilmaydi (o'ylab topilmaydi).
"""

from __future__ import annotations

import json
import math

from ..format import f1, uzs
from .common import CONTENT_BOT, FRAME, Box, C
from .cross import cross_section_view, guide_detail_k
from .details import cleat_section, profile_detail
from .layout import zone
from .pen import Pen
from .plan import plan_sheet
from .spec import cols_text, edge_text, spec_lines

RIGHT_W = 352  # o'ng ustun (texnik talablar + detallar)
HEAD_H = 40  # varaq sarlavhasi
CROSS_H = 168  # ko'ndalang kesim tasmasi
STEP_FS = 11.2
STEP_LH = 14.6


def tolerances() -> dict[str, str]:
    """Dopusklar: settings.LENTA_TOLERANCES (dict) yoki data/lenta_tolerances.json; yo'q — bo'sh."""
    try:
        from django.conf import settings

        t = getattr(settings, "LENTA_TOLERANCES", None)
        if t is None:
            p = settings.BASE_DIR / "data" / "lenta_tolerances.json"
            t = json.loads(p.read_text(encoding="utf-8")) if p.is_file() else {}
        return {k: str(v).strip() for k, v in t.items() if str(v).strip()} if isinstance(t, dict) else {}
    except Exception:
        return {}


def _sections(m: dict) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    cur = ""
    for ln in spec_lines(m):
        if not ln or not ln.strip():
            continue
        if ln.startswith("§"):
            cur = ln[1:]
            out[cur] = []
        elif cur:
            out[cur].append(ln.strip())
    return out


def _tol(t: dict[str, str], key: str) -> str:
    v = t.get(key)
    return f" ({v})" if v else ""


def production_steps(m: dict, tol: dict[str, str] | None = None) -> list[tuple[str, list[str]]]:
    """[(sarlavha, [qatorlar])] — ish tartibi: kesish → teshik → profil → ulash → nazorat."""
    tol = tolerances() if tol is None else tol
    b = m["belt"]
    bw, ln, joint = b["width"], b["length"], b["joint"] or 0
    sec = _sections(m)
    steps: list[tuple[str, list[str]]] = []

    cut = [f"Lenta: {b['name']}" + (f", qalinligi {f1(b['thickness'])} mm" if b["thickness"] else "")]
    if joint > 0:
        cut.append(f"Kesish o'lchami: {uzs(bw)}{_tol(tol, 'width')} × {uzs(ln + joint)} mm")
        cut.append(f"(tayyor uzunlik {uzs(ln)}{_tol(tol, 'length')} + {uzs(joint)} mm ulash zapasi)")
    else:
        cut.append(f"Kesish o'lchami: {uzs(bw)}{_tol(tol, 'width')} × {uzs(ln)}{_tol(tol, 'length')} mm")
    cut.append("Qirralar to'g'ri burchak ostida, tekis kesilsin")
    steps.append(("KESISH", cut))

    L = (m.get("perf") or {}).get("layout") if m.get("perf") else None
    if L:
        st = L["stagger"] and L["cols"] > 1
        tail = ln - L["start"] - (L["rows"] - 1) * L["pitchL"]
        steps.append(
            (
                "TESHIK OCHISH",
                [
                    f"Ø{f1(L['dia'])}{_tol(tol, 'hole_dia')} mm, jami {uzs(m['perf']['count'])} ta"
                    + (", shaxmat tartibida" if st else ""),
                    f"Enida: {cols_text(L)}, qadam {f1(L['pitch'])} mm",
                    f"Bo'yida: {uzs(L['rows'])} qator, qadam {f1(L['pitchL'])} mm",
                    f"{edge_text(L, bw).capitalize()}{_tol(tol, 'hole_pos')}",
                    f"Lenta boshidan 1-qatorgacha {f1(L['start'])} mm, oxirgi qatordan oxirigacha {f1(tail)} mm",
                    "O'lchov bazasi: lentaning chap cheti va boshi (ko'rinishda yuqori chap burchak)",
                ],
            )
        )

    prof: list[str] = []
    for key, head in (
        ("YO'NALTIRUVCHI", "Yo'naltiruvchi"),
        ("KO'NDALANG PROFIL", "Ko'ndalang profil"),
        ("GOFROBORT", "Gofrobort"),
    ):
        lines = sec.get(key)
        if lines:
            prof.append(f"{head}: {lines[0]}")
            prof += [f"  {x}" for x in lines[1:]]  # tafsilotlar — ichkariga surilgan
    if prof:
        if tol.get("profile"):
            prof.append(f"Profil o'rni va qadami: {tol['profile']}")
        steps.append(("PROFIL O'RNATISH", prof))

    jn = m.get("_join")
    if jn and jn["kind"] == "weld":
        jl = [
            f"Uchlari payvand bilan halqa qilib ulansin (ulash zapasi {uzs(joint)} mm)"
            if joint
            else "Uchlari payvand bilan halqa qilib ulansin"
        ]
    elif jn and jn["kind"] == "lock":
        jl = [f"Ikkala uchiga qulf o'rnatilsin: {jn['name'] or m.get('join') or ''}".rstrip(": ")]
    elif jn and jn["kind"] == "install":
        jl = ["Lenta joyida (mijozda) ulanadi — uchlari ochiq jo'natilsin"]
    else:
        jl = [f"Ulash: {m['join']}" if m.get("join") else "Ulanmaydi — ochiq lenta (metrlab)"]
    jl.append(f"Tayyor uzunlik: {uzs(ln)}{_tol(tol, 'length')} mm")
    steps.append(("ULASH", jl))

    chk = ["Eni, uzunligi va diagonali o'lchab tekshirilsin"]
    if L:
        chk.append(f"Teshiklar soni ({uzs(m['perf']['count'])} ta) va birinchi/oxirgi qator o'rni tekshirilsin")
    if prof:
        chk.append("Profillar soni, qadami va chetdan masofasi tekshirilsin")
    if not tol:
        chk.append("Toleranslar sozlanmagan — nominal o'lchamlar")
    steps.append(("NAZORAT", chk))
    return steps


def _wrap(t: str, max_w: float, fs: float = STEP_FS) -> list[str]:
    mx = max(12, math.floor(max_w / (fs * 0.53)))
    out, cur = [], ""
    for w in t.split():
        if cur and len(cur) + 1 + len(w) > mx:
            out.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}" if cur else w
    if cur:
        out.append(cur)
    return out or [""]


def _steps_height(steps: list[tuple[str, list[str]]], w: float, fs: float) -> float:
    lh = fs * 1.3
    h = 22.0
    for _, lines in steps:
        h += lh + 1 + 6
        for ln in lines:
            ind = 12 if ln.startswith("  ") else 0
            h += lh * len(_wrap(ln.strip(), w - 34 - ind, fs))
    return h


def _steps_block(p: Pen, steps: list[tuple[str, list[str]]], x: float, y: float, w: float, max_h: float) -> float:
    """Raqamlangan bandlar (joyga qarab shrift kichrayadi); "  " bilan boshlangan qator — ichki band. Oxirgi y."""
    fs = STEP_FS
    while fs > 8.4 and _steps_height(steps, w, fs) > max_h:
        fs -= 0.4
    lh = fs * 1.3
    p.text(x, y, "TEXNIK TALABLAR", 14, weight=700, fill=C.line)
    p.text(x + w, y, "ish tartibi bo'yicha", 10.5, fill=C.thin, anchor="end")
    y += 22
    for i, (head, lines) in enumerate(steps, 1):
        p.circle(x + 9, y - 4, 9, fill=C.line, stroke="none")
        p.text(x + 9, y, str(i), 11, weight=700, fill=C.paper, anchor="middle")
        p.text(x + 24, y, head, fs + 0.8, weight=700, fill=C.line)
        y += lh + 1
        for ln in lines:
            ind = 12 if ln.startswith("  ") else 0
            for j, part in enumerate(_wrap(ln.strip(), w - 34 - ind, fs)):
                mark = ("– " if ind else "• ") if j == 0 else ""
                p.text(x + 24 + ind + (8 if j else 0), y, mark + part, fs, fill=C.line if not ind else C.thin)
                y += lh
        y += 6
    return y


def production_sheet(p: Pen, m: dict, n: int) -> None:
    b = m["belt"]
    if not (b["width"] > 0 and b["length"] > 0):
        p.text(FRAME.x + 40, FRAME.y + 120, "Chizma uchun lenta eni va uzunligini kiriting", 14, fill=C.thin)
        return
    right = Box(FRAME.x + FRAME.w - RIGHT_W, FRAME.y, RIGHT_W, CONTENT_BOT - FRAME.y)
    left_w = FRAME.w - RIGHT_W
    # sarlavha
    jn = m.get("_join")
    kind = {"weld": "halqa, payvand", "lock": "qulf bilan", "install": "joyida ulanadi"}.get(
        (jn or {}).get("kind", ""), "ochiq lenta"
    )
    p.text(FRAME.x + 14, FRAME.y + 26, "Ishlab chiqarish chizmasi", 16, weight=700, fill=C.line)
    p.text(
        FRAME.x + left_w - 14,
        FRAME.y + 26,
        f"{b['name']} · {uzs(b['width'])} × {uzs(b['length'])} mm · {kind}",
        12,
        weight=600,
        fill=C.dim,
        anchor="end",
    )
    p.line(FRAME.x, FRAME.y + HEAD_H, FRAME.x + left_w, FRAME.y + HEAD_H, stroke=C.line, stroke_width=1.1)
    zone(p, right)

    # o'ng ustun: texnik talablar
    y = _steps_block(p, production_steps(m), right.x + 14, right.y + 26, right.w - 28, right.h - 40)

    # detallar (joy bo'lsa): B — teshiklar, A — yo'naltiruvchi, C — ko'ndalang profil
    bottom = right.y + right.h - 8
    L = (m.get("perf") or {}).get("layout") if m.get("perf") else None
    det_box = None
    if L and bottom - y >= 200:
        p.line(right.x + 8, y, right.x + right.w - 8, y, stroke=C.thin, stroke_width=0.6, stroke_dasharray="4 3")
        det_box = Box(right.x + 6, y + 8, right.w - 12, min(300, bottom - y - 8))
        y = det_box.y + det_box.h
    g = m.get("guide")
    if g and g.get("spec"):
        gk = guide_detail_k(g["spec"], 60)
        free = bottom - y - 142  # sarlavha, nom, izoh va o'lchamlar uchun ~142 birlik
        gk = min(gk, free / max(g["spec"]["H"], 1))
        if gk >= 2.5:  # juda mayda bo'lsa — chizilmaydi (sarlavha jadvaliga tushmasin)
            p.line(
                right.x + 8,
                y + 4,
                right.x + right.w - 8,
                y + 4,
                stroke=C.thin,
                stroke_width=0.6,
                stroke_dasharray="4 3",
            )
            profile_detail(p, right.x + 40, y + 34, g["name"], g["spec"], heading="A — yo'naltiruvchi kesimi", k=gk)
            y += 142 + g["spec"]["H"] * gk
    cr = m.get("cross")
    if cr and cr.get("spec"):
        bh = min(80.0, bottom - y - 24 - 130)  # sarlavha + izoh qatorlari ~130 birlik
        if bh >= 45:  # joy yetmasa — chizilmaydi (jadvalga tushmasin)
            p.line(
                right.x + 8,
                y + 4,
                right.x + right.w - 8,
                y + 4,
                stroke=C.thin,
                stroke_width=0.6,
                stroke_dasharray="4 3",
            )
            cleat_section(p, right.x + 40, y + 24, cr["name"], cr["spec"], box_h=bh)

    # chap: ustidan ko'rinish + ko'ndalang kesim
    gd = m.get("guide") or {}
    cross_h = CROSS_H + (70 if gd.get("bottom") else 0) + (30 if m.get("gofro") or gd.get("top") else 0)
    p.text(FRAME.x + 14, FRAME.y + HEAD_H + 18, "Ustidan ko'rinish", 12.5, weight=700, fill=C.line)
    plan_box = Box(FRAME.x, FRAME.y + HEAD_H + 16, left_w, CONTENT_BOT - FRAME.y - HEAD_H - 16 - cross_h)
    plan_sheet(p, m, n, main=plan_box, det_box=det_box)
    cbox = Box(FRAME.x, CONTENT_BOT - cross_h, left_w, cross_h)
    p.line(cbox.x, cbox.y, cbox.x + cbox.w, cbox.y, stroke=C.line, stroke_width=1.1)
    p.text(cbox.x + 14, cbox.y + 20, "Ko'ndalang kesim (eni bo'yicha)", 12.5, weight=700, fill=C.line)
    cross_section_view(p, m, Box(cbox.x, cbox.y + 8, cbox.w, cbox.h - 8), max_w=cbox.w - 150, note=False)

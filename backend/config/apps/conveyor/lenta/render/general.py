"""1-list (umumiy chizma) va 3D list — `generalSheet.tsx`, `mainSheet.tsx` nusxasi (06 §5–6)."""

from __future__ import annotations

from .common import (
    CONTENT_X,
    FRAME,
    GEN_MAIN_VIEW,
    GEN_ZONES,
    MAIN_ZONE,
    NO_SCALE,
    PAD,
    Box,
    C,
)
from .cross import cross_section_view, guide_detail_k
from .details import profile_detail
from .iso import iso_geometry, iso_view
from .layout import info_fit, zone
from .pen import Pen
from .perf import perf_detail, perf_simple_scale, perf_simple_view
from .spec import main_notes, spec_lines

MAIN_MAX_W = GEN_MAIN_VIEW.w - 140
DETAIL_H = 200
PERF_DET_H = 330


def _perf_layout(m: dict) -> dict | None:
    return (m.get("perf") or {}).get("layout") if m.get("perf") else None


def is_flat_perf(m: dict) -> bool:
    return bool(_perf_layout(m)) and not m.get("cross") and not m.get("gofro") and not m.get("guide")


def general_scale(m: dict) -> float:
    if m["belt"]["width"] <= 0:
        return 0
    L = _perf_layout(m)
    if L and is_flat_perf(m):
        return 4 / perf_simple_scale(m, L, GEN_MAIN_VIEW, fill=True)
    return NO_SCALE


def general_sheet(p: Pen, m: dict, n: int) -> None:
    Z = GEN_ZONES
    notes = main_notes(m)
    if is_flat_perf(m):
        zone(p, Z["main"], f"{n}. Umumiy chizma — ustidan ko'rinish")
        perf_simple_view(p, m, _perf_layout(m), GEN_MAIN_VIEW, show_join=True, callout="B", fill=True)  # type: ignore[arg-type]
    else:
        zone(p, Z["main"], f"{n}. Umumiy chizma — ko'ndalang kesim")
        g = m.get("guide")
        gs = g["spec"] if g else None
        view = GEN_MAIN_VIEW
        if gs:
            view = Box(view.x, view.y, view.w, view.h - DETAIL_H)
        got = cross_section_view(p, m, view, MAIN_MAX_W)
        if gs and got.get("guide"):
            gx, gy = got["guide"]
            p.circle(gx, gy, 26, fill="none", stroke=C.line, stroke_width=0.9, stroke_dasharray="6 3")
            p.text(gx + 22, gy + 36, "A", 15, weight=700, fill=C.line)
            dx = view.x + 40
            dy = view.y + view.h + 46
            p.line(
                view.x + 14,
                view.y + view.h + 4,
                view.x + view.w - 14,
                view.y + view.h + 4,
                stroke=C.thin,
                stroke_width=0.6,
                stroke_dasharray="4 3",
            )
            profile_detail(
                p,
                dx,
                dy,
                g["name"],
                gs,
                heading="A — yo'naltiruvchi kesimi (kattalashtirilgan)",
                k=guide_detail_k(gs, 70),
            )
    zone(p, Z["spec"], "Texnik tavsif")
    lines = [*spec_lines(m, True)]
    if notes:
        lines += [" ", "§OGOHLANTIRISH", *(f"⚠ {t}" for t in notes)]
    sp = Z["spec"]
    if is_flat_perf(m):
        # pastida "B" detal (teshik joylashuvi, D11)
        top = Box(sp.x, sp.y, sp.w, sp.h - PERF_DET_H)
        info_fit(p, top, lines)
        p.line(
            sp.x + 8,
            top.y + top.h,
            sp.x + sp.w - 8,
            top.y + top.h,
            stroke=C.thin,
            stroke_width=0.6,
            stroke_dasharray="4 3",
        )
        perf_detail(p, m, _perf_layout(m), Box(sp.x + 6, top.y + top.h + 10, sp.w - 12, PERF_DET_H - 16))  # type: ignore[arg-type]
    else:
        info_fit(p, sp, lines)


def main_iso_box(m: dict) -> Box:
    nh = len(main_notes(m))
    return Box(MAIN_ZONE.x + 18, MAIN_ZONE.y + 16, MAIN_ZONE.w - 36, MAIN_ZONE.h - 32 - (nh * 14 + 6 if nh else 0))


def main_sheet(p: Pen, m: dict, n: int) -> None:
    ok = m["belt"]["width"] > 0 and m["belt"]["length"] > 0
    if not ok:
        p.text(CONTENT_X + 40, PAD + 120, "Chizma uchun lenta eni va uzunligini kiriting", 14, fill=C.thin)
        return
    notes = main_notes(m)
    box = main_iso_box(m)
    p.text(FRAME.x + 14, FRAME.y + 26, f"{n}. Umumiy ko'rinish (3D)", 15, weight=600, fill=C.line)
    p.text(
        FRAME.x + 14,
        FRAME.y + 42,
        "uzunligi uzilish bilan qisqartirilgan" if iso_geometry(m, box.w, box.h)["broken"] else "to'liq ko'rinish",
        10.5,
        fill=C.thin,
    )
    zone(p, MAIN_ZONE)
    iso_view(p, m, box.x, box.y, box.w, box.h)
    for i, note in enumerate(notes):
        p.text(
            MAIN_ZONE.x + 18, MAIN_ZONE.y + MAIN_ZONE.h - 12 - (len(notes) - 1 - i) * 14, f"⚠ {note}", 11, fill=C.dim
        )

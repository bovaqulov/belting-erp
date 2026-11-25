"""TS oracle (`scripts/lenta_oracle/oracle.ts`) ning Python ko'zgusi — bir xil tuzilishda natija beradi."""

from __future__ import annotations

import math
from typing import Any

from config.apps.conveyor.lenta import items
from config.apps.conveyor.lenta._js import js_json, js_str
from config.apps.conveyor.lenta.calc import joint_case_of, joint_mm, round_up_to
from config.apps.conveyor.lenta.catalog import catalog
from config.apps.conveyor.lenta.curve import (
    bend_too_tight,
    curve_default_holes,
    curve_geom,
    curve_holes_overlap,
    from_diameters,
    sector_bounds,
    width_patch,
)
from config.apps.conveyor.lenta.drawing_model import (
    build_drawing_model,
    cross_free,
    cross_len_text,
    cross_max_length,
    cross_max_length_for,
    cross_max_segment,
    cross_slot_at,
    cross_spans,
    cross_total_width,
    fit_cross_segs,
    gofro_bands,
    gofro_inset_patch,
    gofro_label,
    guide_positions,
    guide_side_of,
    guide_total_qty,
    perf_align_info,
    perf_alignment,
    perf_count_for_pitch,
    perf_grid_patch,
    perf_hole_points,
    perf_layout,
    perf_layout_for,
    perf_sides_for,
    perf_usable_width,
)
from config.apps.conveyor.lenta.effective import effective_config
from config.apps.conveyor.lenta.format import f1, money, uzs
from config.apps.conveyor.lenta.locks import default_lock_for, lock_fits, lock_thickness_range
from config.apps.conveyor.lenta.model import encode_state, initial_state, parse_project, project_file_name, revive
from config.apps.conveyor.lenta.price import price_of
from config.apps.conveyor.lenta.specs import cleat_outline, cleat_spec_for, sidewall_pitch


def st(o: dict[str, Any]) -> dict[str, Any]:
    return {**initial_state(), **o}


def _lock(name: str) -> dict[str, Any] | None:
    return next((x for x in catalog()["locks"] if x["name"] == name), None)


FUNCS: dict[str, Any] = {
    "evenPositions": items.even_positions,
    "normalizePositions": items.normalize_positions,
    "addPosition": items.add_position,
    "removeAt": items.remove_at,
    "moveTo": items.move_to,
    "gapsOf": items.gaps_of,
    "setGap": items.set_gap,
    "moveOne": items.move_one,
    "setGapLeft": items.set_gap_left,
    "setGapLocal": items.set_gap_local,
    "midSlot": items.mid_slot,
    "midSlotFit": items.mid_slot_fit,
    "nearestAllowed": items.nearest_allowed,
    "groupCount": items.group_count,
    "groupPitch": items.group_pitch,
    "groupStart": items.group_start,
    "groupEnd": items.group_end,
    "nearestIndex": items.nearest_index,
    "uniformPitch": items.uniform_pitch,
    "moveMany": items.move_many,
    "distributeMany": items.distribute_many,
    "pitchMany": items.pitch_many,
    "removeMany": items.remove_many,
    "fitCleatEnds": items.fit_cleat_ends,
    "guidePositions": guide_positions,
    "crossSpans": cross_spans,
    "crossMaxLength": cross_max_length,
    "crossMaxSegment": cross_max_segment,
    "crossTotalWidth": cross_total_width,
    "crossSlotAt": cross_slot_at,
    "fitCrossSegs": fit_cross_segs,
    "perfLayout": perf_layout,
    "perfCountForPitch": perf_count_for_pitch,
    "perfUsableWidth": perf_usable_width,
    "gofroLabel": gofro_label,
    "fromDiameters": from_diameters,
    "sectorBounds": sector_bounds,
    "uzs": lambda x, d=None: uzs(x, 0 if d is None else d),
    "money": money,
    "f1": f1,
    "roundUpTo": round_up_to,
    "jointCaseOf": joint_case_of,
    "parseProject": parse_project,
    "cleatSpecFor": cleat_spec_for,
    "sidewallPitch": sidewall_pitch,
    "cleatOutline": cleat_outline,
    "crossLenTextNum": lambda c: cross_len_text(c, js_str),
    "lockThicknessRangeByName": lambda n: lock_thickness_range(_lock(n)) if _lock(n) else "missing",
    "lockFitsByName": lambda n, t: lock_fits(_lock(n), t) if _lock(n) else "missing",
    "defaultLockFor": lambda t: default_lock_for(catalog()["locks"], t),
    "sGofroBands": lambda o: gofro_bands(st(o)),
    "sPerfSidesFor": lambda o: perf_sides_for(st(o)),
    "sCrossMaxLengthFor": lambda o: cross_max_length_for(st(o)),
    "sCrossFree": lambda o: cross_free(st(o)),
    "sGuideSideOf": lambda o, place: guide_side_of(st(o), place),
    "sPerfLayoutFor": lambda o: perf_layout_for(st(o)),
    "sPerfGridPatch": lambda o, ch: perf_grid_patch(st(o), ch),
    "sPerfAlignInfo": lambda o: perf_align_info(st(o)),
    "sPerfAlignment": lambda o: perf_alignment(st(o)),
    "sGofroInsetPatch": lambda o, side, v, len0=None: gofro_inset_patch(st(o), side, v, len0),
    "sWidthPatch": lambda o, v: width_patch(st(o), v),
    "sCurveGeom": lambda o: curve_geom(st(o)),
    "sJointMm": lambda bj, en, m, w, s: joint_mm(bj, en, m, w, {**initial_state()["settings"], **s}),
}


def run_case(raw: Any) -> dict[str, Any]:
    revived = revive(raw)
    eff = effective_config(revived)
    es = eff["state"]
    price = price_of(eff)
    drawing = build_drawing_model(es)
    drawing_raw = build_drawing_model(revived)
    layout = drawing["perf"]["layout"] if drawing["perf"] else None
    cg = drawing["curve"]
    return {
        "revived": revived,
        "json": js_json(revived),
        "share": encode_state(revived),
        "effective": eff,
        "price": price,
        "drawing": drawing,
        "drawingRaw": drawing_raw,
        "extra": {
            "holes": perf_hole_points(layout, es["length"], es["width"]) if layout else None,
            "crossFree": cross_free(es),
            "guideTotalQty": guide_total_qty(es),
            "perfAlignInfo": perf_align_info(es),
            "perfAlignment": perf_alignment(es),
            "perfLayoutRaw": perf_layout_for(revived),
            "sectorBounds": sector_bounds(cg) if cg else None,
            "curveHolesOverlap": curve_holes_overlap(revived),
            "bendTooTight": bend_too_tight(revived),
            "curveDefaultHoles": curve_default_holes(revived),
            "fileName": project_file_name(revived),
        },
    }


def run_func(fn: str, args: list[Any]) -> Any:
    return FUNCS[fn](*args)


def first_diff(exp: Any, got: Any, path: str = "$", tol: float = 1e-6) -> str | None:
    """Birinchi farq qilgan joy (yo'l + qiymatlar) yoki None. JSON qoidalari: NaN/±inf -> null."""
    if isinstance(got, float) and not math.isfinite(got):
        got = None
    if isinstance(got, tuple):
        got = list(got)
    if exp is None or got is None:
        return None if exp is None and got is None else f"{path}: kutilgan {exp!r}, chiqdi {got!r}"
    if isinstance(exp, bool) or isinstance(got, bool):
        return (
            None
            if isinstance(exp, bool) and isinstance(got, bool) and exp == got
            else f"{path}: kutilgan {exp!r}, chiqdi {got!r}"
        )
    if isinstance(exp, (int, float)) and isinstance(got, (int, float)):
        if abs(exp - got) <= tol or abs(exp - got) <= 1e-9 * max(abs(exp), abs(got)):
            return None
        return f"{path}: kutilgan {exp!r}, chiqdi {got!r}"
    if isinstance(exp, str) and isinstance(got, str):
        return None if exp == got else f"{path}: kutilgan {exp!r}, chiqdi {got!r}"
    if isinstance(exp, list) and isinstance(got, list):
        if len(exp) != len(got):
            return f"{path}: uzunlik {len(exp)} != {len(got)}"
        for i, (a, b) in enumerate(zip(exp, got)):
            d = first_diff(a, b, f"{path}[{i}]", tol)
            if d:
                return d
        return None
    if isinstance(exp, dict) and isinstance(got, dict):
        ke, kg = set(exp), set(got)
        if ke != kg:
            return f"{path}: kalitlar farqi: faqat TS {sorted(ke - kg)}, faqat Py {sorted(kg - ke)}"
        for k in exp:
            d = first_diff(exp[k], got[k], f"{path}.{k}", tol)
            if d:
                return d
        return None
    return f"{path}: tur farqi {type(exp).__name__} != {type(got).__name__} ({exp!r} / {got!r})"

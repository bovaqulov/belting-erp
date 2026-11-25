"""NARX — tekshirilgan holatdan (`effective_config`) qatorlar va jami. `lib/price.ts` nusxasi."""

from __future__ import annotations

from typing import Any

from .calc import (
    calc_belt,
    calc_cross,
    calc_gofro,
    calc_guide,
    calc_install,
    calc_lock,
    calc_lock_tool,
    calc_perf,
    calc_totals,
)
from .catalog import by_name, catalog
from .drawing_model import guide_total_qty

LINE_KEYS = ["belt", "lock", "tool", "guide", "cross", "gofro", "perf"]


def price_of(eff: dict[str, Any]) -> dict[str, Any]:
    """`priceOf(eff)` — {lines: {belt, lock, tool, guide, cross, gofro, perf}, totals}."""
    c = catalog()
    es = eff["state"]
    cfg = es["settings"]
    has_size = es["width"] > 0 and es["length"] > 0
    if es["joinMethod"] == "install":
        lock = calc_install(es["lockOn"], es["installPrice"])
    else:
        lock = calc_lock(
            by_name(c["locks"], es["lockName"]), es["lockOn"] and es["joinMethod"] == "lock", es["width"], es["lockQty"]
        )
    lines = {
        "belt": calc_belt(by_name(c["belts"], es["beltName"]), es["width"], es["length"], cfg, eff["joint"]),
        "lock": lock,
        "tool": calc_lock_tool(
            by_name(c["locks"], es["lockToolName"]), es["lockOn"] and es["lockToolOn"], es["lockToolQty"]
        ),
        "guide": calc_guide(
            by_name(c["guideProfiles"], es["guideName"]), es["guideOn"], es["length"], guide_total_qty(es), cfg
        ),
        # dona soni = o'rinlar × bo'laklar
        "cross": calc_cross(
            by_name(c["crossProfiles"], es["crossName"]),
            es["crossOn"],
            es["crossLen"],
            len(es["crossPos"]) * es["crossParts"],
            cfg,
            has_size,
        ),
        "gofro": calc_gofro(
            by_name(c["gofroProfiles"], es["gofroName"]),
            es["gofroOn"],
            es["length"],
            es["gofroQty"],
            cfg,
            es["gofroHeight"],
        ),
        "perf": calc_perf(es["perfOn"], es["perfDia"], es["perfQty"], has_size),
    }
    totals = calc_totals([lines[k] for k in LINE_KEYS], cfg)
    return {"lines": lines, "totals": totals}

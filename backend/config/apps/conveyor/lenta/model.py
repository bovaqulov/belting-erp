"""Holat (State) — `lib/state.ts`, `cats.ts`, `project.ts` nusxasi.

Holat oddiy dict (kalitlari TS'dagidek camelCase). `revive(raw)` — saqlangan/xom JSON'ni
joriy holatga keltiradi, JS semantikasi bilan AYNAN (noma'lum kalitlar o'tadi, bool son
emas, `qty` butunlamaydi, `snap` doim 1 ...).
"""

from __future__ import annotations

import base64
import copy
import json
import re
import unicodedata
import urllib.parse
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any

from ._js import is_finite, jmax, jmin, jround, js_json, js_str, to_float
from .calc import JOINT_CASES, default_settings
from .catalog import by_name, catalog
from .items import even_positions, fit_cleat_ends, normalize_positions
from .locks import lock_options_of, tool_options_of
from .specs import GOFRO_MIN_INSET, cleat_spec_for

State = dict[str, Any]

CATS = ["belt", "lock", "guide", "cross", "gofro", "perf"]
VIEWS = ["cross", "side", "top", "sheet"]
SNAPS = [1, 5, 10, 50]
CAT_FLAG = {"lock": "lockOn", "guide": "guideOn", "cross": "crossOn", "gofro": "gofroOn", "perf": "perfOn"}

MAX_QTY = 5000
SHARE_PREFIX = "#s="
PROJECT_FORMAT = "lentacud.project"
PROJECT_VERSION = 1
_MARKERS = ["beltName", "width", "length", "crossPos", "settings"]


def _pick(names: list[str], want: str) -> str:
    return want if want in names else names[0]


@lru_cache(maxsize=1)
def _initial() -> State:
    c = catalog()
    tools = tool_options_of(c["locks"])
    return {
        "beltName": _pick([b["name"] for b in c["belts"]], "U13/0A-B (P 9/A/BL blue - 1,3mm)"),
        "width": 0,
        "length": 0,
        "bendAngle": 0,
        "curveHoleCount": 0,
        "curveHoleEdge": 15,
        "curveHoleDia": 8,
        "curveHoleRows": 1,
        "curveHoleRowPitch": 20,
        "curveHoleStagger": False,
        "lockOn": False,
        "lockName": _pick(
            [lk["name"] for lk in lock_options_of(c["locks"])], "KS - SE 90/10 пластик (Пластик замок FORBO)"
        ),
        "lockQty": 2,
        "lockToolOn": False,
        "lockToolName": tools[0]["name"] if tools else "",
        "lockToolQty": 1,
        "joinMethod": "lock",
        "installPrice": 0,
        "weldType": "oddiy",
        "guideOn": False,
        "guideName": _pick([p["name"] for p in c["guideProfiles"]], "UDK8-W (TOOTHED) - Полиуретан"),
        "guideBottomOn": True,
        "guideBottomQty": 1,
        "guideBottomInset": 25,
        "guideBottomPos": None,
        "guideBottomAt": None,
        "guideTopOn": False,
        "guideTopQty": 2,
        "guideTopInset": 25,
        "guideTopPos": None,
        "guideTopAt": None,
        "crossOn": False,
        "crossName": _pick([p["name"] for p in c["crossProfiles"]], "Профиль L 50"),
        "crossLen": 500,
        "crossLenAuto": False,
        "crossPos": [],
        "crossParts": 1,
        "crossGap": 55,
        "crossSegs": None,
        "gofroOn": False,
        "gofroName": _pick([p["name"] for p in c["gofroProfiles"]], "Гофроборт SW-30W - 50 ММ"),
        "gofroHeight": 50,
        "gofroQty": 2,
        "gofroSide": "left",
        "gofroInsetL": GOFRO_MIN_INSET,
        "gofroInsetR": GOFRO_MIN_INSET,
        "crossWallGap": 25,
        "perfOn": False,
        "perfDia": 30,
        "perfQty": 156,
        "perfStagger": True,
        "perfEdge": 0,
        "perfGrid": False,
        "perfRows": 0,
        "perfCols": 0,
        "perfPitchL": 0,
        "perfPitchW": 0,
        "perfStart": 0,
        "perfAlign": False,
        "perfPerGap": 1,
        "perfGroups": 1,
        "perfGroupPitch": 0,
        "perfFill": False,
        "perfLines": [],
        "projectName": "",
        "customerPhone": "",
        "customerAddress": "",
        "author": "",
        "openCat": "cross",
        "view": "side",
        "snap": 1,
        "settings": default_settings(),
    }


def initial_state() -> State:
    """Boshlang'ich holat (har safar yangi nusxa)."""
    return copy.deepcopy(_initial())


def st(**over: Any) -> State:
    """`{...initialState, ...over}` — testlar va qo'lda yig'ish uchun."""
    return {**initial_state(), **over}


# ------------------------------------------------------------------ revive yordamchilari


def _num(got: Any, fallback: float, lo: float = 0) -> float:
    return jmax(lo, to_float(got)) if is_finite(got) else fallback


def _qty(got: Any, fallback: float, lo: float = 1) -> float:
    return jmin(MAX_QTY, _num(got, fallback, lo))


def _bool(got: Any, fallback: bool) -> bool:
    return got if isinstance(got, bool) else fallback


def _one_of(opts: list[str], got: Any, fallback: Any) -> Any:
    return got if isinstance(got, str) and got in opts else fallback


def _str(got: Any) -> str:
    return got if isinstance(got, str) else ""


def _valid_name(items: list[dict[str, Any]], got: Any, fallback: str) -> str:
    return got if isinstance(got, str) and any(x["name"] == got for x in items) else fallback


def _at(got: Any) -> float | None:
    return to_float(got) if is_finite(got) and got >= 0 else None


def _pos_list(got: Any) -> list[float] | None:
    if isinstance(got, list) and 2 <= len(got) <= 500 and all(is_finite(v) and v >= 0 for v in got):
        return sorted(to_float(v) for v in got)
    return None


def _seg_list(got: Any) -> list[list[float]] | None:
    if not isinstance(got, list) or not got:
        return None
    out: list[list[float]] = []
    for v in got:
        if not isinstance(v, list) or len(v) != 2:
            return None
        a, b = v
        if not is_finite(a) or not is_finite(b) or b <= a:
            return None
        out.append([to_float(a), to_float(b)])
    return sorted(out, key=lambda p: p[0])


def _revive_joint_factor(raw: Any) -> dict[str, float]:
    base = default_settings()["jointFactor"]
    if not isinstance(raw, (dict, list)):
        return dict(base)
    p = raw if isinstance(raw, dict) else {}
    return {k: _num(p.get(k), base[k]) for k in JOINT_CASES}


def _revive_cross_pos(p: dict[str, Any]) -> list[float]:
    ln = _num(p.get("length"), 0)
    if "crossPos" in p:
        xs = normalize_positions(p["crossPos"], ln)
    else:
        xs = even_positions(ln, _num(p.get("crossQty"), 0))
    name = p.get("crossName")
    spec = cleat_spec_for(name) if isinstance(name, str) else None
    foot = spec["B"] if spec else 0
    return fit_cleat_ends(xs, ln, foot)


def _revive_guide(p: dict[str, Any], init: State) -> dict[str, Any]:
    old = p["guidePlace"] if isinstance(p.get("guidePlace"), str) else None
    legacy = old is not None and "guideBottomOn" not in p and "guideTopOn" not in p
    if legacy:
        legacy_qty = _qty(p.get("guideQty"), 1)
        inset = _num(p.get("guideInset"), init["guideBottomInset"])
        top = old == "top"
        return {
            "guideBottomOn": not top,
            "guideBottomQty": init["guideBottomQty"] if top else legacy_qty,
            "guideBottomInset": init["guideBottomInset"] if top else inset,
            "guideTopOn": top,
            "guideTopQty": legacy_qty if top else init["guideTopQty"],
            "guideTopInset": inset if top else init["guideTopInset"],
        }
    return {
        "guideBottomOn": _bool(p.get("guideBottomOn"), init["guideBottomOn"]),
        "guideBottomQty": _qty(p.get("guideBottomQty"), init["guideBottomQty"]),
        "guideBottomInset": _num(p.get("guideBottomInset"), init["guideBottomInset"]),
        "guideBottomPos": _pos_list(p.get("guideBottomPos")),
        "guideBottomAt": _at(p.get("guideBottomAt")),
        "guideTopOn": _bool(p.get("guideTopOn"), init["guideTopOn"]),
        "guideTopQty": _qty(p.get("guideTopQty"), init["guideTopQty"]),
        "guideTopInset": _num(p.get("guideTopInset"), init["guideTopInset"]),
        "guideTopPos": _pos_list(p.get("guideTopPos")),
        "guideTopAt": _at(p.get("guideTopAt")),
    }


def revive(raw: Any) -> State:
    """Saqlangan JSON'ni joriy holat shakliga keltiradi (`revive` AYNAN)."""
    init = _initial()
    if isinstance(raw, list):
        # JS: massiv ham obyekt — indekslar yoyiladi, `p.length` esa massiv uzunligi
        spread: dict[str, Any] = {str(i): v for i, v in enumerate(raw)}
        p: dict[str, Any] = {**spread, "length": len(raw)}
    elif isinstance(raw, dict):
        spread = raw
        p = raw
    else:
        return initial_state()
    st_raw = p.get("settings")
    sset: dict[str, Any] = st_raw if isinstance(st_raw, dict) else {}
    c = catalog()
    gofro_item = by_name(c["gofroProfiles"], p["gofroName"] if isinstance(p.get("gofroName"), str) else "")
    gofro_h = gofro_item.get("height") if gofro_item else None
    open_cat = p.get("openCat") if p.get("openCat") is not None else p.get("activeTab")
    perf_lines = p.get("perfLines")
    out: State = {**copy.deepcopy(init), **copy.deepcopy(spread)}
    out.update(
        {
            "beltName": _valid_name(c["belts"], p.get("beltName"), init["beltName"]),
            "lockName": _valid_name(lock_options_of(c["locks"]), p.get("lockName"), init["lockName"]),
            "lockToolName": _valid_name(tool_options_of(c["locks"]), p.get("lockToolName"), init["lockToolName"]),
            "lockToolOn": _bool(p.get("lockToolOn"), init["lockToolOn"]),
            "lockToolQty": _qty(p.get("lockToolQty"), init["lockToolQty"]),
            "guideName": _valid_name(c["guideProfiles"], p.get("guideName"), init["guideName"]),
            "crossName": _valid_name(c["crossProfiles"], p.get("crossName"), init["crossName"]),
            "gofroName": _valid_name(c["gofroProfiles"], p.get("gofroName"), init["gofroName"]),
            "width": _num(p.get("width"), 0),
            "length": _num(p.get("length"), 0),
            "bendAngle": jmin(360, _num(p.get("bendAngle"), 0)),
            "curveHoleCount": _qty(p.get("curveHoleCount"), 0, 0),
            "curveHoleEdge": _num(p.get("curveHoleEdge"), init["curveHoleEdge"]),
            "curveHoleDia": _num(p.get("curveHoleDia"), init["curveHoleDia"]),
            "curveHoleRows": jmax(1, _qty(p.get("curveHoleRows"), init["curveHoleRows"], 1)),
            "curveHoleRowPitch": _num(p.get("curveHoleRowPitch"), init["curveHoleRowPitch"]),
            "curveHoleStagger": _bool(p.get("curveHoleStagger"), init["curveHoleStagger"]),
            "lockQty": _qty(p.get("lockQty"), init["lockQty"]),
            "installPrice": _num(p.get("installPrice"), 0),
        }
    )
    out.update(_revive_guide(p, init))
    out.update(
        {
            "crossLen": _num(p.get("crossLen"), init["crossLen"]),
            "crossPos": _revive_cross_pos(p),
            "crossParts": jmin(6, jmax(1, jround(_num(p.get("crossParts"), init["crossParts"], 1)))),
            "crossGap": _num(p.get("crossGap"), init["crossGap"]),
            "crossSegs": _seg_list(p.get("crossSegs")),
            "gofroQty": jmin(2, _num(p.get("gofroQty"), init["gofroQty"], 1)),
            "gofroHeight": _num(p.get("gofroHeight"), gofro_h if gofro_h is not None else init["gofroHeight"]),
            "lockOn": _bool(p.get("lockOn"), init["lockOn"]),
            "guideOn": _bool(p.get("guideOn"), init["guideOn"]),
            "crossOn": _bool(p.get("crossOn"), init["crossOn"]),
            "crossLenAuto": _bool(p.get("crossLenAuto"), init["crossLenAuto"]),
            "gofroOn": _bool(p.get("gofroOn"), init["gofroOn"]),
            "crossWallGap": _num(p.get("crossWallGap"), init["crossWallGap"], 10),
            "perfOn": _bool(p.get("perfOn"), init["perfOn"]),
            "perfStagger": _bool(p.get("perfStagger"), init["perfStagger"]),
            "perfDia": _num(p.get("perfDia"), init["perfDia"]),
            "perfQty": _qty(p.get("perfQty"), init["perfQty"]),
            "perfEdge": _num(p.get("perfEdge"), 0),
            "perfGrid": _bool(p.get("perfGrid"), False),
            "perfRows": _qty(p.get("perfRows"), 0),
            "perfCols": _qty(p.get("perfCols"), 0),
            "perfPitchL": _num(p.get("perfPitchL"), 0),
            "perfPitchW": _num(p.get("perfPitchW"), 0),
            "perfStart": _num(p.get("perfStart"), 0),
            "perfAlign": _bool(p.get("perfAlign"), False),
            "perfPerGap": _qty(p.get("perfPerGap"), 1),
            "perfGroups": _qty(p.get("perfGroups"), 1),
            "perfGroupPitch": _num(p.get("perfGroupPitch"), 0),
            "perfFill": _bool(p.get("perfFill"), False),
            "perfLines": [to_float(v) for v in perf_lines if is_finite(v) and v >= 0][:50]
            if isinstance(perf_lines, list)
            else [],
            "joinMethod": _one_of(["lock", "meter", "install", "weld"], p.get("joinMethod"), init["joinMethod"]),
            "weldType": _one_of(["zinali", "oddiy", "60"], p.get("weldType"), init["weldType"]),
            "gofroSide": _one_of(["left", "right"], p.get("gofroSide"), init["gofroSide"]),
            "gofroInsetL": jmax(GOFRO_MIN_INSET, _num(p.get("gofroInsetL"), init["gofroInsetL"])),
            "gofroInsetR": jmax(GOFRO_MIN_INSET, _num(p.get("gofroInsetR"), init["gofroInsetR"])),
            "openCat": None if ("openCat" in p and p["openCat"] is None) else _one_of(CATS, open_cat, init["openCat"]),
            "view": _one_of(VIEWS, p.get("view"), init["view"]),
            "snap": init["snap"],
            "projectName": _str(p.get("projectName")),
            "customerPhone": _str(p.get("customerPhone")),
            "customerAddress": _str(p.get("customerAddress")),
            "author": _str(p.get("author")),
        }
    )
    dflt = init["settings"]
    out["settings"] = {
        **copy.deepcopy(dflt),
        "rate": _num(sset.get("rate"), dflt["rate"]),
        "vat": jmin(100, _num(sset.get("vat"), dflt["vat"])),
        "discount": jmin(100, _num(sset.get("discount"), 0)),
        "serviceGuide": _num(sset.get("serviceGuide"), dflt["serviceGuide"]),
        "serviceCross": _num(sset.get("serviceCross"), dflt["serviceCross"]),
        "serviceGofro": _num(sset.get("serviceGofro"), dflt["serviceGofro"]),
        "beltRoundPlus1000": sset["beltRoundPlus1000"]
        if isinstance(sset.get("beltRoundPlus1000"), bool)
        else dflt["beltRoundPlus1000"],
        "jointFactor": _revive_joint_factor(sset.get("jointFactor")),
    }
    return out


# ------------------------------------------------------------------ havola va loyiha fayli


def encode_state(s: State) -> str:
    """Holatni havola uchun matnga siqadi (UTF-8 -> base64 -> encodeURIComponent)."""
    b64 = base64.b64encode(js_json(s).encode("utf-8")).decode("ascii")
    return urllib.parse.quote(b64, safe="-_.!~*'()")


def decode_state(raw: str) -> Any | None:
    """Teskari amal; buzuq matn — None."""
    try:
        data = base64.b64decode(urllib.parse.unquote(raw, errors="strict"), validate=True)
        return json.loads(data.decode("utf-8"))
    except Exception:
        return None


def project_of(s: State, now: datetime | None = None) -> dict[str, Any]:
    """Loyiha fayli konverti."""
    now = now or datetime.now(UTC)
    iso = now.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
    return {
        "format": PROJECT_FORMAT,
        "version": PROJECT_VERSION,
        "app": "LentaCUD",
        "savedAt": iso,
        "name": s["projectName"],
        "state": s,
    }


def project_json(s: State, now: datetime | None = None) -> str:
    """`JSON.stringify(projectOf(s), null, 2)`."""
    return json.dumps(json.loads(js_json(project_of(s, now))), ensure_ascii=False, indent=2)


def parse_project(text: str) -> State | None:
    """Loyiha faylini o'qiydi (konvertli yoki konvertsiz); bo'lmasa None."""
    try:
        raw = json.loads(text)
    except Exception:
        return None
    if not isinstance(raw, dict):
        return None
    if raw.get("format") == PROJECT_FORMAT:
        sv = raw.get("state")
        return revive(sv) if isinstance(sv, dict) else None
    return revive(raw) if any(k in raw for k in _MARKERS) else None


def _js_trim(s: str) -> str:
    return s.strip(" \t\n\r\v\f ﻿                　")


def project_file_name(s: State) -> str:
    """ "Toshkent non zavodi" 860×11500 -> "Toshkent_non_zavodi_860x11500.json"."""
    nm = _js_trim(s["projectName"] or "lenta")
    buf: list[str] = []
    run = False
    for ch in nm:
        ok = ch in "_-" or unicodedata.category(ch)[0] in "LN"
        if ok:
            buf.append(ch)
            run = False
        elif not run:
            buf.append("_")
            run = True
    nm = re.sub(r"^_+|_+$", "", "".join(buf)) or "lenta"
    size = f"_{js_str(s['width'])}x{js_str(s['length'])}" if s["width"] > 0 and s["length"] > 0 else ""
    return f"{nm}{size}.json"

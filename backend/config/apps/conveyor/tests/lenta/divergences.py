"""Ataylab qilingan farqlar (LentaCUD'dan) — differensial test uchun ANIQ ro'yxat.

Har bir farq `docs/lenta/09_divergences.md` da yozilgan. Golden (TS oracle) qiymati
o'zgargan maydonlar bu yerda:
  1. avval YANGI qoida bo'yicha mustaqil tekshiriladi (invariantlar);
  2. faqat shundan keyin kutilgan qiymat o'rniga Python qiymati qo'yiladi.
Qolgan barcha maydonlar (cols, rows, count, pitchL, dia, ...) golden bilan qat'iy solishtiriladi.
Ro'yxatda yo'q yo'l HECH QACHON yumshatilmaydi.
"""

from __future__ import annotations

import copy
from typing import Any

EPS = 1e-6

# D1 — perforatsiya "chetdan N mm" (avtomatik rejim, perfEdge>0) ikkala chetdan simmetrik.
D1_FIELDS = ("pitch", "edge", "edgeOffset", "start")
REGISTRY = {
    "D1": {
        "doc": "docs/lenta/09_divergences.md#d1",
        "case_layout_paths": [
            ("drawing", "perf", "layout"),
            ("drawingRaw", "perf", "layout"),
            ("extra", "perfLayoutRaw"),
        ],
        "case_hole_path": ("extra", "holes"),
        "funcs": {"perfLayout"},
        "fields": D1_FIELDS,
    },
    # D9: faqat effective.issues OXIRIGA bitta yangi ogohlantirish qo'shiladi (`_apply_d9`); boshqa maydonlar qat'iy.
    "D9": {
        "doc": "docs/lenta/09_divergences.md#d9",
        "fields": ("effective.issues[+1, oxirida, prefiks \"O'lchamlar g'ayrioddiy\"]",),
    },
    # D12: ko'ndalang profil maksimaldan uzun — xabar oxiriga "zazor 10 mm bo'lsa — N mm gacha" izohi (`_apply_d12`).
    # Zazorni kamaytirib sig'adigan holat (yangi xatti-harakat) golden'da uchramaydi — test_lenta_cross_wall_gap'da.
    "D12": {
        "doc": "docs/lenta/09_divergences.md#d12",
        "fields": ("effective.issues[crossLen].message + ru — faqat oxiriga qavsli izoh",),
    },
    # D13: bloklovchi chegaralar (kichik bukish burchagi, absurd o'lcham, sig'maydigan gofra) — issues OXIRIGA
    # yangi xatolar va blocked=True (`_apply_d13`); boshqa maydonlar qat'iy.
    "D13": {
        "doc": "docs/lenta/09_divergences.md#d13",
        "fields": ("effective.issues[+0..3, oxirida, level=error]", "effective.blocked"),
    },
    # D10, D11 — faqat render (domen/golden maydonlariga ta'sir yo'q), shuning uchun bu yerda patch yo'q.
}


def _d1_affected(L: Any) -> bool:
    return isinstance(L, dict) and L.get("grid") is False and L.get("manualEdge") is True


def _close(a: float, b: float) -> bool:
    return abs(a - b) <= EPS * max(1.0, abs(a), abs(b))


def _check_d1(exp: dict, got: dict, width: float, length: float) -> None:
    """Yangi qoida: chap = o'ng = N, qatorlar bo'yiga markazlangan. Soni/qatorlar o'zgarmaydi."""
    n_edge = exp["edge"]  # eski qoidada edge = N (qo'lda berilgan chet)
    for k in ("cols", "rows", "count", "pitchL", "dia", "stagger"):
        assert got[k] == exp[k] or _close(got[k], exp[k]), f"D1: {k} o'zgarmasligi kerak ({exp[k]} != {got[k]})"
    cols = got["cols"]
    if cols > 1:
        assert _close(got["edge"], n_edge), f"D1: chap chet {got['edge']} != {n_edge}"
        right = width - (got["edge"] + (cols - 1) * got["pitch"])
        assert _close(right, n_edge), f"D1: o'ng chet {right} != {n_edge}"
        assert _close(got["edgeOffset"], got["edge"] + got["pitch"] / 2), "D1: edgeOffset"
    else:
        assert _close(got["edge"], width / 2), "D1: yakka ustun markazda"
    tail = length - (got["start"] + (got["rows"] - 1) * got["pitchL"])
    assert _close(got["start"], tail), f"D1: bo'yiga boshidan {got['start']} != oxiridan {tail}"


def _patch(exp: dict, got: dict) -> None:
    for k in D1_FIELDS:
        exp[k] = got[k]


def _dig(o: Any, path: tuple) -> Any:
    for k in path:
        if not isinstance(o, dict):
            return None
        o = o.get(k)
    return o


def apply_case(exp_out: dict, got: dict) -> dict:
    """Golden natijaning nusxasi — ro'yxatdagi farqlar tekshirilib, yangi qiymatlar bilan."""
    exp = copy.deepcopy(exp_out)
    reg = REGISTRY["D1"]
    sizes = {
        "drawing": (exp["effective"]["state"]["width"], exp["effective"]["state"]["length"]),
        "drawingRaw": (exp["revived"]["width"], exp["revived"]["length"]),
        "extra": (exp["revived"]["width"], exp["revived"]["length"]),
    }
    for path in reg["case_layout_paths"]:
        e, g = _dig(exp, path), _dig(got, path)
        if _d1_affected(e) and isinstance(g, dict):
            w, ln = sizes[path[0]]
            _check_d1(e, g, w, ln)
            _patch(e, g)
    _apply_d9(exp, got)
    _apply_d12(exp, got)
    _apply_d13(exp, got)
    eL = _dig(exp, ("drawing", "perf", "layout"))
    gL = _dig(got, ("drawing", "perf", "layout"))
    eh, gh = _dig(exp, reg["case_hole_path"]), _dig(got, reg["case_hole_path"])
    if _d1_affected(eL) and isinstance(eh, list) and isinstance(gh, list):
        w = sizes["drawing"][0]
        # eski qoidada start > uzunlik bo'lgan (degenerat) holatda teshik chizilmagan — endi chiziladi
        assert len(gh) == len(eh) or (len(eh) == 0 and len(gh) <= gL["count"]), "D1: teshiklar soni"
        for h in gh:
            assert eL["edge"] - EPS <= h["u"] <= w - eL["edge"] + EPS or gL["cols"] == 1, f"D1: teshik chetda {h}"
        zs = sorted({h["z"] for h in gh})
        for i, z in enumerate(zs):
            assert _close(z, gL["start"] + i * gL["pitchL"]), "D1: qatorlar qadami"
        exp["extra"]["holes"] = gh
    return exp


D9_PREFIX = "O'lchamlar g'ayrioddiy"


def _apply_d9(exp: dict, got: dict) -> None:
    """D9: ehtimoli past o'lchamlar haqida YANGI ogohlantirish (effective.issues oxirida, faqat qo'shiladi).

    Qoida mustaqil tekshiriladi (golden'dagi o'lchamlardan); boshqa issues golden bilan aynan solishtiriladi.
    """
    new = [i for i in got["effective"]["issues"] if i.get("message", "").startswith(D9_PREFIX)]
    rv = exp["revived"]
    w, ln = rv["width"], rv["length"]
    cg = exp["drawingRaw"].get("curve")
    if not (w > 0 and ln > 0):
        want = False
    elif rv["bendAngle"] > 0:
        want = bool(cg) and (w > 1500 or 2 * cg["R"] > 6000 or cg["r"] < w / 10)
    else:
        want = w > 3000 or ln > 200_000
    assert len(new) == (1 if want else 0), f"D9: ogohlantirish kutilgan={want}, chiqdi={len(new)}"
    for i in new:
        assert i["level"] == "warning" and i["tab"] == "belt" and i["ru"].startswith("Необычные размеры")
        # oxirida (faqat D13 xatolaridan oldin) — qolganlari tartibi o'zgarmaydi
        rest = [j for j in got["effective"]["issues"] if not j.get("message", "").startswith(D13_PREFIXES)]
        assert rest[-1] is i
    exp["effective"]["issues"] = exp["effective"]["issues"] + new


def apply_func(fn: str, args: list, exp_out: Any, got: Any) -> Any:
    reg = REGISTRY["D1"]
    if fn in reg["funcs"] and _d1_affected(exp_out) and isinstance(got, dict):
        exp = copy.deepcopy(exp_out)
        _check_d1(exp, got, args[0], args[1])
        _patch(exp, got)
        return exp
    return exp_out


D12_RE = __import__("re").compile(r" \(gofra devorigacha zazor 10 mm bo'lsa — [\d  ,]+ mm gacha\)$")
D12_RU = __import__("re").compile(r" \(при зазоре до стенки 10 мм — до [\d  ,]+ мм\)$")


def _apply_d12(exp: dict, got: dict) -> None:
    """D12: faqat crossLen ogohlantirishi matniga qavsli izoh qo'shiladi; boshqa hamma narsa qat'iy."""
    ei, gi = exp["effective"]["issues"], got["effective"]["issues"]
    for k, e in enumerate(ei):
        if e.get("field") != "crossLen" or k >= len(gi) or gi[k].get("field") != "crossLen":
            continue
        g = gi[k]
        if g["message"] != e["message"] and g["message"].startswith(e["message"]):
            assert D12_RE.fullmatch(g["message"][len(e["message"]) :]) or D12_RE.search(g["message"]), (
                "D12: izoh shakli"
            )
            assert g["ru"].startswith(e["ru"]) and D12_RU.search(g["ru"]), "D12: ru izoh"
            e["message"], e["ru"] = g["message"], g["ru"]


D13_PREFIXES = ("Bukish burchagi juda kichik", "O'lcham haddan tashqari katta", "Gofrobort lentaga sig'maydi")


def _apply_d13(exp: dict, got: dict) -> None:
    """D13: yangi bloklovchi xatolar — qoida golden o'lchamlaridan mustaqil hisoblanadi, issues oxiriga qo'shiladi."""
    new = [i for i in got["effective"]["issues"] if i.get("message", "").startswith(D13_PREFIXES)]
    rv = exp["revived"]
    w, ln, bend = rv["width"], rv["length"], rv["bendAngle"]
    cg = exp["drawingRaw"].get("curve")
    want: list[str] = []
    if bend > 0:
        bad_r = bool(cg) and any(cg.get(k) is None for k in ("R", "r"))  # JSON: inf/NaN -> null
        if w > 0 and ln > 0 and (bend < 0.5 or bad_r):
            want.append(D13_PREFIXES[0])
        elif cg and (w > 15_000 or 2 * cg["R"] > 60_000):
            want.append(D13_PREFIXES[1])
    elif not bend > 0 and (w > 30_000 or ln > 2_000_000):
        want.append(D13_PREFIXES[1])
    if rv["gofroOn"] and 0 < w < 130:  # 2 × (band 55 + chetdan 10)
        want.append(D13_PREFIXES[2])
    assert [next(p for p in D13_PREFIXES if i["message"].startswith(p)) for i in new] == want, (
        f"D13: kutilgan={want}, chiqdi={[i['message'][:40] for i in new]}"
    )
    tail = got["effective"]["issues"][len(got["effective"]["issues"]) - len(new) :]
    for i, t in zip(new, tail, strict=True):
        assert i is t and i["level"] == "error"
    exp["effective"]["issues"] = exp["effective"]["issues"] + new
    if new:
        exp["effective"]["blocked"] = True

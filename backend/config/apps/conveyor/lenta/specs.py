"""Profil, gofra geometrik o'lchamlari — `lib/specs.ts` nusxasi (narx yo'q).

B — yuqori (keng) tomoni, H — balandligi, S — pastki (tor) tomoni, mm.
`src`: chizma · standart · yongli · nomidan · taxminiy.
"""

from __future__ import annotations

import math
from typing import Any

from ._js import jmax, jmin, jround


def _g(B: float, H: float, S: float, toothed: bool, minRoller: float, src: str) -> dict[str, Any]:
    return {"B": B, "H": H, "S": S, "toothed": toothed, "minRoller": minRoller, "src": src}


GUIDE_SPECS: dict[str, dict[str, Any]] = {
    "Профиль К 6": _g(6, 3.5, 3.5, False, 30, "standart"),
    "Профиль К 8": _g(8, 5, 5, False, 40, "standart"),
    "Профиль К 10": _g(10, 6, 6, False, 60, "standart"),
    "Профиль К 13": _g(13, 8, 7, False, 80, "standart"),
    "Профиль К 17": _g(17, 11, 9, False, 120, "standart"),
    "Профиль К 10 TOOTHED": _g(10, 6, 6, True, 40, "standart"),
    "Профиль К 13 TOOTHED": _g(13, 8, 7, True, 50, "standart"),
    "Профиль К 17 TOOTHED": _g(17, 11, 9, True, 100, "standart"),
    "D6-P - M/NB": _g(6, 4, 3.5, False, 40, "yongli"),
    "D8-P - M/NB": _g(8, 5, 5, False, 50, "yongli"),
    "D10-P - M/NB": _g(10, 6.5, 6, False, 70, "chizma"),
    "D13-P - M/NB": _g(13, 8, 7, False, 100, "yongli"),
    "D17-P - M/NB": _g(17, 11, 9, False, 120, "standart"),
    "DKC10-P (TOOTHED) - M/NB": _g(10, 5.4, 4.62, True, 50, "chizma"),
    "DKC13-P (TOOTHED) - M/NB": _g(13, 8, 7, True, 70, "yongli"),
    "DKC17-P (TOOTHED) - M/NB": _g(17, 11, 9, True, 100, "standart"),
    "UDK6-W (TOOTHED) - Полиуретан": _g(6, 4, 3.2, True, 30, "yongli"),
    "UDK8-W (TOOTHED) - Полиуретан": _g(8, 5, 4, True, 40, "yongli"),
    "UDK10-W (TOOTHED) - Полиуретан": _g(10, 6, 4.8, True, 60, "yongli"),
}


def _c(H: float, B: float, T: float, kind: str, minRoller: float) -> dict[str, Any]:
    return {"H": H, "B": B, "T": T, "kind": kind, "minRoller": minRoller, "src": "yongli"}


CLEAT_SPECS: dict[str, dict[str, Any]] = {
    "Профиль Т 20": _c(20, 20, 6, "straight", 90),
    "Профиль T(1)20-P (PETROL)": _c(20, 20, 6, "straight", 90),
    "Профиль T(1)20-W (WHITE)": _c(20, 20, 6, "straight", 90),
    "Профиль T(1)30-P (PETROL)": _c(30, 25, 7, "straight", 120),
    "Профиль T(1)30-W (WHITE)": _c(30, 25, 7, "straight", 120),
    "Профиль T(1)40-P (PETROL)": _c(40, 25, 7, "straight", 120),
    "Профиль T(1)40-W (WHITE)": _c(40, 25, 7, "straight", 120),
    "Профиль L 30 XT30-P (PETROL)": _c(30, 30, 8, "scooped", 60),
    "Профиль L 30 XT30-W (WHITE)": _c(30, 30, 8, "scooped", 60),
    "Профиль L 40": _c(40, 30, 8, "scooped", 60),
    "Профиль L 40 XT40-P (PETROL)": _c(40, 30, 8, "scooped", 60),
    "Профиль L 40 XT40-W (WHITE)": _c(40, 30, 8, "scooped", 60),
    "Профиль L 50": _c(50, 30, 8, "scooped", 80),
    "Профиль L 50 XT50-P (PETROL)": _c(50, 30, 8, "scooped", 80),
    "Профиль L 50 XT50-W (WHITE)": _c(50, 30, 8, "scooped", 80),
    "Профиль L 60": _c(60, 30, 8, "scooped", 80),
    "Профиль L 60 XT60-P (PETROL)": _c(60, 30, 8, "scooped", 80),
    "Профиль L 60 XT60-W (WHITE)": _c(60, 30, 8, "scooped", 80),
    "Профиль W(2)T50-P (PETROL)": _c(50, 30, 9, "wave", 130),
    "Профиль W(2)T50-W (WHITE)": _c(50, 30, 9, "wave", 130),
}

# Gofra qo'yilganda ko'ndalang profil uchun har tomondan qoldiriladigan joy, mm
CROSS_CLEARANCE_PER_SIDE = 55
# Ko'ndalang profil bilan gofra orasidagi odatiy zazor, mm
CROSS_TO_SIDEWALL_GAP = CROSS_CLEARANCE_PER_SIDE - 30
# Gofra devori va ko'ndalang profil orasidagi eng kam masofa, mm
CROSS_TO_SIDEWALL_MIN = 10
# Yangi gofraning chetdan odatiy masofasi, mm
GOFRO_DEFAULT_INSET = 10
# Gofraning chetdan ENG KAM masofasi (qat'iy), mm
GOFRO_MIN_INSET = 10
# Ustidagi yo'naltiruvchi va ko'ndalang profil orasidagi eng kam zazor, mm
CROSS_TO_GUIDE_GAP = 10

SIDEWALL_SPEC: dict[str, Any] = {
    "thickness": 1.3,
    "width": 30,
    "baseWidth": CROSS_CLEARANCE_PER_SIDE,
    "minHeight": 15,
    "developedFactor": 3.2,
    "src": "yongli",
}

SOURCE_LABEL = {
    "chizma": "Megaplast chizmasidan",
    "standart": "V-guide sanoat standarti",
    "yongli": "YONGLI katalogi",
    "nomidan": "profil nomidan",
    "taxminiy": "tasdiqlanmagan",
}


def cleat_spec_for(name: Any) -> dict[str, Any] | None:
    """Ko'ndalang profil o'lchami; V-profil bo'lsa yo'naltiruvchilar jadvalidan."""
    if not isinstance(name, str):
        return None
    direct = CLEAT_SPECS.get(name)
    if direct:
        return dict(direct)
    g = GUIDE_SPECS.get(name)
    if g:
        return {
            "H": g["H"],
            "B": g["B"],
            "T": g["B"],
            "S": g["S"],
            "kind": "vguide",
            "minRoller": g["minRoller"],
            "src": g["src"],
        }
    return None


def cleat_outline(c: dict[str, Any]) -> list[dict[str, float]]:
    """Profilning ko'ndalang konturi (v — uzunlik bo'ylab, w — yuqoriga), mm."""
    H = jmax(c["H"], 0.1)
    B = jmax(c["B"], 0.1)
    if c["kind"] == "vguide":
        S = jmax(c.get("S") if c.get("S") is not None else B * 0.6, 0.1)
        off = (B - S) / 2
        return [{"v": 0, "w": 0}, {"v": B, "w": 0}, {"v": B - off, "w": H}, {"v": off, "w": H}]
    kind = c["kind"]
    lean = 0 if kind == "straight" else 0.5 if kind == "wave" else 0.3
    bend = 1.7 if kind == "wave" else 1.35
    t0 = 0.17 if kind == "straight" else 0.16
    t1 = 0.13 if kind == "straight" else 0.05
    fh = jmax(H * 0.08, 1.2)
    n = 12

    def mid(t: float) -> float:
        return B * (0.5 + lean * t**bend)

    def half(t: float) -> float:
        return B * (t0 + (t1 - t0) * t)

    right: list[dict[str, float]] = []
    left: list[dict[str, float]] = []
    for i in range(n + 1):
        t = i / n
        w = fh + (H - fh) * t
        k = 0 if i == n else 1
        right.append({"v": mid(t) + half(t) * k, "w": w})
        left.append({"v": mid(t) - half(t) * k, "w": w})
    return [
        {"v": 0, "w": 0},
        {"v": B, "w": 0},
        {"v": B, "w": fh * 0.55},
        {"v": mid(0) + half(0), "w": fh},
        *right,
        *reversed(left),
        {"v": mid(0) - half(0), "w": fh},
        {"v": 0, "w": fh * 0.55},
    ]


def fold_points(amp: float, pitch: float, steps: int = 18) -> list[dict[str, float]]:
    """Gofra burmasi konturi (ustdan): akkordeon qanotlari."""
    r = jmax(pitch / 4, 0.1)
    u_in = jmin(r, amp / 2)
    u_out = jmax(amp - r, u_in + 0.1)
    arc = int(jmax(3, jround(steps / 3)))
    pts = [{"u": u_in, "v": 0}, {"u": u_out, "v": 0}]
    for i in range(1, arc):
        a = -math.pi / 2 + (i / arc) * math.pi
        pts.append({"u": u_out + r * math.cos(a), "v": r + r * math.sin(a)})
    pts += [{"u": u_out, "v": 2 * r}, {"u": u_in, "v": 2 * r}]
    for i in range(1, arc):
        a = -math.pi / 2 - (i / arc) * math.pi
        pts.append({"u": u_in + r * math.cos(a), "v": 3 * r + r * math.sin(a)})
    pts.append({"u": u_in, "v": 4 * r})
    return pts


def _fold_length(amp: float, pitch: float) -> float:
    p = fold_points(amp, pitch, 60)
    return sum(math.hypot(p[i]["u"] - p[i - 1]["u"], p[i]["v"] - p[i - 1]["v"]) for i in range(1, len(p)))


def sidewall_pitch(amp: float, factor: float) -> float:
    """Burma qadami: yoyilgan uzunlik / to'g'ri uzunlik = factor bo'ladigan qadam."""
    if amp <= 0 or factor <= 1:
        return jmax(amp, 1)
    lo = amp * 0.02
    hi = amp * 4
    for _ in range(60):
        mid = (lo + hi) / 2
        if _fold_length(amp, mid) / mid > factor:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2

"""Joy kodlari — ombor → bino → xona → stellaj → qator → qavat; har daraja o'z kodiga ega va pastgisi uni davom ettiradi:

    AO              ombor (2 harf)
    AO1             bino (raqam)
    AO1-A           xona (harf, bino ichida yagona)
    AO1-A-02        stellaj (2 raqam)
    AO1-A-02-03     qator / seksiya (2 raqam, chapdan o'ngga)
    AO1-A-02-03-C   joy: qavat harf bilan, A — eng pastki (I va O yo'q — 1 va 0 bilan adashmasin)

Sof funksiyalar (model yo'q) — servislar ham, migratsiyalar ham ishlatadi."""

import re

FLOORS = "ABCDEFGHJKLMNPQRSTUVWXYZ"  # 24 qavat
MAX_FLOORS = len(FLOORS)
MAX_ROWS = 99
MAX_RACKS = 99
CELL_RE = re.compile(r"^([A-Z]{2,3})(\d{1,2})-([A-Z]{1,2})-(\d{2})-(\d{2})-([A-Z])$")


def floor_letter(f: int) -> str:
    return FLOORS[f - 1]


def floor_of(letter: str) -> int:
    return FLOORS.index(letter) + 1


def building(wh: str, number: int) -> str:
    return f"{wh}{number}"


def block(bld: str, letter: str) -> str:
    return f"{bld}-{letter}"


def rack(blk: str, number: int) -> str:
    return f"{blk}-{number:02d}"


def row(rk: str, q: int) -> str:
    return f"{rk}-{q:02d}"


def cell(rk: str, q: int, f: int) -> str:
    return f"{row(rk, q)}-{floor_letter(f)}"


def guess_wh(name: str, taken: set[str]) -> str:
    """Ombor nomidan 2 harfli kod: «Asosiy ombor» → AO, «Do'kon — Chilonzor» → DC, «Sex» → SX; band bo'lsa — boshqasi."""
    words = [re.sub(r"[^A-Za-z]", "", w).upper() for w in name.split()]
    words = [w for w in words if w]
    if len(words) >= 2:
        base = words[0][0] + words[1][0]
    elif words:
        w = words[0]
        cons = [ch for ch in w[1:] if ch not in "AEIOU"]
        base = w[0] + (cons[0] if cons else (w[1] if len(w) > 1 else "X"))
    else:
        base = "OM"
    if base not in taken:
        return base
    for ch in "ABCDEFGHJKLMNPQRSTUVWXYZ":
        if (c := base[0] + ch) not in taken:
            return c
    return base + "X"

"""Remen belgisi va avtomatik nom (frontend `src/erp/finance/lib/catalog.lib.ts` bilan bir xil natija — forma oldindan
ko'rsatgan nom serverda ham shunday chiqadi). Tishli `1040-8M` / dyuymli `210XL`, klinli `B-1450 Lp`, poliklinli
`8PK-1795`; nom — `1040-8M MEGADYNE`, rukav — `Рукав 1040-8M CNFULO`."""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

# dyuymli tishli profillar: belgi "<uzunlik><profil>" (210XL), qolganlari "<uzunlik>-<profil>" (1040-8M)
INCH = frozenset({"MXL", "XL", "L", "H", "XH", "XXH", "DL", "DH"})
# o'lcham turi → birlik
UNIT_OF = {"w": "mm", "wl": "m2", "l": "m"}

_V = re.compile(r"^((SP|XP)[ZABC]|[ZABCDE]|AX|BX|CX|AA|BB|CC|3VX?|5VX?|8V)$")
_RIB = re.compile(r"^P[JKLMH]$")


def family(profile: str) -> str:
    """Profil → oila: poliklinli (PJ, PK…) — rib, klinli (SPA, B, 3V…) — v, qolgani tishli — timing."""
    p = profile.upper()
    if _RIB.match(p):
        return "rib"
    if _V.match(p):
        return "v"
    return "timing"


def _num(v: object) -> Decimal | None:
    try:
        d = Decimal(str(v).strip().replace(",", "."))
    except (InvalidOperation, ValueError):
        return None
    return d if d.is_finite() else None


def _ln(v: object) -> str:
    """Uzunlik matni: 1040.0 → "1040", 1250.5 → "1250.5" (JS Number→String kabi)."""
    d = _num(v) or Decimal(0)
    return str(int(d)) if d == d.to_integral_value() else format(d.normalize(), "f")


def belt_mark(profile: str, length: object, lstd: str = "", ribs: object = None, fam: str | None = None) -> str:
    p = (profile or "").strip().upper()
    n = _num(length) if length not in (None, "") else None
    if not p or not n:
        return ""
    fam = fam or family(p)
    ln = _ln(length)
    if fam == "rib":
        r = _num(ribs) if ribs not in (None, "") else None
        return f"{int(r) if r else ''}{p}-{ln}"
    if fam == "v":
        return f"{p}-{ln}" + (f" {lstd[0].upper()}{lstd[1:].lower()}" if lstd else "")
    return f"{ln}{p}" if p in INCH else f"{ln}-{p}"


def auto_name(
    *,
    profile: str = "",
    length: object = None,
    lstd: str = "",
    ribs: object = None,
    brand: str = "",
    series: str = "",
    dims: str | None = None,
) -> str:
    """Belgidan nom; belgi bo'lmasa — ""."""
    mark = belt_mark(re.sub(r"\s", "", profile or ""), length, lstd or "", ribs)
    if not mark:
        return ""
    tail = " ".join(x for x in ((brand or "").strip().upper(), (series or "").strip()) if x)
    return f"{'Рукав ' if dims == 'w' else ''}{mark}{' ' + tail if tail else ''}"


def search_text(name: str, mark: str | None) -> str:
    """Qidiruv matni: belgi (chiziqsiz) va nom — "1040 8M" ham topilsin."""
    return " | ".join(x for x in ((mark or "").replace("-", " "), name) if x)

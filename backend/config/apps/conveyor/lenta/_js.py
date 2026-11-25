"""JS semantikasi yordamchilari — TypeScript asl bilan AYNAN bir xil natija uchun.

`Math.round` (yarim yuqoriga), NaN/Infinity'ni yutadigan floor/ceil, `bool` son emas,
`String(number)`, `toLocaleString("ru-RU")` va `JSON.stringify` ekvivalentlari.
"""

from __future__ import annotations

import json
import math
from decimal import ROUND_HALF_UP, Context, Decimal
from typing import Any

INF = math.inf
NAN = math.nan
NBSP = " "


def is_num(x: Any) -> bool:
    """JS `typeof x === "number"` (bool son emas)."""
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def is_finite(x: Any) -> bool:
    """JS `Number.isFinite(x)`."""
    if not is_num(x):
        return False
    try:
        return math.isfinite(x)
    except OverflowError:
        return False


def to_float(x: Any) -> float:
    """Sonni JS double'ga aylantiradi (ulkan int -> Infinity)."""
    try:
        return float(x)
    except OverflowError:
        return INF if x > 0 else -INF


def jfloor(x: float) -> float:
    """`Math.floor` — inf/nan o'zgarmaydi, natija float."""
    x = to_float(x)
    if not math.isfinite(x):
        return x
    return float(math.floor(x))


def jceil(x: float) -> float:
    """`Math.ceil`."""
    x = to_float(x)
    if not math.isfinite(x):
        return x
    return float(math.ceil(x))


def jround(x: float) -> float:
    """`Math.round`: eng yaqin butun, teng bo'lsa +inf tomonga (bankir emas)."""
    x = to_float(x)
    if not math.isfinite(x):
        return x
    f = math.floor(x)
    r = float(f + 1) if x - f >= 0.5 else float(f)
    if r == 0 and (x < 0 or math.copysign(1.0, x) < 0):
        return -0.0
    return r


def jtrunc(x: float) -> float:
    x = to_float(x)
    if not math.isfinite(x):
        return x
    return float(math.trunc(x))


def jmax(*a: float) -> float:
    """`Math.max` — NaN tarqaladi, +0 > -0."""
    if not a:
        return -INF
    best = to_float(a[0])
    for v in a:
        v = to_float(v)
        if math.isnan(v):
            return NAN
        if math.isnan(best):
            return NAN
        if v > best or (v == 0 and best == 0 and math.copysign(1, best) < 0 < math.copysign(1, v)):
            best = v
    return best


def jmin(*a: float) -> float:
    """`Math.min` — NaN tarqaladi, -0 < +0."""
    if not a:
        return INF
    best = to_float(a[0])
    for v in a:
        v = to_float(v)
        if math.isnan(v):
            return NAN
        if math.isnan(best):
            return NAN
        if v < best or (v == 0 and best == 0 and math.copysign(1, v) < 0 < math.copysign(1, best)):
            best = v
    return best


def jdiv(a: float, b: float) -> float:
    """JS bo'lish: 0 ga bo'lishda Infinity/NaN (xato emas)."""
    a = to_float(a)
    b = to_float(b)
    if b == 0:
        if a == 0 or math.isnan(a):
            return NAN
        neg = (a < 0) != (math.copysign(1, b) < 0)
        return -INF if neg else INF
    return a / b


def jor(a: Any, b: Any) -> Any:
    """JS `a || b` son uchun: 0, NaN, null -> b."""
    if a is None or a is False or a == 0 or (isinstance(a, float) and math.isnan(a)) or a == "":
        return b
    return a


def js_str(x: Any) -> str:
    """JS `String(x)` son uchun (`${x}` shablonda)."""
    if x is None:
        return "null"
    if isinstance(x, bool):
        return "true" if x else "false"
    if isinstance(x, str):
        return x
    x = to_float(x)
    if math.isnan(x):
        return "NaN"
    if math.isinf(x):
        return "Infinity" if x > 0 else "-Infinity"
    if x == 0:
        return "0"
    sign = "-" if x < 0 else ""
    # eng qisqa raqamlar (Python repr ham, JS ham shortest round-trip)
    d = Decimal(repr(abs(x)))
    tup = d.as_tuple()
    digits = "".join(map(str, tup.digits)).rstrip("0") or "0"
    # n — o'nlik nuqta o'rni: qiymat = 0.digits × 10^n
    n = len(tup.digits) + tup.exponent
    k = len(digits)
    if k <= n <= 21:
        return sign + digits + "0" * (n - k)
    if 0 < n <= 21:
        return sign + digits[:n] + "." + digits[n:]
    if -6 < n <= 0:
        return sign + "0." + "0" * (-n) + digits
    e = n - 1
    es = ("+" if e >= 0 else "-") + str(abs(e))
    if k == 1:
        return sign + digits + "e" + es
    return sign + digits[0] + "." + digits[1:] + "e" + es


_CTX = Context(prec=1000)


def to_locale_ru(x: Any, min_fd: int = 0, max_fd: int = 3) -> str:
    """`x.toLocaleString("ru-RU", {min/maxFractionDigits})` — minglar NBSP bilan, kasr vergul."""
    x = to_float(x)
    if math.isnan(x):
        return "не число"
    neg = math.copysign(1.0, x) < 0
    if math.isinf(x):
        return ("-" if neg else "") + "∞"
    d = Decimal(repr(abs(x)))
    q = d.quantize(Decimal(1).scaleb(-max_fd), rounding=ROUND_HALF_UP, context=_CTX)
    s = format(q, "f")
    if "." in s:
        ip, fp = s.split(".")
    else:
        ip, fp = s, ""
    fp = fp.rstrip("0")
    if len(fp) < min_fd:
        fp = fp + "0" * (min_fd - len(fp))
    groups = []
    while len(ip) > 3:
        groups.insert(0, ip[-3:])
        ip = ip[:-3]
    groups.insert(0, ip)
    out = NBSP.join(groups)
    if fp:
        out += "," + fp
    return ("-" if neg else "") + out


def _is_index_key(k: str) -> bool:
    return k.isascii() and k.isdigit() and (k == "0" or k[0] != "0") and int(k) < 2**32 - 1


def _js_json(v: Any, out: list[str]) -> None:
    if v is None:
        out.append("null")
    elif isinstance(v, bool):
        out.append("true" if v else "false")
    elif is_num(v):
        f = to_float(v)
        out.append(js_str(f) if math.isfinite(f) else "null")
    elif isinstance(v, str):
        out.append(json.dumps(v, ensure_ascii=False))
    elif isinstance(v, (list, tuple)):
        out.append("[")
        for i, item in enumerate(v):
            if i:
                out.append(",")
            _js_json(item, out)
        out.append("]")
    elif isinstance(v, dict):
        out.append("{")
        first = True
        # JS obyektida butun-indeks kalitlar ("0", "12") doim birinchi, o'sish tartibida
        keys = [str(k) for k in v]
        idx = sorted((k for k in keys if _is_index_key(k)), key=int)
        rest = [k for k in keys if not _is_index_key(k)]
        by_str = {str(k): item for k, item in v.items()}
        for k, item in ((k, by_str[k]) for k in idx + rest):
            if not first:
                out.append(",")
            first = False
            out.append(json.dumps(str(k), ensure_ascii=False))
            out.append(":")
            _js_json(item, out)
        out.append("}")
    else:
        raise TypeError(f"JSON'ga aylanmaydi: {type(v)!r}")


def js_json(v: Any) -> str:
    """`JSON.stringify(v)` — bo'shliqsiz, sonlar JS ko'rinishida (860, 860.0 emas)."""
    out: list[str] = []
    _js_json(v, out)
    return "".join(out)

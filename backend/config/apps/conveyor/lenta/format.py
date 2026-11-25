"""Son formatlari — `lib/format.ts`, `lib/lang.ts` (trValue) va `today.ts` nusxasi."""

from __future__ import annotations

import re
from datetime import date

from ._js import NBSP, is_finite, jround, js_str, to_locale_ru


def uzs(x: float, decimals: int = 0) -> str:
    """1234567 -> "1 234 567" (minglar oddiy bo'shliq bilan, kasr vergul)."""
    v = x if is_finite(x) else 0
    return to_locale_ru(v, decimals, decimals).replace(NBSP, " ")


def money(x: float, lang: str = "uz") -> str:
    """Summa valyuta bilan: "1 234 so'm" / "1 234 сум"."""
    return f"{uzs(jround(x))} {'сум' if lang == 'ru' else 'so' + chr(39) + 'm'}"


def f1(n: float) -> str:
    """Bitta kasr, vergul bilan: 9.9 -> "9,9" · 11 -> "11" · 1.25 -> "1,3"."""
    return js_str(jround(n * 10) / 10).replace(".", ",")


def n2(x: float) -> str:
    """`toLocaleString("ru-RU", {maximumFractionDigits: 2})` (NBSP saqlanadi)."""
    return to_locale_ru(x, 0, 2)


def n4(x: float) -> str:
    """`toLocaleString("ru-RU", {maximumFractionDigits: 4})`."""
    return to_locale_ru(x, 0, 4)


def format_date(d: date) -> str:
    """ "DD.MM.YYYY"."""
    return f"{d.day:02d}.{d.month:02d}.{d.year:04d}"


_TR = [
    (re.compile(r"yo'q \(ulanmaydi\)"), "нет (без соединения)"),
    (re.compile(r"kiritilmagan"), "не указано"),
    (re.compile(r"kichik o'lcham"), "малый размер"),
    (re.compile(r"so'mgacha"), "сум"),
    (re.compile(r"so'm"), "сум"),
    (re.compile(r"(\d) dona", re.ASCII), r"\1 шт"),
    (re.compile(r"mm gacha bir xil"), "мм — одинаково"),
    (re.compile(r"\bmm\b", re.ASCII), "мм"),
    (re.compile(r"\byo'q\b", re.ASCII), "нет"),
]


def tr_value(lang: str, v: str) -> str:
    """Hisob qatori qiymatini ruschaga (lang == "ru" bo'lsa)."""
    if lang != "ru":
        return v
    for rx, rep in _TR:
        v = rx.sub(rep, v)
    return v

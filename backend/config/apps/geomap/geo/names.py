"""Kompaniya nomi kaliti (Jarvis geomap/sync.py `name_key`): tashkiliy shakl, qo'shtirnoq, tinish belgilarisiz;
kirill → lotin; so'zlar tartibsiz — bir xil firmani turli yozilishda solishtirish (orginfo, yangi mijozlar)."""

from __future__ import annotations

import re

_LEGAL = {
    "mchj",
    "mch",
    "ooo",
    "oaj",
    "aj",
    "xk",
    "chp",
    "ip",
    "yatt",
    "qk",
    "kk",
    "ok",
    "llc",
    "ltd",
    "ao",
    "zao",
    "oao",
    "fx",
    "masuliyati",
    "masuliyat",
    "cheklangan",
    "jamiyati",
    "jamiyat",
    "jamiyatii",
    "shaklidagi",
    "xususiy",
    "korxonasi",
    "korxona",
    "aksiyadorlik",
    "aksiyadorligi",
    "oilaviy",
    "qoshma",
    "fermer",
    "xojaligi",
    "dehqon",
    "firmasi",
    "firma",
    "uzb",
    "obshestvo",
    "ogranichennoy",
    "otvetstvennostyu",
    "chastnoe",
    "predpriyatie",
    "unitar",
}


def name_key(name: str | None) -> str:
    """Kompaniya nomi kaliti: tashkiliy shakl, qo'shtirnoq, tinish belgilarisiz; kirill -> lotin; so'zlar tartibsiz."""
    from .geo import translit

    n = re.sub(r"'", "", translit(name or ""))
    return " ".join(sorted(w for w in re.sub(r"[^a-z0-9]+", " ", n).split() if w not in _LEGAL))

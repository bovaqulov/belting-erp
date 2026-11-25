"""Lenta katalogi — `backend/data/secret/lenta_catalog.json` (narxlar MAXFIY, faqat serverda; `data/` git'da yo'q).

`catalog()` — to'liq katalog (hisob uchun). `public_catalog()` — mijozga beriladigan
qism: faqat nomlar, izohlar, qalinlik va geometriya; narx/ustama/kurs YO'Q.
"""

from __future__ import annotations

import copy
import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from django.conf import settings


def catalog_path() -> Path:
    """LENTA_CATALOG (muhit) — boshqa faylni sinash uchun; aks holda settings.LENTA_CATALOG yoki data/secret."""
    return Path(
        os.environ.get("LENTA_CATALOG")
        or getattr(settings, "LENTA_CATALOG", "")
        or settings.BASE_DIR / "data" / "secret" / "lenta_catalog.json"
    )


def available() -> bool:
    return catalog_path().is_file()


# public_catalog() da HECH QACHON bo'lmasligi kerak bo'lgan kalitlar
SECRET_KEYS = frozenset(
    {
        "base",
        "baseref",
        "zapas",
        "markup",
        "rate",
        "vat",
        "pricePerM",
        "pricePerPiece",
        "services",
        "installTiers",
        "rounding",
        "joint",
        "lengthFactor",
    }
)


@lru_cache(maxsize=1)
def catalog() -> dict[str, Any]:
    """To'liq katalog (narxlar bilan). Faqat hisob ichida ishlatiladi."""
    p = catalog_path()
    if not p.is_file():
        raise FileNotFoundError(f"lenta katalogi yo'q ({p})")
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def by_name(items: list[dict[str, Any]], name: Any) -> dict[str, Any] | None:
    """Ro'yxatdan nom bo'yicha birinchi element; topilmasa None."""
    for x in items:
        if x.get("name") == name and isinstance(name, str):
            return x
    return None


def _pick(row: dict[str, Any], keys: tuple[str, ...]) -> dict[str, Any]:
    return {k: copy.deepcopy(row[k]) for k in keys if k in row}


def public_catalog() -> dict[str, Any]:
    """Mijozga beriladigan katalog: nomlar va geometriya — narxsiz."""
    c = catalog()
    return {
        "belts": [_pick(b, ("name", "note", "thickness")) for b in c["belts"]],
        "locks": [_pick(lk, ("name", "note", "maker", "consumption", "perPiece")) for lk in c["locks"]],
        "guideProfiles": [_pick(p, ("name", "maker", "kind")) for p in c["guideProfiles"]],
        "crossProfiles": [_pick(p, ("name", "maker", "kind")) for p in c["crossProfiles"]],
        "gofroProfiles": [_pick(p, ("name", "maker", "kind", "height")) for p in c["gofroProfiles"]],
        "perforation": [_pick(p, ("name",)) for p in c["perforation"]],
    }

"""remen.uz ochiq API (v2) — AI yordamchi uchun mahsulot qidiruvi: nom va sahifa havolasi.

`in_stock` OLINMAYDI: saytda hamma tovarda 100 (to'ldiruvchi qiymat) — omborda bor-yo'qligi faqat 1C dan (`stock.py`).

NARX OLINMAYDI va AI'ga berilmaydi (egasi qarori: narxni menejer aytadi). Ochiq endpoint, token kerak emas;
cheklov 500 so'rov/daqiqa — qisqa kesh (10 daqiqa).
"""

from __future__ import annotations

import logging
import re
import time
from typing import Any

import httpx

log = logging.getLogger(__name__)
API = "https://api.remen.uz/api/v2/products"
SITE = "https://remen.uz/product/"
TTL = 600
_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}

# remen belgilari: SPZ 1500, 177-S3M, 8M-1040, HTD 8M 1200, A 1250, 6PK 1500, B-42 …
_SPEC = re.compile(
    r"(?<![\w])("
    r"[a-zа-я]{1,5}[\s\-]?\d{2,5}(?:[\s\-]?[a-z]{1,4}\d?)?"  # SPZ 1500, B-42, A 1250 Lw (qo'shimcha — lotin)
    r"|\d{1,3}[a-zа-я]{1,3}[\s\-]?\d{2,5}"  # 6PK 1500, 8M-1040
    r"|\d{2,5}[\s\-]?[a-zа-я]{1,3}\d{0,2}[a-zа-я]{0,2}"  # 177-S3M, 1040 8M
    r")(?![\w])",
    re.I,
)
_STOP = {"salom", "narxi", "bormi", "qancha", "kerak", "dona", "sht", "mm", "sm", "м", "мм"}


def queries(text: str, limit: int = 3) -> list[str]:
    """Xabardan remen belgilari (qidiruv so'rovlari) — matn qidiruvi emas, belgi bo'yicha."""
    out: list[str] = []
    for m in _SPEC.finditer(text or ""):
        q = re.sub(r"\s+", " ", m.group(1).replace("-", " ")).strip()
        if q.lower() in _STOP or not any(ch.isdigit() for ch in q) or not any(ch.isalpha() for ch in q):
            continue
        if q.upper() not in (x.upper() for x in out):
            out.append(q)
        if len(out) >= limit:
            break
    return out


def search(q: str, limit: int = 5) -> list[dict[str, Any]]:
    key = q.lower()
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < TTL:
        return hit[1]
    try:
        r = httpx.get(
            API,
            params={"search": q, "quantity": limit},
            headers={"Accept": "application/json", "Accept-Language": "ru"},
            timeout=10,
        )
        rows = r.json().get("data") or []
    except (httpx.HTTPError, ValueError) as e:
        log.warning("remen.uz qidiruvi: %s", e)
        return []
    out = [
        {
            "name": str(x.get("name") or ""),
            "url": SITE + str(x.get("id")) + "-" + str(x.get("slug") or ""),
        }
        for x in rows[:limit]
        if x.get("name")
    ]
    _cache[key] = (time.time(), out)
    return out


def lookup(text: str) -> dict[str, list[dict[str, Any]]]:
    """Xabardagi har belgi → topilgan mahsulotlar (bo'sh ro'yxat — saytda yo'q)."""
    return {q: search(q) for q in queries(text)}

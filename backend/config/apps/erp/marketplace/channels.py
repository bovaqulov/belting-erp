"""Kanal API mijozlari (WB, Ozon, Uzum) — faqat marketplace 1-bosqichi ishlatadigan metodlar, sinxron httpx.

Jarvis integrations/{wb,ozon,uzum}/client.py dan soddalashtirilgan (katalog va limiter'siz): 429 — qisqa kutib qayta.
Yozuvchi amal (`write=True`) — settings.MP_WRITE yoqilmaguncha kanalga yuborilmaydi (Forbidden).
Tokenlar: settings.WB_TOKEN, OZON_ID + OZON_TOKEN, UZUM_TOKEN (.env.local).
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

import httpx
from django.conf import settings
from django.core.cache import cache

log = logging.getLogger(__name__)

WB_MARKET = "https://marketplace-api.wildberries.ru"
WB_CONTENT = "https://content-api.wildberries.ru"
WB_ANALYTICS = "https://seller-analytics-api.wildberries.ru"
OZON = "https://api-seller.ozon.ru"
UZUM = "https://api-seller.uzum.uz/api/seller-openapi"
UA = "BeltingERP/1.0 (+marketplace)"
TIMEOUT = httpx.Timeout(60, connect=15)
NAMES = {"wb": "Wildberries", "ozon": "Ozon", "uzum": "Uzum Market"}


class ChannelError(Exception):
    """Kanal API xatosi (502) yoki biznes rad etishi (400)."""

    def __init__(self, detail: str, status: int = 502):
        super().__init__(detail)
        self.detail = detail
        self.status = status


class WriteBlocked(ChannelError):
    def __init__(self) -> None:
        super().__init__(
            "Kanalga yozish o'chiq (faqat o'qish rejimi). Yoqish: backend .env.local da MP_WRITE=1 va qayta ishga tushirish.",
            403,
        )


@dataclass
class Res:
    status: int
    content: bytes
    ctype: str

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300

    def json(self) -> Any:
        if not self.content:
            return None
        try:
            return httpx.Response(200, content=self.content).json()
        except ValueError:
            return None

    def text(self, n: int = 300) -> str:
        return self.content[:n].decode("utf-8", "replace")


def configured(ch: str) -> bool:
    if ch == "wb":
        return bool(settings.WB_TOKEN)
    if ch == "ozon":
        return bool(settings.OZON_ID and settings.OZON_TOKEN)
    if ch == "uzum":
        return bool(settings.UZUM_TOKEN)
    return False


def _headers(ch: str) -> dict[str, str]:
    if not configured(ch):
        env = {"wb": "WB_TOKEN", "ozon": "OZON_ID va OZON_TOKEN", "uzum": "UZUM_TOKEN"}[ch]
        raise ChannelError(f"{NAMES[ch]} ulanmagan: backend .env.local da {env} kerak.", 400)
    if ch == "wb":
        return {"Authorization": settings.WB_TOKEN, "User-Agent": UA}
    if ch == "ozon":
        return {"Client-Id": settings.OZON_ID, "Api-Key": settings.OZON_TOKEN, "User-Agent": UA}
    return {"Authorization": settings.UZUM_TOKEN, "Accept-Language": "ru", "User-Agent": UA}


def request(
    ch: str,
    method: str,
    url: str,
    *,
    params: dict | None = None,
    json: Any = None,
    write: bool = False,
) -> Res:
    """Bitta so'rov; 429/5xx — 3 marta qisqa kutib qayta. Tarmoq xatosi — ChannelError(502)."""
    if write and not settings.MP_WRITE:
        raise WriteBlocked
    headers = _headers(ch)
    q = {
        k: ",".join(map(str, v)) if isinstance(v, list) else v for k, v in (params or {}).items() if v not in (None, "")
    }
    last: Res | None = None
    for attempt in range(3):
        try:
            with httpx.Client(timeout=TIMEOUT) as h:
                r = h.request(method, url, params=q, json=json, headers=headers)
        except httpx.HTTPError as e:
            raise ChannelError(f"{NAMES[ch]} bilan aloqa yo'q: {e.__class__.__name__}") from e
        last = Res(r.status_code, r.content, r.headers.get("content-type", ""))
        if r.status_code != 429 and r.status_code < 500:
            return last
        wait = float(r.headers.get("X-Ratelimit-Retry") or r.headers.get("Retry-After") or 2 * (attempt + 1))
        time.sleep(min(wait, 10))
    assert last is not None
    return last


def error_text(ch: str, r: Res) -> str:
    j = r.json()
    msg = ""
    if isinstance(j, dict):
        errs = j.get("errors")
        if isinstance(errs, list):
            msg = "; ".join(str(e.get("message") or e) if isinstance(e, dict) else str(e) for e in errs)
        msg = msg or str(j.get("message") or j.get("detail") or j.get("errorText") or "")
    hint = {401: "token noto'g'ri", 403: "tokenga ruxsat yo'q", 404: "topilmadi", 429: "limit — keyinroq"}.get(
        r.status, ""
    )
    out = f"{NAMES[ch]} HTTP {r.status}" + (f" ({hint})" if hint else "")
    return out + (f": {msg[:200]}" if msg else (f": {r.text(200)}" if r.content and not hint else ""))


def must(ch: str, r: Res, what: str) -> Any:
    if not r.ok:
        raise ChannelError(f"{what}: {error_text(ch, r)}")
    return r.json()


# ---------------------------------------------------------------- WB
def wb(method: str, path: str, *, host: str = WB_MARKET, **kw: Any) -> Res:
    return request("wb", method, host + path, **kw)


# ---------------------------------------------------------------- Ozon (hammasi POST JSON)
def ozon(path: str, body: dict, *, write: bool = False) -> dict:
    r = request("ozon", "POST", OZON + path, json=body, write=write)
    return must("ozon", r, "Ozon") or {}


# ---------------------------------------------------------------- Uzum
def uzum(method: str, path: str, **kw: Any) -> Res:
    return request("uzum", method, UZUM + path, **kw)


def uzum_payload(r: Res) -> Any:
    j = r.json()
    return j.get("payload", j) if isinstance(j, dict) and "payload" in j else j


def uzum_shops() -> list[int]:
    """Kalitga ochiq do'konlar (kesh 6 soat). /v1/shops yopiq do'konni ham qaytaradi — har biri sinab ko'riladi."""
    key = "mp:uzum:shops"
    if (hit := cache.get(key)) is not None:
        return hit
    p = uzum_payload(r) if (r := uzum("GET", "/v1/shops")).ok else must("uzum", r, "Uzum do'konlar")
    items = p if isinstance(p, list) else (p or {}).get("shops") or (p or {}).get("items") or []
    out = []
    for s in items:
        sid = s.get("id") if isinstance(s, dict) else None
        if sid is not None and uzum("GET", "/v2/fbs/orders/count", params={"shopIds": [sid], "status": "CREATED"}).ok:
            out.append(int(sid))
    cache.set(key, out, 6 * 3600)
    return out

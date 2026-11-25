"""AI yordamchi: remen omborda bormi — 1C qoldig'i (eski Jarvis bazasi, FAQAT O'QISH).

Manba: `JARVIS_ONEC_DB_URL` (postgres://…; eski Jarvis 1C'dan sinxronlaydigan `onec_item`/`onec_stock` jadvallari).
Yangi ERP katalogi hali demo — 1C integratsiyasi ko'chgach shu modul o'sha manbaga o'tadi.

Mijozga faqat holat: BOR / ZAKAZGA / NOMA'LUM — son, ombor, 1C nomi, kod hech qachon chiqmaydi.
- NOMA'LUM: manba sozlanmagan, ochilmadi yoki qoldiq `TGCRM_STOCK_MAX_AGE_H` soatdan eski (1C sinxroni to'xtagan bo'lishi
  mumkin) — AI "menejer aniqlab beradi" deydi, "bor" demaydi.
- remen.uz `in_stock` ishlatilmaydi: u yerda hamma tovarda 100 (to'ldiruvchi qiymat).
Tishli remen rukavi (quvur) omborda bo'lsa — o'lchamga kesib beriladi, ya'ni "bor".
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from django.conf import settings
from django.utils import timezone

from .belts import Spec, len_diff, parse, same_size

log = logging.getLogger(__name__)
YES, ORDER, UNKNOWN = "bor", "zakazga", "noma'lum"
CACHE_SEC = 600
_lock = threading.Lock()
_cache: dict[str, Any] = {"at": 0.0, "data": None}


@dataclass
class Row:
    spec: Spec
    qty: float


def _load() -> tuple[datetime | None, list[tuple[str, float]]]:
    """(qoldiq sanasi, [(1C nomi, jami musbat qoldiq)]) — bitta faqat-o'qish tranzaksiyasi."""
    import psycopg

    url = settings.JARVIS_ONEC_DB_URL
    with psycopg.connect(url, connect_timeout=3, options="-c default_transaction_read_only=on") as conn:
        cur = conn.cursor()
        cur.execute("SELECT value FROM kv WHERE key LIKE 'onec_stock_%%'")
        stamps = [datetime.fromisoformat(v) for (v,) in cur.fetchall() if v]
        cur.execute(
            "SELECT i.name, COALESCE(SUM(s.qty) FILTER (WHERE s.qty > 0), 0) FROM onec_item i "
            "LEFT JOIN onec_stock s ON s.base = i.base AND s.item_kod = i.kod GROUP BY i.base, i.kod, i.name"
        )
        rows = [(str(n or ""), float(q or 0)) for n, q in cur.fetchall()]
    at = min(stamps) if stamps else None  # eng eski baza — ikkalasi ham yangi bo'lsin
    if at is not None and at.tzinfo is None:
        at = timezone.make_aware(at)
    return at, rows


def _data() -> tuple[datetime | None, list[Row]] | None:
    if not settings.JARVIS_ONEC_DB_URL:
        return None
    with _lock:
        if _cache["data"] is not None and time.time() - _cache["at"] < CACHE_SEC:
            return _cache["data"]
        try:
            at, raw = _load()
        except Exception as e:
            log.warning("tgcrm stock: 1C qoldig'i o'qilmadi: %s", e)
            return None
        rows = [Row(sp, q) for name, q in raw if (sp := parse(name)) and sp.length]
        _cache.update(at=time.time(), data=(at, rows))
        return at, rows


def clear_cache() -> None:
    _cache.update(at=0.0, data=None)


def source() -> dict[str, Any]:
    """Panel uchun: manba holati."""
    if not settings.JARVIS_ONEC_DB_URL:
        return {"ok": False, "at": None, "detail": "1C manbasi sozlanmagan (JARVIS_ONEC_DB_URL)"}
    d = _data()
    if d is None:
        return {"ok": False, "at": None, "detail": "1C qoldig'i o'qilmadi"}
    at, rows = d
    fresh = _fresh(at)
    return {
        "ok": fresh,
        "at": at.isoformat() if at else None,
        "items": len(rows),
        "detail": "yangi" if fresh else f"qoldiq {settings.TGCRM_STOCK_MAX_AGE_H} soatdan eski — AI «bor» demaydi",
    }


def _fresh(at: datetime | None) -> bool:
    return at is not None and timezone.now() - at <= timedelta(hours=settings.TGCRM_STOCK_MAX_AGE_H)


def check(want: Spec) -> dict[str, Any]:
    """{status, near: [{label, diff_mm}]} — near: aniq o'lcham omborda yo'q bo'lsa, shu profildagi bori (eng yaqin 3)."""
    d = _data()
    if d is None or not _fresh(d[0]):
        return {"status": UNKNOWN, "near": []}
    rows = d[1]
    same = [r for r in rows if same_size(r.spec, want)]
    if any(r.qty > 0 for r in same):
        return {"status": YES, "near": []}
    near: dict[str, float] = {}
    for r in rows:
        g = r.spec
        if r.qty <= 0 or g.family != want.family or g.profile != want.profile or same_size(g, want):
            continue
        if want.family == "rib" and want.ribs and g.ribs and g.ribs != want.ribs:
            continue
        lbl = Spec(g.family, g.profile, g.length, g.lstd if g.lstd == "li" else "", ribs=want.ribs or g.ribs).label()
        diff = round(len_diff(g, want))
        if lbl not in near or abs(diff) < abs(near[lbl]):
            near[lbl] = diff
    best = sorted(near.items(), key=lambda x: abs(x[1]))[:3]
    return {"status": ORDER, "near": [{"label": k, "diff_mm": v} for k, v in best if abs(v) <= 0.1 * want.length]}

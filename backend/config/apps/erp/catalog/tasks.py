"""Katalog fon vazifalari: AppSheet narxlari sinxroni (har 30 daqiqa; kalitlar sozlanmagan bo'lsa — hech narsa)."""

from __future__ import annotations

import logging

from celery import shared_task

from . import pricing

log = logging.getLogger(__name__)


@shared_task
def sync_prices() -> dict:
    if not pricing.configured():
        return {"skipped": "AppSheet kalitlari yo'q"}
    try:
        return pricing.sync_live()
    except Exception as exc:  # tarmoq/AppSheet xatosi — siyosat oynasida ko'rinadi, keyingi siklda qayta
        log.warning("AppSheet narx sinxroni: %s", exc)
        pol = pricing.policy()
        pol.sync_note = f"Xato: {exc}"[:300]
        pol.save(update_fields=["sync_note"])
        return {"error": str(exc)}

"""Audit appining ochiq interfeysi: jurnalga yozish (`log`) va o'qish (`recent`). Boshqa applar faqat shu orqali."""

from __future__ import annotations

import json
from typing import Any

from .models import Event

MAX_DETAIL = 8000  # Jarvis fit_detail: juda katta tafsilot qisqartiriladi


def fit_detail(detail: Any) -> str:
    if detail is None or detail == "":
        return ""
    s = detail if isinstance(detail, str) else json.dumps(detail, ensure_ascii=False, default=str)
    return s if len(s) <= MAX_DETAIL else s[: MAX_DETAIL - 1] + "…"


def log(
    event: str,
    tg_id: int | None = None,
    dept: str | None = None,
    chat_id: int | None = None,
    detail: Any = None,
    cost: float = 0.0,
) -> None:
    """Jurnal yozuvi. Xato bo'lsa ham asosiy amal to'xtamasin — chaqiruvchi o'zi try/except qilmaydi."""
    try:
        Event.objects.create(
            tg_id=tg_id, dept=(dept or "")[:60], chat_id=chat_id, event=event[:40], detail=fit_detail(detail), cost=cost
        )
    except Exception:
        import logging

        logging.getLogger(__name__).exception("audit yozilmadi: %s", event)


def recent(limit: int = 200, dept: str | None = None) -> list[Event]:
    qs = Event.objects.all()
    if dept:
        qs = qs.filter(dept=dept)
    return list(qs[:limit])

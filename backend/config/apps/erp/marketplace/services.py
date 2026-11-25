"""Marketplace appining ochiq interfeysi (boshqa applar faqat shu orqali): analitika uchun buyurtmalar xulosasi."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any

from django.utils import timezone

from .models import ACTIVE, Channel, Order, Stage


def orders_summary(d1: date, d2: date) -> dict[str, Any]:
    """Davr [d1, d2] da tushgan buyurtmalar (kanal, bosqich bo'yicha) va hozirgi faol / muddati o'tganlar."""
    tz = timezone.get_current_timezone()
    t1 = timezone.make_aware(datetime.combine(d1, time.min), tz)
    t2 = timezone.make_aware(datetime.combine(d2 + timedelta(days=1), time.min), tz)
    rows = list(Order.objects.filter(ordered__gte=t1, ordered__lt=t2).values_list("channel", "stage"))
    by_channel = {c.value: 0 for c in Channel}
    by_stage = {s.value: 0 for s in Stage}
    for ch, st in rows:
        by_channel[ch] = by_channel.get(ch, 0) + 1
        by_stage[st] = by_stage.get(st, 0) + 1
    active = Order.objects.filter(stage__in=ACTIVE)
    return {
        "orders_n": len(rows),
        "by_channel": by_channel,
        "by_stage": by_stage,
        "active_n": active.count(),
        "overdue_n": active.filter(deadline__lt=timezone.now()).count(),
        "channel_names": {c.value: c.label for c in Channel},
    }

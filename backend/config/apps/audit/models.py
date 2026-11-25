"""Audit jurnali (Jarvis `audit` jadvali): agent javoblari, vositalar chaqiruvi, hisobot topshirish, ovozli xabarlar va
boshqa muhim amallar. Yozish — `services.log()` (boshqa applar shu orqali); foydalanuvchi — tg_id bilan (FK yo'q)."""

from __future__ import annotations

from django.db import models


class Event(models.Model):
    ts = models.DateTimeField(auto_now_add=True, db_index=True)
    tg_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    dept = models.CharField(max_length=60, blank=True, db_index=True)  # bo'lim / agent kaliti
    chat_id = models.BigIntegerField(null=True, blank=True)
    event = models.CharField(max_length=40, db_index=True)  # answer | tool | voice | report_submitted | ...
    detail = models.TextField(blank=True)  # JSON matn (≤ 8 KB)
    cost = models.FloatField(default=0)

    class Meta:
        ordering = ["-id"]

    def __str__(self) -> str:
        return f"{self.ts:%Y-%m-%d %H:%M} {self.event}"

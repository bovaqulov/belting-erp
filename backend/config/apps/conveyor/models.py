"""LentaCUD loyihalari (Jarvis `lenta_project` jadvali): chizma holati (state — narxsiz `public_state`), mijoz,
qo'llanilishi, kontakt. Egasi — tg_id (applararo FK yo'q). `updated` — mikrosoniyagacha matn: optimistik qulf
(mijoz ko'rgan versiya mos kelmasa — 409)."""

from __future__ import annotations

from django.db import models


class LentaProject(models.Model):
    tg_id = models.BigIntegerField(db_index=True)
    name = models.CharField(max_length=120, blank=True)
    state = models.JSONField(default=dict)
    customer = models.CharField(max_length=300, blank=True)
    application = models.CharField(max_length=300, blank=True)
    contact = models.CharField(max_length=300, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.CharField(max_length=32)  # isoformat(microseconds)

    class Meta:
        ordering = ["-updated"]
        indexes = [models.Index(fields=["tg_id", "updated"])]

    def __str__(self) -> str:
        return self.name or f"#{self.pk}"

"""Sex modellari: zakaz (ishlab chiqarish topshirig'i) — Yangi → Yig'ilmoqda → Tayyorlanmoqda → Tayyor; material sarfi
(ombor birligidan, skaner bilan) va tarix. Tovar — katalogda (ID bilan), ombor — `erp_warehouse` (services orqali).

Marshrut (`route`): `rukav` — rukavdan eni bo'yicha kesiladi (`qty` — eni, mm; `pieces` — dona), `lenta` — konveyer
lenta (`spec`: {width, length, joint} mm), bo'sh — oddiy mahsulot (`qty` — miqdor, materiali katalogdagi `material_id`).
"""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from django.db import models

if TYPE_CHECKING:
    from django.db.models.manager import RelatedManager


class Phase(models.TextChoices):
    NEW = "new", "Yangi"
    COLLECTING = "collecting", "Yig'ilmoqda"
    MAKING = "making", "Tayyorlanmoqda"
    READY = "ready", "Tayyor"
    CANCELLED = "cancelled", "Bekor"


class Job(models.Model):
    number = models.CharField(max_length=24, unique=True)  # SX-26-0001
    source = models.CharField(max_length=40, blank=True, db_index=True)  # "crm:12" — kim ochgan
    order_number = models.CharField(max_length=40, blank=True)
    phase = models.CharField(max_length=12, choices=Phase.choices, default=Phase.NEW, db_index=True)
    priority = models.PositiveSmallIntegerField(default=0)
    due = models.DateTimeField(null=True, blank=True)
    route = models.CharField(max_length=8, blank=True)
    item_id = models.PositiveIntegerField()  # erp_catalog.Item — tayyor mahsulot
    char_id = models.PositiveIntegerField(null=True, blank=True)
    item_name = models.CharField(max_length=255)
    char_name = models.CharField(max_length=60, blank=True)
    material_id = models.PositiveIntegerField(null=True, blank=True)  # erp_catalog.Item — xom ashyo
    qty = models.DecimalField(max_digits=14, decimal_places=4)
    unit = models.CharField(max_length=12, default="dona")
    pieces = models.PositiveIntegerField(default=1)
    spec = models.JSONField(null=True, blank=True)  # lenta: {width, length, joint}
    firm = models.CharField(max_length=12, blank=True)
    customer = models.CharField(max_length=255, blank=True)
    channel = models.CharField(max_length=16, blank=True)
    seller_name = models.CharField(max_length=120, blank=True)
    order_note = models.TextField(blank=True)
    worker_tg = models.BigIntegerField(null=True, blank=True)
    worker_name = models.CharField(max_length=120, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    ready_at = models.DateTimeField(null=True, blank=True)
    product_unit = models.PositiveIntegerField(null=True, blank=True)  # erp_warehouse.Unit — omborga kirgan mahsulot
    product_code = models.CharField(max_length=16, blank=True)
    created = models.DateTimeField()

    if TYPE_CHECKING:
        takes: RelatedManager[Take]
        log: RelatedManager[Log]

    class Meta:
        ordering = ["-priority", "due", "id"]

    def __str__(self) -> str:
        return self.number


class Take(models.Model):
    """Material sarfi: qaysi birlikdan, qancha (rejadagi birlikda: rukav — eni mm, lenta — m², boshqasi — miqdor)."""

    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name="takes")
    item_id = models.PositiveIntegerField()
    unit_id = models.PositiveIntegerField(null=True, blank=True)
    code = models.CharField(max_length=16, blank=True)
    qty = models.DecimalField(max_digits=14, decimal_places=4)
    width_mm = models.DecimalField(max_digits=9, decimal_places=1, null=True, blank=True)
    length_mm = models.DecimalField(max_digits=10, decimal_places=1, null=True, blank=True)
    doc = models.CharField(max_length=24, blank=True)  # ombor hujjati SR-…
    by_tg = models.BigIntegerField(null=True, blank=True)
    by_name = models.CharField(max_length=120, blank=True)
    created = models.DateTimeField()

    class Meta:
        ordering = ["created", "id"]

    def __str__(self) -> str:
        return f"{self.job_id}: {self.code} {self.qty}"


class Log(models.Model):
    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name="log")
    action = models.CharField(max_length=16)  # create, accept, consume, collected, ready, brak
    by = models.CharField(max_length=120, blank=True)
    ts = models.DateTimeField()
    data = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["ts", "id"]

    def __str__(self) -> str:
        return f"{self.job_id}: {self.action}"


ZERO = Decimal(0)

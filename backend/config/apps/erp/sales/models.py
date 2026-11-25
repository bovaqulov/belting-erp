"""Savdo hujjatlari (1C «Управление компанией» uslubida, docs/plans/2026-11-21-sales-docs.md): buyurtma, hisob, yuk xati
(расходная накладная), schyot-faktura, to'lov. Mijoz — CRM `Customer`, shartnoma — moliya `Contract`, firma va ombor —
ombor appida: applararo FK yo'q — ID va nusxa (nom, STIR). Qarz — o'tkazilgan yuk xatlari − to'lovlar (settle.py)."""

from __future__ import annotations

from decimal import Decimal

from django.db import models


class Kind(models.TextChoices):
    ORDER = "order", "Buyurtma"
    INVOICE = "invoice", "Hisob"
    SHIPMENT = "shipment", "Yuk xati"
    VAT_INVOICE = "vat_invoice", "Schyot-faktura"
    RECEIPT = "receipt", "To'lov"


class Status(models.TextChoices):
    DRAFT = "draft", "Qoralama"
    POSTED = "posted", "O'tkazilgan"
    CANCELLED = "cancelled", "Bekor qilingan"


class PayMethod(models.TextChoices):
    BANK = "bank", "Bank (hisob raqamga)"
    CASH = "cash", "Kassa (naqd)"
    CARD = "card", "Karta"


class SaleDoc(models.Model):
    kind = models.CharField(max_length=12, choices=Kind.choices, db_index=True)
    number = models.CharField(max_length=24, unique=True)  # BR-YX-26-00001
    date = models.DateTimeField(db_index=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT, db_index=True)
    firm = models.CharField(max_length=12)  # ombor Firm.code
    customer_id = models.PositiveIntegerField(null=True, blank=True, db_index=True)  # CRM Customer
    customer_name = models.CharField(max_length=255, blank=True)
    customer_inn = models.CharField(max_length=20, blank=True)
    contract_id = models.PositiveIntegerField(null=True, blank=True)  # moliya Contract
    contract = models.CharField(max_length=120, blank=True)
    warehouse_id = models.PositiveIntegerField(null=True, blank=True)
    warehouse = models.CharField(max_length=120, blank=True)
    deal_id = models.PositiveIntegerField(null=True, blank=True, db_index=True)  # CRM bitimi
    base = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="children")
    lines = models.JSONField(
        default=list, blank=True
    )  # [{item_id, char_id, name, char, unit, qty, price, discount, amount, vat}]
    vat_pct = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal(12))
    total = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal(0))  # QQS bilan
    vat = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal(0))
    pay_method = models.CharField(max_length=6, choices=PayMethod.choices, blank=True)  # to'lov
    ship_state = models.CharField(max_length=12, blank=True)  # yuk xati: picking | shipped | deal
    comment = models.TextField(blank=True)
    owner_tg = models.BigIntegerField(null=True, blank=True, db_index=True)  # mas'ul (muallif)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    posted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self) -> str:
        return self.number


class Seq(models.Model):
    """Hisoblagich: kalit «BR-YX-26» → oxirgi raqam (`select_for_update`)."""

    key = models.CharField(max_length=24, primary_key=True)
    n = models.PositiveIntegerField(default=0)

    def __str__(self) -> str:
        return f"{self.key}={self.n}"

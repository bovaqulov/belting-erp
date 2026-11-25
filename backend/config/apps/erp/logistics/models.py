"""Logistika: jo'natma (tashuvchi, qabul qiluvchi, manzil, joylar/vazn, narx, trek raqami, holat va tarix).
Buyurtma/bitim bilan bog'lanish — matnli havola (`ref`, masalan BR-BU-26-00031): applararo FK yo'q."""

from __future__ import annotations

from django.db import models


class Carrier(models.TextChoices):
    EMU = "emu", "EMU"
    YANDEX_GO = "yandex_go", "Yandex Go"
    BITO = "bito", "Bito"
    FARGO = "fargo", "Fargo"


class Status(models.TextChoices):
    NEW = "new", "Yangi"
    HANDED = "handed", "Topshirildi"
    TRANSIT = "transit", "Yo'lda"
    DELIVERED = "delivered", "Yetkazildi"
    RETURNED = "returned", "Qaytdi"
    CANCELLED = "cancelled", "Bekor"


class Payer(models.TextChoices):
    US = "us", "Biz"
    CUSTOMER = "customer", "Mijoz"


class Shipment(models.Model):
    number = models.CharField(max_length=20, unique=True)  # LG-26-00001
    carrier = models.CharField(max_length=12, choices=Carrier.choices)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.NEW, db_index=True)
    recipient = models.CharField(max_length=160)
    phone = models.CharField(max_length=32, blank=True)
    city = models.CharField(max_length=80, blank=True)
    address = models.CharField(max_length=300, blank=True)
    places = models.PositiveIntegerField(default=1)
    weight_kg = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)
    cost = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    payer = models.CharField(max_length=10, choices=Payer.choices, default=Payer.US)
    track_no = models.CharField(max_length=60, blank=True, db_index=True)
    ref = models.CharField(max_length=60, blank=True)  # buyurtma/bitim raqami
    note = models.TextField(blank=True)
    history = models.JSONField(default=list, blank=True)  # [{ts, status, by, note}]
    created_by = models.BigIntegerField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-id"]

    def __str__(self) -> str:
        return self.number

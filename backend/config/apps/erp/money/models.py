"""Pul modellari (docs/plans/2026-11-21-money.md): hisob (kassa / bank / karta), pul oqimi moddasi, pul hujjati.
Firma — ombor `Firm.code`; kontragent — mijoz (CRM) / yetkazib beruvchi (moliya) / xodim: ID va nusxa (applararo FK yo'q).
Qoldiq = boshlang'ich (sana bilan, 1C'dan) + o'tkazilgan hujjatlar (ledger.py)."""

from __future__ import annotations

from decimal import Decimal

from django.db import models


class AccKind(models.TextChoices):
    CASH = "cash", "Kassa"
    BANK = "bank", "Bank hisobi"
    CARD = "card", "Karta (ekvayring)"


class Account(models.Model):
    firm = models.CharField(max_length=12)
    kind = models.CharField(max_length=6, choices=AccKind.choices)
    name = models.CharField(max_length=160)
    number = models.CharField(max_length=40, blank=True)  # hisob raqam (20 xona)
    bank = models.CharField(max_length=160, blank=True)
    mfo = models.CharField(max_length=10, blank=True)
    currency = models.CharField(max_length=3, default="UZS")
    opening = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal(0))
    opening_date = models.DateField(null=True, blank=True)  # boshlang'ich qoldiq sanasi (1C importi)
    main = models.BooleanField(default=False)  # firma + turi bo'yicha asosiy (sotuv to'lovlari shu yerga)
    active = models.BooleanField(default=True)
    source = models.CharField(max_length=200, blank=True, db_index=True)  # «1c:NB:<hisob>» — qayta import uchun

    class Meta:
        ordering = ["firm", "kind", "name"]

    def __str__(self) -> str:
        return self.name


class Dir(models.TextChoices):
    IN = "in", "Kirim"
    OUT = "out", "Chiqim"


class FlowItem(models.Model):
    """Pul oqimi moddasi (1C «Статья движения денег»)."""

    name = models.CharField(max_length=120)
    direction = models.CharField(max_length=3, choices=Dir.choices)
    code = models.SlugField(max_length=32, blank=True)  # tizim moddasi: customer, supplier, salary …
    active = models.BooleanField(default=True)
    sort = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["direction", "sort", "name"]

    def __str__(self) -> str:
        return self.name


class Kind(models.TextChoices):
    IN = "in", "Kirim"
    OUT = "out", "Chiqim"
    TRANSFER = "transfer", "O'tkazish"


class Op(models.TextChoices):
    CUSTOMER = "customer", "Mijozdan to'lov"
    SUPPLIER = "supplier", "Yetkazib beruvchiga to'lov"
    SALARY = "salary", "Ish haqi"
    TAX = "tax", "Soliq va majburiy to'lovlar"
    EXPENSE = "expense", "Xarajat"
    LOAN = "loan", "Kredit va qarzlar"
    REFUND = "refund", "Mijozga qaytarish"
    OTHER = "other", "Boshqa"
    TRANSFER = "transfer", "Hisoblararo o'tkazish"


class Status(models.TextChoices):
    DRAFT = "draft", "Qoralama"
    POSTED = "posted", "O'tkazilgan"
    CANCELLED = "cancelled", "Bekor qilingan"


class MoneyDoc(models.Model):
    kind = models.CharField(max_length=8, choices=Kind.choices, db_index=True)
    number = models.CharField(max_length=24, unique=True)
    date = models.DateTimeField(db_index=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT, db_index=True)
    firm = models.CharField(max_length=12)
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="docs")
    account_to = models.ForeignKey(Account, null=True, blank=True, on_delete=models.PROTECT, related_name="docs_in")
    amount = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal(0))  # hisob valyutasida
    amount_to = models.DecimalField(
        max_digits=18, decimal_places=2, null=True, blank=True
    )  # o'tkazish: qabul qiluvchida
    op = models.CharField(max_length=10, choices=Op.choices, default=Op.OTHER)
    item = models.ForeignKey(FlowItem, null=True, blank=True, on_delete=models.PROTECT, related_name="docs")
    party_kind = models.CharField(max_length=10, blank=True)  # customer | supplier | employee | other
    party_id = models.PositiveIntegerField(null=True, blank=True, db_index=True)
    party_name = models.CharField(max_length=255, blank=True)
    party_inn = models.CharField(max_length=20, blank=True)
    purpose = models.CharField(max_length=500, blank=True)  # to'lov maqsadi
    comment = models.TextField(blank=True)
    source = models.CharField(max_length=40, blank=True, db_index=True)  # «sales:12» — boshqa hujjatning ko'zgusi
    source_label = models.CharField(max_length=60, blank=True)
    owner_tg = models.BigIntegerField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self) -> str:
        return self.number


class Seq(models.Model):
    key = models.CharField(max_length=24, primary_key=True)
    n = models.PositiveIntegerField(default=0)

    def __str__(self) -> str:
        return f"{self.key}={self.n}"

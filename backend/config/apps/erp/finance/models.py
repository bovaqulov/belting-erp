"""Moliya (Accounting) modellari — docs/api/accounting.md: shartnomalar (kontragent, firma bilan) va maoshlar (xodim
okladi, oylik hisob). Firma — ombor appida (`erp_warehouse.Firm`), shu sabab ID bilan (applararo FK yo'q).
Summalar — butun so'm (maosh) yoki valyutada (shartnoma, kasr bilan)."""

from __future__ import annotations

from django.db import models


class CpKind(models.TextChoices):
    CUSTOMER = "customer", "Mijoz"
    SUPPLIER = "supplier", "Yetkazib beruvchi"
    BOTH = "both", "Mijoz va yetkazib beruvchi"


class Counterparty(models.Model):
    name = models.CharField(max_length=255)
    inn = models.CharField(max_length=14, blank=True, db_index=True)  # 9 raqam (UZ) yoki 10–14 (xorij)
    kind = models.CharField(max_length=10, choices=CpKind.choices, default=CpKind.CUSTOMER)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class CKind(models.TextChoices):
    SALE = "sale", "Sotuv"
    PURCHASE = "purchase", "Xarid"
    SERVICE = "service", "Xizmat"


class Contract(models.Model):
    number = models.CharField(max_length=40, unique=True)  # BR-2026/001
    date = models.DateField()
    kind = models.CharField(max_length=10, choices=CKind.choices)
    counterparty = models.ForeignKey(Counterparty, on_delete=models.PROTECT, related_name="contracts")
    firm_id = models.PositiveIntegerField()  # erp_warehouse.Firm
    currency = models.CharField(max_length=3, default="UZS")
    amount = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    pay_days = models.PositiveIntegerField(null=True, blank=True)  # 0 — oldindan to'lov
    credit_limit = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    valid_until = models.DateField(null=True, blank=True)
    signed = models.BooleanField(default=False)  # Didox'da imzolangan
    active = models.BooleanField(default=True)
    note = models.TextField(blank=True)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-active", "-date", "-pk"]

    def __str__(self) -> str:
        return self.number


class Employee(models.Model):
    """Maosh hisobidagi xodim (oklad). Tizim foydalanuvchisi bo'lishi shart emas."""

    name = models.CharField(max_length=120)
    position = models.CharField(max_length=120, blank=True)
    dept = models.CharField(max_length=120, blank=True)
    salary = models.PositiveBigIntegerField()  # oklad, so'm
    hired = models.DateField()
    phone = models.CharField(max_length=20, blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-active", "dept", "name"]

    def __str__(self) -> str:
        return self.name


class PayMonth(models.Model):
    """Oylik hisob: qoralama (approved_at yo'q) → tasdiqlangan → to'langan (hamma qator paid_at)."""

    month = models.CharField(max_length=7, unique=True)  # YYYY-MM
    approved_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return self.month


class PayRow(models.Model):
    """Oy qatori: oklad + bonus − ushlanma = hisoblangan; hisoblangan − avans = to'lanadi. Ism/lavozim — hisob paytidagi."""

    month = models.ForeignKey(PayMonth, on_delete=models.CASCADE, related_name="rows")
    employee = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name="pay_rows")
    name = models.CharField(max_length=120)
    position = models.CharField(max_length=120, blank=True)
    dept = models.CharField(max_length=120, blank=True)
    base = models.PositiveBigIntegerField()
    bonus = models.PositiveBigIntegerField(default=0)
    penalty = models.PositiveBigIntegerField(default=0)
    advance = models.PositiveBigIntegerField(default=0)
    note = models.CharField(max_length=255, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["dept", "name"]
        constraints = [models.UniqueConstraint(fields=["month", "employee"], name="fin_payrow_uniq")]

    def __str__(self) -> str:
        return f"{self.month_id}: {self.name}"

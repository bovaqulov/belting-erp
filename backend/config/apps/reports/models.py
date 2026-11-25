"""Kunlik hisobotlar (Jarvis `services/templates.py`, `reports.py`): bo'lim (yoki bo'lim ichidagi toifa
`<bo'lim>:<toifa>`) shabloni — versiyalanadi, o'zgarishni tasdiqlovchi bo'lim (IT) kiritadi yoki tasdiqlaydi; xodim
hisoboti — kun bo'yicha qiymatlar. Foydalanuvchi — tg_id bilan (applararo FK yo'q)."""

from __future__ import annotations

from django.db import models


class Status(models.TextChoices):
    ACTIVE = "active", "Faol"
    PENDING = "pending", "Kutilmoqda"
    REJECTED = "rejected", "Rad etilgan"
    ARCHIVED = "archived", "Arxiv"
    SUPERSEDED = "superseded", "Almashtirilgan"


class Template(models.Model):
    dept = models.CharField(max_length=64, db_index=True)  # bo'lim kaliti yoki «bo'lim:toifa»
    version = models.PositiveIntegerField()
    title = models.CharField(max_length=80)
    fields = models.JSONField(default=list)  # [{key, label, type: number|money|text}]
    ask_at = models.CharField(max_length=5, blank=True)  # HH:MM eslatma
    summary_at = models.CharField(max_length=5, blank=True)  # HH:MM jamoa jadvali
    status = models.CharField(max_length=12, choices=Status.choices)
    proposed_by = models.BigIntegerField(null=True, blank=True)
    decided_by = models.BigIntegerField(null=True, blank=True)
    reason = models.CharField(max_length=255, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    decided = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["dept", "-version"]
        indexes = [models.Index(fields=["dept", "status"])]

    def __str__(self) -> str:
        return f"{self.dept} v{self.version} ({self.status})"


class Report(models.Model):
    dept = models.CharField(max_length=64)
    tg_id = models.BigIntegerField()
    date = models.DateField()
    values = models.JSONField(default=dict)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["dept", "tg_id", "date"], name="reports_report_uniq")]
        indexes = [models.Index(fields=["dept", "date"])]

    def __str__(self) -> str:
        return f"{self.dept} {self.date} {self.tg_id}"


class Assign(models.Model):
    """Xodim → bo'lim ichidagi hisobot toifasi (bir bo'limda bitta toifa)."""

    tg_id = models.BigIntegerField()
    unit = models.CharField(max_length=64)  # «bo'lim:toifa»
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["tg_id", "unit"], name="reports_assign_uniq")]

    def __str__(self) -> str:
        return f"{self.tg_id} → {self.unit}"

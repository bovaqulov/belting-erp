"""Katalog modellari (docs/api/catalog.md): kategoriya (2 daraja), tovar (turi, birlik, remen belgisi, artikul, narx),
variant — kenglik / uzunlik (`Char`). Qoldiq — ombor appida (`erp_warehouse.Stock`, tovarga ID bilan).

Narx (`Item.price`): {mode: "piece" | "mm", price, step_mm, overrides: {"<kenglik mm>": narx}} — `piece` — dona (yoki
birlik) narxi, `mm` — 1 mm kenglik narxi × variant kengligi (qadamga yuqoriga yaxlitlanadi); `overrides` — qo'lda narx.
HTTP API (`/app/api/erp/cat/*`) hali ochilmagan — moliya sahifasi demo backend bilan ishlaydi; ochiq interfeys — services.py.
"""

from __future__ import annotations

from django.db import models


class Kind(models.TextChoices):
    MATERIAL = "material", "Xom ashyo"
    PRODUCT = "product", "Tayyor mahsulot"
    GOODS = "goods", "Tovar"
    SERVICE = "service", "Xizmat"


class Group(models.Model):
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="children")
    name = models.CharField(max_length=120)
    name_ru = models.CharField(max_length=120, blank=True)
    attrs = models.JSONField(default=dict, blank=True)  # {kind?, dims?, unit?, belt?}
    sort = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort", "name"]
        constraints = [models.UniqueConstraint(fields=["parent", "name"], name="cat_group_uniq")]

    def __str__(self) -> str:
        return self.name


class Item(models.Model):
    group = models.ForeignKey(Group, null=True, blank=True, on_delete=models.PROTECT, related_name="items")
    name = models.CharField(max_length=255, db_index=True)
    name_ru = models.CharField(max_length=255, blank=True)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.GOODS)
    unit = models.CharField(max_length=12, default="dona")
    measured = models.BooleanField(default=False)  # o'lchab sotiladi (m, mm, m2)
    brand = models.CharField(max_length=60, blank=True)
    belt_mark = models.CharField(max_length=40, blank=True, db_index=True)  # 1040-8M, SPB-1650, 8PK-1795
    sku = models.CharField(max_length=60, blank=True, db_index=True)
    min_qty = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    ikpu = models.CharField(max_length=20, blank=True)
    attrs = models.JSONField(default=dict, blank=True)  # {dims, family, profile, length, ribs, ...}
    price = models.JSONField(null=True, blank=True)  # {mode, price, step_mm, overrides}
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Char(models.Model):
    """Tovar varianti: kenglik (rukav, lenta) yoki uzunlik."""

    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="chars")
    name = models.CharField(max_length=60)
    width_mm = models.PositiveIntegerField(null=True, blank=True)
    length_mm = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["width_mm", "length_mm", "name"]
        constraints = [models.UniqueConstraint(fields=["item", "name"], name="cat_char_uniq")]

    def __str__(self) -> str:
        return f"{self.item_id}: {self.name}"

"""Katalog modellari (docs/api/catalog.md): kategoriya (2 daraja), tovar (turi, birlik, remen belgisi, artikul, narx),
variant — kenglik / uzunlik (`Char`). Texnik oila va ko'rsatkichlar — specs.py (xalqaro standartlar). Qoldiq — ombor appida (`erp_warehouse.Stock`, tovarga ID bilan).

Narx (`Item.price`): {mode: "piece" | "mm", price, step_mm, overrides: {"<kenglik mm>": narx}} — `piece` — dona (yoki
birlik) narxi, `mm` — 1 mm kenglik narxi × variant kengligi (qadamga yuqoriga yaxlitlanadi); `overrides` — qo'lda narx.
HTTP API (`/app/api/erp/cat/*`) — views.py + ops.py; boshqa applar uchun ochiq interfeys — services.py.
"""

from __future__ import annotations

from decimal import Decimal

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
    # texnik oila (specs.FAMILIES) va uning ko'rsatkichlari; belgi — standart bo'yicha, kalit — analog/takror qidiruvi
    family = models.CharField(max_length=16, blank=True, db_index=True)
    spec = models.JSONField(default=dict, blank=True)
    designation = models.CharField(max_length=80, blank=True, db_index=True)
    match_key = models.CharField(max_length=120, blank=True, db_index=True)
    hs_code = models.CharField(max_length=12, blank=True)  # TIF TN (HS)
    # narx manbasi — AppSheet qatori (pricing.py bog'laydi); bitta qatorga bir nechta tovar (rukav, undan remenlar)
    price_src = models.ForeignKey("PriceSource", null=True, blank=True, on_delete=models.SET_NULL, related_name="items")
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


class PricePolicy(models.Model):
    """Narx siyosati (yagona qator, pk=1): formula ko'rsatkichlari va chegirma chegaralari. Kurs va qat'iy qo'shimcha —
    AppSheet ma'lumotidan o'rganiladi (`learn`), qo'lda o'zgartirilsa — o'rganish o'chadi."""

    usd_rate = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal(13500)
    )  # USD → so'm (rukav formulasi)
    fixed_add = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal(2000))  # qat'iy qo'shimcha, so'm
    round_to = models.PositiveIntegerField(default=1000)  # yuqoriga yaxlitlash qadami, so'm
    vat_pct = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal(12))
    default_width = models.PositiveIntegerField(default=10)  # eni aytilmasa (mm)
    learn = models.BooleanField(default=True)
    max_disc_lead = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal(50))  # rahbariyat
    max_disc_head = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal(0))  # sotuv bo'limi rahbari
    max_disc_seller = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal(0))  # sotuvchi
    synced = models.DateTimeField(null=True, blank=True)
    sync_note = models.CharField(max_length=300, blank=True)  # oxirgi sinxron natijasi / xatosi
    updated = models.DateTimeField(auto_now=True)
    updated_by = models.BigIntegerField(null=True, blank=True)

    def __str__(self) -> str:
        return "Narx siyosati"


class PriceSource(models.Model):
    """AppSheet narx qatori (klinli/poliklinli — `v`, tishli — `t`). Tannarx, birlik tannarxi va marja — MAXFIY."""

    src = models.CharField(max_length=2)
    ext_id = models.CharField(max_length=60)
    mark = models.CharField(max_length=120)
    name = models.CharField(max_length=255, blank=True)
    sleeve = models.CharField(max_length=16, blank=True)  # Товар | Рукав | Рулон
    family = models.CharField(max_length=16, blank=True)
    spec = models.JSONField(default=dict, blank=True)
    brand = models.CharField(max_length=60, blank=True)
    li = models.FloatField(default=0)
    lp = models.FloatField(default=0)
    la = models.FloatField(default=0)
    width = models.FloatField(default=0)
    price = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal(0))  # QQSsiz
    price_vat = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal(0))
    net = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal(0))  # tannarx, so'm
    cost_unit = models.FloatField(default=0)  # rukav: 1 mm eni / 1 qovurg'a tannarxi, USD
    margin = models.FloatField(default=0)  # %
    origin = models.CharField(max_length=60, blank=True)
    synced = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["src", "ext_id"], name="cat_pricesrc_uniq")]

    def __str__(self) -> str:
        return self.mark

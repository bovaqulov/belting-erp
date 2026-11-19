"""Ombor modellari (docs/api/warehouse.md). Tovar — katalog appida (`erp_catalog.Item`/`Char`), bu yerda ID bilan
(applararo ForeignKey yo'q).

Qoldiq — birliklar (`Unit`): o'lchamli tovar (lenta, rukav, rulon) — har rulon/bo'lak QR kodli alohida birlik; donali
tovar — kodsiz partiya (`kind=lot`, item/variant/firma/ombor/joy bo'yicha jamlanadi). Tirik qoldiq — miqdori bor,
sanashda kutilmayotgan (`pending=False`) va «yo'lda» bo'lmagan omborda turgan birliklar.
Harakat — hujjatlar (`Doc`): qoralama → o'tkazish (raqam beriladi, qoldiq o'zgaradi; versiya bilan — 409).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import models


class Firm(models.Model):
    code = models.CharField(max_length=12, unique=True)
    name = models.CharField(max_length=120)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return self.name


class WhKind(models.TextChoices):
    STORE = "store", "Ombor"
    SHOP = "shop", "Do'kon"
    PRODUCTION = "production", "Sex"
    TRANSIT = "transit", "Yo'lda"


class Warehouse(models.Model):
    name = models.CharField(max_length=120, unique=True)
    code = models.CharField(
        max_length=3, blank=True, default=""
    )  # joy kodining boshi: AO (Asosiy ombor) → AO1-A-02-03-C
    kind = models.CharField(max_length=12, choices=WhKind.choices, default=WhKind.STORE)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return self.name


class Building(models.Model):
    """Ombordagi bino (tuzilma: ombor → bino → blok → qator → qavat → joy)."""

    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name="buildings")
    number = models.PositiveIntegerField(default=0)  # omborda: AO1 — 1-bino
    name = models.CharField(max_length=120)

    class Meta:
        ordering = ["warehouse_id", "id"]
        constraints = [models.UniqueConstraint(fields=["warehouse", "name"], name="wh_building_uniq")]

    def __str__(self) -> str:
        return self.name


class Purpose(models.TextChoices):
    """Xona vazifasi — xulq-atvorni belgilaydi (joylashtirish tavsiyasi, yig'ish, karantin)."""

    STORAGE = "storage", "Saqlash"
    RECEIVING = "receiving", "Qabul"
    SHIPPING = "shipping", "Jo'natish"
    QUARANTINE = "quarantine", "Karantin"
    PRODUCTION = "production", "Sex"
    RETURNS = "returns", "Qaytarish"


class CellKind(models.TextChoices):
    """Joy turi (stellaj bo'yicha): saqlash usuli."""

    SHELF = "shelf", "Tokcha"
    ROLL = "roll", "Rulon"
    PALLET = "pallet", "Poddon"
    BIN = "bin", "Quti"
    FLOOR = "floor", "Pol"


class Block(models.Model):
    """Ombor bloki (zona) — binoda: javonlar guruhi, kodi joy kodining boshi (A → A-01-1); `keepers` — mas'ul omborchilar
    (tg_id) — «mening bloklarim»."""

    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name="blocks")
    building = models.ForeignKey(Building, null=True, blank=True, on_delete=models.SET_NULL, related_name="blocks")
    code = models.CharField(max_length=12)
    name = models.CharField(max_length=120, blank=True)
    keepers = models.JSONField(default=list, blank=True)
    purpose = models.CharField(max_length=12, choices=Purpose.choices, default=Purpose.STORAGE)
    groups = models.JSONField(default=list, blank=True)  # joylashtirish qoidasi: shu xonaga mos tovar guruhlari

    class Meta:
        ordering = ["warehouse_id", "code"]
        constraints = [models.UniqueConstraint(fields=["building", "code"], name="wh_block_bld_uniq")]

    def __str__(self) -> str:
        return f"{self.code} {self.name}".strip()


class CellStatus(models.TextChoices):
    ACTIVE = "active", "Faol"
    BLOCKED = "blocked", "Bloklangan"  # joylashtirib bo'lmaydi (ta'mir, shikast)
    QUARANTINE = "quarantine", "Karantin"  # tekshiruvdagi tovar uchun


class Rack(models.Model):
    """Stellaj — xonada (UI'da blok = xona): qatorlar × qavatlar; kodi `AO1-A-02`, joylari `AO1-A-02-03-C`."""

    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name="racks")
    block = models.ForeignKey(Block, on_delete=models.CASCADE, related_name="racks")
    number = models.PositiveIntegerField()
    name = models.CharField(max_length=120, blank=True)
    rows = models.PositiveIntegerField(default=1)  # qatorlar (seksiyalar) soni
    floors = models.PositiveIntegerField(default=1)  # qavatlar soni
    cell_kind = models.CharField(max_length=8, choices=CellKind.choices, default=CellKind.SHELF)
    capacity = models.PositiveIntegerField(null=True, blank=True)  # bitta joyga necha birlik (bo'sh — cheklanmagan)
    max_width_mm = models.PositiveIntegerField(null=True, blank=True)  # eng keng rulon/bo'lak (lenta eni), mm

    class Meta:
        ordering = ["block_id", "number"]
        constraints = [models.UniqueConstraint(fields=["block", "number"], name="wh_rack_uniq")]

    def __str__(self) -> str:
        return f"{self.block.code}-{self.number}"


class Cell(models.Model):
    """Joy: `AO1-A-02-03-C` — ombor (AO), bino (1), xona (A), stellaj (02), qator (03), qavat (C — pastdan 3-);
    kod QR stikerda, butun bazada yagona; stellajsiz (eski/erkin) joylar — kodi o'zgarmaydi."""

    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name="cells")
    block = models.ForeignKey(Block, null=True, blank=True, on_delete=models.SET_NULL, related_name="cells")
    rack = models.ForeignKey(Rack, null=True, blank=True, on_delete=models.SET_NULL, related_name="cells")
    code = models.CharField(max_length=24, unique=True)
    row = models.PositiveIntegerField(null=True, blank=True)  # stellajdagi qator (1…)
    floor = models.PositiveIntegerField(null=True, blank=True)  # qavat (1 — eng past; kodda harf: A)
    status = models.CharField(max_length=10, choices=CellStatus.choices, default=CellStatus.ACTIVE)

    class Meta:
        ordering = ["code"]

    def __str__(self) -> str:
        return self.code


class UnitKind(models.TextChoices):
    ROLL = "roll", "Rulon"
    PIECE = "piece", "Bo'lak"
    LOT = "lot", "Partiya"
    PRODUCT = "product", "Mahsulot"


class Unit(models.Model):
    code = models.CharField(max_length=16, unique=True, null=True, blank=True)  # P00000123 (QR); partiyada — yo'q
    item_id = models.PositiveIntegerField(db_index=True)  # erp_catalog.Item
    char_id = models.PositiveIntegerField(null=True, blank=True)  # erp_catalog.Char
    firm = models.CharField(max_length=12)  # Firm.code
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="units")
    loc = models.ForeignKey(Cell, null=True, blank=True, on_delete=models.SET_NULL, related_name="units")
    kind = models.CharField(max_length=8, choices=UnitKind.choices)
    width_mm = models.DecimalField(max_digits=9, decimal_places=1, null=True, blank=True)
    length_mm = models.DecimalField(max_digits=10, decimal_places=1, null=True, blank=True)
    qty = models.DecimalField(max_digits=14, decimal_places=4, default=Decimal(0))
    parent_code = models.CharField(max_length=16, blank=True)  # qaysi rulondan kesilgan
    made = models.JSONField(null=True, blank=True)  # {kind, by_name, posted_at, job}
    cuts = models.JSONField(default=list, blank=True)  # [{by_name, posted_at, job, number, width_mm, length_mm, qty}]
    pending = models.BooleanField(default=False)  # sanashda topilgan, hali hisobga kirmagan
    src = models.CharField(max_length=32, blank=True)  # qabul hujjati raqami (joylash navbati)
    created = models.DateTimeField()

    class Meta:
        indexes = [models.Index(fields=["item_id", "warehouse"])]

    def __str__(self) -> str:
        return self.code or f"lot#{self.pk}"


class Cls(models.TextChoices):
    A = "A", "A"
    B = "B", "B"
    C = "C", "C"


class ItemMeta(models.Model):
    """Ombor tomonidagi tovar ma'lumoti: ABC sinf (sikl sanoq), oxirgi sanoq, tannarx (1 birlik)."""

    item_id = models.PositiveIntegerField(primary_key=True)
    cls = models.CharField(max_length=1, choices=Cls.choices, default=Cls.C)
    last_count = models.DateTimeField(null=True, blank=True)
    cost = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal(0))

    def __str__(self) -> str:
        return f"#{self.item_id} {self.cls}"


class DocStatus(models.TextChoices):
    DRAFT = "draft", "Qoralama"
    POSTED = "posted", "O'tkazilgan"


class Doc(models.Model):
    number = models.CharField(max_length=24, null=True, blank=True, unique=True)
    kind = models.CharField(max_length=12, db_index=True)
    status = models.CharField(max_length=8, choices=DocStatus.choices, default=DocStatus.DRAFT)
    firm = models.CharField(max_length=12)
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="docs")
    warehouse_to = models.ForeignKey(Warehouse, null=True, blank=True, on_delete=models.PROTECT, related_name="docs_in")
    author = models.BigIntegerField(null=True, blank=True)  # tg_id
    date = models.DateTimeField()
    updated = models.DateTimeField()
    version = models.PositiveIntegerField(default=1)
    data = models.JSONField(default=dict, blank=True)
    lines = models.JSONField(default=list, blank=True)  # [{item_id, char_id, batch_id, qty, data}]

    class Meta:
        ordering = ["-updated"]

    def __str__(self) -> str:
        return self.number or f"{self.kind}#{self.pk}"


class Place(models.Model):
    """Joylashtirish (boshlang'ich qoldiq): kim, qayerga, nima — bekor qilish uchun birliklar ro'yxati bilan."""

    number = models.CharField(max_length=24)
    loc = models.ForeignKey(Cell, on_delete=models.CASCADE, related_name="places")
    item_id = models.PositiveIntegerField()
    char_id = models.PositiveIntegerField(null=True, blank=True)
    qty = models.DecimalField(max_digits=14, decimal_places=4)
    firm = models.CharField(max_length=12)
    date = models.DateTimeField()
    author = models.BigIntegerField(null=True, blank=True)
    unit_ids = models.JSONField(default=list)

    class Meta:
        ordering = ["-date"]

    def __str__(self) -> str:
        return self.number


class Pick(models.Model):
    """Yig'ish navbati: jo'natiladigan buyurtma (CRM bitimi, sex tayyor mahsuloti, marketplace).
    `lines`: [{line_no, item_id, char_id, qty, left}]; hammasi yig'ilsa — `done`."""

    number = models.CharField(max_length=32)
    date = models.DateTimeField()
    customer = models.CharField(max_length=255, blank=True)
    firm = models.CharField(max_length=12)
    channel = models.CharField(max_length=16, blank=True)
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="picks")
    lines = models.JSONField(default=list)
    source = models.CharField(max_length=40, blank=True, db_index=True)  # "crm:12" — takror ochilmasin
    done = models.BooleanField(default=False, db_index=True)

    class Meta:
        ordering = ["date", "id"]

    def __str__(self) -> str:
        return self.number


class Incoming(models.Model):
    """Kutilayotgan kirim (xarid): `items` [{item_id, char_id, qty}] — qabulda qoldig'i kamayadi."""

    number = models.CharField(max_length=32, unique=True)
    supplier = models.CharField(max_length=255, blank=True)
    firm = models.CharField(max_length=12)
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="incoming")  # yo'lda
    expected = models.DateTimeField(null=True, blank=True)
    items = models.JSONField(default=list)
    done = models.BooleanField(default=False, db_index=True)

    class Meta:
        ordering = ["expected", "id"]

    def __str__(self) -> str:
        return self.number


class Seq(models.Model):
    """Hisoblagich (birlik kodi P00000001, hujjat raqami KS-26-0001): `select_for_update` bilan — takrorlanmaydi."""

    key = models.CharField(max_length=24, primary_key=True)
    n = models.PositiveIntegerField(default=0)

    def __str__(self) -> str:
        return f"{self.key}={self.n}"


class StockMove(models.Model):
    """Harakatlar jurnali — o'chmaydigan yozuv: birlikning miqdori, ombori, joyi yoki holati har o'zgarganda (ledger.py,
    Unit signallari). Tuzatish — yangi (teskari) yozuv bilan; tahrirlash va o'chirish taqiqlangan. Birlikning joriy
    qoldig'i = uning yozuvlari `delta` yig'indisi (sanashda kutilayotgan — `pending` — birlik qoldiq emas: 0)."""

    at = models.DateTimeField(db_index=True)
    op = models.CharField(max_length=24, db_index=True)  # amal: acceptance, cut, inventory, transfer, place, opening…
    unit = models.ForeignKey(Unit, null=True, blank=True, on_delete=models.SET_NULL, related_name="moves")
    unit_code = models.CharField(max_length=16, blank=True)  # birlik o'chsa ham ko'rinsin
    item_id = models.PositiveIntegerField(db_index=True)
    char_id = models.PositiveIntegerField(null=True, blank=True)
    firm = models.CharField(max_length=12, blank=True)
    delta = models.DecimalField(max_digits=14, decimal_places=4)  # qoldiq o'zgarishi (+ kirim, − chiqim, 0 — ko'chish)
    qty_after = models.DecimalField(max_digits=14, decimal_places=4)
    wh_from = models.ForeignKey(Warehouse, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    wh_to = models.ForeignKey(Warehouse, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    loc_from = models.ForeignKey(Cell, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    loc_to = models.ForeignKey(Cell, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    loc_from_code = models.CharField(max_length=24, blank=True)
    loc_to_code = models.CharField(max_length=24, blank=True)
    doc = models.ForeignKey(Doc, null=True, blank=True, on_delete=models.SET_NULL, related_name="moves")
    doc_number = models.CharField(max_length=24, blank=True)
    reason = models.CharField(max_length=255, blank=True)
    author = models.BigIntegerField(null=True, blank=True)  # tg_id
    author_name = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ["-id"]
        indexes = [models.Index(fields=["unit", "id"]), models.Index(fields=["loc_to", "id"])]

    def __str__(self) -> str:
        return f"{self.op} {self.unit_code or self.item_id} {self.delta:+}"

    def save(self, *a: Any, **kw: Any) -> None:
        if self.pk:
            raise ValueError("Jurnal yozuvini o'zgartirib bo'lmaydi — teskari yozuv qo'shing")
        super().save(*a, **kw)

    def delete(self, *a: Any, **kw: Any) -> tuple[int, dict[str, int]]:
        raise ValueError("Jurnal yozuvini o'chirib bo'lmaydi")


class IdemKey(models.Model):
    """Qayta yuborishdan himoya: mijoz POST'ga `Idempotency-Key` qo'ysa — ikkinchi marta o'sha javob qaytadi (amal takrorlanmaydi)."""

    key = models.CharField(max_length=64, unique=True)
    author = models.BigIntegerField(null=True, blank=True)
    path = models.CharField(max_length=200)
    status = models.PositiveSmallIntegerField()
    body = models.TextField()
    at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.key


class StockLevel(models.Model):
    """To'ldirish me'yori (replenishment): omborda tovar `min_qty` dan kam qolsa — `max_qty` gacha to'ldirish taklif
    qilinadi (asosiy ombordan ko'chirish)."""

    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name="levels")
    item_id = models.PositiveIntegerField()
    min_qty = models.DecimalField(max_digits=14, decimal_places=4)
    max_qty = models.DecimalField(max_digits=14, decimal_places=4)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["warehouse", "item_id"], name="wh_level_uniq")]

    def __str__(self) -> str:
        return f"{self.warehouse_id}:{self.item_id} {self.min_qty}–{self.max_qty}"

"""Marketplace modellari: kanal kartochkasi, FBS buyurtma, kartochka muammosi (audit), amallar jurnali.

Jarvis jadvallari (erp.mp_card, erp.mp_order, erp.mp_issue, erp.audit) dan; ERP tovari/hujjatiga bog'lanish —
katalog va ombor applari ko'chganda (hozir kartochka shtrixkodi bilan ishlaydi).
"""

from django.conf import settings
from django.db import models


class Channel(models.TextChoices):
    WB = "wb", "Wildberries"
    OZON = "ozon", "Ozon"
    UZUM = "uzum", "Uzum Market"


class Stage(models.TextChoices):
    NEW = "new", "Yangi"
    ASSEMBLY = "assembly", "Yig'ishda"
    TRANSIT = "transit", "Yo'lda"
    DONE = "done", "Yetkazildi"
    CANCELLED = "cancelled", "Bekor"


ACTIVE = (Stage.NEW, Stage.ASSEMBLY)


class Card(models.Model):
    """Kanal kartochkasi (WB nmID, Ozon product_id, Uzum skuId). Skanerda qabul qilinadigan shtrixkodlar — `codes`."""

    channel = models.CharField(max_length=8, choices=Channel.choices)
    ext_id = models.CharField(max_length=64)
    vendor_code = models.CharField(max_length=128, blank=True)
    title = models.CharField(max_length=500, blank=True)
    codes = models.JSONField(default=list, blank=True)
    width_mm = models.DecimalField(max_digits=8, decimal_places=1, null=True, blank=True)
    mode = models.CharField(max_length=8, blank=True)  # unit | sleeve (ERP bog'lanishi bilan)
    item_ids = models.JSONField(default=list, blank=True)  # ERP tovarlari — katalog ko'chganda
    active = models.BooleanField(default=True)
    ch_stock = models.IntegerField(default=0)
    photos = models.IntegerField(null=True, blank=True)
    ext = models.JSONField(default=dict, blank=True)  # chrtId, offer_id, sku, imtID, shopId …
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["channel", "ext_id"], name="mp_card_uniq")]
        indexes = [models.Index(fields=["channel", "vendor_code"])]

    def __str__(self) -> str:
        return f"{self.channel}:{self.ext_id} {self.title[:40]}"


class Order(models.Model):
    """FBS buyurtma. `lines` — kartochka bilan to'ldirilgan qatorlar (None — qayta hisoblash kerak)."""

    channel = models.CharField(max_length=8, choices=Channel.choices)
    ext_id = models.CharField(max_length=64)
    stage = models.CharField(max_length=10, choices=Stage.choices, default=Stage.NEW)
    ext_status = models.CharField(max_length=64, blank=True)
    ordered = models.DateTimeField(null=True, blank=True)
    deadline = models.DateTimeField(null=True, blank=True)
    supply_id = models.CharField(max_length=64, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    lines = models.JSONField(null=True, blank=True)
    picked = models.JSONField(default=list, blank=True)
    assembled_at = models.DateTimeField(null=True, blank=True)
    assembled_by = models.BigIntegerField(null=True, blank=True)
    number = models.CharField(max_length=32, blank=True)  # ERP buyurtma raqami — savdo app ko'chganda
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["channel", "ext_id"], name="mp_order_uniq")]
        indexes = [models.Index(fields=["channel", "stage"]), models.Index(fields=["supply_id"])]

    def __str__(self) -> str:
        return f"{self.channel}:{self.ext_id} {self.stage}"


class Severity(models.TextChoices):
    CRIT = "crit", "Jiddiy"
    WARN = "warn", "Ogohlantirish"
    INFO = "info", "Ma'lumot"


class Issue(models.Model):
    """Kartochka muammosi. Keyingi tekshiruvda topilmasa — yopiladi (resolved); «Xato emas» (muted) qayta chiqmaydi."""

    channel = models.CharField(max_length=8, choices=Channel.choices)
    ext_id = models.CharField(max_length=64)
    code = models.CharField(max_length=32)
    severity = models.CharField(max_length=4, choices=Severity.choices)
    text = models.CharField(max_length=200)
    vendor_code = models.CharField(max_length=128, blank=True)
    title = models.CharField(max_length=500, blank=True)
    photos = models.IntegerField(null=True, blank=True)
    detail = models.JSONField(null=True, blank=True)
    muted = models.BooleanField(default=False)
    found_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["channel", "ext_id", "code"], name="mp_issue_uniq")]

    def __str__(self) -> str:
        return f"{self.channel}:{self.ext_id} {self.code}"


class Log(models.Model):
    """Kanalga yozuvchi va yig'ish amallari jurnali (kim, qachon, nima)."""

    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    channel = models.CharField(max_length=8)
    ref = models.CharField(max_length=64)
    action = models.CharField(max_length=32)
    detail = models.JSONField(default=dict, blank=True)
    ts = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-ts"]

    def __str__(self) -> str:
        return f"{self.channel}:{self.ref} {self.action}"

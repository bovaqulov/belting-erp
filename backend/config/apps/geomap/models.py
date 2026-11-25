"""GeoMaps — mijozlar xaritasi (Jarvis `geomap` sxemasi, storage/schema/008–009). Yozuv = CRM mijozi (`crm:<id>`):
nomi, STIR, manzil, mas'ul (CRM `owner_tg`), savdo ko'rsatkichlari (CRM bitimlaridan) + geokod (nuqta, aniqlik,
viloyat, tuman) va orginfo.uz reyestr manzili. Foydalanuvchilar — tg_id bilan (applararo FK yo'q)."""

from __future__ import annotations

from django.db import models


class Record(models.Model):
    id = models.CharField(primary_key=True, max_length=40)  # crm:<customer_id>
    source = models.CharField(max_length=10, default="crm")
    name = models.CharField(max_length=255)
    inn = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=300, blank=True)  # xom manzil (CRM)
    region = models.CharField(max_length=40, blank=True, db_index=True)  # viloyat (ADM1 kaliti) yoki «xorij:<cc>»
    district = models.CharField(max_length=60, blank=True)  # tuman (ADM2 shapeID)
    lat = models.FloatField(null=True, blank=True)
    lng = models.FloatField(null=True, blank=True)
    geo_quality = models.CharField(max_length=10, default="none")  # exact | street | district | region | none | manual
    owner_tg = models.BigIntegerField(null=True, blank=True, db_index=True)
    owner_name = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=20, blank=True)  # faol | sust | yo'qotilgan | yangi | xaridsiz
    sales_12m = models.FloatField(default=0)  # oxirgi 12 oydagi xaridlar (UZS)
    sales_count = models.IntegerField(default=0)
    last_sale = models.CharField(max_length=10, blank=True)  # YYYY-MM-DD
    debt = models.FloatField(default=0)
    overdue_days = models.IntegerField(default=0)
    deals_open = models.IntegerField(default=0)
    fields = models.JSONField(default=dict, blank=True)  # turi, teg; geo_try / org_try belgilari
    territory = models.ForeignKey("Territory", null=True, blank=True, on_delete=models.SET_NULL, related_name="records")
    addr_org = models.CharField(max_length=300, blank=True)  # orginfo: "viloyat, tuman, ko'cha, uy"
    org_url = models.CharField(max_length=300, blank=True)
    org_inn = models.CharField(max_length=20, blank=True)
    updated = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return self.name


class GeocodeCache(models.Model):
    """Bir manzil bir marta so'raladi (Nominatim ≤ 1 so'rov/s); "topilmadi" (lat yo'q) ham keshlanadi."""

    q = models.CharField(primary_key=True, max_length=400)
    lat = models.FloatField(null=True, blank=True)
    lng = models.FloatField(null=True, blank=True)
    quality = models.CharField(max_length=10, blank=True)
    raw = models.TextField(blank=True)
    ts = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.q


class OrginfoCache(models.Model):
    """orginfo.uz qidiruvi: kalit `inn:<STIR>` yoki `name:<nom kaliti>[@viloyat]`; topilmagani ham yoziladi."""

    key = models.CharField(primary_key=True, max_length=300)
    found = models.BooleanField()
    inn = models.CharField(max_length=20, blank=True)
    name = models.CharField(max_length=300, blank=True)
    locality = models.CharField(max_length=300, blank=True)
    street = models.CharField(max_length=300, blank=True)
    url = models.CharField(max_length=300, blank=True)
    note = models.CharField(max_length=200, blank=True)
    ts = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.key


class View(models.Model):
    """Saqlangan ko'rinish (filtr + uslub + qatlamlar)."""

    name = models.CharField(max_length=80)
    owner_tg = models.BigIntegerField()
    shared = models.BooleanField(default=False)
    state = models.JSONField(default=dict)
    ts = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.name


class Territory(models.Model):
    """Hudud: chizilgan poligon (draw), radius, avtomatik (auto), import."""

    name = models.CharField(max_length=80)
    kind = models.CharField(max_length=10)
    color = models.CharField(max_length=16, blank=True)
    geometry = models.JSONField()  # GeoJSON geometriya
    owner_tg = models.BigIntegerField(null=True, blank=True)  # biriktirilgan menejer
    grp = models.CharField(max_length=60, blank=True)  # avtomatik hududlar to'plami
    meta = models.JSONField(default=dict, blank=True)
    created_by = models.BigIntegerField(null=True, blank=True)
    ts = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return self.name


class Route(models.Model):
    name = models.CharField(max_length=80)
    owner_tg = models.BigIntegerField(db_index=True)
    stops = models.JSONField(default=list)  # [{id, name, lat, lng}] — optimallashgan tartibda
    geometry = models.JSONField(null=True, blank=True)  # yo'l chizig'i (LineString)
    distance_m = models.FloatField(null=True, blank=True)
    duration_s = models.FloatField(null=True, blank=True)
    ts = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.name


class Checkin(models.Model):
    record_id = models.CharField(max_length=40, db_index=True)
    tg_id = models.BigIntegerField()
    note = models.TextField(blank=True)
    lat = models.FloatField(null=True, blank=True)
    lng = models.FloatField(null=True, blank=True)
    ts = models.CharField(max_length=19)  # mijoz vaqti (oflayn navbatdan kelishi mumkin)

    def __str__(self) -> str:
        return f"{self.record_id} {self.ts}"


class Share(models.Model):
    """Ulashilgan xarita: ochiq yoki parolli havola (tanlangan yozuvlar, maxfiy maydonlarsiz)."""

    token = models.CharField(primary_key=True, max_length=40)
    name = models.CharField(max_length=80)
    state = models.JSONField(default=dict)  # {ids, style}
    pw_hash = models.CharField(max_length=200, blank=True)
    created_by = models.BigIntegerField(null=True, blank=True)
    expires = models.DateTimeField(null=True, blank=True)
    ts = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.name

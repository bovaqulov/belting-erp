"""CRM modellari: voronka/bosqichlar, mijozlar, bitimlar (tovarlar, faoliyat, bosqich tarixi, hujjatlar), lidlar, oylik
reja (API — `views.py`, mantiq — `deals.py`, kontrakt — docs/api/crm.md) va sotuvchilar Telegram'i (`tg.py`).
Mas'ul — `owner_tg` (xodimning Telegram ID'si, staff.User.tg_id) — frontend kontrakti shunday.

Telegram: sotuvchi Telegram → Sozlamalar → Telegram Business → Chat-botlar bo'limida CRM botini ulaydi (qaysi chatlarga ruxsat —
o'zi tanlaydi). Bot ulangandan keyingi xabarlarni oladi (tarix olinmaydi) va ruxsat berilgan bo'lsa sotuvchi nomidan
javob yozadi. Boshqa CRM jadvallari — keyingi bosqichda.
"""

from __future__ import annotations

import re
from decimal import Decimal

from django.db import models


class Pipeline(models.Model):
    code = models.SlugField(primary_key=True, max_length=32)
    name = models.CharField(max_length=100)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "code"]

    def __str__(self) -> str:
        return self.name


class StageKind(models.TextChoices):
    OPEN = "open", "Ochiq"
    WON = "won", "Yutildi"
    LOST = "lost", "Yutqazildi"


class Stage(models.Model):
    code = models.SlugField(primary_key=True, max_length=32)
    pipeline = models.ForeignKey(Pipeline, on_delete=models.CASCADE, related_name="stages")
    name = models.CharField(max_length=100)
    kind = models.CharField(max_length=8, choices=StageKind.choices, default=StageKind.OPEN)
    color = models.CharField(max_length=16, blank=True)
    probability = models.PositiveSmallIntegerField(null=True, blank=True)
    rot_days = models.PositiveSmallIntegerField(null=True, blank=True)  # shuncha kun tegilmasa — "harakatsiz"
    # SLA: bosqichda shuncha soatdan ortiq tursa — mas'ulga eslatma (robot), kartochkada "muddati o'tdi"
    sla_hours = models.PositiveIntegerField(null=True, blank=True)
    guide = models.TextField(blank=True)  # sotuvchiga ko'rsatma (bosqichda nima qilish)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["pipeline__order", "order"]

    def __str__(self) -> str:
        return self.name


class LostReason(models.Model):
    name = models.CharField(max_length=100, unique=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "name"]

    def __str__(self) -> str:
        return self.name


class CustomerKind(models.TextChoices):
    COMPANY = "company", "Yuridik shaxs (firma)"
    EMPLOYEE = "employee", "Firma xodimi"
    TRADER = "trader", "Savdogar"
    IP = "ip", "YaTT (yakka tartibdagi tadbirkor)"
    PERSON = "person", "Jismoniy shaxs"
    STATE = "state", "Davlat tashkiloti"


class Customer(models.Model):
    # turi: firma / firma xodimi (lavozim + firma ma'lumotlari) / savdogar / YaTT / jismoniy shaxs / davlat tashkiloti
    kind = models.CharField(max_length=10, choices=CustomerKind.choices, default=CustomerKind.COMPANY, db_index=True)
    name = models.CharField(max_length=255)  # firma / tashkilot nomi yoki odamning ismi
    inn = models.CharField("STIR", max_length=20, blank=True, db_index=True)
    phones = models.JSONField(default=list, blank=True)  # ["998901234567"]
    owner_tg = models.BigIntegerField(null=True, blank=True, db_index=True)
    created = models.DateTimeField(auto_now_add=True)
    # kontakt shaxslar: [{"name": "Rahim", "role": "ta'minotchi", "phone": "998901234567"}]
    contacts = models.JSONField(default=list, blank=True)
    note = models.TextField(blank=True)
    address = models.CharField("Manzil (joylashuv)", max_length=300, blank=True)
    # firma xodimi: lavozimi va qaysi firmadan
    position = models.CharField("Lavozimi", max_length=120, blank=True)
    company = models.CharField("Firma nomi", max_length=255, blank=True)
    company_inn = models.CharField("Firma STIRi", max_length=20, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class PayTerms(models.TextChoices):
    FULL = "full", "100% oldindan"
    HALF = "half", "50/50"


class SignStatus(models.TextChoices):
    SENT = "sent", "Yuborildi"
    SIGNED = "signed", "Imzolandi"


class Division(models.TextChoices):
    NOVOBELT = "novobelt", "Novobelt"
    BELTING = "belting", "Belting Rezina"


DEAL_NO = re.compile(r"^#\d+\s*")


def deal_title(pk: int, title: str) -> str:
    """Bitim nomi unikal raqam bilan: «#42 SPB 1650 remen». Eski/qo'lda yozilgan «#N» prefiksi almashtiriladi."""
    return f"#{pk} {DEAL_NO.sub('', title.strip()) or 'Yangi bitim'}"[:255]


class Deal(models.Model):
    title = models.CharField(max_length=255)
    customer = models.ForeignKey(Customer, null=True, blank=True, on_delete=models.SET_NULL, related_name="deals")
    owner_tg = models.BigIntegerField(null=True, blank=True, db_index=True)
    amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal(0))
    stage = models.ForeignKey(Stage, on_delete=models.PROTECT, related_name="deals")
    stage_since = models.DateTimeField()
    created = models.DateTimeField()
    updated = models.DateTimeField(db_index=True)
    closed = models.DateTimeField(null=True, blank=True)
    close_date = models.DateField(null=True, blank=True)  # kutilgan yopilish sanasi
    tags = models.JSONField(default=list, blank=True)
    source = models.CharField(max_length=32, blank=True)
    lost_reason = models.CharField(max_length=200, blank=True)
    probability = models.PositiveSmallIntegerField(null=True, blank=True)
    need = models.TextField(blank=True)
    items = models.JSONField(default=list, blank=True)  # [{item_id, char_id, name, unit, qty, price, discount}]
    # tovarlar bo'yicha summa: tovarlar × (1 − chegirma%) × (1 + ustama%) + logistika (deals.recalc)
    discount = models.DecimalField("Chegirma, %", max_digits=5, decimal_places=2, default=Decimal(0))
    markup = models.DecimalField("Ustama, %", max_digits=6, decimal_places=2, default=Decimal(0))
    logistics = models.DecimalField("Logistika, so'm", max_digits=16, decimal_places=2, default=Decimal(0))
    location = models.CharField("Yetkazish manzili", max_length=300, blank=True)
    # kartochka maydonlari: kontakt, bo'linma, 1C hujjat raqamlari, takroriy bitim
    contact = models.CharField("Kontakt shaxs", max_length=200, blank=True)
    division = models.CharField("Bo'linma", max_length=16, choices=Division.choices, blank=True)
    buyer_order = models.CharField("Mijoz buyurtmasi № (1C)", max_length=32, blank=True)
    prod_order = models.CharField("Ishlab chiqarish buyurtmasi № (1C)", max_length=32, blank=True)
    prod_no = models.CharField("Ishlab chiqarish № (1C)", max_length=32, blank=True)
    repeat = models.BooleanField("Takroriy bitim", default=False)
    # shartnoma va to'lov (Didox / bank / 1C integratsiyasigacha — qo'lda)
    pay_terms = models.CharField("To'lov sharti", max_length=8, choices=PayTerms.choices, default=PayTerms.FULL)
    paid_sum = models.DecimalField("To'langan", max_digits=16, decimal_places=2, default=Decimal(0))
    sign_status = models.CharField("Shartnoma imzosi", max_length=8, choices=SignStatus.choices, blank=True)
    sign_sent_at = models.DateTimeField(null=True, blank=True)
    docs_done = models.BooleanField("Yuk xati va dalolatnoma imzolandi", default=False)
    sla_reminded_at = models.DateTimeField(null=True, blank=True)  # robot: shu bosqich SLA eslatmasi yuborilgan
    # tunnel: shu bitimdan (masalan, savdo → ishlab chiqarish) yaratilgan bo'lsa — manba bitim
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="children")

    class Meta:
        ordering = ["-updated"]

    def __str__(self) -> str:
        return self.title


class TunnelAction(models.TextChoices):
    COPY = "copy", "Keyingi voronkada bog'langan bitim ochish"
    ROOT = "root", "Asl (savdo) bitimni shu bosqichga o'tkazish"


class Tunnel(models.Model):
    """Voronkalar orasidagi bog'lanish (tunnel): bitim from_stage ga o'tganda — to_stage da bog'langan bitim
    ochiladi (copy) yoki zanjirning boshidagi asl bitim to_stage ga o'tkaziladi (root)."""

    from_stage = models.ForeignKey(Stage, on_delete=models.CASCADE, related_name="tunnels_out")
    to_stage = models.ForeignKey(Stage, on_delete=models.CASCADE, related_name="tunnels_in")
    action = models.CharField(max_length=8, choices=TunnelAction.choices, default=TunnelAction.COPY)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["from_stage", "to_stage"], name="crm_tunnel_uniq")]

    def __str__(self) -> str:
        return f"{self.from_stage_id} → {self.to_stage_id} ({self.action})"


class Activity(models.Model):
    """Bitim tarixi: izoh, qo'ng'iroq, uchrashuv, vazifa (due/done_at), hujjat."""

    deal = models.ForeignKey(Deal, on_delete=models.CASCADE, related_name="activity")
    kind = models.CharField(max_length=16)
    ts = models.DateTimeField(db_index=True)
    actor = models.BigIntegerField(null=True, blank=True)
    text = models.TextField(blank=True)
    data = models.JSONField(null=True, blank=True)
    due = models.DateTimeField(null=True, blank=True)
    done_at = models.DateTimeField(null=True, blank=True)
    assignee = models.BigIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["-ts"]

    def __str__(self) -> str:
        return f"{self.kind}: {self.text[:40]}"


class StageHistory(models.Model):
    deal = models.ForeignKey(Deal, on_delete=models.CASCADE, related_name="history")
    ts = models.DateTimeField()
    actor = models.BigIntegerField(null=True, blank=True)
    from_stage = models.CharField(max_length=32, blank=True)
    to_stage = models.CharField(max_length=32)
    src = models.CharField(max_length=16, default="web")
    reason = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["ts", "id"]

    def __str__(self) -> str:
        return f"{self.from_stage or '—'} → {self.to_stage}"


class Doc(models.Model):
    """Bitim hujjati: tijorat taklifi (quote) yoki buyurtma (order) qoralamasi."""

    deal = models.ForeignKey(Deal, on_delete=models.CASCADE, related_name="docs")
    number = models.CharField(max_length=32, unique=True)
    kind = models.CharField(max_length=16)
    date = models.DateField()
    status = models.CharField(max_length=16, default="draft")
    state = models.CharField(max_length=32, blank=True)
    total = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal(0))
    # yaratilgan paytdagi nusxa: tovar qatorlari va narxlash (bitim keyin o'zgarsa ham hujjat o'zgarmaydi)
    lines = models.JSONField(default=list, blank=True)  # [{item_id, char_id, name, unit, qty, price, discount, amount}]
    meta = models.JSONField(default=dict, blank=True)  # {customer, inn, location, sub, discount, markup, logistics}
    # Didox: qoralama ID'si va holati (0 qoralama, 1 mijoz imzosi kutilmoqda, 3 imzolangan, 4 rad …) — crm/didox.py
    didox_id = models.CharField(max_length=64, blank=True)
    didox_status = models.IntegerField(null=True, blank=True)
    didox_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self) -> str:
        return self.number


class LeadStatus(models.TextChoices):
    NEW = "new", "Yangi"  # javob kutmoqda
    WORK = "work", "Ishda"  # bog'lanildi / javob yuborildi
    INTERESTED = "interested", "Qiziqish bildirdi"
    CONVERTED = "converted", "Bitimga aylandi"
    JUNK = "junk", "Yaroqsiz"


class Call(models.Model):
    """Telefon qo'ng'irog'i: IP-telefoniyadan (webhook, calls.py) yoki qo'lda yozilgan. Mijozga — telefon raqami bo'yicha."""

    customer = models.ForeignKey(Customer, null=True, blank=True, on_delete=models.SET_NULL, related_name="calls")
    deal = models.ForeignKey(Deal, null=True, blank=True, on_delete=models.SET_NULL, related_name="calls")
    phone = models.CharField(max_length=20, db_index=True)
    direction = models.CharField(max_length=3, default="out")  # in | out
    status = models.CharField(max_length=10, default="answered")  # answered | missed | busy
    started = models.DateTimeField(db_index=True)
    duration = models.PositiveIntegerField(default=0)  # soniya (gaplashilgan)
    recording_url = models.URLField(max_length=500, blank=True)
    owner_tg = models.BigIntegerField(null=True, blank=True, db_index=True)  # sotuvchi (operator)
    note = models.TextField(blank=True)
    source = models.CharField(max_length=20, default="manual")  # manual | pbx (provayder nomi)
    ext_id = models.CharField(max_length=80, blank=True, db_index=True)  # provayder qo'ng'iroq ID'si (takrorlanmasin)

    class Meta:
        ordering = ["-started"]

    def __str__(self) -> str:
        return f"{self.direction} {self.phone} {self.started:%d.%m %H:%M}"


class Lead(models.Model):
    created = models.DateTimeField(db_index=True)
    title = models.CharField(max_length=255, blank=True)
    name = models.CharField(max_length=200, blank=True)
    company = models.CharField(max_length=255, blank=True)
    note = models.TextField(blank=True)
    phone = models.CharField(max_length=20, blank=True, db_index=True)
    source = models.CharField(max_length=32, default="manual")
    owner_tg = models.BigIntegerField(null=True, blank=True, db_index=True)
    status = models.CharField(max_length=12, choices=LeadStatus.choices, default=LeadStatus.NEW, db_index=True)
    deal = models.ForeignKey(Deal, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    first_touch = models.DateTimeField(null=True, blank=True)
    junk_reason = models.CharField(max_length=200, blank=True)
    # kvalifikatsiya: tasma turi, o'lcham, hajm, STIR (kompaniya — company)
    product = models.CharField("Tasma turi", max_length=120, blank=True)
    size = models.CharField("O'lcham", max_length=120, blank=True)
    qty = models.CharField("Hajm", max_length=60, blank=True)
    inn = models.CharField("STIR", max_length=20, blank=True)
    region = models.CharField("Hudud", max_length=80, blank=True)
    # javob bermadi: urinishlar soni va keyingi qo'ng'iroq (1, 3, 7 kun)
    no_answer = models.PositiveSmallIntegerField(default=0)
    next_call_at = models.DateTimeField(null=True, blank=True)
    call_reminded_at = models.DateTimeField(null=True, blank=True)
    reminded_at = models.DateTimeField(null=True, blank=True)  # robot: "javobsiz lid" eslatmasi yuborilgan
    # Telegram'dan avtomatik ochilgan lid — sotuvchining shu chati (har chatdan bitta lid)
    tg_chat = models.ForeignKey("TgChat", null=True, blank=True, on_delete=models.SET_NULL, related_name="leads")

    class Meta:
        ordering = ["-created"]

    def __str__(self) -> str:
        return self.name or self.company or self.phone or f"Lid #{self.pk}"


class RoutingRule(models.Model):
    """Lidni taqsimlash qoidasi (rahbar belgilaydi): mahsulot yoki hudud kalit so'zlari → sotuvchi. Mos kelmasa — navbat."""

    class Kind(models.TextChoices):
        PRODUCT = "product", "Mahsulot"
        REGION = "region", "Hudud"

    kind = models.CharField(max_length=8, choices=Kind.choices)
    keywords = models.CharField(max_length=300)  # vergul bilan: "konveyer, lenta"
    seller_tg = models.BigIntegerField()
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return f"{self.kind}: {self.keywords} → {self.seller_tg}"


class Goal(models.Model):
    """Sotuvchining oylik rejasi (so'm); month — oyning 1-kuni."""

    owner_tg = models.BigIntegerField()
    month = models.DateField()
    amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal(0))

    class Meta:
        constraints = [models.UniqueConstraint(fields=["owner_tg", "month"], name="crm_goal_uniq")]

    def __str__(self) -> str:
        return f"{self.owner_tg} {self.month:%Y-%m}"


class Channel(models.TextChoices):
    TG = "tg", "Telegram"
    WA = "wa", "WhatsApp"
    IG = "ig", "Instagram"


class TgConnection(models.Model):
    """Sotuvchining kanal ulanishi. Telegram — Business ulanishi (id — business_connection_id); WhatsApp / Instagram —
    kompaniya raqami/akkaunti, sotuvchiga taqsimlangan chatlar shu yerda (id — «wa:<tg_id>», meta.py)."""

    id = models.CharField(primary_key=True, max_length=128)  # business_connection_id | «wa:<tg_id>» | «ig:<tg_id>»
    channel = models.CharField(max_length=2, choices=Channel.choices, default=Channel.TG, db_index=True)
    user_tg = models.BigIntegerField("Sotuvchi Telegram ID", db_index=True)
    user_name = models.CharField(max_length=200, blank=True)
    user_chat_id = models.BigIntegerField(null=True, blank=True)
    can_reply = models.BooleanField(default=False)
    rights = models.JSONField(default=dict, blank=True)
    is_enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.user_name or self.user_tg} ({'yoqilgan' if self.is_enabled else 'uzilgan'})"


class TgChatQuerySet(models.QuerySet):
    def people(self) -> TgChatQuerySet:
        """Botlarsiz (bot username'i doim "bot" bilan tugaydi) — avval saqlangan bot chatlari ham ko'rinmaydi."""
        return self.exclude(username__iendswith="bot")


class TgChat(models.Model):
    """Sotuvchi bilan mijoz o'rtasidagi shaxsiy chat."""

    connection = models.ForeignKey(TgConnection, on_delete=models.CASCADE, related_name="chats")
    chat_id = models.BigIntegerField()
    title = models.CharField(max_length=255, blank=True)
    username = models.CharField(max_length=64, blank=True)
    last_at = models.DateTimeField(null=True, blank=True, db_index=True)
    last_text = models.CharField(max_length=300, blank=True)
    last_out = models.BooleanField(default=False)
    unread = models.PositiveIntegerField(default=0)
    # CRM mijozi (sotuvchi biriktiradi: chatdan bitim ochganda yoki qo'lda)
    customer = models.ForeignKey(Customer, null=True, blank=True, on_delete=models.SET_NULL, related_name="tg_chats")

    objects = TgChatQuerySet.as_manager()

    class Meta:
        ordering = ["-last_at"]
        constraints = [models.UniqueConstraint(fields=["connection", "chat_id"], name="crm_tgchat_uniq")]

    def __str__(self) -> str:
        return self.title or str(self.chat_id)


class TgMessage(models.Model):
    chat = models.ForeignKey(TgChat, on_delete=models.CASCADE, related_name="messages")
    message_id = models.BigIntegerField()
    out = models.BooleanField(default=False)  # sotuvchi yozgan (o'zi yoki CRM orqali)
    kind = models.CharField(max_length=16, default="text")  # text, photo, video, voice, document, sticker …
    text = models.TextField(blank=True)
    date = models.DateTimeField(db_index=True)
    edited_at = models.DateTimeField(null=True, blank=True)
    deleted = models.BooleanField(default=False)
    via_crm = models.BooleanField(default=False)
    # fayl (rasm, video, ovoz, hujjat, stiker): {file_id, mime, name, size, width, height, duration}; fayl — Telegram'da
    media = models.JSONField(null=True, blank=True)
    raw = models.JSONField(null=True, blank=True)  # Telegram xabari (yangi turlarni keyin ko'rsatish uchun)
    # javob (reply): {message_id, text, kind, from_id} — asl xabar CRM'da bo'lmasa ham iqtibos ko'rinadi
    reply = models.JSONField(null=True, blank=True)
    # tahrirlar tarixi: har tahrirdan oldingi matn [{text, at}] — eskisidan yangisiga
    history = models.JSONField(default=list, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["date", "message_id"]
        constraints = [models.UniqueConstraint(fields=["chat", "message_id"], name="crm_tgmsg_uniq")]

    def __str__(self) -> str:
        return f"{self.chat_id}:{self.message_id}"

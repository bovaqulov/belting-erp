"""TelegramCRM modellari. 1-bosqich: akkaunt, uning MTProto sessiyasi, sessiya entity keshi, hodisalar jurnali.

Boshqa applar modeliga FK yo'q: egasi — xodimning `tg_id` si (`owner_tg`).
"""

from __future__ import annotations

from django.db import models


class Kind(models.TextChoices):
    COMPANY = "company", "Firma raqami"
    PERSONAL = "personal", "Shaxsiy raqam"


class Status(models.TextChoices):
    NEW = "new", "Ulanmagan"
    CODE_SENT = "code_sent", "Kod yuborildi"
    PASSWORD = "password", "2FA parol kerak"
    QR = "qr", "QR kutilmoqda"
    ACTIVE = "active", "Ulangan"
    OFFLINE = "offline", "Aloqa yo'q"
    FLOOD = "flood", "Kutish (flood)"
    LIMITED = "limited", "Cheklangan (spam)"
    FROZEN = "frozen", "Muzlatilgan"
    BANNED = "banned", "Bloklangan"
    LOGGED_OUT = "logged_out", "Sessiya tugagan"
    ERROR = "error", "Xato"


# gateway ishga tushganda ko'tariladigan holatlar (sessiyasi bor, avtorizatsiyadan o'tgan)
RUNNABLE = (Status.ACTIVE, Status.OFFLINE, Status.FLOOD, Status.LIMITED, Status.FROZEN)
# login jarayoni (gateway xotirasida; qayta ishga tushsa — boshidan)
LOGIN = (Status.CODE_SENT, Status.PASSWORD, Status.QR)


class Account(models.Model):
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.COMPANY)
    title = models.CharField(max_length=120, blank=True)
    owner_tg = models.BigIntegerField(db_index=True)  # kim ulagan (staff tg_id)
    phone = models.CharField(max_length=32, blank=True)
    tg_user_id = models.BigIntegerField(null=True, blank=True, unique=True)  # bitta Telegram akkaunti — bir marta
    username = models.CharField(max_length=64, blank=True)
    name = models.CharField(max_length=160, blank=True)
    premium = models.BooleanField(default=False)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.NEW, db_index=True)
    status_detail = models.CharField(max_length=300, blank=True)
    flood_until = models.DateTimeField(null=True, blank=True)
    limits = models.JSONField(default=dict, blank=True)  # help.getAppConfig: caption, papkalar, fayl hajmi ...
    sla_minutes = models.PositiveIntegerField(default=15)  # 7-bosqich: mijozga javob muddati (javobsiz — qizil)
    alert_status = models.CharField(
        max_length=16, blank=True
    )  # 8-bosqich: oxirgi yuborilgan ogohlantirish (takrorlanmasin)
    alert_at = models.DateTimeField(null=True, blank=True)
    # AI yordamchi: mijoz xabariga avtomatik javob (egasi qarori 2026-11-19 — darhol, barcha shaxsiy chatlar, narxsiz)
    ai_enabled = models.BooleanField(default=False)
    ai_instructions = models.TextField(blank=True)  # firma, FAQ, uslub — egasi yozadi
    ai_delay_sec = models.PositiveIntegerField(default=8)  # ketma-ket xabarlar jamlanadi
    ai_quiet_min = models.PositiveIntegerField(default=30)  # odam yozgan bo'lsa — AI jim
    ai_max_per_hour = models.PositiveIntegerField(default=6)  # bir chatga soatiga
    connected_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("kind", "title", "id")

    def __str__(self) -> str:
        return self.title or self.name or self.phone or f"#{self.pk}"


class AccountSession(models.Model):
    """Telethon sessiyasi: DC, shifrlangan auth_key, yangilanish holati (pts/qts/date/seq — catch_up uchun)."""

    account = models.OneToOneField(Account, on_delete=models.CASCADE, related_name="session")
    dc_id = models.PositiveSmallIntegerField(default=0)
    server_address = models.CharField(max_length=64, blank=True)
    port = models.PositiveIntegerField(default=0)
    auth_key = models.TextField(blank=True)  # Fernet token
    takeout_id = models.BigIntegerField(null=True, blank=True)
    states = models.JSONField(default=dict, blank=True)  # {"0": [pts, qts, date, seq], "<kanal>": [pts]}
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"sessiya #{self.account_id} (dc{self.dc_id})"


class SessionEntity(models.Model):
    """Entity keshi (id + access_hash): username/telefonni qayta-qayta resolve qilmaslik uchun (flood/ban xavfi)."""

    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="entities")
    peer_id = models.BigIntegerField()  # Telethon "marked" id (kanal — -100…, guruh — manfiy)
    access_hash = models.BigIntegerField(default=0)
    username = models.CharField(max_length=64, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    name = models.CharField(max_length=255, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("account", "peer_id"), name="tgcrm_entity_uniq")]

    def __str__(self) -> str:
        return f"{self.account_id}:{self.peer_id}"


class AccountEvent(models.Model):
    """Akkaunt jurnali: ulandi/uzildi, flood, cheklov, xato — sog'liq paneli va tahlil uchun."""

    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="events")
    kind = models.CharField(max_length=32)
    detail = models.CharField(max_length=500, blank=True)
    actor_tg = models.BigIntegerField(null=True, blank=True)
    at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("-at",)

    def __str__(self) -> str:
        return f"{self.account_id} {self.kind}"


# ---------------------------------------------------------------------- 2-bosqich: sinxronlash
class PeerKind(models.TextChoices):
    USER = "user", "Foydalanuvchi"
    BOT = "bot", "Bot"
    GROUP = "group", "Guruh"
    SUPERGROUP = "supergroup", "Superguruh"
    CHANNEL = "channel", "Kanal"


class Peer(models.Model):
    """Suhbatdosh (foydalanuvchi, guruh, kanal) — akkaunt nuqtai nazaridan. peer_id — Telethon "marked" id."""

    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="peers")
    peer_id = models.BigIntegerField()
    kind = models.CharField(max_length=12, choices=PeerKind.choices, default=PeerKind.USER)
    title = models.CharField(max_length=255, blank=True)  # foydalanuvchi — ism familiya
    username = models.CharField(max_length=64, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    photo_id = models.BigIntegerField(null=True, blank=True)
    verified = models.BooleanField(default=False)
    scam = models.BooleanField(default=False)  # scam/fake belgisi (Telegram)
    deleted = models.BooleanField(default=False)  # o'chirilgan akkaunt
    is_self = models.BooleanField(default=False)  # "Saqlangan xabarlar"
    contact = models.BooleanField(default=False)  # telefon kontaktlarida (papka filtrlari uchun)
    members = models.IntegerField(null=True, blank=True)
    online = models.BooleanField(default=False)
    last_seen = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("account", "peer_id"), name="tgcrm_peer_uniq")]

    def __str__(self) -> str:
        return self.title or self.username or str(self.peer_id)


class Dialog(models.Model):
    """Chat ro'yxatidagi qator. Tarix dangasa: [history_min_id … top] oralig'i bazada uzluksiz."""

    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="dialogs")
    peer = models.OneToOneField(Peer, on_delete=models.CASCADE, related_name="dialog")
    top_msg_id = models.IntegerField(default=0)
    last_date = models.DateTimeField(null=True, blank=True, db_index=True)
    last_text = models.CharField(max_length=300, blank=True)  # ro'yxatdagi ko'rinish (matn yoki "Rasm" …)
    last_out = models.BooleanField(default=False)
    unread = models.IntegerField(default=0)
    unread_mentions = models.IntegerField(default=0)
    read_inbox_max = models.IntegerField(default=0)
    read_outbox_max = models.IntegerField(default=0)  # suhbatdosh o'qigan (✓✓)
    pinned = models.BooleanField(default=False)
    archived = models.BooleanField(default=False)  # folder_id = 1
    muted_until = models.DateTimeField(null=True, blank=True)
    draft = models.TextField(blank=True)
    # 6-bosqich: mas'ul operator (staff tg_id) — biriktirilmagan chatga birinchi javob bergan avtomatik oladi
    assignee_tg = models.BigIntegerField(null=True, blank=True, db_index=True)
    assigned_at = models.DateTimeField(null=True, blank=True)
    assigned_by = models.BigIntegerField(null=True, blank=True)
    ai_off = models.BooleanField(default=False)  # shu chatda AI javob bermaydi (do'st, oila …)
    history_min_id = models.IntegerField(null=True, blank=True)  # eng eski uzluksiz yuklangan xabar
    history_complete = models.BooleanField(default=False)  # boshigacha yuklangan
    synced_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=("account", "-last_date"), name="tgcrm_dialog_order")]

    def __str__(self) -> str:
        return f"{self.account_id}:{self.peer_id}"


class Message(models.Model):
    """Xabar. msg_id — Telegram id (shaxsiy chat/guruhda akkaunt bo'yicha umumiy ketma-ketlik, kanalda — kanal bo'yicha)."""

    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="messages")
    peer = models.ForeignKey(Peer, on_delete=models.CASCADE, related_name="messages")
    msg_id = models.IntegerField()
    date = models.DateTimeField(db_index=True)
    out = models.BooleanField(default=False)
    sender_id = models.BigIntegerField(null=True, blank=True)
    text = models.TextField(blank=True)
    entities = models.JSONField(default=list, blank=True)  # formatlash: [{type, offset, length, url?}]
    media = models.JSONField(null=True, blank=True)  # {kind, …meta} — fayl 4-bosqichda
    action = models.JSONField(null=True, blank=True)  # xizmat xabari (qo'shildi, nom o'zgardi …)
    reply_to = models.IntegerField(null=True, blank=True)
    fwd = models.JSONField(null=True, blank=True)  # {from_id?, from_name?, date}
    grouped_id = models.BigIntegerField(null=True, blank=True)  # albom
    edit_date = models.DateTimeField(null=True, blank=True)
    views = models.IntegerField(null=True, blank=True)
    post_author = models.CharField(max_length=128, blank=True)
    reactions = models.JSONField(null=True, blank=True)  # [{emoji, count, mine}]
    deleted = models.BooleanField(default=False)  # o'chirilgan (CRM tarixi uchun saqlanadi, UI'da belgilanadi)
    sent_by = models.BigIntegerField(null=True, blank=True)  # CRM orqali yuborgan xodim (tg_id) — audit
    by_ai = models.BooleanField(default=False)  # AI yordamchi yozgan

    class Meta:
        constraints = [models.UniqueConstraint(fields=("peer", "msg_id"), name="tgcrm_msg_uniq")]
        indexes = [models.Index(fields=("account", "msg_id"), name="tgcrm_msg_acc_id")]

    def __str__(self) -> str:
        return f"{self.peer_id}#{self.msg_id}"


class Folder(models.Model):
    """Telegram papkasi (dialog filter). Qoidalar — Telegram'dagidek; ro'yxatni hisoblash — backend'da."""

    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="folders")
    folder_id = models.IntegerField()
    title = models.CharField(max_length=64)
    emoticon = models.CharField(max_length=16, blank=True)
    order = models.IntegerField(default=0)
    flags = models.JSONField(default=dict, blank=True)  # contacts, non_contacts, groups, broadcasts, bots, exclude_*
    include = models.JSONField(default=list, blank=True)  # peer_id lar
    exclude = models.JSONField(default=list, blank=True)
    pinned = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ("order",)
        constraints = [models.UniqueConstraint(fields=("account", "folder_id"), name="tgcrm_folder_uniq")]

    def __str__(self) -> str:
        return self.title


# ---------------------------------------------------------------------- 6-bosqich: operatorlar
class Role(models.TextChoices):
    ADMIN = "admin", "Admin"  # ulash/uzish, a'zolar, biriktirish
    OPERATOR = "operator", "Operator"  # yozadi, chat oladi
    VIEWER = "viewer", "Kuzatuvchi"  # faqat o'qiydi


class AccountMember(models.Model):
    """Akkauntga kirish. Firma raqamida ro'yxat bo'sh — modulning hamma xodimi operator (oldingi xulq)."""

    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="members")
    staff_tg = models.BigIntegerField(db_index=True)
    role = models.CharField(max_length=12, choices=Role.choices, default=Role.OPERATOR)
    added_by = models.BigIntegerField(null=True, blank=True)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("account", "staff_tg"), name="tgcrm_member_uniq")]

    def __str__(self) -> str:
        return f"{self.account_id}:{self.staff_tg}:{self.role}"


# ---------------------------------------------------------------------- 7-bosqich: CRM qatlami
class Stage(models.TextChoices):
    NEW = "new", "Yangi"
    QUALIFIED = "qualified", "Ehtiyoj aniqlandi"
    OFFER = "offer", "Taklif berildi"
    NEGOTIATION = "negotiation", "Muzokara"
    WON = "won", "Sotildi"
    LOST = "lost", "Yo'qotildi"


class Tag(models.Model):
    name = models.CharField(max_length=40, unique=True)
    color = models.CharField(max_length=9, default="#3e88f7")

    class Meta:
        ordering = ("name",)

    def __str__(self) -> str:
        return self.name


class Contact(models.Model):
    """Mijoz — Telegram foydalanuvchisi (bir nechta akkauntga yozsa ham bitta karta). tg_user_id = Peer.peer_id (musbat)."""

    tg_user_id = models.BigIntegerField(unique=True)
    name = models.CharField(max_length=160, blank=True)
    company = models.CharField(max_length=160, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    inn = models.CharField(max_length=14, blank=True)  # STIR
    source = models.CharField(max_length=60, blank=True)  # qayerdan keldi: Telegram, Instagram, tavsiya …
    stage = models.CharField(max_length=16, choices=Stage.choices, default=Stage.NEW, db_index=True)
    lost_reason = models.CharField(max_length=200, blank=True)
    owner_tg = models.BigIntegerField(null=True, blank=True, db_index=True)  # mas'ul sotuvchi
    amount = models.DecimalField(max_digits=16, decimal_places=2, null=True, blank=True)  # kutilayotgan summa (so'm)
    tags = models.ManyToManyField(Tag, blank=True, related_name="contacts")
    stage_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.name or self.company or str(self.tg_user_id)


class Note(models.Model):
    """Ichki izoh — mijozga yuborilmaydi."""

    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name="notes")
    author_tg = models.BigIntegerField()
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return self.text[:40]


class Task(models.Model):
    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name="tasks")
    title = models.CharField(max_length=200)
    due_at = models.DateTimeField(db_index=True)
    assignee_tg = models.BigIntegerField(db_index=True)
    created_by = models.BigIntegerField()
    done_at = models.DateTimeField(null=True, blank=True)
    reminded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("done_at", "due_at")

    def __str__(self) -> str:
        return self.title


class QuickReply(models.Model):
    """Tez javob (shablon). account=None — barcha akkauntlar uchun. Operator tanlab yuboradi (ommaviy emas)."""

    account = models.ForeignKey(Account, on_delete=models.CASCADE, null=True, blank=True, related_name="quick_replies")
    title = models.CharField(max_length=60)
    text = models.TextField()
    created_by = models.BigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("title",)

    def __str__(self) -> str:
        return self.title

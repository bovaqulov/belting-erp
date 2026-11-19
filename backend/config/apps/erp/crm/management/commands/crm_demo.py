"""CRM demo ma'lumotlari (dev baza): mijozlar (barcha turlar), bitimlar (har bosqichda, tovarlar, narxlash, to'lov,
faoliyat, vazifalar, tarix), lidlar, oylik reja, WhatsApp / Instagram chatlari — bitta xodim profili uchun.

Yaratilganlar ID'lari `data/crm_demo.json` ga yoziladi — `--clear` aynan shularni o'chiradi (haqiqiy ma'lumotga tegmaydi).
    manage.py crm_demo                 # Telegram ulangan xodim (yoki birinchi xodim) uchun
    manage.py crm_demo --tg 5574861580
    manage.py crm_demo --clear         # demo ma'lumotlarni o'chirish
Qayta ishga tushirilsa — avval eski demo o'chiriladi.
"""

from __future__ import annotations

import json
import random
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from config.apps.erp.catalog import services as catalog
from config.apps.erp.crm.deals import deal_title, goods_total, priced
from config.apps.erp.crm.meta import msg_id
from config.apps.erp.crm.models import (
    Activity,
    Customer,
    Deal,
    Doc,
    Goal,
    Lead,
    LeadStatus,
    Stage,
    StageHistory,
    TgChat,
    TgConnection,
    TgMessage,
)
from config.apps.staff.services import User, user_names

REG = Path(settings.BASE_DIR) / "data" / "crm_demo.json"

# (tur, nom, STIR, telefon, manzil, lavozim, firma, firma STIRi)
CUSTOMERS: list[tuple[str, str, str, str, str, str, str, str]] = [
    ("company", "Chinoz Un MChJ", "305112847", "998901234567", "Toshkent v., Chinoz t., Sanoat ko'ch. 12", "", "", ""),
    (
        "company",
        "Navoiy Konveyer Servis MChJ",
        "306221904",
        "998933305577",
        "Navoiy sh., Galaba shoh ko'ch. 41",
        "",
        "",
        "",
    ),
    (
        "company",
        "Qarshi Shakar Kombinati AJ",
        "203887105",
        "998951471298",
        "Qashqadaryo v., Qarshi sh., Zavod ko'ch. 3",
        "",
        "",
        "",
    ),
    (
        "company",
        "Farg'ona Tekstil MChJ",
        "306998421",
        "998918201093",
        "Farg'ona sh., Mustaqillik ko'ch. 88",
        "",
        "",
        "",
    ),
    (
        "company",
        "Angren Ko'mir Transport MChJ",
        "302906357",
        "998901738842",
        "Toshkent v., Angren sh., Shaxtyor 7",
        "",
        "",
        "",
    ),
    (
        "employee",
        "Rahim Karimov",
        "",
        "998905554433",
        "Samarqand v., Urgut t.",
        "Ta'minotchi",
        "Urgut Sement MChJ",
        "307441209",
    ),
    (
        "employee",
        "Dilshod Yo'ldoshev",
        "",
        "998977001122",
        "Andijon sh., Bobur shoh ko'ch. 5",
        "Bosh mexanik",
        "Andijon Mexanika Zavodi AJ",
        "200741182",
    ),
    (
        "employee",
        "Nodira Xasanova",
        "",
        "998935557711",
        "Buxoro sh., Navoiy ko'ch. 19",
        "Xarid bo'limi boshlig'i",
        "Buxoro Paxta Tozalash MChJ",
        "302245619",
    ),
    (
        "trader",
        "Akmal aka (Abu Saxiy)",
        "",
        "998901112233",
        "Toshkent, Abu Saxiy bozori, 3-qator 14-do'kon",
        "",
        "",
        "",
    ),
    ("trader", "Sherzod Remen Savdo", "", "998939998877", "Samarqand, Siyob bozori, texnika qatori", "", "", ""),
    (
        "ip",
        "YaTT Tursunov Bekzod",
        "31204857600011",
        "998946665544",
        "Jizzax sh., Sharof Rashidov ko'ch. 2",
        "",
        "",
        "",
    ),
    ("person", "Otabek Rasulov", "31508962100027", "998914443322", "Toshkent sh., Yunusobod 14-mavze", "", "", ""),
    ("state", "Toshkent Suv Ta'minoti DUK", "201125588", "998712334455", "Toshkent sh., Shayxontohur t.", "", "", ""),
    ("company", "Termiz Tegirmon MChJ", "308452013", "998993643200", "Surxondaryo v., Termiz sh.", "", "", ""),
]

# katalog tovarlari (catalog_demo): (nom, variant) — narx va birlik katalogdan
GOODS: list[tuple[str, str | None]] = [
    ("Ремень клиновой SPB 1650", None),
    ("Ремень клиновой SPA 1250", None),
    ("Ремень клиновой B-1800", None),
    ("Ремень зубчатый 1040-8M-30", None),
    ("Ремень зубчатый 5M-450-15", None),
    ("Ремень поликлиновой 8PK 1795", None),
    ("Лента конвейерная EP-400/3", "800 мм"),
    ("Лента конвейерная EP-200/2", "500 мм"),
    ("Рукав напорный 25 мм", None),
    ("Резинотканевая лента 2-650", None),
]

# (mijoz indeksi, bosqich, yaratilganiga kun, bosqichda kun, tovarlar [(tovar, miqdor)], chegirma %, ustama %, logistika)
DEALS: list[tuple[int, str, int, int, list[tuple[int, int]], int, int, int]] = [
    (0, "new", 1, 1, [(0, 25)], 0, 0, 0),
    (8, "new", 2, 2, [(1, 40), (2, 30)], 3, 0, 0),
    (11, "new", 0, 0, [(5, 2)], 0, 0, 0),
    (1, "offer", 6, 3, [(6, 120)], 5, 0, 1_500_000),
    (5, "offer", 9, 5, [(3, 8), (4, 12)], 0, 0, 350_000),
    (12, "offer", 4, 2, [(8, 300)], 0, 7, 0),
    (3, "later", 21, 10, [(0, 60), (1, 40)], 4, 0, 0),
    (9, "later", 14, 6, [(2, 100)], 6, 0, 0),
    (2, "contract", 12, 2, [(9, 80)], 0, 0, 2_200_000),
    (6, "contract", 18, 4, [(3, 20)], 2, 0, 0),
    (13, "contract", 8, 1, [(7, 60), (8, 120)], 0, 0, 900_000),
    (4, "payment", 15, 3, [(6, 200)], 7, 0, 3_000_000),
    (10, "payment", 10, 2, [(5, 15), (0, 10)], 0, 5, 0),
    (7, "production", 25, 6, [(9, 150)], 3, 0, 1_800_000),
    (0, "production", 20, 4, [(1, 200), (2, 150)], 5, 0, 0),
    (1, "ready", 30, 1, [(7, 90)], 0, 0, 1_200_000),
    (2, "shipping", 34, 2, [(6, 80)], 4, 0, 2_500_000),
    (3, "won", 60, 25, [(0, 50)], 0, 0, 0),
    (5, "won", 45, 12, [(3, 10), (4, 10)], 0, 0, 400_000),
    (8, "won", 38, 9, [(1, 60)], 5, 0, 0),
    (11, "lost", 26, 14, [(5, 4)], 0, 0, 0),
    (12, "lost", 40, 20, [(8, 500)], 0, 0, 0),
]
COMMENTS = [
    "Mijoz narxni so'radi, katalog yuborildi",
    "Ombordagi qoldiq tekshirildi — yetarli",
    "Texnik shart: harorat 60°C gacha, moyga chidamli",
    "Rahbar bilan kelishib qaytib aloqaga chiqadi",
    "Namuna uchun eski remen rasmini yubordi",
    "Yetkazish sanasini aniqlash kerak",
]
CALLS = [
    "Qo'ng'iroq: narx bo'yicha gaplashildi",
    "Qo'ng'iroq: hajmni tasdiqladi",
    "Qo'ng'iroq: javob bermadi, qayta qilinadi",
]
TASKS = [
    "Tijorat taklifini yuborish",
    "Mijozga qayta qo'ng'iroq",
    "Shartnoma loyihasini tayyorlash",
    "To'lovni tekshirish",
]
# (ism, kompaniya, telefon, manba, holat, tasma, o'lcham, hajm, hudud, soat oldin, izoh)
LEADS: list[tuple[str, str, str, str, str, str, str, str, str, int, str]] = [
    ("Bobur", "", "998901230011", "site", "new", "SPB", "1650", "10 dona", "Toshkent", 1, "Saytdan: narxi qancha?"),
    (
        "Jamshid",
        "Guliston Plastmass",
        "998907770022",
        "whatsapp",
        "new",
        "8M",
        "1040",
        "4 dona",
        "Sirdaryo",
        3,
        "WhatsApp: tishli remen kerak",
    ),
    (
        "Aziza",
        "",
        "998935550033",
        "instagram",
        "new",
        "Konveyer lenta",
        "500 mm",
        "40 m",
        "Farg'ona",
        5,
        "Instagram: lenta narxi",
    ),
    (
        "Sardor",
        "Nukus Karton MChJ",
        "998612220044",
        "call",
        "work",
        "B",
        "1800",
        "30 dona",
        "Qoraqalpog'iston",
        26,
        "Qo'ng'iroq qildi, hajmni aniqlaydi",
    ),
    ("Murod", "", "998993330055", "olx", "work", "Rukav", "25 mm", "100 m", "Toshkent", 30, "OLX e'loniga yozdi"),
    (
        "Kamola",
        "Samarqand Don Mahsulotlari",
        "998915550066",
        "bot",
        "interested",
        "SPA",
        "1250",
        "50 dona",
        "Samarqand",
        52,
        "Botdan: taklif kutyapti",
    ),
    (
        "Ulug'bek",
        "Jizzax Qurilish",
        "998947770077",
        "recommendation",
        "interested",
        "Konveyer lenta",
        "800 mm",
        "60 m",
        "Jizzax",
        75,
        "Tavsiya bilan keldi",
    ),
]
# kanal, sarlavha, chat_id (telefon / IGSID), username, [(daqiqa oldin, chiquvchi, matn)]
CHATS: list[tuple[str, str, int, str, list[tuple[int, bool, str]]]] = [
    (
        "wa",
        "Jamshid +998 90 777 00 22",
        998907770022,
        "",
        [
            (180, False, "Assalomu alaykum, 1040-8M-30 tishli remen bormi?"),
            (170, True, "Va alaykum assalom, bor. Necha dona kerak?"),
            (35, False, "4 dona. Narxi va yetkazish muddati qancha?"),
        ],
    ),
    (
        "wa",
        "Rahim (Urgut Sement)",
        998905554433,
        "",
        [(60 * 26, True, "Tijorat taklifi yuborildi"), (60 * 25, False, "Rahmat, rahbarga ko'rsataman")],
    ),
    (
        "ig",
        "Aziza",
        17841400000000001,
        "aziza_textile",
        [(90, False, "Konveyer lenta 500 mm narxini bilsam bo'ladimi?"), (12, False, "40 metr kerak")],
    ),
    (
        "ig",
        "Sherzod",
        17841400000000002,
        "sherzod.uz",
        [(60 * 30, False, "Salom, katalog bormi?"), (60 * 29, True, "Assalomu alaykum! Katalogni yubordik")],
    ),
]


class Command(BaseCommand):
    help = "CRM demo ma'lumotlari (dev): --tg <xodim>, --clear — o'chirish"

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--tg", type=int, help="xodimning Telegram ID'si (standart — Telegram ulangan xodim)")
        parser.add_argument("--clear", action="store_true", help="demo ma'lumotlarni o'chirish")

    def handle(self, *args: Any, tg: int | None = None, clear: bool = False, **opts: Any) -> None:
        if not settings.DEBUG and "sqlite" not in settings.DATABASES["default"]["ENGINE"]:
            raise CommandError("Demo ma'lumot faqat dev bazaga (DEBUG yoki SQLite) — production'ga yozilmaydi.")
        removed = self.clear()
        if clear:
            self.stdout.write(f"Demo o'chirildi: {removed}")
            return
        owner = tg or self.default_owner()
        if not User.objects.filter(tg_id=owner).exists():
            raise CommandError(f"Xodim topilmadi: tg_id={owner}")
        reg = self.seed(owner)
        REG.parent.mkdir(parents=True, exist_ok=True)
        REG.write_text(json.dumps(reg, indent=1))
        self.stdout.write(
            self.style.SUCCESS(
                f"Demo yaratildi (xodim {owner}): " + ", ".join(f"{k}: {len(v)}" for k, v in reg.items())
            )
        )

    @staticmethod
    def default_owner() -> int:
        conn = TgConnection.objects.filter(channel="tg").order_by("-updated_at").first()
        if conn is not None:
            return conn.user_tg
        u = User.objects.order_by("id").first()
        if u is None:
            raise CommandError("Xodim yo'q — avval tizimga kiring.")
        return u.tg_id

    @transaction.atomic
    def clear(self) -> str:
        if not REG.exists():
            return "oldingi demo yo'q"
        reg: dict[str, list[Any]] = json.loads(REG.read_text())
        n = {
            "deals": Deal.objects.filter(pk__in=reg.get("deals", [])).delete()[0],
            "leads": Lead.objects.filter(pk__in=reg.get("leads", [])).delete()[0],
            "chats": TgChat.objects.filter(pk__in=reg.get("chats", [])).delete()[0],
            "customers": Customer.objects.filter(pk__in=reg.get("customers", [])).delete()[0],
            "goals": Goal.objects.filter(pk__in=reg.get("goals", [])).delete()[0],
            "conns": TgConnection.objects.filter(pk__in=reg.get("conns", []), chats__isnull=True).delete()[0],
        }
        REG.unlink()
        return ", ".join(f"{k}: {v}" for k, v in n.items())

    @transaction.atomic
    def seed(self, owner: int) -> dict[str, list[Any]]:
        rnd = random.Random(42)  # noqa: S311 — demo ma'lumot, kriptografiya emas
        now = timezone.now()
        ago = lambda d=0, h=0, m=0: now - timedelta(days=d, hours=h, minutes=m)
        reg: dict[str, list[Any]] = {"customers": [], "deals": [], "leads": [], "chats": [], "goals": [], "conns": []}

        custs: list[Customer] = []
        for kind, name, inn, phone, addr, pos, comp, cinn in CUSTOMERS:
            c = Customer.objects.create(
                kind=kind,
                name=name,
                inn=inn,
                phones=[phone],
                owner_tg=owner,
                address=addr,
                position=pos,
                company=comp,
                company_inn=cinn,
                contacts=[{"name": "Bahodir", "role": "ta'minotchi", "phone": "998901110000"}]
                if kind == "company"
                else [],
            )
            custs.append(c)
            reg["customers"].append(c.pk)

        call_command("catalog_demo", stdout=self.stdout)
        cat = []
        for gname, char in GOODS:
            h = catalog.find(gname, char)
            if h is None:
                raise CommandError(f"Katalogda yo'q: {gname} {char or ''}")
            cat.append(h)
        stages = {s.code: s for s in Stage.objects.filter(pipeline_id="main")}
        order = ["new", "offer", "later", "contract", "payment", "production", "ready", "shipping", "won"]
        reasons = ["Qimmat", "Raqobatchidan oldi"]
        for i, (ci, code, created_d, since_d, goods, disc, mark, log) in enumerate(DEALS):
            c, st = custs[ci], stages[code]
            items = [
                {
                    "item_id": cat[g]["item_id"],
                    "char_id": cat[g]["char_id"],
                    "name": cat[g]["name"] + (f" ({cat[g]['char']})" if cat[g]["char"] else ""),
                    "unit": cat[g]["unit"],
                    "qty": f"{q}.00",
                    "price": f"{Decimal(cat[g]['price'] or 0):.2f}",
                    "discount": "0.00",
                }
                for g, q in goods
            ]
            created, since = ago(created_d, rnd.randint(1, 6)), ago(since_d, rnd.randint(0, 5))
            d = Deal(
                title=f"{items[0]['name'].replace('Ремень ', '').replace('Лента ', '')} — {goods[0][1]} {items[0]['unit']}",
                customer=c,
                owner_tg=owner,
                stage=st,
                stage_since=since,
                created=created,
                updated=since,
                items=items,
                discount=Decimal(disc),
                markup=Decimal(mark),
                logistics=Decimal(log),
                location=c.address,
                source=rnd.choice(["call", "telegram", "site", "existing", "recommendation", "whatsapp"]),
                pay_terms=rnd.choice(["full", "half"]),
                tags=["ulgurji"] if goods[0][1] >= 100 else [],
                close_date=(now + timedelta(days=rnd.randint(3, 25))).date() if st.kind == "open" else None,
                closed=since if st.kind != "open" else None,
                lost_reason=reasons[i % 2] if code == "lost" else "",
                need="Mijozga remen va lenta kerak; yetkazish — mijoz manziliga",
            )
            d.amount = priced(d, goods_total(items))
            if code in ("production", "ready", "shipping", "won"):
                d.paid_sum = (
                    d.amount if code in ("shipping", "won") else (d.amount / 2 if d.pay_terms == "half" else d.amount)
                )
                d.sign_status = "signed"
            elif code in ("contract", "payment"):
                d.sign_status = "sent"
                d.sign_sent_at = since
            d.docs_done = code == "won"
            d.save()
            d.title = deal_title(d.pk, d.title)
            d.save(update_fields=["title"])
            reg["deals"].append(d.pk)

            # bosqich tarixi: yangi → ... → joriy
            StageHistory.objects.create(deal=d, ts=created, actor=owner, from_stage="", to_stage="new", src="web")
            path = order[1 : order.index(code) + 1] if code in order else ["offer", "lost"]
            prev = "new"
            for j, s in enumerate(path):
                ts = since if s == path[-1] else created + (since - created) * (j + 1) / (len(path) + 1)
                StageHistory.objects.create(deal=d, ts=ts, actor=owner, from_stage=prev, to_stage=s, src="web")
                prev = s

            # faoliyat: izoh, qo'ng'iroq, uchrashuv, vazifa (muddati o'tgan / bugun / kelgusi / bajarilgan)
            Activity.objects.create(
                deal=d, kind="comment", ts=created + timedelta(hours=1), actor=owner, text=rnd.choice(COMMENTS)
            )
            if created_d > 2:
                Activity.objects.create(
                    deal=d, kind="call", ts=created + timedelta(days=1), actor=owner, text=rnd.choice(CALLS)
                )
            if code in ("contract", "payment", "production"):
                Activity.objects.create(
                    deal=d,
                    kind="meeting",
                    ts=since - timedelta(hours=3),
                    actor=owner,
                    text="Uchrashuv: ofisda shartnoma shartlari kelishildi",
                )
            if st.kind == "open":
                due = rnd.choice([ago(1), now + timedelta(hours=3), now + timedelta(days=2)])
                Activity.objects.create(
                    deal=d, kind="task", ts=since, actor=owner, text=rnd.choice(TASKS), due=due, assignee=owner
                )
            Activity.objects.create(
                deal=d,
                kind="task",
                ts=created,
                actor=owner,
                text="Mijoz ehtiyojini aniqlash",
                due=created + timedelta(days=1),
                done_at=created + timedelta(hours=20),
                assignee=owner,
            )
            if d.paid_sum:
                Activity.objects.create(
                    deal=d,
                    kind="payment",
                    ts=since - timedelta(hours=1),
                    actor=owner,
                    text=f"To'lov: {d.paid_sum:,.0f} so'm (bank)".replace(",", " "),
                    data={"amount": str(d.paid_sum), "via": "bank"},
                )
            if code not in ("new", "lost"):
                Doc.objects.create(
                    deal=d,
                    number=f"BR-TT-DEMO-{d.pk:05d}",
                    kind="quote",
                    date=(created + timedelta(days=1)).date(),
                    status="posted",
                    total=d.amount,
                )

        leads: dict[str, Lead] = {}
        for name, comp, phone, src, status, prod, size, qty, region, hours, note in LEADS:
            lead = Lead.objects.create(
                created=ago(h=hours),
                name=name,
                company=comp,
                phone=phone,
                source=src,
                status=status,
                owner_tg=owner,
                product=prod,
                size=size,
                qty=qty,
                region=region,
                note=note,
                first_touch=ago(h=max(0, hours - 1)) if status != LeadStatus.NEW else None,
            )
            reg["leads"].append(lead.pk)
            leads[phone] = lead

        month = date(now.year, now.month, 1)
        if not Goal.objects.filter(owner_tg=owner, month=month).exists():
            reg["goals"].append(Goal.objects.create(owner_tg=owner, month=month, amount=Decimal(250_000_000)).pk)

        name = user_names([owner]).get(owner, "")
        for ch, title, ext, username, msgs in CHATS:
            conn, made = TgConnection.objects.get_or_create(
                id=f"{ch}:{owner}", defaults={"channel": ch, "user_tg": owner, "user_name": name, "can_reply": True}
            )
            if made:
                reg["conns"].append(conn.pk)
            chat = TgChat.objects.create(connection=conn, chat_id=ext, title=title, username=username)
            reg["chats"].append(chat.pk)
            unread = 0
            for k, (mins, out, text) in enumerate(msgs):
                ts = ago(m=mins)
                TgMessage.objects.create(
                    chat=chat,
                    message_id=msg_id(f"demo.{ch}.{ext}.{k}"),
                    out=out,
                    text=text,
                    date=ts,
                    raw={"id": f"demo.{k}"},
                )
                unread = 0 if out else unread + 1
                chat.last_at, chat.last_text, chat.last_out = ts, text, out
            chat.unread = unread
            chat.save()
            # chat → mijoz (telefon mos kelsa); WhatsApp / Instagram lidi → shu chat (lid kartochkasida «Chat»)
            cust = next((c for c in custs if str(ext) in c.phones), None)
            if cust is not None:
                chat.customer = cust
                chat.save(update_fields=["customer"])
            lead = leads.get(str(ext)) or next(
                (x for x in leads.values() if x.source == "instagram" and x.name == title), None
            )
            if lead is not None:
                lead.tg_chat = chat
                lead.save(update_fields=["tg_chat"])
        return reg

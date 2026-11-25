"""Savdo hujjatlari mantig'i (docs/plans/2026-11-21-sales-docs.md).

- Turlar: buyurtma → hisob / yuk xati / to'lov; hisob → yuk xati / to'lov; yuk xati → schyot-faktura / to'lov.
- Holat: qoralama (tahrirlanadi) → o'tkazilgan (qarz va jo'natishga ta'sir qiladi) → qaytarish (qoralamaga) yoki bekor.
- Narx — QQS bilan (1C «с НДС»); katalog narxi QQSsiz → qo'shilganda QQS qo'shiladi. Qator: summa = miqdor × narx ×
  (1 − chegirma %), QQS = summa × r / (100 + r). Chegirma — narx siyosati chegarasi (rolga qarab).
- Yuk xati o'tkazilsa: CRM bitimidan bo'lsa — bitimning o'z ombor navbati (takror yo'q), aks holda — ombor yig'ish
  navbati `sale:<id>`; jo'natilgach — «jo'natildi».
- Ko'rinish: rahbariyat, sotuv bo'limi rahbari, buxgalteriya — hammasi; sotuvchi — o'zi mas'ul hujjatlar.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.db.models import Q, QuerySet, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from config.apps.core.http import ApiError
from config.apps.erp.catalog import services as catalog
from config.apps.erp.crm import services as crm
from config.apps.erp.finance import services as finance
from config.apps.erp.money import services as moneysvc
from config.apps.erp.warehouse import services as wh

from .models import Kind, PayMethod, SaleDoc, Seq, Status

CODE = {Kind.ORDER: "ZK", Kind.INVOICE: "HS", Kind.SHIPMENT: "YX", Kind.VAT_INVOICE: "SF", Kind.RECEIPT: "TL"}
CHILDREN: dict[str, tuple[str, ...]] = {
    Kind.ORDER: (Kind.INVOICE, Kind.SHIPMENT, Kind.RECEIPT),
    Kind.INVOICE: (Kind.SHIPMENT, Kind.RECEIPT),
    Kind.SHIPMENT: (Kind.VAT_INVOICE, Kind.RECEIPT),
    Kind.VAT_INVOICE: (),
    Kind.RECEIPT: (),
}
GROUPS = {
    "orders": (Kind.ORDER, Kind.INVOICE),
    "shipments": (Kind.SHIPMENT,),
    "vat": (Kind.VAT_INVOICE,),
    "receipts": (Kind.RECEIPT,),
}
WITH_LINES = (Kind.ORDER, Kind.INVOICE, Kind.SHIPMENT, Kind.VAT_INVOICE)
SRC = "sale:"
SRC_MONEY = "sales:"  # pul bo'limidagi ko'zgu hujjat manbasi
C2 = Decimal("0.01")
SHIP = {"picking": "Omborda yig'ilmoqda", "shipped": "Jo'natildi", "deal": "CRM bitimi orqali"}


def bad(msg: str, status: int = 400) -> ApiError:
    return ApiError(status, msg)


def dec(v: Any, label: str = "Son") -> Decimal:
    s = "" if v is None else str(v).strip().replace(" ", "").replace(" ", "").replace(",", ".")
    if not s:
        return Decimal(0)
    try:
        d = Decimal(s)
    except InvalidOperation:
        raise bad(f"{label}: son kiriting") from None
    if not d.is_finite():
        raise bad(f"{label}: son kiriting")
    return d


def r2(d: Decimal) -> Decimal:
    return d.quantize(C2, rounding=ROUND_HALF_UP)


def money(d: Decimal | None) -> str:
    """JSON uchun: butun bo'lsa — butun («1657600»), aks holda 2 xona."""
    d = d or Decimal(0)
    return str(int(d)) if d == d.to_integral_value() else str(r2(d))


@dataclass(frozen=True)
class Ctx:
    tg: int
    user: Any
    lead: bool
    head: bool
    all: bool  # hamma hujjatni ko'radi

    @classmethod
    def of(cls, user: Any) -> Ctx:
        lead, head = crm.sales_role(user)
        acc = "buxgalteriya" in set(user.dept_keys())
        return cls(user.tg_id, user, lead, head, lead or head or acc)

    def scope(self, qs: QuerySet[SaleDoc]) -> QuerySet[SaleDoc]:
        return qs if self.all else qs.filter(owner_tg=self.tg)

    @property
    def disc_max(self) -> Decimal:
        return catalog.max_discount(self.lead, self.head)


# ------------------------------------------------------------------ raqam, qatorlar
def next_number(kind: str, firm: str, at: datetime) -> str:
    key = f"{firm}-{CODE[Kind(kind)]}-{at:%y}"
    seq, _ = Seq.objects.select_for_update().get_or_create(key=key)
    seq.n += 1
    seq.save(update_fields=["n"])
    return f"{key}-{seq.n:05d}"


def calc_line(x: dict[str, Any], vat_pct: Decimal) -> dict[str, Any]:
    qty = dec(x.get("qty"), "Miqdor")
    price = dec(x.get("price"), "Narx")
    disc = dec(x.get("discount"), "Chegirma")
    if qty <= 0:
        raise bad(f"«{x.get('name') or 'Qator'}»: miqdor 0 dan katta bo'lsin")
    if price < 0:
        raise bad(f"«{x.get('name') or 'Qator'}»: narx manfiy bo'lmaydi")
    if not 0 <= disc <= 100:
        raise bad("Chegirma 0–100% oralig'ida bo'lsin")
    amount = r2(qty * price * (1 - disc / 100))
    vat = r2(amount * vat_pct / (100 + vat_pct)) if vat_pct else Decimal(0)
    return {
        "item_id": int(x["item_id"]) if str(x.get("item_id") or "").isdigit() else None,
        "char_id": int(x["char_id"]) if str(x.get("char_id") or "").isdigit() else None,
        "name": (str(x.get("name") or "").strip() or "Nomsiz")[:255],
        "char": (str(x.get("char") or "").strip() or None),
        "unit": (str(x.get("unit") or "").strip() or "dona")[:12],
        "qty": money(qty),
        "price": money(price),
        "discount": money(disc),
        "amount": money(amount),
        "vat": money(vat),
    }


def _discounts(lines: list[dict[str, Any]]) -> set[tuple[Any, Any, str]]:
    return {(x.get("item_id"), x.get("char_id"), str(x.get("discount"))) for x in lines}


def check_discounts(ctx: Ctx, new: list[dict[str, Any]], old: list[dict[str, Any]]) -> None:
    """Narx siyosati: yangi yoki o'zgargan chegirma — rol chegarasidan oshmasin (avval saqlangani tekshirilmaydi)."""
    had = _discounts(old)
    lim = ctx.disc_max
    for x in new:
        d = Decimal(x["discount"])
        if d > lim and (x["item_id"], x["char_id"], x["discount"]) not in had:
            raise bad(
                f"Narx siyosati: sizga ruxsat etilgan chegirma — {money(lim)}% gacha."
                if lim
                else "Narx siyosati: chegirmani rahbariyat belgilaydi.",
                403,
            )


# ------------------------------------------------------------------ JSON
def paid_of(d: SaleDoc) -> Decimal:
    """Shu hujjat asosidagi o'tkazilgan to'lovlar (buyurtma — uning hisob va yuk xatlari asosidagilari ham)."""
    ids = [d.pk]
    if d.kind == Kind.ORDER:
        ids += list(SaleDoc.objects.filter(base=d).exclude(status=Status.CANCELLED).values_list("pk", flat=True))
    s = SaleDoc.objects.filter(kind=Kind.RECEIPT, status=Status.POSTED, base_id__in=ids).aggregate(t=Sum("total"))["t"]
    return s or Decimal(0)


def row(d: SaleDoc, paid: Decimal | None = None) -> dict[str, Any]:
    out = {
        "id": d.pk,
        "kind": d.kind,
        "kind_name": Kind(d.kind).label,
        "number": d.number,
        "date": timezone.localtime(d.date).isoformat(timespec="minutes"),  # mahalliy (Toshkent) vaqt
        "status": d.status,
        "firm": d.firm,
        "customer_id": d.customer_id,
        "customer": d.customer_name or None,
        "total": money(d.total),
        "vat": money(d.vat),
        "ship_state": d.ship_state or None,
        "ship_name": SHIP.get(d.ship_state) if d.ship_state else None,
        "pay_method": d.pay_method or None,
        "base": {"id": d.base_id, "number": d.base.number, "kind": d.base.kind} if d.base_id and d.base else None,
        "owner_tg": d.owner_tg,
        "deal_id": d.deal_id,
    }
    if paid is not None:
        out["paid"] = money(paid)
    return out


def detail(ctx: Ctx, pk: int) -> dict[str, Any]:
    d = get(ctx, pk)
    paid = paid_of(d) if d.kind in (Kind.ORDER, Kind.INVOICE, Kind.SHIPMENT) else None
    kids = list(SaleDoc.objects.filter(base=d).exclude(status=Status.CANCELLED).order_by("date", "id"))
    card = crm.customer_card(d.customer_id) if d.customer_id else None
    out = {
        **row(d, paid),
        "due": money(max(d.total - paid, Decimal(0))) if paid is not None else None,
        "contract_id": d.contract_id,
        "contract": d.contract or None,
        "warehouse_id": d.warehouse_id,
        "warehouse": d.warehouse or None,
        "customer_inn": d.customer_inn or None,
        "lines": d.lines,
        "vat_pct": money(d.vat_pct),
        "comment": d.comment,
        "children": [row(k) for k in kids],
        "contact": card,
        "can": {
            "edit": d.status == Status.DRAFT,
            "post": d.status == Status.DRAFT,
            "unpost": d.status == Status.POSTED
            and d.ship_state != "shipped"
            and not any(k.status == Status.POSTED for k in kids),
            "cancel": d.status == Status.DRAFT,
            "create": list(CHILDREN[Kind(d.kind)]) if d.status != Status.CANCELLED else [],
        },
        "disc_max": money(ctx.disc_max),
    }
    return out


# ------------------------------------------------------------------ o'qish
def get(ctx: Ctx, pk: int, lock: bool = False) -> SaleDoc:
    qs = SaleDoc.objects.select_related("base")
    if lock:
        qs = qs.select_for_update()
    d = ctx.scope(qs).filter(pk=pk).first()
    if d is None:
        raise bad("Hujjat topilmadi", 404)
    return d


def journal(ctx: Ctx, g: dict[str, str]) -> dict[str, Any]:
    qs = ctx.scope(SaleDoc.objects.select_related("base"))
    kinds = [k for grp in (g.get("groups") or "").split(",") if grp for k in GROUPS.get(grp, ())]
    if kinds:
        qs = qs.filter(kind__in=kinds)
    if g.get("kind"):
        qs = qs.filter(kind=g["kind"])
    if g.get("status"):
        qs = qs.filter(status=g["status"])
    else:
        qs = qs.exclude(status=Status.CANCELLED)
    if g.get("customer_id", "").isdigit():
        qs = qs.filter(customer_id=int(g["customer_id"]))
    if d1 := parse_date(g.get("from") or ""):
        qs = qs.filter(date__date__gte=d1)
    if d2 := parse_date(g.get("to") or ""):
        qs = qs.filter(date__date__lte=d2)
    q = (g.get("q") or "").strip()
    if q:
        qs = qs.filter(
            Q(number__icontains=q)
            | Q(customer_name__icontains=q)
            | Q(customer_inn__startswith=q)
            | Q(comment__icontains=q)
        )
    rows = list(qs[:300])
    return {"rows": [row(d) for d in rows], "more": qs.count() > len(rows)}


# ------------------------------------------------------------------ saqlash
def _customer(ctx: Ctx, cid: Any) -> dict[str, Any] | None:
    if cid in (None, ""):
        return None
    try:
        cid = int(cid)
    except (TypeError, ValueError):
        raise bad("Mijoz noto'g'ri") from None
    card = crm.customer_card(cid)
    if card is None:
        raise bad("Mijoz topilmadi")
    if (
        not ctx.all
        and card["owner_tg"] != ctx.tg
        and all(c["id"] != cid for c in crm.customers_for(ctx.user, card["name"], 50))
    ):
        raise bad("Bu mijoz sizga biriktirilmagan", 403)
    return card


def _firm(code: Any) -> dict[str, Any]:
    fs = wh.firms()
    f = next((x for x in fs if x["code"] == str(code or "").strip()), None) or (fs[0] if fs and not code else None)
    if f is None:
        raise bad("Firma noto'g'ri")
    return f


def _apply(ctx: Ctx, d: SaleDoc, b: dict[str, Any]) -> None:
    if b.get("date"):
        dt = parse_datetime(str(b["date"])) or (
            datetime.combine(pd, datetime.now().time()) if (pd := parse_date(str(b["date"])[:10])) else None
        )
        if dt is None:
            raise bad("Sana noto'g'ri")
        d.date = timezone.make_aware(dt) if timezone.is_naive(dt) else dt
    if "firm" in b or not d.firm:
        d.firm = _firm(b.get("firm"))["code"]
    if "customer_id" in b:
        card = _customer(ctx, b.get("customer_id"))
        d.customer_id = card["id"] if card else None
        d.customer_name = card["name"] if card else ""
        d.customer_inn = (card["inn"] or "") if card else ""
        if not card:
            d.contract_id, d.contract = None, ""
    if "contract_id" in b:
        cid = b.get("contract_id")
        if cid in (None, ""):
            d.contract_id, d.contract = None, ""
        else:
            opts = finance.contracts_for(d.customer_inn, _firm(d.firm)["id"])
            c = next((x for x in opts if str(x["id"]) == str(cid)), None)
            if c is None:
                raise bad("Shartnoma bu mijoz va firmaga tegishli emas")
            d.contract_id, d.contract = c["id"], c["label"]
    if "warehouse_id" in b:
        wid = b.get("warehouse_id")
        w = next((x for x in wh.warehouses() if str(x["id"]) == str(wid)), None) if wid not in (None, "") else None
        if wid not in (None, "") and w is None:
            raise bad("Ombor noto'g'ri")
        d.warehouse_id, d.warehouse = (w["id"], w["name"]) if w else (None, "")
    if "vat_pct" in b:
        v = dec(b["vat_pct"], "QQS")
        if not 0 <= v <= 100:
            raise bad("QQS 0–100% oralig'ida bo'lsin")
        d.vat_pct = v
    if "comment" in b:
        d.comment = str(b.get("comment") or "")[:2000]
    if d.kind == Kind.RECEIPT:
        if "pay_method" in b:
            if b["pay_method"] not in PayMethod.values:
                raise bad("To'lov usulini tanlang")
            d.pay_method = b["pay_method"]
        if "amount" in b:
            a = r2(dec(b["amount"], "Summa"))
            if a < 0:
                raise bad("Summa manfiy bo'lmaydi")
            d.total, d.vat = a, Decimal(0)
    elif "lines" in b:
        raw = b["lines"] if isinstance(b["lines"], list) else []
        lines = [calc_line(x, d.vat_pct) for x in raw if isinstance(x, dict)]
        check_discounts(ctx, lines, d.lines or [])
        d.lines = lines
    if d.kind in WITH_LINES:
        d.total = sum((Decimal(x["amount"]) for x in d.lines or []), Decimal(0))
        d.vat = sum((Decimal(x["vat"]) for x in d.lines or []), Decimal(0))


@transaction.atomic
def save(ctx: Ctx, b: dict[str, Any], pk: int | None = None) -> dict[str, Any]:
    if pk:
        d = get(ctx, pk, lock=True)
        if d.status != Status.DRAFT:
            raise bad("O'tkazilgan hujjat tahrirlanmaydi — avval «Qaytarish»", 409)
    else:
        kind = str(b.get("kind") or "")
        if kind not in Kind.values:
            raise bad("Hujjat turi noto'g'ri")
        now = timezone.now()
        d = SaleDoc(kind=kind, date=now, owner_tg=ctx.tg, status=Status.DRAFT)
        if kind == Kind.RECEIPT:
            d.pay_method = PayMethod.BANK
        if b.get("deal_id"):
            deal = crm.deal_brief(int(b["deal_id"]))
            if deal is None:
                raise bad("Bitim topilmadi")
            if not ctx.all and deal["owner_tg"] != ctx.tg:
                raise bad("Bu bitim sizniki emas", 403)
            d.deal_id = deal["id"]
    _apply(ctx, d, b)
    if not d.number:
        d.number = next_number(d.kind, d.firm, d.date)
    d.save()
    if b.get("post"):
        return post(ctx, d.pk)
    return detail(ctx, d.pk)


# ------------------------------------------------------------------ o'tkazish
@transaction.atomic
def post(ctx: Ctx, pk: int) -> dict[str, Any]:
    d = get(ctx, pk, lock=True)
    if d.status != Status.DRAFT:
        raise bad("Hujjat allaqachon o'tkazilgan yoki bekor qilingan", 409)
    if not d.customer_id:
        raise bad("Mijozni tanlang")
    if d.kind in WITH_LINES and not d.lines:
        raise bad("Tovar qatorlari yo'q")
    if d.kind == Kind.RECEIPT and d.total <= 0:
        raise bad("To'lov summasini kiriting")
    if d.kind == Kind.SHIPMENT:
        if d.deal_id:
            d.ship_state = "deal"  # bitimning o'z ombor navbati (crm:<id>) — takror ochilmaydi
        else:
            if not d.warehouse_id:
                raise bad("Omborni tanlang")
            opened = wh.open_pick(
                source=f"{SRC}{d.pk}",
                number=d.number,
                customer=d.customer_name,
                lines=[{"item_id": x["item_id"], "char_id": x["char_id"], "qty": x["qty"]} for x in d.lines],
                channel="sales",
                firm=d.firm,
            )
            d.ship_state = "picking" if opened else ""
    d.status = Status.POSTED
    d.posted_at = timezone.now()
    d.save()
    if d.kind == Kind.RECEIPT:  # pul bo'limiga kirim (firma + usul bo'yicha asosiy hisob)
        moneysvc.mirror_receipt(
            f"{SRC_MONEY}{d.pk}",
            label=d.number,
            firm=d.firm,
            method=d.pay_method or "bank",
            amount=d.total,
            at=d.date,
            party={"id": d.customer_id, "name": d.customer_name, "inn": d.customer_inn},
        )
    return detail(ctx, d.pk)


@transaction.atomic
def unpost(ctx: Ctx, pk: int) -> dict[str, Any]:
    d = get(ctx, pk, lock=True)
    if d.status != Status.POSTED:
        raise bad("Hujjat o'tkazilmagan", 409)
    if d.ship_state == "shipped":
        raise bad("Tovar jo'natilgan — yuk xatini qaytarib bo'lmaydi (qaytarish hujjati kerak)", 409)
    if SaleDoc.objects.filter(base=d).filter(status=Status.POSTED).exists():
        raise bad("Shu hujjat asosida o'tkazilgan hujjat bor — avval uni qaytaring", 409)
    if d.ship_state == "picking":
        wh.close_pick(f"{SRC}{d.pk}")
    if d.kind == Kind.RECEIPT:
        moneysvc.unmirror(f"{SRC_MONEY}{d.pk}")
    d.ship_state = ""
    d.status = Status.DRAFT
    d.posted_at = None
    d.save()
    return detail(ctx, d.pk)


@transaction.atomic
def cancel(ctx: Ctx, pk: int) -> dict[str, Any]:
    d = get(ctx, pk, lock=True)
    if d.status != Status.DRAFT:
        raise bad("Faqat qoralama bekor qilinadi — avval «Qaytarish»", 409)
    d.status = Status.CANCELLED
    d.save(update_fields=["status", "updated"])
    return detail(ctx, d.pk)


@transaction.atomic
def create_from(ctx: Ctx, base_pk: int, kind: str) -> dict[str, Any]:
    """«Asosida yaratish»: mijoz, shartnoma, firma, ombor, bitim, qatorlar ko'chadi; to'lov — asosning qolgan qarzi."""
    base = get(ctx, base_pk)
    if base.status == Status.CANCELLED:
        raise bad("Bekor qilingan hujjatdan yaratib bo'lmaydi")
    if kind not in CHILDREN[Kind(base.kind)]:
        raise bad(
            f"«{Kind(base.kind).label}» asosida «{Kind(kind).label if kind in Kind.values else kind}» yaratilmaydi"
        )
    if (
        kind == Kind.VAT_INVOICE
        and SaleDoc.objects.filter(base=base).filter(kind=Kind.VAT_INVOICE).exclude(status=Status.CANCELLED).exists()
    ):
        raise bad("Bu yuk xati uchun schyot-faktura bor")
    now = timezone.now()
    d = SaleDoc(
        kind=kind,
        date=now,
        status=Status.DRAFT,
        firm=base.firm,
        customer_id=base.customer_id,
        customer_name=base.customer_name,
        customer_inn=base.customer_inn,
        contract_id=base.contract_id,
        contract=base.contract,
        warehouse_id=base.warehouse_id,
        warehouse=base.warehouse,
        deal_id=base.deal_id,
        base=base,
        vat_pct=base.vat_pct,
        owner_tg=ctx.tg,
    )
    if kind == Kind.RECEIPT:
        d.pay_method = PayMethod.BANK
        d.total = max(base.total - paid_of(base), Decimal(0))
    else:
        d.lines = [dict(x) for x in base.lines or []]
        d.total, d.vat = base.total, base.vat
    d.number = next_number(kind, d.firm, now)
    d.save()
    return detail(ctx, d.pk)


def from_deal(ctx: Ctx, deal_id: int, kind: str = Kind.ORDER) -> dict[str, Any]:
    """CRM bitimidan buyurtma (yoki hisob/yuk xati): mijoz va tovarlar (narx QQSsiz → QQS bilan)."""
    deal = crm.deal_brief(deal_id)
    if deal is None:
        raise bad("Bitim topilmadi", 404)
    vat = Decimal(12)
    lines = [
        {
            "item_id": x.get("item_id"),
            "char_id": x.get("char_id"),
            "name": x.get("name"),
            "unit": x.get("unit"),
            "qty": x.get("qty"),
            "price": str(r2(dec(x.get("price")) * (1 + vat / 100))),
            "discount": x.get("discount") or 0,
        }
        for x in deal["items"]
    ]
    return save(ctx, {"kind": kind, "deal_id": deal_id, "customer_id": deal["customer_id"], "lines": lines})


# ------------------------------------------------------------------ hisob-kitob
def debts(ctx: Ctx, q: str = "") -> list[dict[str, Any]]:
    """Mijozlar qarzi: o'tkazilgan yuk xatlari − to'lovlar (musbat — qarz, manfiy — avans)."""
    qs = ctx.scope(SaleDoc.objects.filter(status=Status.POSTED, kind__in=(Kind.SHIPMENT, Kind.RECEIPT)))
    if q.strip():
        qs = qs.filter(Q(customer_name__icontains=q.strip()) | Q(customer_inn__startswith=q.strip()))
    acc: dict[int, dict[str, Any]] = {}
    for cid, name, inn, kind, tot, dt in qs.values_list(
        "customer_id", "customer_name", "customer_inn", "kind", "total", "date"
    ):
        if cid is None:
            continue
        a = acc.setdefault(
            cid,
            {
                "customer_id": cid,
                "customer": name,
                "inn": inn or None,
                "shipped": Decimal(0),
                "paid": Decimal(0),
                "last": dt,
            },
        )
        a["shipped" if kind == Kind.SHIPMENT else "paid"] += tot
        a["last"] = max(a["last"], dt)
    out = []
    for a in acc.values():
        bal = a["shipped"] - a["paid"]
        out.append(
            {
                **a,
                "shipped": money(a["shipped"]),
                "paid": money(a["paid"]),
                "balance": money(bal),
                "last": timezone.localtime(a["last"]).isoformat(timespec="minutes"),
            }
        )
    out.sort(key=lambda x: -Decimal(x["balance"]))
    return out


# ------------------------------------------------------------------ yordamchi ro'yxatlar
def items(q: str, vat_pct: Decimal = Decimal(12)) -> list[dict[str, Any]]:
    """Katalog qidiruvi: narx QQS bilan (katalog narxi QQSsiz), erkin qoldiq."""
    out = []
    for r in catalog.search(q, 30):
        p = r.get("price")
        out.append({**r, "price_vat": money(r2(Decimal(p) * (1 + vat_pct / 100))) if p is not None else None})
    return out


def refs(ctx: Ctx, inn: str = "", firm: str = "") -> dict[str, Any]:
    firms = wh.firms()
    f = next((x for x in firms if x["code"] == firm), None)
    return {
        "firms": firms,
        "warehouses": wh.warehouses(),
        "contracts": finance.contracts_for(inn, f["id"] if f else None) if inn else [],
        "kinds": [{"key": k, "name": Kind(k).label, "children": list(CHILDREN[k])} for k in Kind.values],
        "pay_methods": [{"key": k, "name": n} for k, n in PayMethod.choices],
        "disc_max": money(ctx.disc_max),
        "all": ctx.all,
    }


def on_shipped(source: str, number: str) -> None:
    """Ombor: yig'ish navbati to'liq jo'natildi → yuk xati «jo'natildi»."""
    if not source.startswith(SRC) or not source[len(SRC) :].isdigit():
        return
    SaleDoc.objects.filter(pk=int(source[len(SRC) :]), kind=Kind.SHIPMENT).update(ship_state="shipped")

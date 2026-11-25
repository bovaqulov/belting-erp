"""Pul mantig'i (docs/plans/2026-11-21-money.md): hisoblar va qoldiqlar, kirim / chiqim / o'tkazish hujjatlari
(qoralama → o'tkazilgan → qaytarish / bekor), pul oqimi hisoboti, sotuv to'lovlari ko'zgusi.

- Qoldiq = boshlang'ich (1C importi sanasidagi) + o'tkazilgan kirim − chiqim − chiqib ketgan o'tkazish + kelgan
  o'tkazish (`amount_to`); har hisob o'z valyutasida.
- Kassadan qoldiqdan ko'p chiqim / o'tkazish — taqiq (bankda ham: 1C kabi manfiy qoldiq yo'q).
- Ko'zgu hujjat (`source` — «sales:12»): sotuvda o'tkazilgan to'lov; pulda tahrirlanmaydi, sotuvda qaytarilsa o'chadi.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.db.models import Q, QuerySet, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from config.apps.core.http import ApiError
from config.apps.erp.crm import services as crm
from config.apps.erp.finance import services as finance
from config.apps.erp.warehouse import services as wh

from .models import AccKind, Account, FlowItem, Kind, MoneyDoc, Op, Seq, Status

CODE = {Kind.IN: "KR", Kind.OUT: "CH", Kind.TRANSFER: "OT"}
C2 = Decimal("0.01")
OPS_IN = (Op.CUSTOMER, Op.LOAN, Op.OTHER)
OPS_OUT = (Op.SUPPLIER, Op.SALARY, Op.TAX, Op.EXPENSE, Op.LOAN, Op.REFUND, Op.OTHER)
PARTY_OF = {Op.CUSTOMER: "customer", Op.REFUND: "customer", Op.SUPPLIER: "supplier", Op.SALARY: "employee"}
ITEM_OF = {Op.CUSTOMER: "customer", Op.SUPPLIER: "supplier", Op.SALARY: "salary", Op.TAX: "tax", Op.REFUND: "refund"}
DEFAULT_NAME = {AccKind.CASH: "Asosiy kassa", AccKind.BANK: "Asosiy bank hisobi", AccKind.CARD: "Karta (ekvayring)"}


def bad(msg: str, status: int = 400) -> ApiError:
    return ApiError(status, msg)


def dec(v: Any, label: str = "Summa") -> Decimal:
    s = "" if v is None else str(v).strip().replace(" ", "").replace(" ", "").replace(",", ".")
    if not s:
        return Decimal(0)
    try:
        d = Decimal(s)
    except InvalidOperation:
        raise bad(f"{label}: son kiriting") from None
    if not d.is_finite():
        raise bad(f"{label}: son kiriting")
    return d.quantize(C2, rounding=ROUND_HALF_UP)


def money(d: Decimal | None) -> str:
    d = d or Decimal(0)
    return str(int(d)) if d == d.to_integral_value() else str(d.quantize(C2))


def iso(dt: datetime) -> str:
    return timezone.localtime(dt).isoformat(timespec="minutes")


# ------------------------------------------------------------------ qoldiqlar
def balances(at: date | None = None) -> dict[int, Decimal]:
    """Hisob → qoldiq (`at` — shu kun oxiridagi)."""
    qs = MoneyDoc.objects.filter(status=Status.POSTED)
    if at is not None:
        qs = qs.filter(date__date__lte=at)
    out = {a.pk: a.opening for a in Account.objects.all()}
    for acc, kind, amt in qs.values_list("account_id", "kind", "amount"):
        out[acc] = out.get(acc, Decimal(0)) + (amt if kind == Kind.IN else -amt)
    for acc, amt, amt_to in qs.filter(kind=Kind.TRANSFER).values_list("account_to_id", "amount", "amount_to"):
        out[acc] = out.get(acc, Decimal(0)) + (amt_to if amt_to is not None else amt)
    return out


def acc_json(a: Account, bal: Decimal | None = None) -> dict[str, Any]:
    return {
        "id": a.pk,
        "firm": a.firm,
        "kind": a.kind,
        "kind_name": AccKind(a.kind).label,
        "name": a.name,
        "number": a.number or None,
        "bank": a.bank or None,
        "mfo": a.mfo or None,
        "currency": a.currency,
        "opening": money(a.opening),
        "opening_date": a.opening_date.isoformat() if a.opening_date else None,
        "main": a.main,
        "active": a.active,
        "balance": money(bal) if bal is not None else None,
        "from_1c": a.source.startswith("1c:"),
    }


def accounts(all_: bool = False) -> list[dict[str, Any]]:
    bal = balances()
    qs = Account.objects.all() if all_ else Account.objects.filter(active=True)
    return [acc_json(a, bal.get(a.pk, a.opening)) for a in qs]


def save_account(d: dict[str, Any], pk: int | None = None) -> dict[str, Any]:
    a = Account.objects.filter(pk=pk).first() if pk else Account()
    if a is None:
        raise bad("Hisob topilmadi", 404)
    if "firm" in d or not a.firm:
        codes = {f["code"] for f in wh.firms()}
        if str(d.get("firm") or "") not in codes:
            raise bad("Firmani tanlang")
        a.firm = str(d["firm"])
    if "kind" in d or not a.kind:
        if d.get("kind") not in AccKind.values:
            raise bad("Hisob turini tanlang")
        a.kind = d["kind"]
    for k, n in (("name", 160), ("number", 40), ("bank", 160), ("mfo", 10)):
        if k in d:
            setattr(a, k, str(d.get(k) or "").strip()[:n])
    if not a.name:
        raise bad("Hisob nomi kerak")
    if "currency" in d:
        c = str(d.get("currency") or "UZS").upper()
        if c not in ("UZS", "USD", "EUR", "RUB", "CNY"):
            raise bad("Valyuta noto'g'ri")
        if pk and c != a.currency and MoneyDoc.objects.filter(Q(account=a) | Q(account_to=a)).exists():
            raise bad("Harakati bor hisobning valyutasi o'zgarmaydi")
        a.currency = c
    if "opening" in d:
        a.opening = dec(d.get("opening"), "Boshlang'ich qoldiq")
    if "opening_date" in d:
        a.opening_date = parse_date(str(d.get("opening_date") or "")) or None
    if "active" in d:
        a.active = bool(d["active"])
    if d.get("main"):
        Account.objects.filter(firm=a.firm, kind=a.kind, main=True).exclude(pk=a.pk).update(main=False)
        a.main = True
    a.save()
    return acc_json(a, balances().get(a.pk))


def main_account(firm: str, kind: str) -> Account:
    """Firma + turi bo'yicha asosiy hisob (yo'q bo'lsa — yaratiladi): sotuv to'lovlari shu yerga tushadi."""
    a = Account.objects.filter(firm=firm, kind=kind, active=True, currency="UZS").order_by("-main", "id").first()
    if a is None:
        a = Account.objects.create(firm=firm, kind=kind, name=DEFAULT_NAME[AccKind(kind)], main=True)
    return a


# ------------------------------------------------------------------ moddalar
def items() -> list[dict[str, Any]]:
    return [
        {"id": i.pk, "name": i.name, "direction": i.direction, "code": i.code or None, "active": i.active}
        for i in FlowItem.objects.all()
    ]


def save_item(d: dict[str, Any], pk: int | None = None) -> dict[str, Any]:
    it = FlowItem.objects.filter(pk=pk).first() if pk else FlowItem()
    if it is None:
        raise bad("Modda topilmadi", 404)
    if "name" in d:
        it.name = str(d.get("name") or "").strip()[:120]
    if not it.name:
        raise bad("Modda nomi kerak")
    if not pk:
        if d.get("direction") not in ("in", "out"):
            raise bad("Yo'nalishni tanlang (kirim / chiqim)")
        it.direction = d["direction"]
    if "active" in d:
        it.active = bool(d["active"])
    it.save()
    return {"id": it.pk, "name": it.name, "direction": it.direction, "code": it.code or None, "active": it.active}


# ------------------------------------------------------------------ hujjatlar
def next_number(kind: str, firm: str, at: datetime) -> str:
    key = f"{firm}-{CODE[Kind(kind)]}-{at:%y}"
    seq, _ = Seq.objects.select_for_update().get_or_create(key=key)
    seq.n += 1
    seq.save(update_fields=["n"])
    return f"{key}-{seq.n:05d}"


def row(d: MoneyDoc) -> dict[str, Any]:
    return {
        "id": d.pk,
        "kind": d.kind,
        "kind_name": Kind(d.kind).label,
        "number": d.number,
        "date": iso(d.date),
        "status": d.status,
        "firm": d.firm,
        "account_id": d.account_id,
        "account": d.account.name,
        "account_to_id": d.account_to_id,
        "account_to": d.account_to.name if d.account_to else None,
        "currency": d.account.currency,
        "amount": money(d.amount),
        "amount_to": money(d.amount_to) if d.amount_to is not None else None,
        "op": d.op,
        "op_name": Op(d.op).label,
        "item_id": d.item_id,
        "item": d.item.name if d.item else None,
        "party_kind": d.party_kind or None,
        "party_id": d.party_id,
        "party": d.party_name or None,
        "party_inn": d.party_inn or None,
        "purpose": d.purpose,
        "comment": d.comment,
        "source": d.source or None,
        "source_label": d.source_label or None,
        "readonly": bool(d.source),
    }


def get(pk: int, lock: bool = False) -> MoneyDoc:
    qs = MoneyDoc.objects.select_related("account", "account_to", "item")
    if lock:
        qs = qs.select_for_update()
    d = qs.filter(pk=pk).first()
    if d is None:
        raise bad("Hujjat topilmadi", 404)
    return d


def detail(pk: int) -> dict[str, Any]:
    d = get(pk)
    return {
        **row(d),
        "can": {
            "edit": d.status == Status.DRAFT and not d.source,
            "post": d.status == Status.DRAFT and not d.source,
            "unpost": d.status == Status.POSTED and not d.source,
            "cancel": d.status == Status.DRAFT and not d.source,
        },
    }


def journal(g: dict[str, str]) -> dict[str, Any]:
    qs: QuerySet[MoneyDoc] = MoneyDoc.objects.select_related("account", "account_to", "item")
    if g.get("kind") in Kind.values:
        qs = qs.filter(kind=g["kind"])
    if g.get("status") in Status.values:
        qs = qs.filter(status=g["status"])
    else:
        qs = qs.exclude(status=Status.CANCELLED)
    if g.get("account_id", "").isdigit():
        a = int(g["account_id"])
        qs = qs.filter(Q(account_id=a) | Q(account_to_id=a))
    if g.get("firm"):
        qs = qs.filter(firm=g["firm"])
    if d1 := parse_date(g.get("from") or ""):
        qs = qs.filter(date__date__gte=d1)
    if d2 := parse_date(g.get("to") or ""):
        qs = qs.filter(date__date__lte=d2)
    q = (g.get("q") or "").strip()
    if q:
        qs = qs.filter(
            Q(number__icontains=q) | Q(party_name__icontains=q) | Q(purpose__icontains=q) | Q(party_inn__startswith=q)
        )
    rows = list(qs[:300])
    return {"rows": [row(d) for d in rows], "more": qs.count() > len(rows)}


def _account(v: Any, label: str = "Hisob") -> Account:
    a = Account.objects.filter(pk=int(v) if str(v or "").isdigit() else 0, active=True).first()
    if a is None:
        raise bad(f"{label}ni tanlang")
    return a


def _party(user: Any, kind: str, pid: Any, name: Any) -> tuple[str, int | None, str, str]:
    """(turi, id, nom, STIR): mijoz — CRM (huquq bilan), yetkazib beruvchi — moliya, xodim — maosh ro'yxati, boshqa — matn."""
    if kind == "customer" and str(pid or "").isdigit():
        c = crm.customer_card(int(pid))
        if c is None:
            raise bad("Mijoz topilmadi")
        return "customer", c["id"], c["name"], c["inn"] or ""
    if kind == "supplier" and str(pid or "").isdigit():
        s = next((x for x in finance.suppliers("", 10_000) if x["id"] == int(pid)), None)
        if s is None:
            raise bad("Yetkazib beruvchi topilmadi")
        return "supplier", s["id"], s["name"], s["inn"] or ""
    if kind == "employee" and str(pid or "").isdigit():
        e = next((x for x in finance.employees("", 10_000) if x["id"] == int(pid)), None)
        if e is None:
            raise bad("Xodim topilmadi")
        return "employee", e["id"], e["name"], ""
    n = str(name or "").strip()[:255]
    return ("other" if n else ""), None, n, ""


def _apply(user: Any, d: MoneyDoc, b: dict[str, Any]) -> None:
    if b.get("date"):
        dt = parse_datetime(str(b["date"])) or (
            datetime.combine(pd, timezone.localtime().time()) if (pd := parse_date(str(b["date"])[:10])) else None
        )
        if dt is None:
            raise bad("Sana noto'g'ri")
        d.date = timezone.make_aware(dt) if timezone.is_naive(dt) else dt
    if "account_id" in b:
        d.account = _account(b["account_id"])
        d.firm = d.account.firm
    if d.kind == Kind.TRANSFER:
        if "account_to_id" in b:
            d.account_to = _account(b["account_to_id"], "Qabul qiluvchi hisob")
        d.op = Op.TRANSFER
    elif "op" in b:
        allowed = OPS_IN if d.kind == Kind.IN else OPS_OUT
        if b["op"] not in allowed:
            raise bad("Operatsiyani tanlang")
        d.op = b["op"]
    if "amount" in b:
        d.amount = dec(b["amount"])
    if "amount_to" in b:
        d.amount_to = dec(b["amount_to"], "Qabul qilinadigan summa") if b["amount_to"] not in (None, "") else None
    if "item_id" in b:
        it = FlowItem.objects.filter(pk=int(b["item_id"]) if str(b["item_id"] or "").isdigit() else 0).first()
        if b["item_id"] not in (None, "") and (it is None or it.direction != ("in" if d.kind == Kind.IN else "out")):
            raise bad("Pul oqimi moddasi bu hujjat turiga mos emas")
        d.item = it
    if any(k in b for k in ("party_kind", "party_id", "party_name")):
        d.party_kind, d.party_id, d.party_name, d.party_inn = _party(
            user, str(b.get("party_kind") or ""), b.get("party_id"), b.get("party_name")
        )
    for k, n in (("purpose", 500), ("comment", 2000)):
        if k in b:
            setattr(d, k, str(b.get(k) or "")[:n])


@transaction.atomic
def save(user: Any, b: dict[str, Any], pk: int | None = None) -> dict[str, Any]:
    if pk:
        d = get(pk, lock=True)
        if d.source:
            raise bad("Bu hujjat boshqa bo'limdan (sotuv to'lovi) — o'sha yerda o'zgartiriladi", 409)
        if d.status != Status.DRAFT:
            raise bad("O'tkazilgan hujjat tahrirlanmaydi — avval «Qaytarish»", 409)
    else:
        kind = str(b.get("kind") or "")
        if kind not in Kind.values:
            raise bad("Hujjat turi noto'g'ri")
        d = MoneyDoc(
            kind=kind, date=timezone.now(), owner_tg=user.tg_id, op=Op.TRANSFER if kind == Kind.TRANSFER else Op.OTHER
        )
        if "account_id" not in b:
            raise bad("Hisobni tanlang")
    _apply(user, d, b)
    if not d.item_id and d.kind != Kind.TRANSFER and (code := ITEM_OF.get(Op(d.op))):
        d.item = FlowItem.objects.filter(code=code).first()
    if not d.number:
        d.number = next_number(d.kind, d.firm, d.date)
    d.save()
    if b.get("post"):
        return post(d.pk)
    return detail(d.pk)


def _check_post(d: MoneyDoc) -> None:
    if d.amount <= 0:
        raise bad("Summani kiriting")
    if d.kind == Kind.TRANSFER:
        if d.account_to_id is None or d.account_to_id == d.account_id:
            raise bad("Qabul qiluvchi hisob boshqa bo'lsin")
        assert d.account_to is not None
        if d.account_to.currency != d.account.currency and not d.amount_to:
            raise bad(f"Valyuta har xil — qabul qilinadigan summani ({d.account_to.currency}) kiriting")
    if d.kind != Kind.IN:
        bal = balances().get(d.account_id, Decimal(0))
        if d.amount > bal:
            raise bad(f"«{d.account.name}»da yetarli pul yo'q: qoldiq {money(bal)} {d.account.currency}", 409)


@transaction.atomic
def post(pk: int) -> dict[str, Any]:
    d = get(pk, lock=True)
    if d.status != Status.DRAFT or d.source:
        raise bad("Hujjat allaqachon o'tkazilgan yoki bekor qilingan", 409)
    _check_post(d)
    d.status = Status.POSTED
    d.save(update_fields=["status", "updated"])
    return detail(d.pk)


@transaction.atomic
def unpost(pk: int) -> dict[str, Any]:
    d = get(pk, lock=True)
    if d.status != Status.POSTED or d.source:
        raise bad("Hujjat o'tkazilmagan (yoki boshqa bo'limdan)", 409)
    # kirimni qaytarish qoldiqni manfiy qilmasin (undan keyin chiqim bo'lgan)
    bal = balances()
    if d.kind == Kind.IN and bal.get(d.account_id, Decimal(0)) < d.amount:
        raise bad("Bu kirimdan keyin pul sarflangan — qaytarilsa qoldiq manfiy bo'ladi", 409)
    if d.kind == Kind.TRANSFER and d.account_to_id is not None:
        got = d.amount_to if d.amount_to is not None else d.amount
        if bal.get(d.account_to_id, Decimal(0)) < got:
            raise bad("Qabul qiluvchi hisobdan pul sarflangan — qaytarilsa qoldiq manfiy bo'ladi", 409)
    d.status = Status.DRAFT
    d.save(update_fields=["status", "updated"])
    return detail(d.pk)


@transaction.atomic
def cancel(pk: int) -> dict[str, Any]:
    d = get(pk, lock=True)
    if d.status != Status.DRAFT or d.source:
        raise bad("Faqat qoralama bekor qilinadi", 409)
    d.status = Status.CANCELLED
    d.save(update_fields=["status", "updated"])
    return detail(d.pk)


# ------------------------------------------------------------------ hisobot
def flow(d1: date, d2: date, firm: str = "") -> dict[str, Any]:
    """Pul oqimi (davr): hisoblar bo'yicha boshi / kirim / chiqim / oxiri; moddalar bo'yicha kirim va chiqim."""
    start = balances(date.fromordinal(d1.toordinal() - 1))
    end = balances(d2)
    qs = MoneyDoc.objects.filter(status=Status.POSTED, date__date__gte=d1, date__date__lte=d2)
    if firm:
        qs = qs.filter(firm=firm)
    acc_rows = []
    for a in Account.objects.filter(**({"firm": firm} if firm else {})):
        mine = qs.filter(Q(account=a) | Q(account_to=a))
        inc = mine.filter(kind=Kind.IN, account=a).aggregate(s=Sum("amount"))["s"] or Decimal(0)
        out = mine.filter(kind=Kind.OUT, account=a).aggregate(s=Sum("amount"))["s"] or Decimal(0)
        tr_out = mine.filter(kind=Kind.TRANSFER, account=a).aggregate(s=Sum("amount"))["s"] or Decimal(0)
        tr_in = sum(
            (
                x if x is not None else y
                for x, y in mine.filter(kind=Kind.TRANSFER, account_to=a).values_list("amount_to", "amount")
            ),
            Decimal(0),
        )
        b0, b1 = start.get(a.pk, a.opening), end.get(a.pk, a.opening)
        if not (a.active or b0 or b1 or inc or out):
            continue
        acc_rows.append(
            {
                "id": a.pk,
                "name": a.name,
                "firm": a.firm,
                "currency": a.currency,
                "start": money(b0),
                "in": money(inc + tr_in),
                "out": money(out + tr_out),
                "end": money(b1),
            }
        )
    by_item: dict[tuple[str, str], Decimal] = {}
    for kind, name, op, amt in qs.exclude(kind=Kind.TRANSFER).values_list("kind", "item__name", "op", "amount"):
        k = (kind, name or Op(op).label)
        by_item[k] = by_item.get(k, Decimal(0)) + amt
    items_rows = [
        {"direction": k[0], "item": k[1], "amount": money(v)}
        for k, v in sorted(by_item.items(), key=lambda kv: (kv[0][0], -kv[1]))
    ]
    return {"from": d1.isoformat(), "to": d2.isoformat(), "accounts": acc_rows, "items": items_rows}


# ------------------------------------------------------------------ boshqa bo'limlar uchun (services.py)
@transaction.atomic
def mirror(
    source: str, *, label: str, firm: str, method: str, amount: Decimal, at: datetime, party: dict[str, Any]
) -> int:
    """Sotuv to'lovi o'tkazildi → pulda kirim (bor bo'lsa — yangilanadi). method: bank | cash | card."""
    kind = {"cash": AccKind.CASH, "card": AccKind.CARD}.get(method, AccKind.BANK)
    acc = main_account(firm, kind)
    d = MoneyDoc.objects.select_for_update().filter(source=source).first()
    if d is None:
        d = MoneyDoc(source=source, kind=Kind.IN, number=next_number(Kind.IN, firm, at))
    d.source_label = label[:60]
    d.date, d.firm, d.account, d.amount, d.op = at, firm, acc, amount, Op.CUSTOMER
    d.item = FlowItem.objects.filter(code="customer").first()
    d.party_kind, d.party_id = "customer", party.get("id")
    d.party_name, d.party_inn = (party.get("name") or "")[:255], (party.get("inn") or "")[:20]
    d.purpose = f"Mijozdan to'lov ({label})"[:500]
    d.status = Status.POSTED
    d.save()
    return d.pk


def unmirror(source: str) -> int:
    return MoneyDoc.objects.filter(source=source).delete()[0]

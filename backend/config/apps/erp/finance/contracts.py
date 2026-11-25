"""Shartnomalar va kontragentlar (docs/api/accounting.md) — frontend demo `src/erp/finance/demo/contracts.lib.ts` va
`lib/contracts.lib.ts` (holat, raqamlash) bilan bir xil qoidalar. Holat har so'rovda bugungi sanadan hisoblanadi."""

from __future__ import annotations

import re
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.utils import timezone

from config.apps.core.http import ApiError
from config.apps.erp.warehouse import services as wh

from .models import CKind, Contract, Counterparty, CpKind

CURRENCIES = ("UZS", "USD", "RUB", "EUR")
EXPIRING_DAYS = 30  # muddat tugashiga shuncha kun qolganda — «tugayapti»
CP_LIMIT = 30


def bad(msg: str) -> ApiError:
    return ApiError(400, msg)


def _s(v: Any) -> str:
    return "" if v is None else str(v).strip()


def _num(v: Any) -> Decimal | None:
    s = re.sub(r"\s", "", _s(v)).replace(",", ".")
    if not s:
        return None
    try:
        d = Decimal(s)
    except InvalidOperation as e:
        raise bad(f"Raqam noto'g'ri: {_s(v)}") from e
    if not d.is_finite():
        raise bad(f"Raqam noto'g'ri: {_s(v)}")
    return d


def _n(d: Decimal | None) -> int | float | None:
    if d is None:
        return None
    return int(d) if d == d.to_integral_value() else float(d)


def _date(v: Any, what: str) -> date | None:
    """YYYY-MM-DD: bo'sh — None; noto'g'ri — 400."""
    s = _s(v)
    if not s:
        return None
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
            return date.fromisoformat(s)
    except ValueError:
        pass
    raise bad(f"{what} noto'g'ri")


def today() -> date:
    return timezone.localdate()


# ------------------------------------------------------------------ holat va raqam
def days_left(valid_until: date | None, on: date) -> int | None:
    return None if valid_until is None else (valid_until - on).days


def state_of(c: Contract, on: date) -> str:
    """Yopilgan → imzolanmagan → muddati o'tgan → tugayapti → amalda."""
    if not c.active:
        return "closed"
    if not c.signed:
        return "draft"
    d = days_left(c.valid_until, on)
    if d is not None and d < 0:
        return "expired"
    if d is not None and d <= EXPIRING_DAYS:
        return "expiring"
    return "active"


def next_number(firm_code: str, year: int) -> str:
    """`<firma>-<yil>/<NNN>` — shu firma va yilning eng kattasidan keyin."""
    pre = f"{firm_code}-{year}/"
    nums = [
        int(tail)
        for n in Contract.objects.filter(number__startswith=pre).values_list("number", flat=True)
        if (tail := n[len(pre) :]).isdigit()
    ]
    return f"{pre}{max(nums, default=0) + 1:03d}"


def _firms() -> dict[int, dict[str, Any]]:
    return {f["id"]: f for f in wh.firms()}


def view(c: Contract, on: date, firms: dict[int, dict[str, Any]] | None = None) -> dict[str, Any]:
    firms = firms if firms is not None else _firms()
    cp = c.counterparty
    return {
        "id": c.pk,
        "number": c.number,
        "date": c.date.isoformat(),
        "kind": c.kind,
        "counterparty_id": cp.pk,
        "counterparty": cp.name,
        "inn": cp.inn or None,
        "firm_id": c.firm_id,
        "firm": firms.get(c.firm_id, {}).get("code", "—"),
        "currency": c.currency,
        "amount": _n(c.amount),
        "pay_days": c.pay_days,
        "credit_limit": _n(c.credit_limit),
        "valid_until": c.valid_until.isoformat() if c.valid_until else None,
        "signed": c.signed,
        "active": c.active,
        "note": c.note or None,
        "state": state_of(c, on),
        "days_left": days_left(c.valid_until, on),
    }


# ------------------------------------------------------------------ ro'yxat va saqlash
def contracts(q: str = "", kind: str = "", state: str = "") -> list[dict[str, Any]]:
    on = today()
    firms = _firms()
    qs = Contract.objects.select_related("counterparty")
    if kind:
        qs = qs.filter(kind=kind)
    rows = [view(c, on, firms) for c in qs.order_by("-active", "-date", "-pk")]
    if state:
        want = {"draft", "expiring", "expired"} if state == "attention" else {state}
        rows = [r for r in rows if r["state"] in want]
    s = q.strip().casefold()
    if s:
        rows = [r for r in rows if any(s in (r[k] or "").casefold() for k in ("number", "counterparty", "inn", "note"))]
    return rows


def contract(cid: int) -> dict[str, Any]:
    c = Contract.objects.select_related("counterparty").filter(pk=cid).first()
    if c is None:
        raise ApiError(404, "Shartnoma topilmadi")
    return view(c, today())


@transaction.atomic
def save(d: dict[str, Any]) -> dict[str, Any]:
    cid = int(_num(d.get("id")) or 0)
    cp = Counterparty.objects.filter(pk=int(_num(d.get("counterparty_id")) or 0)).first()
    if cp is None:
        raise bad("Kontragentni tanlang")
    firm = _firms().get(int(_num(d.get("firm_id")) or 0))
    if firm is None:
        raise bad("Firmani tanlang")
    kind = _s(d.get("kind"))
    if kind not in CKind.values:
        raise bad("Shartnoma turi noto'g'ri")
    on = _date(d.get("date"), "Sana") or today()
    valid = _date(d.get("valid_until"), "Amal qilish muddati")
    if valid and valid < on:
        raise bad("Amal qilish muddati shartnoma sanasidan oldin bo'lmaydi")
    currency = _s(d.get("currency")) or "UZS"
    if currency not in CURRENCIES:
        raise bad("Valyuta noto'g'ri")
    amount, limit, pay_days = _num(d.get("amount")), _num(d.get("credit_limit")), _num(d.get("pay_days"))
    if any(x is not None and x < 0 for x in (amount, limit, pay_days)):
        raise bad("Summa, limit va muddat manfiy bo'lmaydi")
    number = _s(d.get("number")) or next_number(firm["code"], on.year)
    # casefold Python'da: SQLite iexact kirill/lotin bo'lmagan harflarda katta-kichikni farqlaydi
    if any(
        n.casefold() == number.casefold() for n in Contract.objects.exclude(pk=cid).values_list("number", flat=True)
    ):
        raise bad(f"«{number}» raqamli shartnoma bor")
    if cid:
        c = Contract.objects.filter(pk=cid).first()
        if c is None:
            raise ApiError(404, "Shartnoma topilmadi")
        if not c.active:
            raise bad("Yopilgan shartnoma tahrirlanmaydi — avval qayta oching")
    else:
        c = Contract(active=True)
    c.number = number
    c.date = on
    c.kind = kind
    c.counterparty = cp
    c.firm_id = firm["id"]
    c.currency = currency
    c.amount = amount
    c.pay_days = None if pay_days is None else int(pay_days.to_integral_value())
    c.credit_limit = limit
    c.valid_until = valid
    c.signed = bool(d.get("signed"))
    c.note = _s(d.get("note"))
    c.save()
    return view(c, today())


def set_active(cid: int, active: bool) -> dict[str, Any]:
    c = Contract.objects.select_related("counterparty").filter(pk=cid).first()
    if c is None:
        raise ApiError(404, "Shartnoma topilmadi")
    c.active = active
    c.save(update_fields=["active"])
    return view(c, today())


# ------------------------------------------------------------------ kontragentlar va firmalar
def _cp(c: Counterparty) -> dict[str, Any]:
    return {"id": c.pk, "name": c.name, "inn": c.inn or None, "kind": c.kind}


def counterparties(q: str = "") -> list[dict[str, Any]]:
    s = q.strip()
    qs = Counterparty.objects.all()
    if s:
        rows = [c for c in qs if s.casefold() in c.name.casefold() or s in c.inn]
    else:
        rows = list(qs)
    return [_cp(c) for c in rows[:CP_LIMIT]]


@transaction.atomic
def add_counterparty(d: dict[str, Any]) -> dict[str, Any]:
    name = _s(d.get("name"))
    if not name:
        raise bad("Kontragent nomi kerak")
    inn = re.sub(r"\D", "", _s(d.get("inn")))
    if inn and not re.fullmatch(r"\d{9}|\d{10,14}", inn):
        raise bad("INN 9 raqam (O'zbekiston) yoki 10–14 raqam (xorij)")
    dup = next(
        (c for c in Counterparty.objects.all() if (inn and c.inn == inn) or c.name.casefold() == name.casefold()),
        None,
    )
    if dup:
        raise bad(f"«{dup.name}» bor{f' (INN {dup.inn})' if dup.inn else ''}")
    kind = _s(d.get("kind")) or CpKind.CUSTOMER
    if kind not in CpKind.values:
        raise bad("Kontragent turi noto'g'ri")
    return _cp(Counterparty.objects.create(name=name, inn=inn, kind=kind))


def firms() -> list[dict[str, Any]]:
    return wh.firms()

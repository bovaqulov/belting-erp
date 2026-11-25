"""Maoshlar (docs/api/accounting.md) — frontend demo `src/erp/finance/demo/payroll.lib.ts` bilan bir xil qoidalar.
Oy: hisoblanmagan → qoralama (tahrirlanadi) → tasdiqlangan (qulf) → to'langan (hamma qator to'langan). Hisoblash faol va
shu oygacha ishga kirgan xodimlardan; qoralamani qayta hisoblash bonus/ushlanma/avans/izohni saqlaydi, okladni yangilaydi."""

from __future__ import annotations

import re
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.utils import timezone

from config.apps.core.http import ApiError

from .models import Employee, PayMonth, PayRow

MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def bad(msg: str) -> ApiError:
    return ApiError(400, msg)


def _s(v: Any) -> str:
    return "" if v is None else str(v).strip()


def _money(v: Any, what: str) -> int:
    """So'm: bo'sh — 0; manfiy yoki noto'g'ri — 400; butunga yaxlitlanadi."""
    s = re.sub(r"\s", "", _s(v)).replace(",", ".")
    if not s:
        return 0
    try:
        d = Decimal(s)
    except InvalidOperation as e:
        raise bad(f"{what}: musbat son kiriting") from e
    if not d.is_finite() or d < 0:
        raise bad(f"{what}: musbat son kiriting")
    return int(d.quantize(Decimal(1)))


def _iso(dt: Any) -> str | None:
    return dt.isoformat().replace("+00:00", "Z") if dt else None


def due(r: PayRow) -> int:
    """To'lanadi = oklad + bonus − ushlanma − avans."""
    return int(r.base) + int(r.bonus) - int(r.penalty) - int(r.advance)


# ------------------------------------------------------------------ xodimlar
def _emp(e: Employee) -> dict[str, Any]:
    return {
        "id": e.pk,
        "name": e.name,
        "position": e.position or "—",
        "dept": e.dept or "—",
        "salary": int(e.salary),
        "hired": e.hired.isoformat(),
        "phone": e.phone or None,
        "active": e.active,
    }


def staff() -> list[dict[str, Any]]:
    return [
        _emp(e)
        for e in sorted(Employee.objects.all(), key=lambda e: (not e.active, e.dept.casefold(), e.name.casefold()))
    ]


@transaction.atomic
def save_staff(d: dict[str, Any]) -> dict[str, Any]:
    name = _s(d.get("name"))
    if not name:
        raise bad("Xodim ismi kerak")
    salary = _money(d.get("salary"), "Oklad")
    if not salary:
        raise bad("Oklad kiriting")
    hs = _s(d.get("hired"))
    try:
        hired = date.fromisoformat(hs) if hs else timezone.localdate()
    except ValueError as e:
        raise bad("Ishga kirgan sana noto'g'ri") from e
    eid = int(_money(d.get("id"), "ID") or 0)
    if eid:
        e = Employee.objects.filter(pk=eid).first()
        if e is None:
            raise ApiError(404, "Xodim topilmadi")
    else:
        e = Employee()
    e.name = name
    e.position = _s(d.get("position"))
    e.dept = _s(d.get("dept"))
    e.salary = salary
    e.hired = hired
    e.phone = _s(d.get("phone"))
    e.active = True if d.get("active") is None else bool(d.get("active"))
    e.save()
    return _emp(e)


# ------------------------------------------------------------------ oy
def _state(m: PayMonth | None, rows: list[PayRow]) -> str:
    if m is None:
        return "none"
    if not m.approved_at:
        return "draft"
    return "paid" if rows and all(r.paid_at for r in rows) else "approved"


def _row(r: PayRow) -> dict[str, Any]:
    return {
        "employee_id": r.employee_id,
        "name": r.name,
        "position": r.position or "—",
        "dept": r.dept or "—",
        "base": int(r.base),
        "bonus": int(r.bonus),
        "penalty": int(r.penalty),
        "advance": int(r.advance),
        "note": r.note or None,
        "paid_at": _iso(r.paid_at),
    }


def _check(month: str) -> str:
    if not MONTH.match(month):
        raise bad("Oy noto'g'ri (YYYY-MM)")
    return month


def month_view(month: str) -> dict[str, Any]:
    m = PayMonth.objects.filter(month=_check(month)).first()
    rows = list(PayRow.objects.filter(month=m)) if m else []
    return {
        "month": month,
        "state": _state(m, rows),
        "rows": [_row(r) for r in rows],
        "approved_at": _iso(m.approved_at if m else None),
    }


def _need(month: str) -> tuple[PayMonth, list[PayRow], str]:
    m = PayMonth.objects.select_for_update().filter(month=_check(month)).first()
    if m is None:
        raise bad("Avval oyni hisoblang")
    rows = list(PayRow.objects.filter(month=m))
    return m, rows, _state(m, rows)


@transaction.atomic
def calc(month: str) -> dict[str, Any]:
    m = PayMonth.objects.select_for_update().filter(month=_check(month)).first()
    rows = list(PayRow.objects.filter(month=m)) if m else []
    if _state(m, rows) in ("approved", "paid"):
        raise bad("Tasdiqlangan oy qayta hisoblanmaydi — avval tasdiqni bekor qiling")
    have = {r.employee_id for r in rows}
    staff_ = [e for e in Employee.objects.filter(active=True) if e.hired.isoformat()[:7] <= month]
    if not rows and not staff_:
        raise bad("Bu oyda faol xodim yo'q")
    if m is None:
        m = PayMonth.objects.create(month=month)
    for e in staff_:
        if e.pk not in have:
            PayRow.objects.create(month=m, employee=e, name=e.name, position=e.position, dept=e.dept, base=e.salary)
    # qoralamada oklad, ism, lavozim xodim kartochkasidan yangilanadi (bonus/ushlanma/avans saqlanadi)
    for r in PayRow.objects.filter(month=m).select_related("employee"):
        e = r.employee
        r.name, r.position, r.dept, r.base = e.name, e.position, e.dept, e.salary
        r.save(update_fields=["name", "position", "dept", "base"])
    return month_view(month)


@transaction.atomic
def edit_row(month: str, employee_id: int, d: dict[str, Any]) -> dict[str, Any]:
    _m, rows, st = _need(month)
    if st != "draft":
        raise bad("Tasdiqlangan oy tahrirlanmaydi")
    r = next((x for x in rows if x.employee_id == employee_id), None)
    if r is None:
        raise bad("Xodim bu oy hisobida yo'q")
    r.bonus = _money(d.get("bonus"), "Bonus")
    r.penalty = _money(d.get("penalty"), "Ushlanma")
    r.advance = _money(d.get("advance"), "Avans")
    r.note = _s(d.get("note"))[:255]
    if due(r) < 0:
        raise bad("Ushlanma va avans hisoblangan summadan oshib ketdi")
    r.save(update_fields=["bonus", "penalty", "advance", "note"])
    return month_view(month)


@transaction.atomic
def approve(month: str) -> dict[str, Any]:
    m, _rows, st = _need(month)
    if st != "draft":
        raise bad("Oy allaqachon tasdiqlangan")
    m.approved_at = timezone.now()
    m.save(update_fields=["approved_at"])
    return month_view(month)


@transaction.atomic
def unapprove(month: str) -> dict[str, Any]:
    m, rows, st = _need(month)
    if st == "draft":
        raise bad("Oy tasdiqlanmagan")
    if any(r.paid_at for r in rows):
        raise bad("To'lov qilingan oy tasdig'i bekor qilinmaydi")
    m.approved_at = None
    m.save(update_fields=["approved_at"])
    return month_view(month)


@transaction.atomic
def pay(month: str, d: dict[str, Any]) -> dict[str, Any]:
    _m, rows, st = _need(month)
    if st == "draft":
        raise bad("Avval oyni tasdiqlang")
    raw = d.get("ids")
    ids = {int(x) for x in raw} if isinstance(raw, list) else {r.employee_id for r in rows}
    at = timezone.now()
    for r in rows:
        if r.employee_id in ids and not r.paid_at:
            r.paid_at = at
            r.save(update_fields=["paid_at"])
    return month_view(month)

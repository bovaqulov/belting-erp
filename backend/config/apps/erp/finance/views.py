"""Moliya HTTP API (docs/api/accounting.md). Shartnomalar, kontragentlar, firmalar — Accounting (buxgalteriya bo'limi,
ega/admin, Rahbariyat); maoshlar — faqat ega/admin."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.http import HttpRequest, HttpResponse

from config.apps.core.http import api, json_body, ok

from . import contracts as C
from . import payroll as P

if TYPE_CHECKING:
    from config.apps.staff.models import User

DENY = "Ruxsat yo'q: Accounting bo'limi buxgalteriya va rahbariyatga ochiq"
DENY_PAY = "Ruxsat yo'q: maoshlarni faqat rahbariyat ko'radi"


def can_acc(u: User) -> bool:
    return u.can_module("accounting")


def can_pay(u: User) -> bool:
    return u.is_panel


# ------------------------------------------------------------------ shartnomalar
@api(("GET", "POST"), check=can_acc, deny=DENY)
def contracts(request: HttpRequest, user: User) -> HttpResponse:
    if request.method == "POST":
        return ok(C.save(json_body(request)))
    g = request.GET
    return ok(C.contracts(g.get("q", ""), g.get("kind", ""), g.get("state", "")))


@api(check=can_acc, deny=DENY)
def contract(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(C.contract(pk))


@api(("POST",), check=can_acc, deny=DENY)
def contract_close(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(C.set_active(pk, False))


@api(("POST",), check=can_acc, deny=DENY)
def contract_reopen(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(C.set_active(pk, True))


@api(("GET", "POST"), check=can_acc, deny=DENY)
def counterparties(request: HttpRequest, user: User) -> HttpResponse:
    if request.method == "POST":
        return ok(C.add_counterparty(json_body(request)))
    return ok(C.counterparties(request.GET.get("q", "")))


@api(check=can_acc, deny=DENY)
def firms(request: HttpRequest, user: User) -> HttpResponse:
    return ok(C.firms())


# ------------------------------------------------------------------ maoshlar
@api(("GET", "POST"), check=can_pay, deny=DENY_PAY)
def staff(request: HttpRequest, user: User) -> HttpResponse:
    if request.method == "POST":
        return ok(P.save_staff(json_body(request)))
    return ok(P.staff())


@api(check=can_pay, deny=DENY_PAY)
def month(request: HttpRequest, user: User, month: str) -> HttpResponse:
    return ok(P.month_view(month))


@api(("POST",), check=can_pay, deny=DENY_PAY)
def month_calc(request: HttpRequest, user: User, month: str) -> HttpResponse:
    return ok(P.calc(month))


@api(("POST",), check=can_pay, deny=DENY_PAY)
def month_row(request: HttpRequest, user: User, month: str, employee_id: int) -> HttpResponse:
    return ok(P.edit_row(month, employee_id, json_body(request)))


@api(("POST",), check=can_pay, deny=DENY_PAY)
def month_approve(request: HttpRequest, user: User, month: str) -> HttpResponse:
    return ok(P.approve(month))


@api(("POST",), check=can_pay, deny=DENY_PAY)
def month_unapprove(request: HttpRequest, user: User, month: str) -> HttpResponse:
    return ok(P.unapprove(month))


@api(("POST",), check=can_pay, deny=DENY_PAY)
def month_pay(request: HttpRequest, user: User, month: str) -> HttpResponse:
    return ok(P.pay(month, json_body(request)))

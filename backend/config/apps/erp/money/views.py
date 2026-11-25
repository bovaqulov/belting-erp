"""Pul HTTP API (docs/api/money.md). Ruxsat — `money` moduli (buxgalteriya, rahbariyat, ega/admin)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import TYPE_CHECKING

from django.http import HttpRequest, HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date

from config.apps.core.http import api, json_body, ok
from config.apps.erp.crm import services as crm
from config.apps.erp.finance import services as finance
from config.apps.erp.warehouse import services as wh

from . import ledger as L
from .models import AccKind, Op

if TYPE_CHECKING:
    from config.apps.staff.models import User

DENY = "Ruxsat yo'q: Pul bo'limi buxgalteriya va rahbariyatga ochiq"


def can(u: User) -> bool:
    return u.can_module("money")


@api(("GET", "POST"), check=can, deny=DENY)
def accounts(request: HttpRequest, user: User) -> HttpResponse:
    if request.method == "POST":
        return ok(L.save_account(json_body(request)))
    return ok(L.accounts(request.GET.get("all") == "1"))


@api(("POST",), check=can, deny=DENY)
def account(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(L.save_account(json_body(request), pk))


@api(("GET", "POST"), check=can, deny=DENY)
def items(request: HttpRequest, user: User) -> HttpResponse:
    if request.method == "POST":
        return ok(L.save_item(json_body(request)))
    return ok(L.items())


@api(("POST",), check=can, deny=DENY)
def item(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(L.save_item(json_body(request), pk))


@api(("GET", "POST"), check=can, deny=DENY)
def docs(request: HttpRequest, user: User) -> HttpResponse:
    if request.method == "POST":
        return ok(L.save(user, json_body(request)))
    return ok(L.journal(request.GET.dict()))


@api(("GET", "POST"), check=can, deny=DENY)
def doc(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    if request.method == "POST":
        return ok(L.save(user, json_body(request), pk))
    return ok(L.detail(pk))


@api(("POST",), check=can, deny=DENY)
def doc_post(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(L.post(pk))


@api(("POST",), check=can, deny=DENY)
def doc_unpost(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(L.unpost(pk))


@api(("POST",), check=can, deny=DENY)
def doc_cancel(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(L.cancel(pk))


@api(check=can, deny=DENY)
def flow(request: HttpRequest, user: User) -> HttpResponse:
    today = timezone.localdate()
    d1 = parse_date(request.GET.get("from") or "") or today.replace(day=1)
    d2 = parse_date(request.GET.get("to") or "") or today
    if d2 < d1:
        d1, d2 = d2, d1
    d2 = min(d2, d1 + timedelta(days=3660))
    return ok(L.flow(d1, d2, request.GET.get("firm", "")))


@api(check=can, deny=DENY)
def parties(request: HttpRequest, user: User) -> HttpResponse:
    """Kontragent qidiruvi: kind=customer (CRM) | supplier (moliya) | employee (maosh)."""
    q, kind = request.GET.get("q", ""), request.GET.get("kind", "")
    if kind == "customer":
        rows = [{"id": c["id"], "name": c["name"], "inn": c["inn"]} for c in crm.customers_for(user, q)]
    elif kind == "supplier":
        rows = finance.suppliers(q)
    elif kind == "employee":
        rows = [{"id": e["id"], "name": e["name"], "inn": None, "sub": e["position"]} for e in finance.employees(q)]
    else:
        rows = []
    return ok(rows)


@api(check=can, deny=DENY)
def refs(request: HttpRequest, user: User) -> HttpResponse:
    return ok(
        {
            "firms": wh.firms(),
            "account_kinds": [{"key": k, "name": n} for k, n in AccKind.choices],
            "ops_in": [{"key": k, "name": Op(k).label} for k in L.OPS_IN],
            "ops_out": [{"key": k, "name": Op(k).label} for k in L.OPS_OUT],
            "party_of": {k: v for k, v in L.PARTY_OF.items()},
            "today": date.today().isoformat(),
        }
    )

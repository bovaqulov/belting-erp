"""Savdo hujjatlari HTTP API (docs/api/sales.md). Ruxsat — `sales` moduli (sotuv bo'limlari, buxgalteriya, rahbariyat);
ko'rinish — docs.Ctx (sotuvchi — o'z hujjatlari)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.http import HttpRequest, HttpResponse

from config.apps.core.http import ApiError, api, json_body, ok
from config.apps.erp.crm import services as crm
from config.apps.erp.finance import services as finance
from config.apps.erp.warehouse import services as wh

from . import docs as D
from . import pdf

if TYPE_CHECKING:
    from config.apps.staff.models import User

DENY = "Ruxsat yo'q: savdo hujjatlari sotuv bo'limlari va buxgalteriyaga ochiq"


def can(u: User) -> bool:
    return u.can_module("sales")


@api(("GET", "POST"), check=can, deny=DENY)
def docs(request: HttpRequest, user: User) -> HttpResponse:
    ctx = D.Ctx.of(user)
    if request.method == "POST":
        return ok(D.save(ctx, json_body(request)))
    return ok(D.journal(ctx, request.GET.dict()))


@api(("GET", "POST"), check=can, deny=DENY)
def doc(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    ctx = D.Ctx.of(user)
    if request.method == "POST":
        return ok(D.save(ctx, json_body(request), pk))
    return ok(D.detail(ctx, pk))


@api(("POST",), check=can, deny=DENY)
def doc_post(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(D.post(D.Ctx.of(user), pk))


@api(("POST",), check=can, deny=DENY)
def doc_unpost(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(D.unpost(D.Ctx.of(user), pk))


@api(("POST",), check=can, deny=DENY)
def doc_cancel(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(D.cancel(D.Ctx.of(user), pk))


@api(("POST",), check=can, deny=DENY)
def doc_create(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(D.create_from(D.Ctx.of(user), pk, str(json_body(request).get("kind") or "")))


@api(check=can, deny=DENY)
def doc_pdf(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    d = D.detail(D.Ctx.of(user), pk)
    firm = next((f["name"] for f in wh.firms() if f["code"] == d["firm"]), d["firm"])
    r = HttpResponse(pdf.render(d, firm), content_type="application/pdf")
    r["Content-Disposition"] = f'inline; filename="{d["number"]}.pdf"'
    return r


@api(("POST",), check=can, deny=DENY)
def from_deal(request: HttpRequest, user: User) -> HttpResponse:
    b = json_body(request)
    if not str(b.get("deal_id") or "").isdigit():
        raise ApiError(400, "Bitim kerak")
    return ok(D.from_deal(D.Ctx.of(user), int(b["deal_id"]), str(b.get("kind") or "order")))


@api(check=can, deny=DENY)
def debts(request: HttpRequest, user: User) -> HttpResponse:
    return ok(D.debts(D.Ctx.of(user), request.GET.get("q", "")))


@api(check=can, deny=DENY)
def customers(request: HttpRequest, user: User) -> HttpResponse:
    return ok(crm.customers_for(user, request.GET.get("q", "")))


@api(check=can, deny=DENY)
def customer(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    card = crm.customer_card(pk)
    if card is None:
        raise ApiError(404, "Mijoz topilmadi")
    ctx = D.Ctx.of(user)
    bal = next((x for x in D.debts(ctx) if x["customer_id"] == pk), None)
    return ok(
        {**card, "balance": bal["balance"] if bal else "0", "contracts": finance.contracts_for(card["inn"] or "")}
    )


@api(check=can, deny=DENY)
def items(request: HttpRequest, user: User) -> HttpResponse:
    return ok(D.items(request.GET.get("q", ""), D.dec(request.GET.get("vat") or "12")))


@api(check=can, deny=DENY)
def refs(request: HttpRequest, user: User) -> HttpResponse:
    return ok(D.refs(D.Ctx.of(user), request.GET.get("inn", ""), request.GET.get("firm", "")))

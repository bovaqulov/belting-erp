"""Logistika HTTP API (docs/api/logistics.md): jo'natmalar ro'yxati/yaratish, bitta jo'natma (tahrirlash), holat.
Ruxsat — `logistics` moduli (logistika va ombor bo'limlari, rahbariyat, ega/admin)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.http import HttpRequest, HttpResponse

from config.apps.core.http import api, json_body, ok

from . import logic as L

if TYPE_CHECKING:
    from config.apps.staff.models import User

DENY = "Ruxsat yo'q: Logistika logistika va ombor bo'limlariga ochiq"


def can_log(u: User) -> bool:
    return u.can_module("logistics")


@api(check=can_log, deny=DENY)
def meta(request: HttpRequest, user: User) -> HttpResponse:
    return ok(L.meta())


@api(("GET", "POST"), check=can_log, deny=DENY)
def shipments(request: HttpRequest, user: User) -> HttpResponse:
    if request.method == "POST":
        return ok(L.create(json_body(request), user.tg_id))
    g = request.GET
    return ok(L.shipments(g.get("status", ""), g.get("carrier", ""), g.get("q", "")))


@api(("GET", "POST"), check=can_log, deny=DENY)
def shipment(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    if request.method == "POST":
        return ok(L.update(pk, json_body(request), user.tg_id))
    return ok(L.shipment(pk))


@api(("POST",), check=can_log, deny=DENY)
def shipment_status(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    b = json_body(request)
    return ok(L.set_status(pk, str(b.get("status") or ""), user.tg_id, str(b.get("note") or "")))

"""Marketplace API: /app/api/erp/mk/* (kontrakt: docs/api/marketplace.md, 1-bosqich).

Ruxsat: ko'rish va yig'ish — faol xodim (owner/admin/employee); audit amallari — owner/admin.
Kanal xatosi → 502, biznes qoidasi → 400, yozish o'chiq (MP_WRITE=0) → 403; shakl — {detail}.
"""

from __future__ import annotations

from collections.abc import Callable
from functools import wraps
from typing import Any

from django.http import HttpRequest, HttpResponse, JsonResponse

from config.apps.core.http import ApiError, api, json_body, ok
from config.apps.staff.models import User

from . import cards, orders, supplies
from .channels import ChannelError

ACTIVE_ROLES = ("owner", "admin", "employee")
DENY = "Marketplace bo'limi faqat xodimlar uchun."


def _staff(u: User) -> bool:
    return u.role in ACTIVE_ROLES


def _admin(u: User) -> bool:
    return u.role in ("owner", "admin")


def mk(methods: tuple[str, ...] = ("GET",), *, admin: bool = False):
    """api() + kanal xatosini {detail} ga o'girish."""

    def deco(fn: Callable[..., HttpResponse]) -> Callable[..., HttpResponse]:
        @wraps(fn)
        def inner(request: HttpRequest, user: User, *a: Any, **kw: Any) -> HttpResponse:
            try:
                return fn(request, user, *a, **kw)
            except ChannelError as e:
                raise ApiError(e.status, e.detail) from e

        check = _admin if admin else _staff
        return api(methods, check=check, deny="Bu amal faqat adminlar uchun." if admin else DENY)(inner)

    return deco


def _ch(ch: str) -> str:
    if ch not in orders.CHANNELS:
        raise ApiError(404, "Kanal yo'q")
    return ch


def _file(body: bytes, ctype: str, name: str) -> HttpResponse:
    r = HttpResponse(body, content_type=ctype)
    r["Content-Disposition"] = f'inline; filename="{name}"'
    return r


# ---------------------------------------------------------------- umumiy
@mk()
def overview(request: HttpRequest, user: User) -> JsonResponse:
    return ok(
        {
            "channels": cards.channel_stats(),
            "sources": [],  # qoldiq manbalari — ombor app ko'chganda
            "orders": orders.summary(),
            "reviews": {"n": 0, "bad": 0},  # sharhlar — keyingi bosqich
            "push_errors": 0,
            "audit": cards.summary(),
        }
    )


@mk()
def order_counts(request: HttpRequest, user: User) -> JsonResponse:
    return ok(orders.counts())


# ---------------------------------------------------------------- audit
@mk()
def audit(request: HttpRequest, user: User) -> JsonResponse:
    return ok(cards.issues(request.GET.get("code") or None, request.GET.get("ch") or None))


@mk(("POST",), admin=True)
def audit_run(request: HttpRequest, user: User) -> JsonResponse:
    return ok(cards.run())


@mk(("POST",), admin=True)
def audit_mute(request: HttpRequest, user: User, pk: int) -> JsonResponse:
    return ok(cards.mute(pk))


# ---------------------------------------------------------------- buyurtmalar
@mk()
def order_board(request: HttpRequest, user: User, ch: str) -> JsonResponse:
    stage = request.GET.get("stage") or "active"
    if stage not in ("active", *orders.STAGES):
        raise ApiError(400, "Bosqich noto'g'ri")
    return ok(orders.board(_ch(ch), stage))


@mk(("POST",))
def order_sync(request: HttpRequest, user: User, ch: str) -> JsonResponse:
    return ok(orders.sync(_ch(ch)))


@mk(("POST",))
def order_act(request: HttpRequest, user: User, ch: str, ext: str, act: str) -> JsonResponse:
    ch, b = _ch(ch), json_body(request)
    if act == "scan":
        return ok(orders.scan(ch, ext, str(b.get("code") or ""), user))
    if act == "reset":
        return ok(orders.reset(ch, ext, user))
    if act == "cancel":
        return ok(orders.cancel(ch, ext, user, str(b.get("reason") or "")))
    if act == "confirm" and ch == "uzum":
        return ok(orders.uzum_confirm(ext, user))
    if act == "ship" and ch == "ozon":
        return ok(orders.ozon_ship(ext, user))
    raise ApiError(404, "Amal topilmadi")


@mk()
def order_label(request: HttpRequest, user: User, ch: str, ext: str) -> HttpResponse:
    body, ctype = orders.label(_ch(ch), ext)
    return _file(body, ctype, f"{ch}-{ext}.{'png' if ctype == 'image/png' else 'pdf'}")


# ---------------------------------------------------------------- WB postavkalar
@mk(("GET", "POST"))
def wb_supplies(request: HttpRequest, user: User) -> JsonResponse:
    if request.method == "GET":
        return ok(supplies.supplies())
    return ok(supplies.create(str(json_body(request).get("name") or ""), user))


@mk()
def wb_supply(request: HttpRequest, user: User, sid: str) -> JsonResponse:
    return ok(supplies.detail(sid))


@mk()
def wb_supply_qr(request: HttpRequest, user: User, sid: str) -> HttpResponse:
    body, ctype = supplies.qr(sid)
    return _file(body, ctype, f"{sid}.png")


@mk(("POST",))
def wb_supply_act(request: HttpRequest, user: User, sid: str, act: str) -> JsonResponse:
    b = json_body(request)
    if act == "add":
        return ok(supplies.add(sid, list(b.get("orders") or []), user))
    if act == "deliver":
        return ok(supplies.deliver(sid, user))
    if act == "boxes":
        return ok(supplies.boxes_add(sid, int(b.get("amount") or 1), user))
    raise ApiError(404, "Amal topilmadi")


@mk(("POST",))
def wb_boxes_act(request: HttpRequest, user: User, sid: str, act: str) -> JsonResponse:
    ids = [str(x) for x in json_body(request).get("ids") or []]
    if act == "delete":
        return ok(supplies.boxes_delete(sid, ids, user))
    if act == "stickers":
        return ok(supplies.box_stickers(sid, ids))
    raise ApiError(404, "Amal topilmadi")


@mk(("POST",))
def wb_stickers(request: HttpRequest, user: User) -> JsonResponse:
    return ok(supplies.order_stickers([str(x) for x in json_body(request).get("orders") or []]))

"""Sex API: /app/api/erp/shop/* (kontrakt: docs/api/workshop.md, frontend src/erp/workshop/). Mantiq — shop.py.

Ruxsat: ishlab chiqarish moduli (Ishlab chiqarish bo'limi, rahbariyat, ega/admin). Xato: {detail} — 400/404.
"""

from __future__ import annotations

from collections.abc import Callable
from functools import wraps
from typing import TYPE_CHECKING, Any

from django.http import HttpRequest, HttpResponse

from config.apps.core.http import ApiError, api, json_body, ok
from config.apps.erp.warehouse import services as wh

from . import shop
from .shop import Bad, NotFound

if TYPE_CHECKING:
    from config.apps.staff.models import User

DENY = "Sex faqat Ishlab chiqarish bo'limi va rahbariyat uchun."


def _shop(u: User) -> bool:
    return u.can_module("manufacturing")


def sx(methods: tuple[str, ...] = ("GET",)):
    def deco(fn: Callable[..., HttpResponse]) -> Callable[..., HttpResponse]:
        @wraps(fn)
        def inner(request: HttpRequest, user: User, *a: Any, **kw: Any) -> HttpResponse:
            try:
                return fn(request, user, *a, **kw)
            except (Bad, wh.Bad) as e:
                raise ApiError(400, str(e)) from e
            except (NotFound, wh.NotFound) as e:
                raise ApiError(404, str(e)) from e

        return api(methods, check=_shop, deny=DENY)(inner)

    return deco


def _pdf(body: bytes, name: str) -> HttpResponse:
    r = HttpResponse(body, content_type="application/pdf")
    r["Content-Disposition"] = f'inline; filename="{name}"'
    return r


@sx()
def board(request: HttpRequest, user: User) -> HttpResponse:
    return ok(shop.board())


@sx()
def job(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(shop.detail(shop.get(pk)))


@sx(("POST",))
def job_act(request: HttpRequest, user: User, pk: int, act: str) -> HttpResponse:
    b = json_body(request)
    if act == "accept":
        shop.accept(pk, user)
        return ok()
    if act == "take":
        return ok(shop.take([pk], b, user))
    if act == "collected":
        shop.collected([pk], bool(b.get("force")), user)
        return ok()
    if act == "ready":
        r = shop.ready([pk], user)
        return ok({"ok": True, "sticker": r["sticker"]})
    if act == "untake":
        return ok(shop.untake(pk, b, user))
    if act == "sticker":
        return ok({"url": f"/app/api/erp/shop/sticker.pdf?ids={pk}"})
    raise ApiError(404, "Amal yo'q")


@sx(("POST",))
def group(request: HttpRequest, user: User) -> HttpResponse:
    return ok(shop.group(list(json_body(request).get("ids") or [])))


@sx(("POST",))
def group_act(request: HttpRequest, user: User, act: str) -> HttpResponse:
    b = json_body(request)
    ids = list(b.get("ids") or [])
    if act == "accept":
        return ok(shop.accept_many(ids, user))
    if act == "take":
        return ok(shop.take(ids, b, user))
    if act == "collected":
        shop.collected(ids, bool(b.get("force")), user)
        return ok()
    if act == "ready":
        return ok(shop.ready(ids, user))
    if act == "sticker":
        shop.many(ids)
        return ok({"url": "/app/api/erp/shop/sticker.pdf?ids=" + ",".join(str(int(x)) for x in ids)})
    raise ApiError(404, "Amal yo'q")


@sx(("POST",))
def cut_preview(request: HttpRequest, user: User) -> HttpResponse:
    b = json_body(request)
    return ok(wh.cut_preview(int(b.get("batch_id") or 0), b.get("width_mm"), b.get("length_mm")))


@sx()
def sticker(request: HttpRequest, user: User) -> HttpResponse:
    ids = [x for x in request.GET.get("ids", "").split(",") if x.strip().isdigit()]
    return _pdf(shop.sticker_pdf(ids), "zakaz.pdf")


@sx()
def drawing(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    shop.get(pk)
    raise ApiError(404, "Bu zakazga chizma biriktirilmagan.")

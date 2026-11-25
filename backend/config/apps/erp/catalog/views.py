"""Katalog HTTP API (docs/api/catalog.md). O'qish — ERP modullaridan biriga kirishi bor har kim (ombor, CRM, sex katalogdan
qidiradi); o'zgartirish — Accounting (buxgalteriya bo'limi, ega/admin, Rahbariyat)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.http import HttpRequest, HttpResponse

from config.apps.core.http import ApiError, api, json_body, ok

from . import ops as M
from . import pricing as PR
from .models import Item

if TYPE_CHECKING:
    from config.apps.staff.models import User

DENY_VIEW = "Ruxsat yo'q: katalog ERP modullaridan biriga kirishi bor xodimlarga ochiq"
DENY_EDIT = "Ruxsat yo'q: katalogni Accounting (buxgalteriya) o'zgartiradi"


def can_view(u: User) -> bool:
    return bool(u.modules())


def can_edit(u: User) -> bool:
    return u.can_module("accounting")


@api(("GET", "POST"), check=can_view, deny=DENY_VIEW)
def groups(request: HttpRequest, user: User) -> HttpResponse:
    if request.method == "GET":
        return ok(M.groups())
    if not can_edit(user):
        raise ApiError(403, DENY_EDIT)
    return ok(M.save_group(json_body(request)))


@api(("POST",), check=can_edit, deny=DENY_EDIT)
def groups_seed(request: HttpRequest, user: User) -> HttpResponse:
    return ok(M.seed_groups())


@api(("POST",), check=can_edit, deny=DENY_EDIT)
def group_drop(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(M.drop_group(pk))


@api(("GET", "POST"), check=can_view, deny=DENY_VIEW)
def items(request: HttpRequest, user: User) -> HttpResponse:
    if request.method == "GET":
        g = request.GET
        return ok(
            M.item_rows(g.get("q", ""), g.get("group_id"), g.get("kind", ""), g.get("family", ""), g.get("brand", ""))
        )
    if not can_edit(user):
        raise ApiError(403, DENY_EDIT)
    return ok(M.save_item(json_body(request)))


def cost_ok(u: User) -> bool:
    """Tannarx, marja, narx formulasi (MAXFIY): ega/admin va rahbariyat (Jarvis can_see_cost)."""
    return u.is_panel or u.in_lead_dept()


@api(check=can_view, deny=DENY_VIEW)
def item(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(M.item_detail(pk, cost_ok(user)))


@api(check=can_view, deny=DENY_VIEW)
def item_quote(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    """Rukav / rukavdan kesiladigan remen: ixtiyoriy eni uchun narx (formula ko'rsatilmaydi)."""
    it = Item.objects.select_related("price_src").filter(pk=pk, active=True).first()
    if it is None:
        raise ApiError(404, "Tovar topilmadi")
    try:
        w = float(request.GET.get("width") or 0)
    except ValueError:
        w = 0
    if not 1 <= w <= 2000:
        raise ApiError(400, "Eni 1–2000 mm oralig'ida bo'lsin")
    return ok(PR.quote_width(it, w))


@api(("GET", "POST"), check=can_view, deny=DENY_VIEW)
def pricing(request: HttpRequest, user: User) -> HttpResponse:
    if request.method == "POST":
        if not cost_ok(user):
            raise ApiError(403, "Narx siyosatini faqat rahbariyat o'zgartiradi")
        return ok(PR.save_policy(json_body(request), user.tg_id))
    return ok(PR.policy_json(cost_ok(user)))


@api(("POST",), check=can_view, deny=DENY_VIEW)
def pricing_sync(request: HttpRequest, user: User) -> HttpResponse:
    if not cost_ok(user):
        raise ApiError(403, "Narxlarni faqat rahbariyat yangilaydi")
    if not PR.configured():
        raise ApiError(400, "AppSheet kalitlari sozlanmagan (.env: APPSHEET_VBELT_*, APPSHEET_TIMING_*)")
    try:
        PR.sync_live()
    except Exception as exc:
        raise ApiError(502, f"AppSheet javob bermadi: {exc}") from exc
    return ok(PR.policy_json(True))


@api(check=can_view, deny=DENY_VIEW)
def pricing_unmatched(request: HttpRequest, user: User) -> HttpResponse:
    return ok(PR.unmatched())


@api(("POST",), check=can_edit, deny=DENY_EDIT)
def item_widths(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(M.add_widths(pk, json_body(request)))


@api(("POST",), check=can_edit, deny=DENY_EDIT)
def item_products(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(M.make_products(pk, json_body(request)))


@api(("POST",), check=can_edit, deny=DENY_EDIT)
def item_price(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(M.save_price(pk, json_body(request)))


@api(("POST",), check=can_view, deny=DENY_VIEW)
def preview(request: HttpRequest, user: User) -> HttpResponse:
    """Forma: belgi, nom, hisoblangan ko'rsatkichlar, TIF TN taklifi, takror va analoglar (saqlamaydi)."""
    return ok(M.preview(json_body(request)))


@api(check=can_view, deny=DENY_VIEW)
def duplicates(request: HttpRequest, user: User) -> HttpResponse:
    return ok(M.duplicates())


@api(check=can_view, deny=DENY_VIEW)
def brands(request: HttpRequest, user: User) -> HttpResponse:
    return ok(M.brands())


@api(check=can_view, deny=DENY_VIEW)
def archive(request: HttpRequest, user: User) -> HttpResponse:
    """Eski (1C) katalog — import hali ulanmagan, bo'sh ro'yxat (frontendda hali ishlatilmaydi)."""
    return ok([])


@api(("POST",), check=can_view, deny=DENY_VIEW)
def labels_link(request: HttpRequest, user: User) -> HttpResponse:
    return ok(M.labels_link(json_body(request).get("item_id")))

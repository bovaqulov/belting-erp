"""Ombor API: /app/api/erp/* (kontrakt: docs/api/warehouse.md). Mantiq — stock.py, stikerlar — labels.py.

Ruxsat: ombor moduli (Ombor, Ishlab chiqarish, Logistika bo'limlari, rahbariyat, ega/admin); skaner va qidiruv — sex
ishchilariga ham (material skanerlash). Tannarx — faqat ega/admin va buxgalteriya.
Xato: biznes qoidasi → 400, topilmadi → 404, hujjat versiyasi eskirgan → 409; shakl — {detail}.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from functools import wraps
from typing import TYPE_CHECKING, Any

from django.http import HttpRequest, HttpResponse
from django.utils import timezone

from config.apps.core.http import ApiError, api, json_body, ok

from . import labels, ledger, stock
from .models import IdemKey
from .stock import Bad, Conflict, NotFound

if TYPE_CHECKING:
    from config.apps.staff.models import User

DENY = "Ombor faqat Ombor, Ishlab chiqarish, Logistika bo'limlari va rahbariyat uchun."


def _wh(u: User) -> bool:
    return u.can_module("warehouse")


def _wh_or_shop(u: User) -> bool:
    return u.can_module("warehouse") or u.can_module("manufacturing")


def see_cost(u: User) -> bool:
    return u.role in ("owner", "admin") or u.can_module("accounting")


IDEM_DAYS = 7  # internetsiz navbat shu muddatda yuboriladi deb hisoblanadi
_idem_n = 0


def idem_gc(every: int = 200) -> int:
    """Eski qayta-yuborish kalitlarini tozalash (har `every`-chaqiruvda bir marta): o'chirilganlar soni."""
    global _idem_n
    _idem_n += 1
    if _idem_n % every:
        return 0
    return IdemKey.objects.filter(at__lt=timezone.now() - timedelta(days=IDEM_DAYS)).delete()[0]


def wh(methods: tuple[str, ...] = ("GET",), *, shop: bool = False):
    """api() + stock xatolarini HTTP holatiga o'girish."""

    def deco(fn: Callable[..., HttpResponse]) -> Callable[..., HttpResponse]:
        @wraps(fn)
        def inner(request: HttpRequest, user: User, *a: Any, **kw: Any) -> HttpResponse:
            key = request.headers.get("Idempotency-Key", "")[:64] if request.method != "GET" else ""
            if key and (seen := IdemKey.objects.filter(key=key).first()):
                return HttpResponse(seen.body, status=seen.status, content_type="application/json")
            try:
                # harakatlar jurnali: amal — view nomi, muallif — so'rov egasi (hujjatda — aniqlashtiriladi)
                with ledger.op(
                    getattr(fn, "__name__", "api"), author=user.tg_id, author_name=getattr(user, "name", "") or ""
                ):
                    res = fn(request, user, *a, **kw)
                if key and res.status_code < 500 and res.get("Content-Type", "").startswith("application/json"):
                    idem_gc()
                    IdemKey.objects.get_or_create(
                        key=key,
                        defaults={
                            "author": user.tg_id,
                            "path": request.path[:200],
                            "status": res.status_code,
                            "body": res.content.decode(),
                        },
                    )
                return res
            except Bad as e:
                raise ApiError(400, str(e)) from e
            except NotFound as e:
                raise ApiError(404, str(e)) from e
            except Conflict as e:
                raise ApiError(409, str(e)) from e

        return api(methods, check=_wh_or_shop if shop else _wh, deny=DENY)(inner)

    return deco


def _int(v: str | None) -> int | None:
    try:
        return int(v) if v else None
    except ValueError as e:
        raise ApiError(400, "Raqam noto'g'ri") from e


def _pdf(body: bytes, name: str) -> HttpResponse:
    r = HttpResponse(body, content_type="application/pdf")
    r["Content-Disposition"] = f'inline; filename="{name}"'
    return r


# ---------------------------------------------------------------- ma'lumot
@wh(shop=True)
def scan(request: HttpRequest, user: User) -> HttpResponse:
    return ok(stock.scan(request.GET.get("code", "")))


@wh(shop=True)
def items(request: HttpRequest, user: User) -> HttpResponse:
    return ok(stock.items_search(request.GET.get("q", "")))


@wh(shop=True)
def item_stock(request: HttpRequest, user: User) -> HttpResponse:
    item_id = _int(request.GET.get("item_id"))
    if not item_id:
        raise ApiError(400, "Tovarni tanlang")
    return ok(stock.item_stock(item_id, _int(request.GET.get("char_id"))))


@wh()
def dashboard(request: HttpRequest, user: User) -> HttpResponse:
    return ok(stock.dashboard(see_cost(user)))


@wh()
def stock_table(request: HttpRequest, user: User) -> HttpResponse:
    g = request.GET
    return ok(
        stock.stock_table(
            g.get("warehouse_id"), g.get("q", ""), g.get("kind", ""), g.get("low") == "true", see_cost(user)
        )
    )


@wh()
def cycle(request: HttpRequest, user: User) -> HttpResponse:
    return ok(stock.cycle(stock.wh_ok(request.GET.get("warehouse_id"))))


@wh(("POST",), shop=True)
def cutplan(request: HttpRequest, user: User) -> HttpResponse:
    return ok(stock.cut_plan(json_body(request)))


# ---------------------------------------------------------------- joylar va birliklar
@wh(("GET", "POST"))
def cells(request: HttpRequest, user: User) -> HttpResponse:
    if request.method == "POST":
        b = json_body(request)
        return ok(stock.add_cells(b.get("parent_id"), list(b.get("codes") or []), b.get("block_id")))
    return ok(stock.cells())


def _edit_or_drop(request: HttpRequest, edit: Callable[[dict[str, Any]], Any], drop: Callable[[], Any]) -> HttpResponse:
    return ok(drop() if request.method == "DELETE" else edit(json_body(request)))


@wh(("POST", "DELETE"))
def cell(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    """POST {code} — joy kodini o'zgartirish; DELETE — bo'sh joyni o'chirish."""
    return _edit_or_drop(
        request, lambda b: stock.edit_cell(pk, b.get("status"), b.get("code")), lambda: stock.drop_cell(pk)
    )


@wh(("POST", "DELETE"))
def wh_building(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    """POST {name}; DELETE — bloklari va joylari bilan (bo'sh bo'lsa)."""
    return _edit_or_drop(
        request, lambda b: stock.edit_building(pk, b.get("name"), b.get("number")), lambda: stock.drop_building(pk)
    )


@wh(("POST", "DELETE"))
def wh_block(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    """POST {name}; DELETE — joylari bilan (bo'sh bo'lsa)."""
    return _edit_or_drop(
        request,
        lambda b: stock.edit_block(pk, b.get("name"), b.get("code"), b.get("purpose"), b.get("groups")),
        lambda: stock.drop_block(pk),
    )


@wh(("POST",))
def wh_racks(request: HttpRequest, user: User) -> HttpResponse:
    """POST {store_id, block_id, rows, floors, name?} — xonaga stellaj (joylari bilan)."""
    b = json_body(request)
    return ok(
        stock.add_rack(
            b.get("store_id"), b.get("block_id"), b.get("rows"), b.get("floors"), b.get("name"), b.get("count"), b
        )
    )


@wh(("POST",))
def wh_wizard(request: HttpRequest, user: User) -> HttpResponse:
    """Tuzilma ustasi: {store_id, building_id | building_name, block_code, block_name?, racks, rows, floors, rack_name?}."""
    return ok(stock.wizard(json_body(request)))


@wh(("POST", "DELETE"))
def wh_rack(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    """POST {rows, floors, name?} — xarakteristika; DELETE — joylari bilan (bo'sh bo'lsa)."""
    return _edit_or_drop(
        request,
        lambda b: stock.edit_rack(pk, b.get("rows"), b.get("floors"), b.get("name"), b),
        lambda: stock.drop_rack(pk),
    )


@wh(shop=True)
def moves(request: HttpRequest, user: User) -> HttpResponse:
    """Harakatlar jurnali: ?unit_id | item_id | loc_id | doc_id | warehouse_id | op, before_id (sahifa), limit."""
    g = request.GET
    return ok(
        ledger.moves(
            unit_id=_int(g.get("unit_id")),
            item_id=_int(g.get("item_id")),
            loc_id=_int(g.get("loc_id")),
            doc_id=_int(g.get("doc_id")),
            warehouse_id=_int(g.get("warehouse_id")),
            op_name=g.get("op") or None,
            before_id=_int(g.get("before_id")),
            limit=_int(g.get("limit")) or 50,
        )
    )


@wh(shop=True)
def putaway(request: HttpRequest, user: User) -> HttpResponse:
    """Joylashtirish tavsiyasi: ?store_id, item_id, width_mm?, n? (nechta birlik)."""
    g = request.GET
    return ok(stock.putaway(g.get("store_id"), g.get("item_id"), g.get("width_mm"), g.get("n")))


@wh(shop=True)
def groups(request: HttpRequest, user: User) -> HttpResponse:
    return ok(stock.groups())


@wh()
def cell_units(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(stock.cell_units(pk))


@wh()
def wh_tree(request: HttpRequest, user: User) -> HttpResponse:
    restricted = user.role not in ("owner", "admin") and not user.is_panel and not user.in_lead_dept()
    return ok(stock.wh_tree(request.GET.get("store_id"), user.tg_id, restricted))


@wh()
def wh_structure(request: HttpRequest, user: User) -> HttpResponse:
    return ok(stock.structure(request.GET.get("store_id")))


@wh(("POST", "DELETE"))
def wh_store(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    """POST — nomi/turini o'zgartirish; DELETE — o'chirish (faqat egasi/admin)."""
    if request.method == "DELETE":
        if user.role not in ("owner", "admin"):
            raise ApiError(403, "Omborni faqat egasi yoki admin o'chira oladi")
        return ok(stock.drop_store(pk))
    b = json_body(request)
    return ok(stock.edit_store(pk, b.get("name"), b.get("kind"), b.get("code")))


@wh(("POST",))
def wh_buildings(request: HttpRequest, user: User) -> HttpResponse:
    b = json_body(request)
    return ok(stock.add_building(b.get("store_id"), b.get("name"), b.get("number")))


@wh(("POST",))
def wh_blocks(request: HttpRequest, user: User) -> HttpResponse:
    b = json_body(request)
    return ok(
        stock.add_block(
            b.get("store_id"), b.get("building_id"), b.get("code"), b.get("name"), b.get("purpose"), b.get("groups")
        )
    )


@wh()
def wh_unplaced(request: HttpRequest, user: User) -> HttpResponse:
    return ok(stock.unplaced(request.GET.get("store_id")))


@wh(("POST",))
def units_loc(request: HttpRequest, user: User) -> HttpResponse:
    b = json_body(request)
    stock.set_loc(list(b.get("batch_ids") or []), b.get("loc_id"))
    return ok()


@wh(("POST",))
def units(request: HttpRequest, user: User) -> HttpResponse:
    return ok(stock.count_unit(json_body(request)))


@wh(("DELETE",))
def unit_drop(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    stock.drop_unit(pk)
    return ok()


@wh(("POST",), shop=True)
def labels_print(request: HttpRequest, user: User) -> HttpResponse:
    """Printer navbati: stiker printeri serverga ulanmagan — PDF orqali chop etiladi."""
    raise ApiError(
        400,
        "Stiker printeri serverga ulanmagan — «PDF» tugmasi bilan yuklab, printerdan chop eting (58×40, masshtab 100%).",
    )


@wh(("POST",), shop=True)
def labels_pdf(request: HttpRequest, user: User) -> HttpResponse:
    return _pdf(labels.labels_pdf(json_body(request)), "stiker.pdf")


@wh(shop=True)
def label_place(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return _pdf(labels.place_pdf(pk), f"joy-{pk}.pdf")


@wh(shop=True)
def label_units(request: HttpRequest, user: User) -> HttpResponse:
    ids = [int(x) for x in request.GET.get("ids", "").split(",") if x.strip().isdigit()]
    return _pdf(labels.units_pdf(ids), "stiker.pdf")


# ---------------------------------------------------------------- joylashtirish
@wh()
def cat_items(request: HttpRequest, user: User) -> HttpResponse:
    s = request.GET.get("q", "").strip().casefold()
    info = stock.cat()
    tot: dict[int, float] = {}
    for (i, _c), q in stock.totals(info).items():
        tot[i] = tot.get(i, 0.0) + float(q)
    rows = [
        {
            "id": it["id"],
            "name": it["name"],
            "grp": it["grp"],
            "kind": it["kind"],
            "unit": it["unit"],
            "qty": round(tot.get(it["id"], 0.0), 4),
        }
        for it in info.values()
        if it["active"] and (not s or any(s in (x or "").casefold() for x in (it["name"], it["sku"], it["grp"])))
    ]
    rows.sort(key=lambda r: r["name"])
    return ok(rows[:200])


@wh()
def cat_item(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    it = stock.item(pk)
    return ok(
        {
            "id": it["id"],
            "name": it["name"],
            "grp": it["grp"],
            "kind": it["kind"],
            "unit": it["unit"],
            "measured": bool(it["dims"]),
            "attrs": {"dims": it["dims"]},
            "chars": [{"id": cid, "name": c["name"]} for cid, c in it["chars"].items()],
        }
    )


@wh(("POST",))
def place(request: HttpRequest, user: User) -> HttpResponse:
    return ok(stock.place(json_body(request), user))


@wh()
def place_recent(request: HttpRequest, user: User) -> HttpResponse:
    return ok(stock.place_recent(request.GET.get("loc_id"), user.tg_id))


@wh(("POST",))
def place_undo(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    try:
        stock.place_undo(pk, user.tg_id)
    except Bad as e:
        if "o'zingiz" in str(e):
            raise ApiError(403, str(e)) from e
        raise
    return ok()


# ---------------------------------------------------------------- hujjatlar
@wh(("GET", "POST"))
def docs(request: HttpRequest, user: User) -> HttpResponse:
    if request.method == "POST":
        return ok(stock.doc_create(json_body(request), user.tg_id))
    g = request.GET
    return ok(stock.docs_list(g.get("kind", ""), g.get("status", ""), _int(g.get("limit")) or 50))


@wh()
def doc(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    from .models import Doc

    d = Doc.objects.filter(pk=pk).first()
    if d is None:
        raise ApiError(404, "Hujjat topilmadi")
    return ok(stock.doc_out(d))


@wh(("POST",))
def doc_act(request: HttpRequest, user: User, pk: int, act: str) -> HttpResponse:
    b = json_body(request)
    if act == "save":
        return ok(stock.doc_save(pk, b))
    if act == "post":
        return ok(stock.doc_post(pk, b, user))
    if act == "review":
        return ok(stock.inventory_review(pk, user))
    if act == "receive":
        return ok(stock.transfer_receive(pk, b))
    raise ApiError(404, "Amal yo'q")


# ---------------------------------------------------------------- yig'ish va qabul
@wh()
def picks(request: HttpRequest, user: User) -> HttpResponse:
    return ok(stock.picks())


@wh()
def pick(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(stock.pick_out(pk))


@wh(("POST",))
def pick_ship(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(stock.pick_ship(pk, json_body(request), user.tg_id))


@wh()
def unit_trace(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    """Birlik zanjiri: qaysi materiallardan qilingan va qayerda ishlatilgan."""
    return ok(stock.trace(pk))


@wh(("POST",))
def pick_short(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    """Topilmadi {line_no, reason, loc?} — yangilangan buyurtma (tovar sanash navbatiga tushadi)."""
    return ok(stock.pick_short(pk, json_body(request), user.name or ""))


@wh()
def sales(request: HttpRequest, user: User) -> HttpResponse:
    """Qaytarish uchun jo'natishlar: ?q — raqam, mijoz yoki birlik QR."""
    return ok(stock.sales(request.GET.get("q") or ""))


@wh(("POST",))
def returns(request: HttpRequest, user: User) -> HttpResponse:
    """Mijozdan qaytarish {sale_id, warehouse_id?, reason, lines: [{line, qty, grade}]}."""
    return ok(stock.return_post(json_body(request), user.tg_id))


@wh(("GET", "POST"), shop=True)
def purchase_incoming(request: HttpRequest, user: User) -> HttpResponse:
    """GET — yo'ldagi (kutilgan) kirimlar; POST {supplier, firm, expected?, items[]} — yangi kutilgan kirim."""
    if request.method == "POST":
        if not _wh(user):
            raise ApiError(403, "Kirim yaratish — ombor huquqi kerak")
        return ok(stock.incoming_create(json_body(request)))
    return ok(stock.incoming())


@wh(("DELETE",))
def purchase_incoming_one(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    """Kutilgan kirimni bekor qilish (qabul boshlanmagan bo'lsa)."""
    return ok(stock.incoming_cancel(pk))


@wh(shop=True)
def transfers_incoming(request: HttpRequest, user: User) -> HttpResponse:
    """Shu omborga yo'lda kelayotgan ko'chirishlar: ?store_id."""
    return ok(stock.transfers_incoming(request.GET.get("store_id")))


@wh(("GET", "POST"))
def wh_levels(request: HttpRequest, user: User) -> HttpResponse:
    """To'ldirish me'yorlari: GET ?store_id; POST {store_id, item_id, min_qty, max_qty} (bor bo'lsa — yangilanadi)."""
    if request.method == "POST":
        return ok(stock.level_set(json_body(request)))
    return ok(stock.levels(request.GET.get("store_id")))


@wh(("DELETE",))
def wh_level(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    return ok(stock.level_drop(pk))


@wh()
def replenish(request: HttpRequest, user: User) -> HttpResponse:
    """To'ldirish taklifi: ?store_id, from_id? (berilmasa — asosiy ombor)."""
    return ok(stock.replenish(request.GET.get("store_id"), request.GET.get("from_id")))


@wh()
def kpi_ira(request: HttpRequest, user: User) -> HttpResponse:
    """Zaxira yozuvlari aniqligi (IRA): ?store_id, days."""
    return ok(stock.ira(request.GET.get("store_id"), _int(request.GET.get("days")) or 90))


@wh()
def kpi_summary(request: HttpRequest, user: User) -> HttpResponse:
    """Ko'rsatkichlar paneli: ?store_id, days=30."""
    return ok(stock.kpi_summary(request.GET.get("store_id"), int(request.GET.get("days") or 30)))


@wh(shop=True)
def kpi_dock(request: HttpRequest, user: User) -> HttpResponse:
    """Qabuldan joylashgacha (dock-to-stock): ?store_id, days."""
    return ok(stock.dock_to_stock(request.GET.get("store_id"), _int(request.GET.get("days")) or 30))

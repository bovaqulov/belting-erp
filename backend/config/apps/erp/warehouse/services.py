"""Ombor appining ochiq interfeysi (boshqa applar faqat shu orqali):

- qoldiq o'qish (`free`, `stock_of`) — katalog qidiruvi, CRM, sex rejasi;
- sex: materialni skaner bilan sarflash (`consume`, `cut_preview`), tayyor mahsulotni omborga kiritish (`produce`);
- yig'ish navbati (`open_pick`) — CRM bitimi / sex tayyor mahsuloti jo'natishga; to'liq jo'natilganda — `on_shipped`;
- demo/import (`set_qty`, `drop`).
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from datetime import datetime
from decimal import Decimal
from typing import Any

from django.db import transaction

from . import hooks, ledger
from . import stock as S
from .models import Cell, Doc, DocStatus, Firm, Pick, Unit, Warehouse, WhKind

Bad = S.Bad
NotFound = S.NotFound


# ---------------------------------------------------------------- qoldiq
def free(item_ids: Iterable[int]) -> dict[tuple[int, int | None], Decimal]:
    """Erkin qoldiq (tirik qoldiq − yig'ish navbatidagi band) — (tovar, variant) bo'yicha, barcha omborlar."""
    ids = list(item_ids)
    out = S.totals(ids)
    for p in Pick.objects.filter(done=False):
        for ln in p.lines:
            if ln["item_id"] in ids:
                k = (ln["item_id"], ln.get("char_id"))
                out[k] = out.get(k, Decimal(0)) - S.dec(ln["left"])
    return {k: max(Decimal(0), v).quantize(Decimal("0.001")) for k, v in out.items()}


def stock_of(item_id: int) -> Decimal:
    return sum((v for (i, _c), v in S.totals([item_id]).items() if i == item_id), Decimal(0))


def item_totals(item_ids: Iterable[int]) -> dict[int, tuple[Decimal, int]]:
    """Katalog ro'yxati uchun: tovar → (tirik qoldiq, birliklar soni) — barcha omborlar."""
    out: dict[int, tuple[Decimal, int]] = {}
    for item_id, qty in S.live().filter(item_id__in=list(item_ids)).values_list("item_id", "qty"):
        q, n = out.get(item_id, (Decimal(0), 0))
        out[item_id] = (q + qty, n + 1)
    return out


def item_units(item_id: int) -> list[dict[str, Any]]:
    """Katalog kartochkasi uchun: tovarning tirik birliklari — ombor, firma, joy, kod, o'lcham, miqdor, variant ID."""
    return [
        {
            "id": u.pk,
            "warehouse": u.warehouse.name,
            "firm": u.firm,
            "loc": u.loc.code if u.loc else None,
            "code": u.code,
            "width_mm": S.mm(u.width_mm),
            "length_mm": S.mm(u.length_mm),
            "qty": S.fl(u.qty),
            "char_id": u.char_id,
        }
        for u in S.live().select_related("warehouse", "loc").filter(item_id=item_id).order_by("warehouse__name", "pk")
    ]


def firms() -> list[dict[str, Any]]:
    """Firmalar (tovar egasi, shartnoma tomoni): [{id, code, name}]."""
    return [{"id": f.pk, "code": f.code, "name": f.name} for f in Firm.objects.order_by("code")]


def warehouses() -> list[dict[str, Any]]:
    """Saqlash omborlari (yo'ldagi emas): [{id, name, code, kind}] — savdo hujjatlari (yuk xati) uchun."""
    return [
        {"id": w.pk, "name": w.name, "code": w.code, "kind": w.kind}
        for w in Warehouse.objects.filter(active=True).exclude(kind=WhKind.TRANSIT).order_by("id")
    ]


def candidates(item_id: int, limit: int = 8) -> list[dict[str, Any]]:
    """Sex rejasi uchun: shu materialning qayerda nima borligi (avval bo'laklar, kichigi birinchi)."""
    rukav = S.item(item_id)["dims"] == "w"  # rukavda mavjud miqdor — eni (mm), dona emas
    us = sorted(S.units_for(item_id), key=lambda u: (u.kind == "roll", u.width_mm if rukav else u.qty))[:limit]
    return [
        {
            "loc": u.loc.code if u.loc else None,
            "block": u.loc.block.code if u.loc and u.loc.block else None,
            "block_name": u.loc.block.name if u.loc and u.loc.block else None,
            "code": u.code,
            "width_mm": S.mm(u.width_mm),
            "length_mm": S.mm(u.length_mm),
            "qty": str(S.mm(u.width_mm) if rukav else S.fl(u.qty)),
        }
        for u in us
    ]


def unit_brief(unit_id: int) -> dict[str, Any] | None:
    u = Unit.objects.select_related("warehouse", "loc").filter(pk=unit_id).first()
    return S.scan_unit(u) if u else None


@ledger.tracked("set_qty")
def set_qty(item_id: int, char_id: int | None, qty: Decimal, reserved: Decimal = Decimal(0)) -> None:
    """Demo/import: tovarning asosiy ombordagi qoldig'ini qty ga keltirish (donali partiya)."""
    del reserved  # band — yig'ish navbatidan hisoblanadi
    with transaction.atomic():
        wh = S.default_wh()
        firm = S.default_firm()
        Unit.objects.filter(item_id=item_id, char_id=char_id, warehouse=wh, code__isnull=True).delete()
        if qty > 0:
            S.add_lot(item_id, char_id, firm, wh, None, qty)


@ledger.tracked("drop")
def drop(item_ids: Iterable[int]) -> int:
    """Tovarlar qoldig'ini o'chirish (tovar o'chirilganda)."""
    return Unit.objects.filter(item_id__in=list(item_ids)).delete()[0]


# ---------------------------------------------------------------- sex: sarf va ishlab chiqarish
def _shop_wh() -> Warehouse:
    return Warehouse.objects.filter(active=True, kind=WhKind.PRODUCTION).first() or S.default_wh()


def cut_preview(unit_id: int, width_mm: Any, length_mm: Any) -> dict[str, Any]:
    """Lentadan bo'lak (eni × uzunligi) — qoldiq(lar) va chiqindi hisobi (bazaga yozmaydi)."""
    u = Unit.objects.filter(pk=unit_id).first()
    if u is None:
        raise S.NotFound("Birlik topilmadi")
    w, length = S.dec(width_mm, "Eni"), S.dec(length_mm, "Uzunligi")
    width, total = u.width_mm or Decimal(0), u.length_mm or Decimal(0)
    if w <= 0 or length <= 0:
        raise Bad("Bo'lak eni va uzunligini kiriting")
    if w > width + S.EPS or length > total + S.EPS:
        raise Bad(f"{u.code}: {S.mm(width)}×{S.mm(total)} mm — {S.mm(w)}×{S.mm(length)} sig'maydi")
    rests, scrap = [], Decimal(0)
    if width - w > S.EPS:
        side = S.area(width - w, length)
        if width - w < S.SCRAP_MM:
            scrap += side
        else:
            rests.append({"width_mm": str(S.mm(width - w)), "length_mm": str(S.mm(length)), "qty": str(S.fl(side))})
    left = total - length
    if left > S.EPS:
        if left < S.SCRAP_MM:
            scrap += S.area(width, left)
        else:
            rests.append(
                {"width_mm": str(S.mm(width)), "length_mm": str(S.mm(left)), "qty": str(S.fl(S.area(width, left)))}
            )
    return {
        "have": str(S.fl(u.qty)),
        "piece": {"width_mm": str(S.mm(w)), "length_mm": str(S.mm(length)), "qty": str(S.fl(S.area(w, length)))},
        "rests": rests,
        "scrap": str(S.fl(scrap)),
        "whole": not rests and scrap == 0,
    }


@ledger.tracked("consume")
@transaction.atomic
def consume(
    unit_id: int,
    *,
    by: str,
    tg_id: int | None,
    job: str,
    qty: Any = None,
    width_mm: Any = None,
    length_mm: Any = None,
    rests: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Sexga material sarfi (skanerlangan birlikdan): lenta — bo'lak eni × uzunligi kesiladi (qoldiq o'z stikeri
    bilan joyida qoladi), rukav — enidan, rulon/donali — miqdor. Hujjat «consume» (SR-…) yoziladi.
    Qaytaradi: {qty, unit, piece_id, rests[], scrap, number}."""
    u = Unit.objects.select_for_update().select_related("warehouse", "loc").filter(pk=unit_id).first()
    if u is None:
        raise S.NotFound("Birlik topilmadi — stikerni qayta skanerlang")
    if u.pending or u.qty <= S.EPS:
        raise Bad(f"{u.code or 'Birlik'}: omborda qoldig'i yo'q")
    it = S.item(u.item_id)
    t = S.now()
    number = S.next_number("consume", t)
    shop = _shop_wh()
    # hujjat avval — jurnal yozuvlari unga va zakazga bog'lansin; ombor — manba (butun rukav sexga o'tishidan oldin)
    d = Doc.objects.create(
        number=number,
        kind="consume",
        status=DocStatus.POSTED,
        firm=u.firm,
        warehouse=u.warehouse,
        warehouse_to=shop,
        author=tg_id,
        date=t,
        updated=t,
        version=2,
        data={"job": job},
        lines=[],
    )
    ledger.bind(op="consume", doc=d, reason=f"Sex: {job}")
    if it["dims"] == "wl":
        manual = (
            [(S.dec(r.get("width_mm"), "Eni"), S.dec(r.get("length_mm"), "Uzunligi")) for r in rests]
            if rests is not None
            else None
        )
        piece, left, scrap = S.cut_unit(
            u,
            it,
            w=S.dec(width_mm, "Eni"),
            length=S.dec(length_mm, "Uzunligi"),
            q=None,
            by=by,
            at=t,
            number=number,
            job=job,
            to=shop,
            rests_manual=manual,
        )
    elif it["dims"] == "w":
        w = S.dec(width_mm if width_mm is not None else qty, "Eni")
        if u.width_mm is not None and abs(w - u.width_mm) <= S.EPS:  # butun rukav
            piece, left, scrap = u, [], Decimal(0)
            u.warehouse = shop
            u.loc = None
            u.save(update_fields=["warehouse", "loc"])
        else:
            piece, left, scrap = S.cut_unit(
                u, it, w=w, length=None, q=None, by=by, at=t, number=number, job=job, to=shop
            )
    elif u.code:
        q = S.dec(qty)
        piece, left, scrap = S.cut_unit(u, it, w=None, length=None, q=q, by=by, at=t, number=number, job=job, to=shop)
    else:
        q = S.dec(qty)
        if q <= 0 or q > u.qty + S.EPS:
            raise Bad(f"{S.fl(u.qty)} {it['unit']} bor — {S.fl(q)} olib bo'lmaydi")
        u.qty = S.q4(u.qty - q)
        u.save(update_fields=["qty"])
        piece, left, scrap = None, [u] if u.qty > S.EPS else [], Decimal(0)
    taken = piece.qty if piece is not None else S.dec(qty)
    # bo'lak sexga o'tdi va ishlatildi — hisobdan chiqadi (mahsulot «tayyor»da kiradi)
    if piece is not None:
        piece.qty = Decimal(0)
        piece.save(update_fields=["qty"])
    d.data = {"job": job, "scrap": S.fl(scrap), "used": S.fl(taken + scrap)}
    d.lines = [
        {
            "item_id": u.item_id,
            "char_id": u.char_id,
            "batch_id": u.pk,
            "qty": str(S.fl(taken)),
            "data": {"piece": piece.pk if piece else None, "rests": [r.pk for r in left], "code": u.code},
        }
    ]
    d.save(update_fields=["data", "lines"])
    S.sweep()
    return {
        "qty": S.fl(taken),
        "unit": it["unit"],
        "item_id": u.item_id,
        "code": u.code,
        "width_mm": S.mm(piece.width_mm) if piece else None,
        "length_mm": S.mm(piece.length_mm) if piece else None,
        "rests": [
            {"code": r.code, "width_mm": S.mm(r.width_mm), "length_mm": S.mm(r.length_mm), "qty": S.fl(r.qty)}
            for r in left
        ],
        "scrap": S.fl(scrap),
        "number": number,
    }


@ledger.tracked("produce")
@transaction.atomic
def produce(
    *,
    item_id: int,
    char_id: int | None,
    qty: Any,
    firm: str | None,
    by: str,
    tg_id: int | None,
    job: str,
    width_mm: Any = None,
    length_mm: Any = None,
    sources: list[str] | None = None,
) -> dict[str, Any]:
    """Tayyor mahsulot omborga (sex → asosiy ombor): stikerli birlik (`product`), hujjat «produce» (IC-…).
    `sources` — zakaz sarf hujjatlari (SR-…): mahsulot qaysi material birliklaridan qilingani (`made.from`)."""
    it = S.item(item_id)
    q = S.dec(qty)
    if q <= 0:
        raise Bad("Mahsulot miqdori 0 dan katta bo'lsin")
    t = S.now()
    number = S.next_number("produce", t)
    wh = S.default_wh()
    f = firm or S.default_firm()
    srcs = sorted(set(sources or []))
    d = Doc.objects.create(
        number=number,
        kind="produce",
        status=DocStatus.POSTED,
        firm=f,
        warehouse=wh,
        author=tg_id,
        date=t,
        updated=t,
        version=2,
        data={"job": job, "sources": srcs},
        lines=[],
    )
    ledger.bind(op="produce", doc=d, reason=f"Sex: {job}")
    u = S.new_unit(
        item_id=item_id,
        char_id=char_id,
        firm=f,
        warehouse=wh,
        kind="product",
        qty=q,
        width_mm=S.dec_or_none(width_mm),
        length_mm=S.dec_or_none(length_mm),
        src=number,
        made={"kind": "produce", "by_name": by, "posted_at": S.iso(t), "job": job, "from": _origins(srcs)},
    )
    d.lines = [{"item_id": item_id, "char_id": char_id, "batch_id": u.pk, "qty": str(S.fl(q)), "data": {}}]
    d.save(update_fields=["lines"])
    return {"unit_id": u.pk, "code": u.code, "qty": S.fl(q), "unit": it["unit"], "number": number, "warehouse": wh.name}


def _origins(numbers: list[str]) -> list[dict[str, Any]]:
    """Sarf hujjatlaridan mahsulotning materiallari: [{code, item_id, name, qty, unit, doc}] (qaytarilganlari — yo'q)."""
    out: list[dict[str, Any]] = []
    for d in Doc.objects.filter(kind="consume", number__in=numbers).order_by("date", "pk"):
        if (d.data or {}).get("returned"):
            continue
        for ln in d.lines:
            it = S.item(int(ln["item_id"]))
            code = (ln.get("data") or {}).get("code")
            if code is None and ln.get("batch_id"):
                code = Unit.objects.filter(pk=ln["batch_id"]).values_list("code", flat=True).first()
            out.append(
                {
                    "code": code,
                    "item_id": ln["item_id"],
                    "name": S.full_name(it, ln.get("char_id")),
                    "qty": S.fl(S.dec(ln.get("qty"))),
                    "unit": it["unit"],
                    "doc": d.number,
                }
            )
    return out


@ledger.tracked("unconsume")
@transaction.atomic
def unconsume(number: str, *, by: str, tg_id: int | None, job: str) -> dict[str, Any]:
    """Sexdan omborga qaytarish (sarfni bekor qilish): olingan bo'lak/miqdor manba omborga joysiz qaytadi
    (joylash navbati, `src` — qaytarish hujjati SQ-…); kesishdagi chiqindi qaytmaydi. Sarf hujjatiga `returned` yoziladi."""
    d = Doc.objects.select_for_update().filter(kind="consume", number=number, status=DocStatus.POSTED).first()
    if d is None:
        raise S.NotFound("Sarf hujjati topilmadi")
    if (d.data or {}).get("returned"):
        raise Bad(f"{number} allaqachon qaytarilgan")
    t = S.now()
    rn = S.next_number("unconsume", t)
    r = Doc.objects.create(
        number=rn,
        kind="unconsume",
        status=DocStatus.POSTED,
        firm=d.firm,
        warehouse=d.warehouse_to or _shop_wh(),
        warehouse_to=d.warehouse,
        author=tg_id,
        date=t,
        updated=t,
        version=2,
        data={"job": job, "base": number, "by_name": by},
        lines=[],
    )
    ledger.bind(op="unconsume", doc=r, reason=f"Sex: {job} — qaytarildi")
    lines, codes = [], []
    for ln in d.lines:
        q = S.dec(ln.get("qty"))
        piece_id = (ln.get("data") or {}).get("piece")
        if piece_id:
            u = Unit.objects.select_for_update().filter(pk=piece_id).first()
            if u is None:
                raise Bad("Sarf bo'lagi topilmadi")
            u.qty, u.warehouse, u.loc, u.src = S.q4(q), d.warehouse, None, rn
            u.save()
            codes.append(u.code)
            bid = u.pk
        else:
            S.add_lot(int(ln["item_id"]), ln.get("char_id") or None, d.firm, d.warehouse, None, q, src=rn)
            bid = None
        lines.append(
            {"item_id": ln["item_id"], "char_id": ln.get("char_id"), "batch_id": bid, "qty": str(S.fl(q)), "data": {}}
        )
    r.lines = lines
    r.save(update_fields=["lines"])
    d.data = {**d.data, "returned": rn}
    d.save(update_fields=["data"])
    return {"number": rn, "codes": [c for c in codes if c], "warehouse": d.warehouse.name}


def units_pdf(unit_ids: list[int]) -> bytes:
    from . import labels

    return labels.units_pdf(unit_ids)


# ---------------------------------------------------------------- yig'ish navbati
@transaction.atomic
def open_pick(
    *,
    source: str,
    number: str,
    customer: str,
    lines: list[dict[str, Any]],
    channel: str = "",
    firm: str | None = None,
    at: datetime | None = None,
) -> int | None:
    """Jo'natish uchun yig'ish buyurtmasi (`source` bo'yicha bir marta: takror chaqiruv — mavjudini yangilaydi).
    lines: [{item_id, char_id, qty}] — katalogda yo'q / miqdorsiz qatorlar o'tkaziladi. Qatorsiz — None."""
    rows = []
    known = S.cat({int(x["item_id"]) for x in lines if x.get("item_id")})
    for x in lines:
        try:
            q = S.dec(x.get("qty"))
        except Bad:
            continue
        if not x.get("item_id") or int(x["item_id"]) not in known or q <= 0:
            continue
        rows.append(
            {
                "line_no": len(rows) + 1,
                "item_id": int(x["item_id"]),
                "char_id": x.get("char_id") or None,
                "qty": S.fl(q),
                "left": S.fl(q),
            }
        )
    if not rows:
        return None
    p = Pick.objects.select_for_update().filter(source=source, done=False).first()
    if p is None:
        p = Pick(source=source, warehouse=S.default_wh(), date=at or S.now())
    p.number = number
    p.customer = customer
    p.channel = channel
    p.firm = firm or S.default_firm()
    p.lines = rows
    p.save()
    return p.pk


def close_pick(source: str) -> int:
    """Bitim bekor bo'ldi — ochiq yig'ish buyurtmasi olib tashlanadi."""
    return Pick.objects.filter(source=source, done=False).delete()[0]


def on_shipped(fn: Callable[[str, str], None]) -> None:
    """fn(source, doc_number) — yig'ish buyurtmasi to'liq jo'natilganda (CRM bitimni yopadi)."""
    hooks.on_shipped(fn)


def cell_exists(code: str) -> bool:
    return Cell.objects.filter(code=code.upper()).exists()


def custom_labels(rows: list[tuple[str, str, list[str], str]]) -> bytes:
    """Stiker PDF (58×40): [(QR kodi, nom, qatorlar, katta yozuv)]."""
    from . import labels

    return labels.custom_pdf(rows)


def item_info(item_id: int) -> dict[str, Any]:
    """Katalog tovari (ombor ko'zi bilan: dims, birlik, variantlar)."""
    return S.item(item_id)


def demo_seed() -> dict[str, Any]:
    """Demo ombor (dev baza, testlar) — boshqa applar demosi shu ustiga quradi."""
    from . import demo

    return demo.seed()


def dashboard_summary() -> dict[str, Any]:
    """Analitika uchun ombor paneli (qiymati bilan): qoldiq, kam qoldiq, sanash aniqligi, yig'ish navbati, bugungi hujjatlar."""
    return S.dashboard(see_cost=True)

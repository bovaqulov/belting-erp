"""Ombor mantig'i (docs/api/warehouse.md) — frontend demo backendi (`src/erp/warehouse/demo/server.lib.ts`) bilan bir xil
qoidalar va JSON shakllari. Yozuvchi amallar — `transaction.atomic` ichida (xato bo'lsa hech narsa o'zgarmaydi).

Miqdorlar ichkarida Decimal, javobda — son (float, 4 xona). O'lcham turi (`dims`) katalogdan: `wl` — eni × uzunligi
(m², konveyer lenta), `w` — eni (rukav, 1 dona), `l` — uzunlik (rulon, m), None — donali (partiya).
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from django.db import models, transaction
from django.db.models import Q, QuerySet
from django.utils import timezone

from . import codes as K
from . import ledger
from .models import (
    Block,
    Building,
    Cell,
    CellKind,
    CellStatus,
    Doc,
    DocStatus,
    Firm,
    Incoming,
    ItemMeta,
    Pick,
    Place,
    Purpose,
    Rack,
    Seq,
    StockLevel,
    StockMove,
    Unit,
    Warehouse,
    WhKind,
)

ZERO = Decimal(0)
EPS = Decimal("0.00005")
Q4 = Decimal("0.0001")
SCRAP_MM = Decimal(100)  # lentadan qolgan bo'lak shundan tor/qisqa bo'lsa — chiqindi
KINDS: list[tuple[str, str]] = [
    ("inventory", "Inventarizatsiya"),
    ("cut", "Kesish"),
    ("transfer", "Ko'chirish"),
    ("writeoff", "Hisobdan chiqarish"),
    ("acceptance", "Qabul"),
    ("sale", "Jo'natish"),
    ("initial", "Boshlang'ich qoldiq"),
    ("produce", "Ishlab chiqarish"),
    ("consume", "Sexga sarf"),
    ("return", "Mijozdan qaytarish"),
    ("unconsume", "Sexdan qaytarish"),
]
PFX = {
    "inventory": "INV",
    "cut": "KS",
    "transfer": "KO",
    "writeoff": "HC",
    "acceptance": "QB",
    "sale": "JN",
    "initial": "BQ",
    "produce": "IC",
    "consume": "SR",
    "incoming": "KR",  # kutilgan kirim (ASN)
    "return": "QT",
    "unconsume": "SQ",
}
USER_KINDS = ("inventory", "cut", "transfer", "writeoff", "acceptance")  # POST docs orqali yaratiladiganlar
CLS_DAYS = {"A": 7, "B": 30, "C": 90}  # siklik sanash: A — haftalik, B — oylik, C — choraklik (jahon amaliyoti)
# Sanash toleransi (sinf bo'yicha): farq foizi VA summasi chegarada bo'lsa — avtomatik; oshsa — qayta sanash + rahbar
# tasdig'i va sabab. A — har qanday farq tasdiq talab qiladi.
TOL: dict[str, tuple[Decimal, Decimal]] = {
    "A": (Decimal(0), Decimal(0)),
    "B": (Decimal(2), Decimal(50_000)),
    "C": (Decimal(5), Decimal(100_000)),
}
REASONS: dict[str, str] = {
    "count_error": "Oldingi sanash yoki kiritish xatosi",
    "mislocated": "Boshqa joyda turgan edi",
    "damage": "Shikastlangan / yaroqsiz",
    "loss": "Yo'qotish (o'g'irlik, aniqlanmagan)",
    "unrecorded_in": "Hujjatsiz kirim",
    "unrecorded_out": "Hujjatsiz chiqim",
    "other": "Boshqa",
}
SLOW_DAYS = 90


class Bad(Exception):
    """Biznes qoidasi buzildi → 400 (matn — nima bo'ldi + qanday tuzatish)."""


class NotFound(Exception):
    """→ 404"""


class Conflict(Exception):
    """→ 409 (hujjat versiyasi eskirgan)"""


# ---------------------------------------------------------------- sonlar
def dec(v: Any, field: str = "Miqdor") -> Decimal:
    """'12,5' / 12.5 / '12.5' → Decimal; noto'g'ri — Bad."""
    if isinstance(v, Decimal):
        return v
    try:
        d = Decimal(str(v if v is not None else "").strip().replace(",", ".").replace(" ", ""))
    except InvalidOperation as e:
        raise Bad(f"{field}: son kiriting") from e
    if not d.is_finite():
        raise Bad(f"{field}: son kiriting")
    return d


def dec_or_none(v: Any, field: str = "O'lcham") -> Decimal | None:
    return None if v is None or v == "" else dec(v, field)


def q4(d: Decimal) -> Decimal:
    return d.quantize(Q4, rounding=ROUND_HALF_UP)


def fl(d: Decimal | float | int | None) -> float | None:
    return None if d is None else float(q4(Decimal(str(d))))


def mm(d: Decimal | None) -> float | int | None:
    """mm o'lcham javobda: butun bo'lsa int."""
    if d is None:
        return None
    return int(d) if d == d.to_integral_value() else float(d)


def area(w: Decimal, length: Decimal) -> Decimal:
    return q4(w * length / Decimal(1_000_000))


def now() -> datetime:
    return timezone.now()


def iso(d: datetime | None) -> str | None:
    return d.isoformat() if d else None


# ---------------------------------------------------------------- katalog (kechiktirilgan import — tsikl yo'q)
def cat(ids: Iterable[int] | None = None) -> dict[int, dict[str, Any]]:
    from config.apps.erp.catalog import services as catalog

    return catalog.items_info(None if ids is None else set(ids))


def item(item_id: int) -> dict[str, Any]:
    it = cat([item_id]).get(item_id)
    if it is None:
        raise Bad(f"Tovar #{item_id} topilmadi")
    return it


def char_name(it: dict[str, Any], char_id: int | None) -> str | None:
    if not char_id:
        return None
    c = it["chars"].get(char_id)
    return c["name"] if c else None


def full_name(it: dict[str, Any], char_id: int | None) -> str:
    return " · ".join(x for x in (it["name"], char_name(it, char_id)) if x)


# ---------------------------------------------------------------- hisoblagichlar
def _seq(key: str) -> int:
    s, _ = Seq.objects.select_for_update().get_or_create(key=key)
    s.n += 1
    s.save(update_fields=["n"])
    return s.n


def next_code() -> str:
    """Birlik QR kodi: P00000001 — mavjud eng kattasidan keyingi (bazada qo'lda kiritilganlar ham hisobga olinadi)."""
    s, created = Seq.objects.select_for_update().get_or_create(key="unit")
    if created or s.n == 0:
        last = Unit.objects.filter(code__startswith="P").order_by("-code").values_list("code", flat=True).first()
        s.n = int(last[1:]) if last and last[1:].isdigit() else 0
    s.n += 1
    s.save(update_fields=["n"])
    return f"P{s.n:08d}"


def next_number(kind: str, at: datetime | None = None) -> str:
    p = PFX.get(kind, "DOC")
    yy = (at or now()).strftime("%y")
    return f"{p}-{yy}-{_seq(f'{p}-{yy}'):04d}"


# ---------------------------------------------------------------- qoldiq
def live() -> QuerySet[Unit]:
    """Hisobdagi tirik qoldiq: miqdori bor, sanashda kutilmayapti, «yo'lda» omborida emas."""
    return Unit.objects.filter(qty__gt=0, pending=False).exclude(warehouse__kind=WhKind.TRANSIT)


def firm_ok(code: Any) -> str:
    if not isinstance(code, str) or not Firm.objects.filter(code=code).exists():
        raise Bad("Firma noto'g'ri — ro'yxatdan tanlang")
    return code


def wh_ok(pk: Any) -> Warehouse:
    try:
        return Warehouse.objects.get(pk=int(pk))
    except (Warehouse.DoesNotExist, TypeError, ValueError) as e:
        raise Bad("Ombor noto'g'ri — ro'yxatdan tanlang") from e


def new_unit(
    *,
    item_id: int,
    firm: str,
    warehouse: Warehouse,
    kind: str,
    qty: Decimal,
    char_id: int | None = None,
    loc: Cell | None = None,
    width_mm: Decimal | None = None,
    length_mm: Decimal | None = None,
    parent_code: str = "",
    made: dict | None = None,
    pending: bool = False,
    src: str = "",
    coded: bool = True,
) -> Unit:
    return Unit.objects.create(
        code=next_code() if coded else None,
        item_id=item_id,
        char_id=char_id,
        firm=firm,
        warehouse=warehouse,
        loc=loc,
        kind=kind,
        qty=q4(qty),
        width_mm=width_mm,
        length_mm=length_mm,
        parent_code=parent_code,
        made=made,
        pending=pending,
        src=src,
        created=now(),
    )


def add_lot(
    item_id: int,
    char_id: int | None,
    firm: str,
    warehouse: Warehouse,
    loc: Cell | None,
    qty: Decimal,
    src: str = "",
    kind: str = "lot",
) -> Unit:
    """Donali partiyaga qo'shish (bir xil tovar/variant/firma/ombor/joy/manba — bitta qator)."""
    cur = (
        Unit.objects.select_for_update()
        .filter(
            kind=kind,
            pending=False,
            code__isnull=True,
            item_id=item_id,
            char_id=char_id,
            firm=firm,
            warehouse=warehouse,
            loc=loc,
            src=src,
        )
        .first()
    )
    if cur:
        cur.qty = q4(cur.qty + qty)
        cur.save(update_fields=["qty"])
        return cur
    return new_unit(
        item_id=item_id,
        char_id=char_id,
        firm=firm,
        warehouse=warehouse,
        loc=loc,
        kind=kind,
        qty=qty,
        src=src,
        coded=False,
    )


def take_lots(item_id: int, char_id: int | None, firm: str | None, warehouse: Warehouse, qty: Decimal) -> None:
    """Donali partiyalardan qty olish (FIFO — avval kelgani); yetmasa — Bad."""
    qs = (
        live()
        .select_for_update()
        .filter(kind__in=("lot", "product"), code__isnull=True, item_id=item_id, char_id=char_id, warehouse=warehouse)
    )
    if firm:
        qs = qs.filter(firm=firm)
    lots = sorted(qs, key=lambda u: (u.created, u.pk))
    have = sum((u.qty for u in lots), ZERO)
    if have + EPS < qty:
        it = item(item_id)
        raise Bad(f"{full_name(it, char_id)}: {warehouse.name} da {fl(have)} {it['unit']} bor, kerak {fl(qty)}")
    left = qty
    for u in lots:
        t = min(u.qty, left)
        u.qty = q4(u.qty - t)
        u.save(update_fields=["qty"])
        left -= t
        if left <= EPS:
            break


def sweep() -> None:
    """Kodsiz, bo'shab qolgan partiyalarni o'chirish (kodli birlik tarixi uchun qoladi)."""
    Unit.objects.filter(code__isnull=True, qty__lte=0, pending=False).delete()


def meta(item_ids: Iterable[int]) -> dict[int, ItemMeta]:
    return {m.item_id: m for m in ItemMeta.objects.filter(item_id__in=list(item_ids))}


def touch_count(item_ids: Iterable[int], at: datetime) -> None:
    for i in set(item_ids):
        ItemMeta.objects.update_or_create(item_id=i, defaults={"last_count": at})


# ---------------------------------------------------------------- javob shakllari
def me_payload(user: Any) -> dict[str, Any]:
    """`/erp/me` ga: omborlar, firmalar, hujjat turlari (ruxsat bilan)."""
    can = ["create", "post"] if user.can_module("warehouse") else []
    return {
        "warehouses": [
            {"id": w.pk, "name": w.name, "kind": w.kind, "code": w.code} for w in Warehouse.objects.filter(active=True)
        ],
        "firms": [{"id": f.pk, "code": f.code, "name": f.name} for f in Firm.objects.all()],
        "kinds": [{"code": c, "title": {"uz": t}, "can": can} for c, t in KINDS],
    }


def scan_unit(u: Unit, info: dict[str, Any] | None = None) -> dict[str, Any]:
    it = info or item(u.item_id)
    has = not u.pending and u.qty > EPS
    return {
        "type": "unit",
        "id": u.pk,
        "code": u.code or "",
        "item_id": u.item_id,
        "char_id": u.char_id,
        "name": full_name(it, u.char_id),
        "kind": u.kind,
        "unit": it["unit"],
        "dims": it["dims"],
        "width_mm": mm(u.width_mm),
        "length_mm": mm(u.length_mm),
        "char": char_name(it, u.char_id),
        "firm": u.firm,
        "loc": u.loc.code if u.loc else None,
        "loc_id": u.loc_id,
        "stock": (
            [{"warehouse_id": u.warehouse_id, "warehouse": u.warehouse.name, "firm": u.firm, "qty": fl(u.qty)}]
            if has
            else []
        ),
        "pending": u.pending,
        "pending_qty": fl(u.qty) if u.pending else 0,
        "parent_code": u.parent_code or None,
        "made": u.made,
        "cuts": u.cuts,
    }


def scan(raw: str) -> dict[str, Any]:
    code = raw.strip()
    up = code.upper()
    if not code:
        return {"type": "unknown"}
    u = Unit.objects.select_related("warehouse", "loc").filter(code=up).first()
    if u:
        return scan_unit(u)
    c = Cell.objects.filter(code=up).first()
    if c:
        return {"type": "cell", "id": c.pk, "code": c.code, "parent_id": c.warehouse_id}
    from config.apps.erp.catalog import services as catalog

    hits = catalog.by_code(code)
    if len(hits) > 1:
        return {
            "type": "choice",
            "options": [
                {
                    "item_id": h["id"],
                    "char_id": None,
                    "name": h["name"],
                    "base": h["base"],
                    "unit": h["unit"],
                    "dims": h["dims"],
                }
                for h in hits
            ],
        }
    if hits:
        h = hits[0]
        out = {
            "type": "item",
            "item_id": h["id"],
            "char_id": None,
            "name": h["name"],
            "unit": h["unit"],
            "dims": h["dims"],
            "sku": h["sku"],
        }
        if h["legacy"] == code:
            out["legacy"] = h["base"]
        return out
    d = Doc.objects.filter(number=up).first()
    if d and d.number:
        return {"type": "doc", "number": d.number}
    return {"type": "unknown"}


def items_search(q: str) -> list[dict[str, Any]]:
    s = q.strip().casefold()
    if len(s) < 2:
        return []
    out = []
    for it in cat().values():
        if not it["active"]:
            continue
        if any(s in (x or "").casefold() for x in (it["name"], it["sku"])):
            out.append(
                {
                    "item_id": it["id"],
                    "char_id": None,
                    "name": it["name"],
                    "sku": it["sku"],
                    "unit": it["unit"],
                    "dims": it["dims"],
                }
            )
        if len(out) >= 50:
            break
    return out


def reserved(item_id: int, char_id: int | None = None) -> Decimal:
    tot = ZERO
    for p in Pick.objects.filter(done=False):
        for ln in p.lines:
            if ln["item_id"] == item_id and (not char_id or ln.get("char_id") == char_id):
                tot += dec(ln["left"])
    return tot


def item_stock(item_id: int, char_id: int | None) -> dict[str, Any]:
    qs = live().select_related("warehouse").filter(item_id=item_id)
    if char_id:
        qs = qs.filter(char_id=char_id)
    us = list(qs)
    total = sum((u.qty for u in us), ZERO)
    res = reserved(item_id, char_id)
    return {
        "total": fl(total),
        "reserved": fl(res),
        "free": fl(max(ZERO, total - res)),
        "units": [
            {
                "batch_id": u.pk if u.code else None,
                "code": u.code,
                "kind": u.kind,
                "width_mm": mm(u.width_mm),
                "length_mm": mm(u.length_mm),
                "warehouse": u.warehouse.name,
                "firm": u.firm,
                "qty": fl(u.qty),
            }
            for u in us
        ],
    }


def dashboard(see_cost: bool) -> dict[str, Any]:
    t = now()
    us = list(live())
    info = cat({u.item_id for u in us} | set(meta_items_low()))
    m = meta(info)
    month = t - timedelta(days=30)
    recent = Doc.objects.filter(status=DocStatus.POSTED, date__gt=month)
    inv = list(recent.filter(kind="inventory").order_by("-date"))
    pos = sum(int(d.data.get("positions") or 0) for d in inv)
    diff = sum(int(d.data.get("diff") or 0) for d in inv)
    cuts = list(recent.filter(kind="cut"))
    used = sum(float(d.data.get("used") or 0) for d in cuts)
    scrap = sum(float(d.data.get("scrap") or 0) for d in cuts)
    today: dict[str, int] = {}
    start = t.replace(hour=0, minute=0, second=0, microsecond=0)
    for k in Doc.objects.filter(status=DocStatus.POSTED, date__gte=start).values_list("kind", flat=True):
        today[k] = today.get(k, 0) + 1
    totals: dict[int, Decimal] = {}
    for u in us:
        totals[u.item_id] = totals.get(u.item_id, ZERO) + u.qty
    low = [
        {"name": it["name"], "min_qty": it["min_qty"], "unit": it["unit"], "qty": fl(totals.get(i, ZERO))}
        for i, it in info.items()
        if it["min_qty"] > 0 and it["active"] and float(totals.get(i, ZERO)) < it["min_qty"]
    ]
    stock: dict[str, Any] = {
        "units": len(us),
        "items": len(totals),
        "rolls": sum(1 for u in us if u.kind == "roll"),
        "pieces": sum(1 for u in us if u.kind == "piece"),
        "no_loc": sum(1 for u in us if not u.loc_id),
    }
    if see_cost:
        stock["value"] = round(sum(float(u.qty * (m[u.item_id].cost if u.item_id in m else ZERO)) for u in us))
    return {
        "stock": stock,
        "picks": Pick.objects.filter(done=False).count(),
        "accuracy": round((1 - diff / pos) * 100, 2) if pos else None,
        "counted_positions": pos,
        "slow_days": SLOW_DAYS,
        "slow_units": sum(1 for u in us if u.created < t - timedelta(days=SLOW_DAYS)),
        "scrap_pct": round(scrap / used * 100, 2) if used else None,
        "pending_units": Unit.objects.filter(pending=True).count(),
        "low": low,
        "today": today,
        "counts": [
            {
                "number": d.number or "",
                "date": iso(d.date),
                "positions": int(d.data.get("positions") or 0),
                "diff": int(d.data.get("diff") or 0),
            }
            for d in inv
        ],
    }


def meta_items_low() -> list[int]:
    """Kam qoldiq ro'yxati uchun minimal miqdori bor tovarlar (qoldig'i 0 bo'lsa ham ko'rinsin)."""
    from config.apps.erp.catalog import services as catalog

    return catalog.with_min_qty()


def _locs(us: list[Unit]) -> list[str]:
    return sorted({u.loc.code for u in us if u.loc})


def cycle(wh: Warehouse) -> dict[str, Any]:
    t = now()
    us = list(live().select_related("loc").filter(warehouse=wh))
    by: dict[int, list[Unit]] = {}
    for u in us:
        by.setdefault(u.item_id, []).append(u)
    info = cat(by)
    m = meta(by)
    rows: list[dict[str, Any]] = []
    for i, mine in by.items():
        mt = m.get(i)
        cls = mt.cls if mt else "C"
        last = mt.last_count if mt else None
        age = (t - last).days if last else 0
        rows.append(
            {
                "item_id": i,
                "name": info[i]["name"] if i in info else f"#{i}",
                "cls": cls,
                "last": iso(last),
                "age": age,
                "locs": _locs(mine),
                "units": len(mine),
                "due": not last or age >= CLS_DAYS[cls],
            }
        )
    summary = {
        c: {
            "days": CLS_DAYS[c],
            "items": sum(1 for r in rows if r["cls"] == c),
            "due": sum(1 for r in rows if r["cls"] == c and r["due"]),
        }
        for c in ("A", "B", "C")
    }
    due = sorted((r for r in rows if r["due"]), key=lambda r: (str(r["cls"]), bool(r["last"]), -int(r["age"] or 0)))
    for r in due:
        r.pop("due")
    return {"due_total": len(due), "summary": summary, "due": due}


def stock_table(wh_id: str | None, q: str, kind: str, low: bool, see_cost: bool) -> dict[str, Any]:
    qs = live().select_related("warehouse", "loc")
    if wh_id:
        qs = qs.filter(warehouse_id=int(wh_id))
    by: dict[int, list[Unit]] = {}
    for u in qs:
        by.setdefault(u.item_id, []).append(u)
    info = cat(by)
    m = meta(by)
    s = q.strip().casefold()
    rows = []
    for i, mine in by.items():
        it = info.get(i)
        if it is None:
            continue
        hay = [it["name"], it["sku"], it["barcode"], it["legacy"]]
        if s and not any(s in (x or "").casefold() for x in hay):
            continue
        if kind == "measured" and not it["dims"]:
            continue
        if kind == "piece" and it["dims"]:
            continue
        qty = sum((u.qty for u in mine), ZERO)
        if low and not (it["min_qty"] > 0 and float(qty) < it["min_qty"]):
            continue
        row: dict[str, Any] = {
            "item_id": i,
            "name": it["name"],
            "sku": it["sku"],
            "qty": fl(qty),
            "unit": it["unit"],
            "min_qty": it["min_qty"],
            "dims": it["dims"],
            "rolls": sum(1 for u in mine if u.kind == "roll"),
            "pieces": sum(1 for u in mine if u.kind == "piece"),
            "units": len(mine),
            "locs": _locs(mine),
            "firms": sorted({u.firm for u in mine}),
            "whs": sorted({u.warehouse.name for u in mine}),
        }
        if see_cost:
            row["cost"] = round(float(qty * (m[i].cost if i in m else ZERO)))
        rows.append(row)
    rows.sort(key=lambda r: r["name"])
    total: dict[str, Any] = {
        "items": len(rows),
        "units": sum(r["units"] for r in rows),
        "rolls": sum(r["rolls"] for r in rows),
        "pieces": sum(r["pieces"] for r in rows),
    }
    if see_cost:
        total["cost"] = sum(r["cost"] for r in rows)
    return {"rows": rows, "total": total, "see_cost": see_cost}


# ---------------------------------------------------------------- joylar
def cell_out(c: Cell, counts: dict[int, int]) -> dict[str, Any]:
    return {
        "id": c.pk,
        "code": c.code,
        "parent_id": c.warehouse_id,
        "block_id": c.block_id,
        "rack_id": c.rack_id,
        "row": c.row,
        "floor": c.floor,
        "status": c.status,
        "warehouse": c.warehouse.name,
        "units": counts.get(c.pk, 0),
    }


def cells() -> list[dict[str, Any]]:
    counts: dict[int, int] = {}
    for loc_id in live().filter(loc__isnull=False).values_list("loc_id", flat=True):
        counts[loc_id] = counts.get(loc_id, 0) + 1
    return [
        cell_out(c, counts) for c in Cell.objects.select_related("warehouse").exclude(warehouse__kind=WhKind.TRANSIT)
    ]


def loc_ok(c: Cell, *, adding: int = 1, width_mm: Any = None, exclude: Iterable[int] = ()) -> Cell:
    """Joylashtirishdan oldin: bloklangan joy — yo'q (karantin — mumkin, u tekshiruvdagi tovar uchun); stellaj sig'imi
    (`capacity` — joyda nechta birlik) va eng katta eni (`max_width_mm`) — oshsa rad."""
    if c.status == CellStatus.BLOCKED:
        raise Bad(f"{c.code} — bloklangan joy: boshqa joy tanlang")
    r = c.rack
    if r is None:
        return c
    if r.max_width_mm and width_mm and Decimal(str(width_mm)) > r.max_width_mm:
        raise Bad(f"{c.code} — eni {r.max_width_mm} mm gacha: {fl(Decimal(str(width_mm)))} mm sig'maydi")
    if r.capacity:
        has = live().filter(loc=c).exclude(pk__in=list(exclude)).count()
        if has + adding > r.capacity:
            raise Bad(f"{c.code} to'la ({has}/{r.capacity}) — boshqa joy tanlang")
    return c


def cell_units(cell_id: int) -> list[dict[str, Any]]:
    us = list(live().filter(loc_id=cell_id))
    info = cat({u.item_id for u in us})
    return [
        {
            "name": full_name(info[u.item_id], u.char_id) if u.item_id in info else f"#{u.item_id}",
            "code": u.code,
            "kind": u.kind,
            "width_mm": mm(u.width_mm),
            "length_mm": mm(u.length_mm),
            "firm": u.firm,
            "qty": fl(u.qty),
            "unit": info[u.item_id]["unit"] if u.item_id in info else "",
        }
        for u in us
    ]


@transaction.atomic
def add_cells(parent_id: Any, codes: list[Any], block_id: Any = None) -> list[dict[str, Any]]:
    """Joylar yaratish: bor kodlar o'tkaziladi. `block_id` berilsa — hamma kod shu blok harfi bilan boshlansin (A-…);
    berilmasa — blok kod boshidan topiladi."""
    wh = wh_ok(parent_id)
    blocks = {b.code: b for b in Block.objects.filter(warehouse=wh)}
    only = None
    if block_id not in (None, ""):
        only = next((b for b in blocks.values() if str(b.pk) == str(block_id)), None)
        if only is None:
            raise Bad("Xona noto'g'ri — ro'yxatdan tanlang")
    clean = [str(raw).strip().upper() for raw in codes if str(raw).strip()]
    if only and (bad := next((c for c in clean if not c.startswith(f"{only.code}-")), None)):
        raise Bad(f"{bad} — {only.code} xonaga tegishli emas (kod {only.code}- bilan boshlanadi)")
    out = []
    for code in clean:
        if ex := Cell.objects.filter(code=code).select_related("warehouse").first():
            if ex.warehouse_id != wh.pk:  # joy kodi butun bazada yagona — boshqa omborda band
                raise Bad(f"{code} — «{ex.warehouse.name}» omborida bor: boshqa xona harfi tanlang")
            continue
        c = Cell.objects.create(warehouse=wh, code=code, block=only or blocks.get(code.split("-")[0]))
        out.append({"id": c.pk, "code": c.code})
    return out


# ---------------------------------------------------------------- kodlar (codes.py): AO1-A-02-03-C
def _bcode(b: Building) -> str:
    return K.building(b.warehouse.code, b.number)


def _xcode(x: Block) -> str:
    return K.block(_bcode(x.building), x.code) if x.building else x.code


def _rcode(r: Rack) -> str:
    return K.rack(_xcode(r.block), r.number)


def _recode(qs: QuerySet[Cell]) -> int:
    """Tuzilma kodi o'zgarganda (ombor kodi, bino raqami, xona harfi) — stellaj joylarining kodlarini qayta qurish.
    Ikki bosqich (vaqtinchalik kod) — yangi kodlar o'zaro to'qnashmasin; boshqa joy band qilgan bo'lsa — 400."""
    cs = list(
        qs.filter(rack__isnull=False, row__isnull=False, floor__isnull=False).select_related(
            "rack__block__building__warehouse"
        )
    )
    new = {c.pk: K.cell(_rcode(c.rack), c.row or 0, c.floor or 0) for c in cs}
    if ex := Cell.objects.filter(code__in=new.values()).exclude(pk__in=new.keys()).first():
        raise Bad(f"{ex.code} — bunday joy allaqachon bor: boshqa kod tanlang")
    for c in cs:
        c.code = f"~{c.pk}"
    Cell.objects.bulk_update(cs, ["code"])
    for c in cs:
        c.code = new[c.pk]
    Cell.objects.bulk_update(cs, ["code"])
    return len(cs)


def structure(store_id: Any) -> dict[str, Any]:
    """Ombor tuzilmasi: binolar, xonalar (blok), stellajlar — har biri o'z kodi bilan (joylar — /cells)."""
    wh = wh_ok(store_id)
    return {
        "store": {"id": wh.pk, "name": wh.name, "code": wh.code},
        "buildings": [
            {"id": b.pk, "name": b.name, "number": b.number, "code": _bcode(b)}
            for b in Building.objects.filter(warehouse=wh).select_related("warehouse").order_by("number")
        ],
        "blocks": [block_out(b) for b in Block.objects.filter(warehouse=wh).select_related("building__warehouse")],
        "racks": [rack_out(r) for r in Rack.objects.filter(warehouse=wh).select_related("block__building__warehouse")],
    }


# ---------------------------------------------------------------- ombor
STORE_KINDS = (WhKind.STORE, WhKind.SHOP, WhKind.PRODUCTION)


def _store(pk: Any) -> Warehouse:
    """Saqlash ombori (faol, «yo'lda» emas) — tahrirlash/o'chirish uchun."""
    wh = wh_ok(pk)
    if not wh.active or wh.kind not in STORE_KINDS:
        raise NotFound("Ombor topilmadi")
    return wh


@transaction.atomic
def edit_store(pk: Any, name: Any, kind: Any = None, code: Any = None) -> dict[str, Any]:
    """Nomi, turi va kodi (2–3 lotin harfi: AO); kod o'zgarsa — barcha joy kodlari qayta quriladi (yorliqlar qayta chop etiladi)."""
    wh = _store(pk)
    n = str(name or "").strip()[:120]
    if not n:
        raise Bad("Ombor nomini yozing, masalan «Asosiy ombor»")
    if Warehouse.objects.filter(name__iexact=n).exclude(pk=wh.pk).exists():
        raise Bad(f"«{n}» nomli ombor allaqachon bor")
    k = str(kind or wh.kind)
    if k not in STORE_KINDS:
        raise Bad("Ombor turi noto'g'ri — Ombor, Do'kon yoki Sex")
    c = wh.code if code is None else str(code).strip().upper()
    if not (2 <= len(c) <= 3 and c.isascii() and c.isalpha()):
        raise Bad("Ombor kodi — 2–3 lotin harfi, masalan AO (Asosiy ombor)")
    if Warehouse.objects.filter(code=c).exclude(pk=wh.pk).exists():
        raise Bad(f"{c} kodi boshqa omborda band")
    changed = c != wh.code
    wh.name, wh.kind, wh.code = n, k, c
    wh.save(update_fields=["name", "kind", "code"])
    recoded = _recode(Cell.objects.filter(warehouse=wh)) if changed else 0
    return {"id": wh.pk, "name": wh.name, "kind": wh.kind, "code": wh.code, "recoded": recoded}


@transaction.atomic
def drop_store(pk: Any) -> dict[str, Any]:
    """Omborni o'chirish: qoldiq bo'lsa — rad; tarixi (hujjat, birlik, yig'ish) bo'lmasa — butunlay (binolar, bloklar,
    joylar bilan), bo'lsa — arxivga (ro'yxatdan yo'qoladi, tarix saqlanadi, nomi bo'shaydi)."""
    wh = _store(pk)
    if Unit.objects.filter(warehouse=wh, qty__gt=0).exists():
        raise Conflict(f"«{wh.name}» da qoldiq bor — avval boshqa omborga ko'chiring yoki hisobdan chiqaring")
    if Pick.objects.filter(warehouse=wh, done=False).exists():
        raise Conflict(f"«{wh.name}» da yopilmagan yig'ish bor")
    used = (
        Unit.objects.filter(warehouse=wh).exists()
        or Doc.objects.filter(warehouse=wh).exists()
        or Doc.objects.filter(warehouse_to=wh).exists()
        or Pick.objects.filter(warehouse=wh).exists()
        or Incoming.objects.filter(warehouse=wh).exists()
    )
    if not used:
        wh.delete()
        return {"ok": True, "archived": False}
    wh.active = False  # binolar/joylar qoladi — joylashtirish tarixi (Place) yo'qolmasin
    wh.name = f"{wh.name} (o'chirilgan #{wh.pk})"[:120]
    wh.code = ""  # kod bo'shaydi — yangi omborga berilishi mumkin
    wh.save(update_fields=["active", "name", "code"])
    return {"ok": True, "archived": True}


def _get[T: models.Model](qs: QuerySet[T], pk: Any, what: str) -> T:
    try:
        return qs.get(pk=int(pk))
    except (qs.model.DoesNotExist, TypeError, ValueError) as e:
        raise NotFound(f"{what} topilmadi") from e


def _empty_cells(cells: QuerySet[Cell], what: str) -> None:
    """O'chirishdan oldin: joylarda birlik (qoldiq yoki sanashda kutilayotgan) bo'lmasin."""
    busy = list(
        Unit.objects.filter(loc__in=cells)
        .filter(Q(qty__gt=0) | Q(pending=True))
        .values_list("loc__code", flat=True)
        .distinct()[:5]
    )
    if busy:
        raise Conflict(f"{what}: {', '.join(busy)} da birlik bor — avval boshqa joyga ko'chiring")


# ---------------------------------------------------------------- binolar
def _bld_in(wh: Warehouse, number: Any, name: Any, me: Building | None = None) -> tuple[int, str]:
    used = set(Building.objects.filter(warehouse=wh).exclude(pk=me.pk if me else None).values_list("number", flat=True))
    if number in (None, ""):
        num = me.number if me else next(i for i in range(1, 100) if i not in used)
    else:
        try:
            num = int(number)
        except (TypeError, ValueError) as e:
            raise Bad("Bino raqami — 1 dan 99 gacha") from e
    if not 1 <= num <= 99:
        raise Bad("Bino raqami — 1 dan 99 gacha")
    if num in used:
        raise Bad(f"{K.building(wh.code, num)} — bu raqamli bino allaqachon bor")
    nm = str(name or "").strip()[:120] or f"{num}-bino"
    if Building.objects.filter(warehouse=wh, name__iexact=nm).exclude(pk=me.pk if me else None).exists():
        raise Bad(f"«{nm}» — bu omborda allaqachon bor")
    return num, nm


@transaction.atomic
def add_building(store_id: Any, name: Any, number: Any = None) -> dict[str, Any]:
    """Bino: raqami (kodda: AO1) berilmasa — keyingi bo'sh raqam; nomi berilmasa — «N-bino»."""
    wh = wh_ok(store_id)
    num, nm = _bld_in(wh, number, name)
    b = Building.objects.create(warehouse=wh, number=num, name=nm)
    return {"id": b.pk, "name": b.name, "number": b.number, "code": _bcode(b)}


@transaction.atomic
def edit_building(pk: Any, name: Any, number: Any = None) -> dict[str, Any]:
    b = _get(Building.objects.select_for_update().select_related("warehouse"), pk, "Bino")
    num, nm = _bld_in(b.warehouse, number, name or b.name, b)
    changed = num != b.number
    b.number, b.name = num, nm
    b.save(update_fields=["number", "name"])
    recoded = _recode(Cell.objects.filter(block__building=b)) if changed else 0
    return {"id": b.pk, "name": b.name, "number": b.number, "code": _bcode(b), "recoded": recoded}


@transaction.atomic
def drop_building(pk: Any) -> dict[str, Any]:
    """Bino — xonalari, stellajlari va joylari bilan (hammasi bo'sh bo'lsa)."""
    b = _get(Building.objects.all(), pk, "Bino")
    blocks = Block.objects.filter(building=b)
    cells = Cell.objects.filter(block__in=blocks)
    _empty_cells(cells, f"«{b.name}»")
    n = cells.count()
    cells.delete()
    blocks.delete()
    b.delete()
    return {"ok": True, "cells": n}


# ---------------------------------------------------------------- xonalar (blok)
def _xona_code(code: Any) -> str:
    k = str(code or "").strip().upper()
    if not (1 <= len(k) <= 2 and k.isascii() and k.isalpha()):
        raise Bad("Xona kodi — 1–2 lotin harfi (masalan A yoki AB): joy kodida turadi (AO1-A-02-03-C)")
    return k


def block_out(b: Block) -> dict[str, Any]:
    return {
        "id": b.pk,
        "code": b.code,
        "full": _xcode(b),
        "name": b.name,
        "building_id": b.building_id,
        "purpose": b.purpose,
        "groups": list(b.groups or []),
    }


def _purpose(v: Any, default: str = Purpose.STORAGE) -> str:
    p = str(v or default)
    if p not in Purpose.values:
        raise Bad("Xona vazifasi noto'g'ri — saqlash, qabul, jo'natish, karantin, sex yoki qaytarish")
    return p


def _groups(v: Any) -> list[str]:
    if v in (None, ""):
        return []
    if not isinstance(v, list):
        raise Bad("Tovar guruhlari — ro'yxat")
    return sorted({str(x).strip()[:120] for x in v if str(x).strip()})[:30]


@transaction.atomic
def add_block(
    store_id: Any, building_id: Any, code: Any, name: Any = "", purpose: Any = None, groups: Any = None
) -> dict[str, Any]:
    """Binoga xona: harfi bino ichida yagona (kodi AO1-A)."""
    wh = wh_ok(store_id)
    try:
        bld = Building.objects.select_related("warehouse").get(pk=int(building_id), warehouse=wh)
    except (Building.DoesNotExist, TypeError, ValueError) as e:
        raise Bad("Bino noto'g'ri — ro'yxatdan tanlang") from e
    k = _xona_code(code)
    if Block.objects.filter(building=bld, code=k).exists():
        raise Bad(f"{K.block(_bcode(bld), k)} — bu binoda {k} xona allaqachon bor")
    b = Block.objects.create(
        warehouse=wh,
        building=bld,
        code=k,
        name=str(name or "").strip()[:120],
        purpose=_purpose(purpose),
        groups=_groups(groups),
    )
    return block_out(b)


@transaction.atomic
def edit_block(pk: Any, name: Any, code: Any = None, purpose: Any = None, groups: Any = None) -> dict[str, Any]:
    """Xona nomi va harfi; harf o'zgarsa — joy kodlari qayta quriladi (yorliqlar qayta chop etiladi)."""
    b = _get(Block.objects.select_for_update().select_related("building__warehouse"), pk, "Xona")
    k = b.code if code in (None, "") else _xona_code(code)
    if k != b.code and Block.objects.filter(building=b.building, code=k).exclude(pk=b.pk).exists():
        raise Bad(f"Bu binoda {k} xona allaqachon bor")
    changed = k != b.code
    b.code = k
    if name is not None:
        b.name = str(name).strip()[:120]
    if purpose is not None:
        b.purpose = _purpose(purpose)
    if groups is not None:
        b.groups = _groups(groups)
    b.save(update_fields=["code", "name", "purpose", "groups"])
    recoded = _recode(Cell.objects.filter(block=b)) if changed else 0
    return {**block_out(b), "recoded": recoded}


@transaction.atomic
def drop_block(pk: Any) -> dict[str, Any]:
    """Xona — stellajlari va joylari bilan (hammasi bo'sh bo'lsa)."""
    b = _get(Block.objects.all(), pk, "Xona")
    cells = Cell.objects.filter(block=b)
    _empty_cells(cells, f"{b.code} xona")
    n = cells.count()
    cells.delete()
    b.delete()
    return {"ok": True, "cells": n}


# ---------------------------------------------------------------- joy: holat, o'chirish
@transaction.atomic
def edit_cell(pk: Any, status: Any = None, code: Any = None) -> dict[str, Any]:
    """Holat (faol / bloklangan / karantin); kod — faqat stellajsiz (erkin) joyda: stellaj joyining kodi tuzilmadan."""
    c = _get(Cell.objects.select_for_update().select_related("warehouse"), pk, "Joy")
    if status is not None:
        if status not in CellStatus.values:
            raise Bad("Holat noto'g'ri — faol, bloklangan yoki karantin")
        c.status = status
    if code not in (None, ""):
        if c.rack_id:
            raise Bad("Stellaj joyining kodi tuzilmadan olinadi — stellaj, xona yoki bino kodini o'zgartiring")
        k = str(code).strip().upper()
        if len(k) > 24 or not all(ch.isascii() and (ch.isalnum() or ch == "-") for ch in k):
            raise Bad("Joy kodi — lotin harf, raqam va «-»")
        if Cell.objects.filter(code=k).exclude(pk=c.pk).exists():
            raise Bad(f"{k} — bunday joy allaqachon bor")
        c.code = k
    c.save(update_fields=["status", "code"])
    return cell_out(c, {})


@transaction.atomic
def drop_cell(pk: Any) -> dict[str, Any]:
    c = _get(Cell.objects.all(), pk, "Joy")
    _empty_cells(Cell.objects.filter(pk=c.pk), "Joy")
    c.delete()
    return {"ok": True}


# ---------------------------------------------------------------- stellajlar
def rack_out(r: Rack) -> dict[str, Any]:
    return {
        "id": r.pk,
        "block_id": r.block_id,
        "number": r.number,
        "code": _rcode(r),
        "name": r.name,
        "rows": r.rows,
        "floors": r.floors,
        "cell_kind": r.cell_kind,
        "capacity": r.capacity,
        "max_width_mm": r.max_width_mm,
    }


def _rack_attrs(body: dict[str, Any], r: Rack | None = None) -> dict[str, Any]:
    """Joy turi, sig'imi (birlik), eng katta eni (mm) — berilmaganlari o'zgarmaydi (yangi: tokcha, cheklovsiz)."""
    out: dict[str, Any] = {}
    if "cell_kind" in body or r is None:
        k = str(body.get("cell_kind") or CellKind.SHELF)
        if k not in CellKind.values:
            raise Bad("Joy turi noto'g'ri — tokcha, rulon, poddon, quti yoki pol")
        out["cell_kind"] = k
    for f, lim, what in (("capacity", 999, "Sig'im (birlik)"), ("max_width_mm", 10000, "Eng katta eni (mm)")):
        if f in body or r is None:
            v = body.get(f)
            if v in (None, "", 0, "0"):
                out[f] = None
                continue
            try:
                n = int(v)
            except (TypeError, ValueError) as e:
                raise Bad(f"{what} — butun son") from e
            if not 1 <= n <= lim:
                raise Bad(f"{what} — 1 dan {lim} gacha")
            out[f] = n
    return out


def _rack_size(rows: Any, floors: Any) -> tuple[int, int]:
    try:
        rw, fl = int(rows), int(floors)
    except (TypeError, ValueError) as e:
        raise Bad("Qatorlar va qavatlar soni — butun son") from e
    if not (1 <= rw <= K.MAX_ROWS and 1 <= fl <= K.MAX_FLOORS):
        raise Bad(f"Qatorlar 1–{K.MAX_ROWS}, qavatlar 1–{K.MAX_FLOORS} (A…{K.FLOORS[-1]}) bo'lsin")
    return rw, fl


def _new_cells(r: Rack, places: list[tuple[int, int]]) -> list[Cell]:
    rc = _rcode(r)
    cs = [Cell(warehouse=r.warehouse, block=r.block, rack=r, row=q, floor=f, code=K.cell(rc, q, f)) for q, f in places]
    if ex := Cell.objects.filter(code__in=[c.code for c in cs]).first():
        raise Bad(f"{ex.code} — bunday joy allaqachon bor")
    return Cell.objects.bulk_create(cs)


@transaction.atomic
def add_rack(
    store_id: Any,
    block_id: Any,
    rows: Any,
    floors: Any,
    name: Any = "",
    count: Any = 1,
    attrs: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Xonaga stellaj(lar): keyingi raqamlar bilan, har biri qatorlar × qavatlar joylari bilan (AO1-A-02-01-A …)."""
    wh = wh_ok(store_id)
    try:
        blk = (
            Block.objects.select_for_update().select_related("building__warehouse").get(pk=int(block_id), warehouse=wh)
        )
    except (Block.DoesNotExist, TypeError, ValueError) as e:
        raise Bad("Xona noto'g'ri — ro'yxatdan tanlang") from e
    if blk.building is None:
        raise Bad("Xona binoga biriktirilmagan — avval binoni tanlang")
    rw, fl = _rack_size(rows, floors)
    try:
        cnt = int(count or 1)
    except (TypeError, ValueError) as e:
        raise Bad("Stellajlar soni — butun son") from e
    if not 1 <= cnt <= 20:
        raise Bad("Bir yo'la 1–20 ta stellaj")
    start = max(Rack.objects.filter(block=blk).values_list("number", flat=True), default=0) + 1
    if start + cnt - 1 > K.MAX_RACKS:
        raise Bad(f"Xonada ko'pi bilan {K.MAX_RACKS} stellaj")
    out, total = [], 0
    for i in range(cnt):
        r = Rack.objects.create(
            warehouse=wh,
            block=blk,
            number=start + i,
            name=str(name or "").strip()[:120],
            rows=rw,
            floors=fl,
            **_rack_attrs(attrs or {}),
        )
        total += len(_new_cells(r, [(q, f) for q in range(1, rw + 1) for f in range(1, fl + 1)]))
        out.append(rack_out(r))
    return {**out[0], "racks": out, "cells": total}


@transaction.atomic
def edit_rack(pk: Any, rows: Any, floors: Any, name: Any = None, attrs: dict[str, Any] | None = None) -> dict[str, Any]:
    """Xarakteristika: qatorlar × qavatlar — yetishmagan joylar qo'shiladi, ortiqchalari (bo'sh bo'lsa) o'chadi."""
    r = _get(Rack.objects.select_for_update().select_related("block__building__warehouse", "warehouse"), pk, "Stellaj")
    rw, fl = _rack_size(rows, floors)
    mine = Cell.objects.filter(rack=r)
    keep = Q(row__gte=1, row__lte=rw, floor__gte=1, floor__lte=fl)
    extra = mine.exclude(keep)
    _empty_cells(extra, f"{_rcode(r)} stellaj")
    have = set(mine.filter(keep).values_list("row", "floor"))
    removed = extra.count()
    extra.delete()
    added = _new_cells(r, [(q, f) for q in range(1, rw + 1) for f in range(1, fl + 1) if (q, f) not in have])
    r.rows, r.floors = rw, fl
    if name is not None:
        r.name = str(name).strip()[:120]
    for f, v in _rack_attrs(attrs or {}, r).items():
        setattr(r, f, v)
    r.save(update_fields=["rows", "floors", "name", "cell_kind", "capacity", "max_width_mm"])
    return {**rack_out(r), "added": len(added), "removed": removed}


@transaction.atomic
def drop_rack(pk: Any) -> dict[str, Any]:
    r = _get(Rack.objects.select_related("block__building__warehouse"), pk, "Stellaj")
    cells = Cell.objects.filter(rack=r)
    _empty_cells(cells, f"{_rcode(r)} stellaj")
    n = cells.count()
    cells.delete()
    r.delete()
    return {"ok": True, "cells": n}


@transaction.atomic
def wizard(body: dict[str, Any]) -> dict[str, Any]:
    """Tuzilma ustasi: bino (bor yoki yangi) → xona (bor yoki yangi harf) → N ta stellaj (qatorlar × qavatlar) — bir yo'la."""
    wh = wh_ok(body.get("store_id"))
    if body.get("building_id"):
        bld = _get(Building.objects.filter(warehouse=wh).select_related("warehouse"), body["building_id"], "Bino")
    else:
        bld_out = add_building(wh.pk, body.get("building_name"), body.get("building_number"))
        bld = Building.objects.select_related("warehouse").get(pk=bld_out["id"])
    k = _xona_code(body.get("block_code"))
    blk = Block.objects.filter(building=bld, code=k).first()
    if blk is None:
        blk = Block.objects.get(
            pk=add_block(wh.pk, bld.pk, k, body.get("block_name") or "", body.get("purpose"), body.get("groups"))["id"]
        )
    r = add_rack(
        wh.pk, blk.pk, body.get("rows"), body.get("floors"), body.get("rack_name") or "", body.get("racks") or 1, body
    )
    return {"building_id": bld.pk, "block_id": blk.pk, "racks": r["racks"], "cells": r["cells"]}


# ---------------------------------------------------------------- joylashtirish tavsiyasi (putaway)
FLOOR_PREF = (2, 3, 1, 4, 5, 6)  # bel balandligi (B, C) — birinchi; keyin pastki, keyin yuqorilar


def putaway(store_id: Any, item_id: Any, width_mm: Any = None, n: Any = 1, limit: int = 5) -> list[dict[str, Any]]:
    """Tovar uchun eng mos joylar (sababi bilan): 1) shu tovar turgan joy (jamlash), 2) guruhiga mos xonadagi bo'sh joy,
    3) boshqa saqlash xonasidagi bo'sh joy; qavat — bel balandligi birinchi. Bloklangan, to'la, eni sig'maydigan,
    saqlash bo'lmagan (qabul, jo'natish, karantin…) xonadagi joylar — tavsiya etilmaydi."""
    wh = wh_ok(store_id)
    it = item(int(item_id or 0))
    try:
        need = max(1, int(n or 1))
    except (TypeError, ValueError):
        need = 1
    w = Decimal(str(width_mm)) if width_mm not in (None, "") else None
    cells = list(
        Cell.objects.filter(
            warehouse=wh, rack__isnull=False, status=CellStatus.ACTIVE, block__purpose=Purpose.STORAGE
        ).select_related("rack", "block")
    )
    occ: dict[int, int] = {}
    mine: set[int] = set()
    for loc_id, iid in live().filter(loc__in=cells).values_list("loc_id", "item_id"):
        occ[loc_id] = occ.get(loc_id, 0) + 1
        if iid == it["id"]:
            mine.add(loc_id)
    grp = it.get("grp") or ""
    out = []
    for c in cells:
        r = c.rack
        if r is None:
            continue
        if r.max_width_mm and w and w > r.max_width_mm:
            continue
        used = occ.get(c.pk, 0)
        if r.capacity and used + need > r.capacity:
            continue
        gs = (c.block.groups or []) if c.block else []
        if c.pk in mine:
            rank, why = 0, "shu tovar shu yerda — jamlash"
        elif grp and grp in gs and not used:
            rank, why = 1, f"«{grp}» xonasi, bo'sh"
        elif grp and grp in gs:
            rank, why = 2, f"«{grp}» xonasi"
        elif not used and not gs:
            rank, why = 3, "bo'sh joy"
        elif not used:
            rank, why = 4, "bo'sh joy (boshqa guruh xonasi)"
        else:
            continue
        fp = FLOOR_PREF.index(c.floor) if c.floor in FLOOR_PREF else 9
        out.append((rank, fp, c.code, c, why, used))
    out.sort(key=lambda x: (x[0], x[1], x[2]))
    return [
        {"id": c.pk, "code": c.code, "reason": why, "units": used, "capacity": c.rack.capacity if c.rack else None}
        for _, _, _, c, why, used in out[:limit]
    ]


def groups() -> list[str]:
    """Katalog tovar guruhlari (xonaga joylashtirish qoidasi uchun)."""
    return sorted({g for x in cat().values() if (g := x.get("grp"))})


def wh_tree(store_id: Any, tg_id: int | None, restricted: bool) -> dict[str, Any]:
    wh = wh_ok(store_id)
    counts: dict[int, int] = {}
    for loc_id in live().filter(loc__isnull=False).values_list("loc_id", flat=True):
        counts[loc_id] = counts.get(loc_id, 0) + 1
    cs = list(Cell.objects.filter(warehouse=wh))
    blocks = []
    for b in Block.objects.filter(warehouse=wh):
        mine_cells = [c for c in cs if c.block_id == b.pk]
        is_mine = tg_id in (b.keepers or []) if b.keepers else True
        if restricted and not is_mine:
            continue
        racks: list[str] = []
        for c in mine_cells:
            r = "-".join(c.code.split("-")[:2])
            if r not in racks:
                racks.append(r)
        blocks.append(
            {
                "id": b.pk,
                "code": b.code,
                "name": b.name,
                "mine": is_mine,
                "racks": [
                    {
                        "code": r,
                        "cells": [
                            {"id": c.pk, "code": c.code, "units": counts.get(c.pk, 0)}
                            for c in mine_cells
                            if c.code == r or c.code.startswith(r + "-")
                        ],
                    }
                    for r in racks
                ],
            }
        )
    return {
        "store": {"id": wh.pk, "name": wh.name},
        "restricted": restricted,
        "blocks": blocks,
        "loose": [{"id": c.pk, "code": c.code, "units": counts.get(c.pk, 0)} for c in cs if not c.block_id],
    }


def unplaced(store_id: Any) -> list[dict[str, Any]]:
    wh = wh_ok(store_id)
    us = list(live().filter(warehouse=wh, loc__isnull=True).exclude(src=""))
    info = cat({u.item_id for u in us})
    return [
        {
            "batch_id": u.pk,
            "name": full_name(info[u.item_id], u.char_id),
            "code": u.code,
            "width_mm": mm(u.width_mm),
            "length_mm": mm(u.length_mm),
            "doc": u.src,
            "firm": u.firm,
            "qty": fl(u.qty),
            "unit": info[u.item_id]["unit"],
            "item_id": u.item_id,
            "since": iso(u.created),  # qabul (yaratilgan) vaqti — joylashni qancha kutyapti
        }
        for u in sorted(us, key=lambda x: x.created)
        if u.item_id in info
    ]


@transaction.atomic
def set_loc(batch_ids: list[Any], loc_id: Any) -> None:
    loc = None
    if loc_id is not None:
        loc = Cell.objects.filter(pk=int(loc_id)).first()
        if loc is None:
            raise Bad("Joy topilmadi — javon stikerini qayta skanerlang")
        if loc.status == CellStatus.BLOCKED:
            loc_ok(loc)
    ids = [int(b) for b in batch_ids]
    for bid in batch_ids:
        u = Unit.objects.select_for_update().filter(pk=int(bid)).first()
        if u is None:
            raise NotFound("Birlik topilmadi")
        if loc and loc.warehouse_id != u.warehouse_id:
            raise Bad(f"{u.code or 'Birlik'}: {u.warehouse.name} da — boshqa ombor javoniga qo'yib bo'lmaydi")
        if loc and u.loc_id != loc.pk:
            loc_ok(loc, width_mm=u.width_mm, exclude=ids)  # shu so'rovdagi birliklar bir-birini sanamaydi
        u.loc = loc
        u.save(update_fields=["loc"])


def qty_of(dims: str | None, w: Decimal | None, length: Decimal | None, q: Decimal | None) -> Decimal:
    if dims == "wl":
        return area(w or ZERO, length or ZERO)
    if dims == "w":
        return Decimal(1)
    return q4(q or ZERO)


def unit_kind(dims: str | None, length: Decimal | None) -> str:
    if dims == "wl":
        return "piece" if (length or ZERO) < 20000 else "roll"
    return "piece" if dims == "w" else "roll"


@transaction.atomic
def count_unit(body: dict[str, Any]) -> dict[str, Any]:
    """Sanashda topilgan yangi birlik (stiker bilan, hisobga sanash hujjati o'tkazilganda kiradi)."""
    item_id = int(body.get("item_id") or 0)
    it = item(item_id)
    if not it["dims"]:
        raise Bad("Donali tovarga birlik stikeri chiqmaydi — miqdorini sanash hujjatiga yozing")
    w = dec_or_none(body.get("width_mm"), "Eni")
    length = dec_or_none(body.get("length_mm"), "Uzunligi")
    q = dec_or_none(body.get("qty"))
    qty = qty_of(it["dims"], w, length, q)
    if qty <= 0:
        raise Bad("O'lchamni kiriting")
    loc = Cell.objects.filter(pk=int(body["loc_id"])).first() if body.get("loc_id") else None
    if loc:
        loc_ok(loc, width_mm=w)
    u = new_unit(
        item_id=item_id,
        firm=firm_ok(body.get("firm")),
        warehouse=wh_ok(body.get("warehouse_id")),
        loc=loc,
        kind=unit_kind(it["dims"], length),
        width_mm=w,
        length_mm=qty * 1000 if it["dims"] == "l" else length,
        qty=qty,
        pending=True,
    )
    return {
        "batch_id": u.pk,
        "code": u.code,
        "qty": fl(u.qty),
        "width_mm": mm(u.width_mm),
        "length_mm": mm(u.length_mm),
        "existing": False,
    }


@transaction.atomic
def drop_unit(pk: int) -> None:
    u = Unit.objects.select_for_update().filter(pk=pk).first()
    if u is None:
        raise NotFound("Birlik topilmadi")
    if not u.pending:
        raise Bad("Hisobdagi birlikni o'chirib bo'lmaydi — hisobdan chiqarish hujjati kerak")
    u.delete()


# ---------------------------------------------------------------- hujjatlar
def doc_out(d: Doc) -> dict[str, Any]:
    f = Firm.objects.filter(code=d.firm).first()
    return {
        "id": d.pk,
        "number": d.number,
        "kind": d.kind,
        "status": d.status,
        "firm_id": f.pk if f else 0,
        "warehouse_id": d.warehouse_id,
        "author": d.author,
        "date": iso(d.date),
        "updated": iso(d.updated),
        "version": d.version,
        "data": d.data,
        "lines": d.lines,
    }


def docs_list(kind: str, status: str, limit: int) -> list[dict[str, Any]]:
    qs = Doc.objects.all()
    if kind:
        qs = qs.filter(kind=kind)
    if status:
        qs = qs.filter(status=status)
    return [
        {
            "id": d.pk,
            "number": d.number,
            "warehouse_id": d.warehouse_id,
            "author": d.author,
            "date": iso(d.date),
            "updated": iso(d.updated),
        }
        for d in qs.order_by("-updated")[: max(1, min(limit, 500))]
    ]


def _lines(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out = []
    for ln in raw:
        if not isinstance(ln, dict):
            continue
        out.append(
            {
                "item_id": int(ln.get("item_id") or 0),
                "char_id": ln.get("char_id") or None,
                "batch_id": ln.get("batch_id") or None,
                "qty": str(ln.get("qty") if ln.get("qty") is not None else ""),
                "data": ln.get("data") or {},
            }
        )
    return out


@transaction.atomic
def doc_create(body: dict[str, Any], tg_id: int | None) -> dict[str, Any]:
    kind = str(body.get("kind") or "")
    if kind not in USER_KINDS:
        raise Bad("Hujjat turi noto'g'ri")
    h = body.get("header") or {}
    t = now()
    wh = wh_ok(h.get("warehouse_id"))
    to = wh_ok(h["warehouse_to"]) if h.get("warehouse_to") else None
    if kind == "transfer" and (to is None or to.pk == wh.pk):
        raise Bad("Qayerga — boshqa omborni tanlang")
    data = dict(h.get("data") or {})
    if h.get("base_id"):
        data["base_id"] = h["base_id"]
    d = Doc.objects.create(
        kind=kind,
        firm=firm_ok(body.get("firm")),
        warehouse=wh,
        warehouse_to=to,
        author=tg_id,
        date=t,
        updated=t,
        data=data,
        lines=_lines(body.get("lines")),
    )
    return doc_out(d)


def _draft(pk: int, version: Any) -> Doc:
    d = Doc.objects.select_for_update().filter(pk=pk).first()
    if d is None:
        raise NotFound("Hujjat topilmadi")
    if d.status != DocStatus.DRAFT:
        raise Bad("Hujjat allaqachon o'tkazilgan")
    if int(version or 0) != d.version:
        raise Conflict("Hujjatni boshqa joyda o'zgartirishgan — sahifani yangilang")
    return d


@transaction.atomic
def doc_save(pk: int, body: dict[str, Any]) -> dict[str, Any]:
    d = _draft(pk, body.get("version"))
    h = body.get("header") or {}
    if h.get("warehouse_id"):
        d.warehouse = wh_ok(h["warehouse_id"])
    if "warehouse_to" in h:
        d.warehouse_to = wh_ok(h["warehouse_to"]) if h["warehouse_to"] else None
    if h.get("data") is not None:
        d.data = {**dict(h["data"]), **({"base_id": d.data["base_id"]} if "base_id" in d.data else {})}
    if body.get("lines") is not None:
        d.lines = _lines(body["lines"])
    d.version += 1
    d.updated = now()
    d.save()
    return doc_out(d)


@transaction.atomic
def supervisor(user: Any) -> bool:
    """Farqni tasdiqlay oladi: egasi, admin yoki rahbariyat bo'limi."""
    return getattr(user, "role", "") in ("owner", "admin") or bool(getattr(user, "in_lead_dept", lambda: False)())


def tolerance(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sanash natijasi qatorlariga: sinf, tannarx, farq summasi va toleransga mosligi (`ok`)."""
    metas = meta({int(r["item_id"]) for r in rows})
    out = []
    for r in rows:
        m = metas.get(int(r["item_id"]))
        cls = m.cls if m else "C"
        cost = m.cost if m else ZERO
        book, cnt = dec(r["book"]), dec(r["counted"])
        diff = abs(cnt - book)
        value = q4(diff * cost)
        pct, cap = TOL.get(cls, TOL["C"])
        ok = diff <= EPS or (book > EPS and diff / book * 100 <= pct and value <= cap)
        out.append({**r, "cls": cls, "value": fl(value), "ok": bool(ok)})
    return out


class _DryRun(Exception):
    pass


def inventory_review(pk: int, user: Any) -> dict[str, Any]:
    """Sanashni o'tkazishdan oldin ko'rish (hech narsa o'zgarmaydi): har pozitsiya — hisob, sanaldi, farq, summa,
    toleransga mosligi; toleransdan katta farqlar — qayta sanash yoki rahbar tasdig'i (`need`)."""
    d = Doc.objects.filter(pk=pk, kind="inventory", status=DocStatus.DRAFT).first()
    if d is None:
        raise NotFound("Qoralama sanash topilmadi")
    data0 = dict(d.data or {})
    rows: list[dict[str, Any]] = []
    try:
        with transaction.atomic():
            post_inventory(d, now())
            rows = list(d.data.get("result") or [])
            raise _DryRun
    except _DryRun:
        pass
    finally:
        d.data = data0
    info = cat({int(r["item_id"]) for r in rows})
    rows = [
        {**r, "name": full_name(info[r["item_id"]], None) if r["item_id"] in info else f"#{r['item_id']}"}
        for r in tolerance(rows)
    ]
    bad = [r for r in rows if not r["ok"]]
    return {
        "lines": rows,
        "positions": len(rows),
        "need": len(bad),
        "value": fl(sum((dec(r["value"]) for r in bad), ZERO)),
        "can_approve": supervisor(user),
        "reasons": [{"code": k, "title": v} for k, v in REASONS.items()],
    }


def doc_post(pk: int, body: dict[str, Any], user: Any) -> dict[str, Any]:
    d = _draft(pk, body.get("version"))
    if d.kind == "inventory":
        rv = inventory_review(pk, user)
        if rv["need"]:
            # toleransdan katta farq: rahbar tasdig'i + sabab bo'lmasa — o'tkazilmaydi (tasodifiy nollashdan himoya)
            reason = str(body.get("reason") or "")
            if not body.get("approve"):
                raise Conflict(
                    f"{rv['need']} ta pozitsiyada farq toleransdan katta — qayta sanang yoki rahbar tasdiqlasin"
                )
            if not supervisor(user):
                raise Conflict("Katta farqni faqat rahbar (egasi, admin) tasdiqlay oladi")
            if reason not in REASONS:
                raise Bad("Farq sababini tanlang")
            d.data = {
                **d.data,
                "reason": REASONS[reason],
                "approval": {
                    "by": getattr(user, "name", ""),
                    "tg_id": getattr(user, "tg_id", None),
                    "reason": reason,
                    "need": rv["need"],
                },
            }
    if d.kind == "writeoff":
        _writeoff_check(d, body, user)
    t = now()
    d.number = next_number(d.kind, t)
    ledger.bind(op=d.kind, doc=d, reason=str((d.data or {}).get("reason") or (d.data or {}).get("comment") or ""))
    by = getattr(user, "name", "") or ""
    if d.kind == "cut":
        post_cut(d, by, t)
    elif d.kind == "inventory":
        post_inventory(d, t)
    elif d.kind in ("transfer", "writeoff"):
        post_move(d, off=d.kind == "writeoff")
    elif d.kind == "acceptance":
        post_acceptance(d)
    d.status = DocStatus.POSTED
    d.version += 1
    d.date = t
    d.updated = t
    d.save()
    sweep()
    return doc_out(d)


def _unit_for_update(pk: Any) -> Unit:
    u = Unit.objects.select_for_update().select_related("warehouse").filter(pk=int(pk or 0)).first()
    if u is None:
        raise Bad("Birlik topilmadi — stikerni qayta skanerlang")
    return u


def cut_unit(
    u: Unit,
    it: dict[str, Any],
    *,
    w: Decimal | None,
    length: Decimal | None,
    q: Decimal | None,
    by: str,
    at: datetime,
    number: str,
    job: str | None = None,
    to: Warehouse | None = None,
    rests_manual: list[tuple[Decimal, Decimal]] | None = None,
) -> tuple[Unit, list[Unit], Decimal]:
    """Birlikdan bo'lak kesish → (bo'lak, qoldiqlar, chiqindi). Lenta (wl) — giliotina: bo'lak eni × uzunligi, yon
    qoldiq (eni < 100 mm — chiqindi), rulon qisqaradi (< 100 mm — chiqindi). `rests_manual` — ishchi o'lchagan
    qoldiqlar (avtomatik hisob o'rniga). Rukav (w) — enidan kesiladi. Rulon/uzunlik — miqdordan."""
    if u.pending or u.qty <= EPS:
        raise Bad(f"{u.code}: qoldig'i yo'q")
    made = {"kind": "cut", "by_name": by, "posted_at": iso(at), "job": job}
    rests: list[Unit] = []
    scrap = ZERO
    dims = it["dims"]
    wh = to or u.warehouse
    if dims == "wl":
        if not (w and length and w > 0 and length > 0):
            raise Bad("Bo'lak eni va uzunligini (mm) kiriting")
        width, total_len = u.width_mm or ZERO, u.length_mm or ZERO
        w, length = Decimal(w), Decimal(length)
        if w > width + EPS or length > total_len + EPS:
            raise Bad(f"{u.code}: {mm(width)}×{mm(total_len)} mm — {mm(w)}×{mm(length)} sig'maydi")
        piece = new_unit(
            item_id=u.item_id,
            char_id=u.char_id,
            firm=u.firm,
            warehouse=wh,
            kind="piece",
            width_mm=w,
            length_mm=length,
            qty=area(w, length),
            parent_code=u.code or "",
            made=made,
        )
        before = u.qty
        if rests_manual is not None:
            # ishchi o'lchagan qoldiqlar: asl birlik yopiladi, har qoldiq — yangi stiker
            for rw, rl in rests_manual:
                if rw <= 0 or rl <= 0:
                    raise Bad("Har qoldiqning eni va uzunligini kiriting")
                rests.append(
                    new_unit(
                        item_id=u.item_id,
                        char_id=u.char_id,
                        firm=u.firm,
                        warehouse=u.warehouse,
                        loc=u.loc,
                        kind="piece",
                        width_mm=rw,
                        length_mm=rl,
                        qty=area(rw, rl),
                        parent_code=u.code or "",
                    )
                )
            rest_area = sum((r.qty for r in rests), ZERO)
            if rest_area + piece.qty > before + EPS:
                raise Bad(
                    f"{u.code}: bo'lak va qoldiqlar birlikdan katta ({fl(rest_area + piece.qty)} > {fl(before)} m²)"
                )
            scrap = q4(before - piece.qty - rest_area)
            u.qty = ZERO
            u.length_mm = ZERO
        else:
            if width - w > EPS:
                side = area(width - w, length)
                if width - w < SCRAP_MM:
                    scrap += side
                else:
                    rests.append(
                        new_unit(
                            item_id=u.item_id,
                            char_id=u.char_id,
                            firm=u.firm,
                            warehouse=u.warehouse,
                            loc=u.loc,
                            kind="piece",
                            width_mm=width - w,
                            length_mm=length,
                            qty=side,
                            parent_code=u.code or "",
                        )
                    )
            new_len = total_len - length
            u.length_mm = new_len
            u.qty = area(width, new_len)
            if new_len < SCRAP_MM:
                scrap += u.qty
                u.qty = ZERO
                u.length_mm = ZERO
            else:
                rests.insert(0, u)
    elif dims == "w":
        cw = w if w is not None else q
        width = u.width_mm or ZERO
        if cw is None or cw <= 0 or cw > width + EPS:
            raise Bad(f"{u.code}: eni {mm(width)} mm — {mm(cw)} mm kesib bo'lmaydi")
        piece = new_unit(
            item_id=u.item_id,
            char_id=u.char_id,
            firm=u.firm,
            warehouse=wh,
            kind="piece",
            width_mm=cw,
            qty=Decimal(1),
            parent_code=u.code or "",
            made=made,
        )
        new_w = width - cw
        u.width_mm = new_w
        if new_w < Decimal(5):  # kesib bo'lmaydigan tor qoldiq
            u.qty = ZERO
        else:
            rests.append(u)
    else:
        if q is None or q <= 0 or q > u.qty + EPS:
            raise Bad(f"{u.code}: {fl(u.qty)} {it['unit']} bor — {fl(q)} kesib bo'lmaydi")
        piece = new_unit(
            item_id=u.item_id,
            char_id=u.char_id,
            firm=u.firm,
            warehouse=wh,
            kind="piece",
            length_mm=q * 1000 if dims == "l" else None,
            qty=q,
            parent_code=u.code or "",
            made=made,
        )
        u.qty = q4(u.qty - q)
        if dims == "l":
            u.length_mm = (u.qty * 1000).quantize(Decimal(1))
        if u.qty > EPS:
            rests.append(u)
    u.cuts = [
        *(u.cuts or []),
        {
            "by_name": by,
            "posted_at": iso(at),
            "job": job,
            "number": number,
            "width_mm": mm(piece.width_mm),
            "length_mm": mm(piece.length_mm),
            "qty": fl(piece.qty),
        },
    ]
    u.save()
    return piece, rests, q4(scrap)


def post_cut(d: Doc, by: str, at: datetime) -> None:
    scrap_all = ZERO
    used = ZERO
    out = []
    for ln in d.lines:
        u = _unit_for_update(ln.get("batch_id"))
        it = item(u.item_id)
        data = ln.get("data") or {}
        piece, rests, scrap = cut_unit(
            u,
            it,
            w=dec_or_none(data.get("width_mm"), "Eni") if it["dims"] == "wl" else None,
            length=dec_or_none(data.get("length_mm"), "Uzunligi"),
            q=dec_or_none(ln.get("qty")),
            by=by,
            at=at,
            number=d.number or "",
        )
        scrap_all += scrap
        used += piece.qty + scrap
        out.append(
            {
                **ln,
                "qty": str(fl(piece.qty)),
                "data": {**data, "pieces": [piece.pk], "rests": [r.pk for r in rests], "scrap": fl(scrap)},
            }
        )
    d.lines = out
    d.data = {**d.data, "scrap": fl(scrap_all), "used": fl(used)}


def post_inventory(d: Doc, at: datetime) -> None:
    wh = d.warehouse
    result: list[dict[str, Any]] = []
    touched: set[int] = set()
    counted_items: set[int] = set()
    for ln in d.lines:
        counted = dec(ln.get("qty"), "Sanalgan miqdor")
        if counted < 0:
            raise Bad("Sanalgan miqdor manfiy bo'lmaydi")
        if ln.get("batch_id"):
            u = _unit_for_update(ln["batch_id"])
            here = not u.pending and u.warehouse_id == wh.pk
            moved = u.warehouse_id if (not u.pending and u.warehouse_id != wh.pk and u.qty > EPS) else None
            book = u.qty if here else ZERO
            u.qty = q4(counted)
            u.warehouse = wh
            u.pending = False
            u.save()
            touched.add(u.pk)
            result.append(
                {
                    "item_id": u.item_id,
                    "batch_id": u.pk,
                    "book": fl(book),
                    "counted": fl(counted),
                    "diff": fl(counted - book),
                    "moved_from": moved,
                }
            )
            counted_items.add(u.item_id)
        else:
            item_id = int(ln.get("item_id") or 0)
            item(item_id)
            char_id = ln.get("char_id") or None
            data = ln.get("data") or {}
            f = Firm.objects.filter(pk=int(data["firm_id"])).first() if data.get("firm_id") else None
            firm = f.code if f else d.firm
            lots = list(
                live()
                .select_for_update()
                .filter(kind="lot", code__isnull=True, item_id=item_id, char_id=char_id, firm=firm, warehouse=wh)
            )
            book = sum((u.qty for u in lots), ZERO)
            for u in lots:
                u.qty = ZERO
                u.save(update_fields=["qty"])
                touched.add(u.pk)
            if counted > EPS:
                touched.add(add_lot(item_id, char_id, firm, wh, None, counted).pk)
            result.append(
                {
                    "item_id": item_id,
                    "batch_id": None,
                    "book": fl(book),
                    "counted": fl(counted),
                    "diff": fl(counted - book),
                    "moved_from": None,
                }
            )
            counted_items.add(item_id)
    scope = d.data.get("scope")
    scope_items = {int(x) for x in d.data.get("items") or []} if scope == "items" else None
    if scope == "full" or scope_items is not None:
        rest = live().select_for_update().filter(warehouse=wh).exclude(pk__in=touched)
        if scope_items is not None:
            rest = rest.filter(item_id__in=scope_items)
        for u in rest:
            result.append(
                {
                    "item_id": u.item_id,
                    "batch_id": u.pk if u.code else None,
                    "book": fl(u.qty),
                    "counted": 0,
                    "diff": fl(-u.qty),
                    "moved_from": None,
                }
            )
            u.qty = ZERO
            u.save(update_fields=["qty"])
        if scope_items:
            counted_items |= scope_items
    touch_count(counted_items, at)
    result = tolerance(result)
    d.data = {
        **d.data,
        "result": result,
        "positions": len(result),
        "diff": sum(1 for r in result if abs(r["diff"] or 0) > float(EPS)),
        "ok": sum(1 for r in result if r["ok"]),
    }


def _road() -> Warehouse:
    road = Warehouse.objects.filter(kind=WhKind.TRANSIT, active=True).first()
    if road is None:
        raise Bad("«Yo'lda» ombori yo'q")
    return road


def post_move(d: Doc, *, off: bool) -> None:
    """Hisobdan chiqarish — qoldiq 0; ko'chirish — tovar avval «Yo'lda» omboriga o'tadi (jahon amaliyoti: in-transit),
    qabul qiluvchi ombor skanerlab yoki «hammasi keldi» bilan qabul qiladi (`transfer_receive`)."""
    to = d.warehouse_to
    if not off and to is None:
        raise Bad("Qayerga — omborni tanlang")
    road = None if off else _road()
    units: list[int] = []
    lots: list[dict[str, Any]] = []
    for ln in d.lines:
        if ln.get("batch_id"):
            u = _unit_for_update(ln["batch_id"])
            if u.qty <= EPS or u.pending or u.warehouse_id != d.warehouse_id:
                raise Bad(f"Birlik {u.code or ''} {d.warehouse.name} da emas")
            if off:
                u.qty = ZERO
            elif road is not None:
                u.warehouse = road
                u.loc = None
                units.append(u.pk)
            u.save()
        else:
            q = dec(ln.get("qty"))
            if q <= 0:
                raise Bad("Miqdorni kiriting")
            item_id = int(ln.get("item_id") or 0)
            take_lots(item_id, ln.get("char_id") or None, d.firm, d.warehouse, q)
            if road is not None:
                add_lot(item_id, ln.get("char_id") or None, d.firm, road, None, q, src=d.number or "")
                lots.append({"item_id": item_id, "char_id": ln.get("char_id") or None, "qty": fl(q)})
    if road is not None:
        d.data = {**d.data, "transit": True, "units": units, "lots": lots, "received": [], "lots_done": not lots}


WRITEOFF_LIMIT = Decimal(500_000)  # hisobdan chiqarish summasi (so'm) shundan oshsa — rahbar tasdig'i
OFF_REASONS: dict[str, str] = {
    "defect": "Brak (ishlab chiqarish nuqsoni)",
    "damage": "Shikastlangan",
    "shortage": "Kamomad",
    "scrap": "Chiqindi (kesish qoldig'i)",
    "expired": "Yaroqlilik muddati o'tgan",
    "other": "Boshqa",
}


def _writeoff_check(d: Doc, body: dict[str, Any], user: Any) -> None:
    """Hisobdan chiqarish: sabab majburiy; summasi (tannarx × miqdor) chegaradan oshsa — rahbar tasdig'i."""
    reason = str((d.data or {}).get("reason") or body.get("reason") or "").strip()
    if not reason:
        raise Bad("Hisobdan chiqarish sababini ko'rsating")
    metas = meta({int(ln.get("item_id") or 0) for ln in d.lines})
    value = ZERO
    for ln in d.lines:
        q = dec(ln.get("qty"))
        if ln.get("batch_id"):
            u = Unit.objects.filter(pk=int(ln["batch_id"])).first()
            q = u.qty if u else q
        m = metas.get(int(ln.get("item_id") or 0))
        value += q * (m.cost if m else ZERO)
    value = q4(value)
    if value > WRITEOFF_LIMIT:
        if not body.get("approve"):
            raise Conflict(
                f"Summa {fl(value):,.0f} so'm — {fl(WRITEOFF_LIMIT):,.0f} dan katta: rahbar tasdig'i kerak".replace(
                    ",", " "
                )
            )
        if not supervisor(user):
            raise Conflict("Katta summani faqat rahbar (egasi, admin) tasdiqlay oladi")
        d.data = {
            **d.data,
            "approval": {"by": getattr(user, "name", ""), "tg_id": getattr(user, "tg_id", None), "value": fl(value)},
        }
    d.data = {**d.data, "reason": reason, "value": fl(value)}


# ---------------------------------------------------------------- yo'ldagi ko'chirish — qabul qiluvchi ombor
def transit_out(d: Doc) -> dict[str, Any]:
    data = d.data or {}
    rec = set(data.get("received") or [])
    us = list(Unit.objects.filter(pk__in=data.get("units") or []))
    info = cat({u.item_id for u in us} | {int(x["item_id"]) for x in data.get("lots") or []})
    nm = lambda i, c=None: full_name(info[i], c) if i in info else f"#{i}"
    return {
        "id": d.pk,
        "number": d.number,
        "date": iso(d.date),
        "from": d.warehouse.name,
        "to_id": d.warehouse_to_id,
        "to": d.warehouse_to.name if d.warehouse_to else "",
        "firm": d.firm,
        "units": [
            {
                "batch_id": u.pk,
                "code": u.code,
                "name": nm(u.item_id, u.char_id),
                "qty": fl(u.qty),
                "width_mm": mm(u.width_mm),
                "length_mm": mm(u.length_mm),
                "received": u.pk in rec,
            }
            for u in us
        ],
        "lots": [{**x, "name": nm(int(x["item_id"]), x.get("char_id"))} for x in data.get("lots") or []],
        "lots_done": bool(data.get("lots_done")),
        "done": bool(data.get("done")),
    }


def transfers_incoming(store_id: Any) -> list[dict[str, Any]]:
    """Shu omborga yo'lda kelayotgan ko'chirishlar (hali to'liq qabul qilinmagan)."""
    wh = wh_ok(store_id)
    # JSON kalit bo'lmasa SQLite'da exclude() hujjatni ham chiqarib tashlaydi — filtr Python'da
    ds = Doc.objects.filter(kind="transfer", status=DocStatus.POSTED, warehouse_to=wh).select_related(
        "warehouse", "warehouse_to"
    )
    return [transit_out(d) for d in ds.order_by("date") if (d.data or {}).get("transit") and not d.data.get("done")]


@transaction.atomic
def transfer_receive(pk: int, body: dict[str, Any]) -> dict[str, Any]:
    """Yo'ldagi ko'chirishni qabul qilish: `batch_ids` — skanerlangan birliklar; `all` — qolgan hammasi (partiyalar ham).
    Kelgan tovar qabul qiluvchi omborning joylash navbatiga tushadi (src = hujjat raqami)."""
    d = Doc.objects.select_for_update().filter(pk=pk, kind="transfer", status=DocStatus.POSTED).first()
    if d is None or not (d.data or {}).get("transit"):
        raise NotFound("Yo'ldagi ko'chirish topilmadi")
    if d.data.get("done"):
        raise Bad("Bu ko'chirish allaqachon qabul qilingan")
    ledger.bind(op="transfer_receive", doc=d)
    to = d.warehouse_to
    assert to is not None
    road = _road()
    rec = set(d.data.get("received") or [])
    want = set(d.data.get("units") or []) - rec
    take = want if body.get("all") else want & {int(x) for x in body.get("batch_ids") or []}
    if not body.get("all") and not take and not body.get("lots"):
        raise Bad("Bu birlik shu ko'chirishda yo'q yoki allaqachon qabul qilingan")
    for u in Unit.objects.select_for_update().filter(pk__in=take, warehouse=road):
        u.warehouse, u.loc, u.src = to, None, d.number or ""
        u.save()
        rec.add(u.pk)
    lots_done = bool(d.data.get("lots_done"))
    if not lots_done and (body.get("all") or body.get("lots")):
        for x in d.data.get("lots") or []:
            need = dec(x["qty"])
            for lot in (
                Unit.objects.select_for_update()
                .filter(
                    warehouse=road,
                    kind="lot",
                    code__isnull=True,
                    item_id=x["item_id"],
                    char_id=x.get("char_id"),
                    firm=d.firm,
                    qty__gt=0,
                )
                .order_by("qty")
            ):
                use = min(lot.qty, need)
                lot.qty = q4(lot.qty - use)
                lot.save(update_fields=["qty"])
                need -= use
                if need <= EPS:
                    break
            add_lot(
                int(x["item_id"]),
                x.get("char_id"),
                d.firm,
                to,
                None,
                dec(x["qty"]) - max(need, ZERO),
                src=d.number or "",
            )
        lots_done = True
    done = rec >= set(d.data.get("units") or []) and lots_done
    d.data = {
        **d.data,
        "received": sorted(rec),
        "lots_done": lots_done,
        "done": done,
        **({"arrived_at": iso(now())} if done else {}),
    }
    d.save(update_fields=["data"])
    return transit_out(d)


# ---------------------------------------------------------------- to'ldirish (replenishment)
def _have(wh: Warehouse, item_ids: Iterable[int]) -> dict[int, Decimal]:
    out: dict[int, Decimal] = {}
    for iid, q in live().filter(warehouse=wh, item_id__in=list(item_ids)).values_list("item_id", "qty"):
        out[iid] = out.get(iid, ZERO) + q
    return out


def levels(store_id: Any) -> list[dict[str, Any]]:
    wh = wh_ok(store_id)
    ls = list(StockLevel.objects.filter(warehouse=wh))
    info = cat({x.item_id for x in ls})
    have = _have(wh, [x.item_id for x in ls])
    return [
        {
            "id": x.pk,
            "item_id": x.item_id,
            "name": info[x.item_id]["name"] if x.item_id in info else f"#{x.item_id}",
            "unit": info.get(x.item_id, {}).get("unit", ""),
            "min_qty": fl(x.min_qty),
            "max_qty": fl(x.max_qty),
            "have": fl(have.get(x.item_id, ZERO)),
        }
        for x in ls
    ]


@transaction.atomic
def level_set(body: dict[str, Any]) -> dict[str, Any]:
    wh = wh_ok(body.get("store_id"))
    it = item(int(body.get("item_id") or 0))
    mn, mx = dec(body.get("min_qty"), "Min"), dec(body.get("max_qty"), "Max")
    if mn <= 0 or mx < mn:
        raise Bad("Min > 0 va Max ≥ Min bo'lsin")
    lv, _ = StockLevel.objects.update_or_create(warehouse=wh, item_id=it["id"], defaults={"min_qty": mn, "max_qty": mx})
    return next(x for x in levels(wh.pk) if x["id"] == lv.pk)


def level_drop(pk: Any) -> dict[str, Any]:
    n = StockLevel.objects.filter(pk=int(pk or 0)).delete()[0]
    if not n:
        raise NotFound("Me'yor topilmadi")
    return {"ok": True}


def replenish(store_id: Any, from_id: Any = None) -> dict[str, Any]:
    """To'ldirish taklifi: me'yori bor tovarlar — qoldiq min'dan kam bo'lsa max'gacha (manba ombordagi bor qoldiqdan)."""
    wh = wh_ok(store_id)
    src = (
        wh_ok(from_id)
        if from_id
        else Warehouse.objects.filter(kind=WhKind.STORE, active=True).exclude(pk=wh.pk).first()
    )
    ls = levels(wh.pk)
    avail = _have(src, [x["item_id"] for x in ls]) if src else {}
    rows = []
    for x in ls:
        have = dec(x["have"])
        if have >= dec(x["min_qty"]):
            continue
        need = dec(x["max_qty"]) - have
        a = avail.get(x["item_id"], ZERO)
        rows.append({**x, "need": fl(need), "available": fl(a), "suggest": fl(min(need, a))})
    return {"from_id": src.pk if src else None, "from": src.name if src else None, "rows": rows}


def post_acceptance(d: Doc) -> None:
    inc = Incoming.objects.select_for_update().filter(pk=int(d.data.get("base_id") or 0), done=False).first()
    if inc is None:
        raise Bad("Kirim topilmadi yoki allaqachon qabul qilingan")
    to = d.warehouse_to or d.warehouse
    if to.kind == WhKind.TRANSIT:
        raise Bad("Qabul qilinadigan omborni tanlang («Yo'lda» emas)")
    info = cat({int(ln.get("item_id") or 0) for ln in d.lines} | {i["item_id"] for i in inc.items})
    for ln in d.lines:
        item_id = int(ln.get("item_id") or 0)
        it = info.get(item_id)
        if it is None:
            raise Bad(f"Tovar #{item_id} topilmadi")
        q = dec(ln.get("qty"))
        if q <= 0:
            continue
        char_id = ln.get("char_id") or None
        if it["dims"]:
            data = ln.get("data") or {}
            w = dec_or_none(data.get("width_mm"), "Eni")
            new_unit(
                item_id=item_id,
                char_id=char_id,
                firm=inc.firm,
                warehouse=to,
                kind="roll",
                qty=q,
                width_mm=w,
                length_mm=q * 1000
                if it["dims"] == "l"
                else (q * 1_000_000 / w if (it["dims"] == "wl" and w) else None),
                src=d.number or "",
            )
        else:
            add_lot(item_id, char_id, inc.firm, to, None, q, src=d.number or "")

    def got(i: dict[str, Any]) -> Decimal:
        return sum(
            (
                dec(ln.get("qty"))
                for ln in d.lines
                if int(ln.get("item_id") or 0) == i["item_id"]
                and (ln.get("char_id") or None) == (i.get("char_id") or None)
            ),
            ZERO,
        )

    result: list[dict[str, Any]] = [
        {
            "item_id": i["item_id"],
            "name": info[i["item_id"]]["name"] if i["item_id"] in info else f"#{i['item_id']}",
            "expected": i["qty"],
            "counted": fl(got(i)),
            "diff": fl(got(i) - dec(i["qty"])),
        }
        for i in inc.items
    ]
    planned = {(i["item_id"], i.get("char_id") or None) for i in inc.items}
    extra: dict[tuple[int, Any], Decimal] = {}
    for ln in d.lines:  # rejadan tashqari kelgan tovar — farqda «+»
        k = (int(ln.get("item_id") or 0), ln.get("char_id") or None)
        if k not in planned and dec(ln.get("qty")) > 0:
            extra[k] = extra.get(k, ZERO) + dec(ln.get("qty"))
    result += [
        {"item_id": k[0], "name": info[k[0]]["name"], "expected": 0, "counted": fl(q), "diff": fl(q), "extra": True}
        for k, q in extra.items()
    ]
    final = bool(d.data.get("final", True))
    if final:
        inc.done = True
    else:
        inc.items = [{**i, "qty": fl(dec(i["qty"]) - got(i))} for i in inc.items if dec(i["qty"]) - got(i) > EPS]
        inc.done = not inc.items
    inc.save()
    d.data = {**d.data, "result": result if final else [r for r in result if (r["diff"] or 0) > 0], "firm": inc.firm}


# ---------------------------------------------------------------- kutilgan kirim (ASN) va qabul ko'rsatkichi
@transaction.atomic
def incoming_create(body: dict[str, Any]) -> dict[str, Any]:
    """Kutilgan kirim: ta'minotchi, firma, kutilgan sana, tovarlar [{item_id, char_id?, qty}] — «Yo'lda» omborida kutadi."""
    road = Warehouse.objects.filter(kind=WhKind.TRANSIT, active=True).first()
    if road is None:
        raise Bad("«Yo'lda» ombori yo'q")
    raw = body.get("items") or []
    if not isinstance(raw, list) or not raw:
        raise Bad("Kamida bitta tovar qo'shing")
    info = cat({int(x.get("item_id") or 0) for x in raw})
    items = []
    for x in raw:
        iid = int(x.get("item_id") or 0)
        if iid not in info:
            raise Bad(f"Tovar #{iid} topilmadi")
        q = dec(x.get("qty"))
        if q <= 0:
            raise Bad(f"{info[iid]['name']}: miqdor 0 dan katta bo'lsin")
        items.append({"item_id": iid, "char_id": x.get("char_id") or None, "qty": fl(q)})
    exp = None
    if body.get("expected"):
        try:
            exp = datetime.fromisoformat(str(body["expected"]))
        except ValueError as e:
            raise Bad("Sana noto'g'ri") from e
        if timezone.is_naive(exp):
            exp = timezone.make_aware(exp)
    inc = Incoming.objects.create(
        number=next_number("incoming"),
        supplier=str(body.get("supplier") or "").strip()[:255],
        firm=firm_ok(body.get("firm")),
        warehouse=road,
        expected=exp,
        items=items,
    )
    return next(x for x in incoming() if x["id"] == inc.pk)


@transaction.atomic
def incoming_cancel(pk: Any) -> dict[str, Any]:
    inc = Incoming.objects.select_for_update().filter(pk=int(pk or 0), done=False).first()
    if inc is None:
        raise NotFound("Kirim topilmadi yoki yakunlangan")
    if Doc.objects.filter(kind="acceptance", status=DocStatus.POSTED, data__base_id=inc.pk).exists():
        raise Conflict("Qisman qabul qilingan — bekor qilib bo'lmaydi, qabulni yakunlang")
    inc.delete()
    return {"ok": True}


def dock_to_stock(store_id: Any, days: int = 30) -> dict[str, Any]:
    """Qabuldan joylashgacha (dock-to-stock): qabul qilingan birlik yaratilishidan birinchi marta joyga qo'yilguncha —
    o'rtacha, median, 2 soat ichidagilar ulushi (jahon yaxshi ko'rsatkichi ≤ 2 soat); kutayotganlar va eng eskisi."""
    from statistics import median

    from .models import StockMove

    wh = wh_ok(store_id)
    since = now() - timedelta(days=max(1, min(int(days or 30), 365)))
    us = list(Unit.objects.filter(warehouse=wh, created__gte=since).exclude(src=""))
    first: dict[int, datetime] = {}
    for uid, at in (
        StockMove.objects.filter(unit__in=us, loc_to__isnull=False).order_by("id").values_list("unit_id", "at")
    ):
        first.setdefault(uid, at)
    hours = [(first[u.pk] - u.created).total_seconds() / 3600 for u in us if u.pk in first]
    waiting = [u for u in live().filter(warehouse=wh, loc__isnull=True).exclude(src="")]
    t = now()
    return {
        "days": (t - since).days,
        "placed": len(hours),
        "avg_h": round(sum(hours) / len(hours), 2) if hours else None,
        "median_h": round(median(hours), 2) if hours else None,
        "within_2h": round(100 * sum(1 for h in hours if h <= 2) / len(hours)) if hours else None,
        "waiting": len(waiting),
        "oldest_h": round(max((t - u.created).total_seconds() for u in waiting) / 3600, 1) if waiting else None,
    }


def ira(store_id: Any, days: int = 90) -> dict[str, Any]:
    """Zaxira yozuvlari aniqligi (IRA): sanalgan pozitsiyalarning necha foizi hisob bilan toleransda mos keldi
    (jahon amaliyoti: 95–98% va undan yuqori). Sinf bo'yicha ham."""
    wh = wh_ok(store_id)
    since = now() - timedelta(days=max(1, min(int(days or 90), 730)))
    docs = list(Doc.objects.filter(kind="inventory", status=DocStatus.POSTED, warehouse=wh, date__gte=since))
    rows = [r for d in docs for r in tolerance(list((d.data or {}).get("result") or []))]
    by: dict[str, list[int]] = {}
    for r in rows:
        x = by.setdefault(r["cls"], [0, 0])
        x[0] += 1
        x[1] += int(r["ok"])
    pct = lambda a, b: round(100 * b / a, 1) if a else None
    return {
        "days": (now() - since).days,
        "counts": len(docs),
        "positions": len(rows),
        "accurate": sum(1 for r in rows if r["ok"]),
        "ira": pct(len(rows), sum(1 for r in rows if r["ok"])),
        "by_cls": {k: {"positions": a, "ira": pct(a, b)} for k, (a, b) in sorted(by.items())},
    }


# ---------------------------------------------------------------- ko'rsatkichlar paneli
HIGH_FLOOR = 4  # D qavat va yuqori — narvon/texnika kerak; A-sinf (tez aylanadigan) tovar pastroqda bo'lsin
ACT_DAYS = 14


def _pct(a: float | int, b: float | int) -> float | None:
    return round(a * 100 / b, 1) if b else None


def kpi_summary(store_id: Any, days: int = 30) -> dict[str, Any]:
    """Ombor ko'rsatkichlari bitta so'rovda: qabul (dock-to-stock), aniqlik (IRA), chiqim va qaytarish, sex chiqindisi,
    hisobdan chiqarish, joy bandligi (xonalar bo'yicha), kunlik faollik, eng faol joylar va joylashuv maslahatlari."""
    wh = wh_ok(store_id)
    days = max(1, min(int(days or 30), 365))
    t = now()
    since = t - timedelta(days=days)
    docs = list(
        Doc.objects.filter(status=DocStatus.POSTED, date__gte=since).filter(Q(warehouse=wh) | Q(warehouse_to=wh))
    )
    sales = [d for d in docs if d.kind == "sale" and d.warehouse_id == wh.pk]
    rets = [d for d in docs if d.kind == "return" and d.warehouse_id == wh.pk]
    sale_lines = sum(len(d.lines) for d in sales)
    ret_lines = [ln for d in rets for ln in d.lines]
    cons = [d for d in docs if d.kind == "consume" and d.warehouse_id == wh.pk]
    used = sum((dec((d.data or {}).get("used") or 0) for d in cons), ZERO)
    scrap = sum((dec((d.data or {}).get("scrap") or 0) for d in cons), ZERO)
    offs = [d for d in docs if d.kind == "writeoff" and d.warehouse_id == wh.pk]
    shorts = sum(
        1
        for p in Pick.objects.filter(warehouse=wh, done=False)
        for ln in p.lines
        for s in ln.get("short") or []
        if str(s.get("at") or "") >= since.isoformat()
    )

    # joy bandligi
    cells = list(Cell.objects.filter(warehouse=wh).select_related("block"))
    busy = set(live().filter(warehouse=wh, loc__isnull=False).values_list("loc_id", flat=True))
    blocks: dict[int | None, dict[str, Any]] = {}
    for c in cells:
        b = blocks.setdefault(
            c.block_id,
            {
                "code": c.block.code if c.block else "—",
                "name": c.block.name if c.block else "Xonasiz",
                "cells": 0,
                "used": 0,
            },
        )
        b["cells"] += 1
        b["used"] += c.pk in busy
    by_block = sorted(
        ({**b, "pct": _pct(b["used"], b["cells"])} for b in blocks.values()), key=lambda b: str(b["code"])
    )
    active = [c for c in cells if c.status == CellStatus.ACTIVE]

    # faollik: kunlik kirim / chiqim / ko'chish (jurnal yozuvlari)
    mv = StockMove.objects.filter(at__gte=t - timedelta(days=ACT_DAYS)).filter(Q(wh_from=wh) | Q(wh_to=wh))
    act: dict[str, dict[str, int]] = {}
    for i in range(ACT_DAYS):
        act[(t - timedelta(days=ACT_DAYS - 1 - i)).date().isoformat()] = {"in": 0, "out": 0, "move": 0}
    for at, delta in mv.values_list("at", "delta"):
        k = timezone.localtime(at).date().isoformat() if timezone.is_aware(at) else at.date().isoformat()
        if k in act:
            act[k]["in" if delta > 0 else "out" if delta < 0 else "move"] += 1

    # eng faol joylar (davr ichidagi harakatlar soni)
    hits: dict[str, int] = {}
    for a, b in (
        StockMove.objects.filter(at__gte=since)
        .filter(Q(wh_from=wh) | Q(wh_to=wh))
        .values_list("loc_from_code", "loc_to_code")
    ):
        for code in {a, b} - {""}:
            hits[code] = hits.get(code, 0) + 1
    hot = [{"code": k, "moves": v} for k, v in sorted(hits.items(), key=lambda x: (-x[1], x[0]))[:10]]

    # joylashuv maslahati: A-sinf tovar baland qavatda
    a_items = set(ItemMeta.objects.filter(cls="A").values_list("item_id", flat=True))
    high = list(
        live()
        .filter(warehouse=wh, item_id__in=a_items, loc__floor__gte=HIGH_FLOOR)
        .select_related("loc")
        .order_by("loc__code")[:10]
    )
    info = cat({u.item_id for u in high})
    slot = [
        {
            "unit_id": u.pk,
            "code": u.code,
            "name": full_name(info[u.item_id], u.char_id) if u.item_id in info else f"#{u.item_id}",
            "loc": u.loc.code if u.loc else None,
            "hint": "A-sinf (tez aylanadi) — pastki B/C qavatga ko'chiring",
        }
        for u in high
    ]
    return {
        "days": days,
        "store": wh.name,
        "dock": dock_to_stock(wh.pk, days),
        "ira": ira(wh.pk, max(days, 90)),
        "outbound": {
            "orders": len(sales),
            "lines": sale_lines,
            "open": Pick.objects.filter(warehouse=wh, done=False).count(),
            "shorts": shorts,
            "returns": len(rets),
            "return_lines": len(ret_lines),
            "return_pct": _pct(len(ret_lines), sale_lines),
            "defect": sum(1 for ln in ret_lines if (ln.get("data") or {}).get("grade") == "defect"),
        },
        "production": {
            "consumes": len(cons),
            "used": fl(used),
            "scrap": fl(scrap),
            "scrap_pct": _pct(float(scrap), float(used)),
            "products": sum(1 for d in docs if d.kind == "produce" and d.warehouse_id == wh.pk),
        },
        "writeoff": {"docs": len(offs), "value": round(sum(float((d.data or {}).get("value") or 0) for d in offs))},
        "space": {
            "cells": len(cells),
            "active": len(active),
            "used": len(busy & {c.pk for c in cells}),
            "pct": _pct(len(busy & {c.pk for c in cells}), len(cells)),
            "blocked": sum(1 for c in cells if c.status == CellStatus.BLOCKED),
            "quarantine": sum(1 for c in cells if c.status == CellStatus.QUARANTINE),
            "by_block": by_block,
        },
        "activity": [{"date": k, **v} for k, v in act.items()],
        "hot": hot,
        "slotting": slot,
    }


# ---------------------------------------------------------------- yig'ish (jo'natish)
# Chiqim (outbound) — jahon amaliyoti:
#  - birlik tanlovi: o'lchamli tovar (lenta) — kerakdan katta bo'lganlarning eng kichigi (kesishda chiqindi kam), qolganlar
#    FIFO; donali tovar — FIFO (avval kelgan avval chiqadi). Karantindagi joydan taklif qilinmaydi, jo'natilmaydi;
#  - yo'l tartibi: qatorlar javonlar bo'yicha «ilon izi» (toq stellajda qator o'sib, juftida kamayib) — yuradigan yo'l qisqa;
#  - skaner tasdig'i: boshqa tovarning birligi qatorga qo'shilmaydi (400);
#  - topilmadi (short pick): qatorga yoziladi va tovar navbatdan tashqari sanashga tushadi (sikl sanog'i).
SHORT_REASONS: dict[str, str] = {
    "missing": "Joyida yo'q",
    "damaged": "Shikastlangan",
    "less": "Kam chiqdi",
    "label": "Yorlig'i yo'q / o'qilmaydi",
}


def path_key(c: Cell | None) -> tuple[int, int, str, int, int, int, str]:
    """Yig'ish yo'li tartibi: bino → xona → stellaj → qator («ilon izi») → qavat; joysiz — oxirida."""
    if c is None:
        return (1, 0, "", 0, 0, 0, "")
    b = c.block
    bn = b.building.number if b and b.building else 0
    bc = b.code if b else ""
    if c.rack and c.row and c.floor:
        rn = c.rack.number
        return (0, bn, bc, rn, c.row if rn % 2 else -c.row, c.floor, c.code)
    return (0, bn, bc, 10**6, 0, 0, c.code)


def _bad_loc(u: Unit) -> bool:
    return bool(u.loc and u.loc.status == CellStatus.QUARANTINE)


def _rank(us: list[Unit], need: Decimal, dims: bool) -> list[tuple[Unit, str]]:
    """Birliklar tavsiya tartibida va sababi bilan."""
    fifo = sorted(us, key=lambda u: (u.created, u.pk))
    if not dims:
        return [(u, "eng eski (FIFO)") for u in fifo]
    fits = sorted((u for u in us if u.qty + EPS >= need), key=lambda u: (u.qty, u.created, u.pk))
    rest = [u for u in fifo if u.qty + EPS < need]
    return [(u, "aniq mos" if abs(u.qty - need) <= EPS else "kam chiqindi") for u in fits] + [
        (u, "eng eski (FIFO)") for u in rest
    ]


def picks() -> list[dict[str, Any]]:
    ps = list(Pick.objects.select_related("warehouse").filter(done=False))
    info = cat({ln["item_id"] for p in ps for ln in p.lines})
    return [
        {
            "id": p.pk,
            "number": p.number,
            "date": iso(p.date),
            "customer": p.customer or None,
            "firm": p.firm,
            "channel": p.channel or None,
            "warehouse": p.warehouse.name,
            "lines": len(p.lines),
            "names": [full_name(info[ln["item_id"]], ln.get("char_id")) for ln in p.lines[:3] if ln["item_id"] in info],
            "short": sum(len(ln.get("short") or []) for ln in p.lines),
        }
        for p in ps
    ]


def pick_out(pk: int) -> dict[str, Any]:
    p = Pick.objects.filter(pk=pk, done=False).first()
    if p is None:
        raise NotFound("Buyurtma topilmadi yoki allaqachon jo'natilgan")
    info = cat({ln["item_id"] for ln in p.lines})
    us = [
        u
        for u in live()
        .select_related("loc__block__building", "loc__rack")
        .filter(warehouse=p.warehouse, item_id__in=list(info))
        if not _bad_loc(u)
    ]
    lines = []
    for ln in p.lines:
        it = info.get(ln["item_id"])
        if it is None:
            continue
        mine = [
            u
            for u in us
            if u.item_id == ln["item_id"] and (bool(it["dims"]) or (u.char_id or None) == (ln.get("char_id") or None))
        ]
        ranked = _rank(mine, dec(ln["left"]), bool(it["dims"]))
        first = ranked[0][0] if ranked else None
        lines.append(
            (
                path_key(first.loc if first else None) if first else (2, 0, "", 0, 0, 0, ""),
                {
                    "line_no": ln["line_no"],
                    "item_id": ln["item_id"],
                    "char_id": ln.get("char_id"),
                    "name": full_name(it, ln.get("char_id")),
                    "unit": it["unit"],
                    "dims": it["dims"],
                    "left": fl(dec(ln["left"])),
                    "at": first.loc.code if first and first.loc else None,
                    "short": len(ln.get("short") or []),
                    "units": [
                        {
                            "batch_id": u.pk if u.code else None,
                            "code": u.code,
                            "loc": u.loc.code if u.loc else None,
                            "qty": fl(u.qty),
                            "width_mm": mm(u.width_mm),
                            "length_mm": mm(u.length_mm),
                            "firm": u.firm,
                            "tip": tip,
                        }
                        for u, tip in ranked
                    ],
                },
            )
        )
    lines.sort(key=lambda x: x[0])
    out = [{**x, "stop": i + 1} for i, (_, x) in enumerate(lines)]
    return {
        "id": p.pk,
        "number": p.number,
        "customer": p.customer or None,
        "firm": p.firm,
        "warehouse_id": p.warehouse_id,
        "lines": out,
        "route": [x["at"] for x in out if x["at"]],
    }


@transaction.atomic
def pick_ship(pk: int, body: dict[str, Any], tg_id: int | None) -> dict[str, Any]:
    p = Pick.objects.select_for_update().filter(pk=pk, done=False).first()
    if p is None:
        raise NotFound("Buyurtma topilmadi yoki allaqachon jo'natilgan")
    rows = body.get("picks") or []
    if not rows:
        raise Bad("Yig'ilgan tovar yo'q — avval stikerni skanerlang")
    m = meta({ln["item_id"] for ln in p.lines})
    info = cat({ln["item_id"] for ln in p.lines})
    t = now()
    # hujjat avval — jurnal yozuvlari unga bog'lansin
    d = Doc.objects.create(
        number=next_number("sale", t),
        kind="sale",
        status=DocStatus.POSTED,
        firm=p.firm,
        warehouse=p.warehouse,
        author=tg_id,
        date=t,
        updated=t,
        version=2,
        data={"base": p.number, "source": p.source, "customer": p.customer, "channel": p.channel},
        lines=[],
    )
    ledger.bind(op="sale", doc=d)
    total = ZERO
    lines = {ln["line_no"]: dict(ln) for ln in p.lines}
    shipped = []
    for x in rows:
        ln = lines.get(int(x.get("line_no") or 0))
        if ln is None:
            raise Bad("Buyurtma qatori topilmadi")
        it = info.get(ln["item_id"])
        q = dec(x.get("qty"))
        if q <= 0 or q > dec(ln["left"]) + EPS:
            raise Bad("Miqdor buyurtmadan ko'p — qolganini tekshiring")
        loc = ""
        if x.get("batch_id"):
            u = _unit_for_update(x["batch_id"])
            if u.item_id != ln["item_id"] or (
                not (it and it["dims"]) and (u.char_id or None) != (ln.get("char_id") or None)
            ):
                raise Bad(f"Birlik {u.code or ''} bu qatordagi tovar emas — boshqa tovar skanerlangan")
            if u.warehouse_id != p.warehouse_id or u.pending or u.qty + EPS < q:
                raise Bad(f"Birlik {u.code or ''} omborda yetarli emas")
            if _bad_loc(u):
                raise Bad(f"Birlik {u.code or ''} karantinda ({u.loc.code if u.loc else ''}) — jo'natib bo'lmaydi")
            loc = u.loc.code if u.loc else ""
            u.qty = q4(u.qty - q)
            u.save(update_fields=["qty"])
        else:
            take_lots(ln["item_id"], ln.get("char_id") or None, None, p.warehouse, q)
        ln["left"] = fl(dec(ln["left"]) - q)
        mt = m.get(ln["item_id"])
        total += q * (mt.cost if mt else ZERO)
        shipped.append(
            {
                "item_id": ln["item_id"],
                "char_id": ln.get("char_id"),
                "batch_id": x.get("batch_id") or None,
                "qty": str(fl(q)),
                "data": {"loc": loc, "scan": str(x.get("scan") or "")},
            }
        )
    p.lines = [ln for ln in lines.values() if dec(ln["left"]) > EPS]
    p.done = not p.lines
    p.save()
    d.lines = shipped
    d.save(update_fields=["lines"])
    sweep()
    if p.done and p.source:
        from . import hooks

        hooks.shipped(p.source, d.number or "")
    return {"number": d.number, "total": round(float(total))}


@transaction.atomic
def pick_short(pk: int, body: dict[str, Any], by: str) -> dict[str, Any]:
    """Topilmadi: qatorga yoziladi, tovar sanash navbatining boshiga tushadi (oxirgi sanoq «yo'q» bo'ladi)."""
    p = Pick.objects.select_for_update().filter(pk=pk, done=False).first()
    if p is None:
        raise NotFound("Buyurtma topilmadi yoki allaqachon jo'natilgan")
    no = int(body.get("line_no") or 0)
    if not any(ln["line_no"] == no for ln in p.lines):
        raise Bad("Buyurtma qatori topilmadi")
    code = str(body.get("reason") or "")
    if code not in SHORT_REASONS:
        raise Bad("Sababni tanlang")
    lines = []
    item_id = 0
    for ln in p.lines:
        x = dict(ln)
        if x["line_no"] == no:
            item_id = int(x["item_id"])
            x["short"] = [
                *(x.get("short") or []),
                {"at": iso(now()), "loc": str(body.get("loc") or ""), "reason": code, "by": by},
            ]
        lines.append(x)
    p.lines = lines
    p.save(update_fields=["lines"])
    ItemMeta.objects.update_or_create(item_id=item_id, defaults={"last_count": None})
    return pick_out(pk)


# ---------------------------------------------------------------- kelib chiqish zanjiri (genealogiya)
def trace(pk: int) -> dict[str, Any]:
    """Birlik zanjiri: `from` — mahsulot qaysi material birliklaridan qilingan (ishlab chiqarishda yozilgan);
    `used` — bu birlik (yoki undan kesilgan bo'lak) qaysi sarflarda ishlatilgan va natijada qaysi mahsulot chiqqan."""
    u = Unit.objects.filter(pk=pk).first()
    if u is None:
        raise NotFound("Birlik topilmadi")
    made = u.made or {}
    cons = [
        d
        for d in Doc.objects.filter(kind="consume", status=DocStatus.POSTED).order_by("-date", "-pk")[:2000]
        if any(ln.get("batch_id") == u.pk or (ln.get("data") or {}).get("piece") == u.pk for ln in d.lines)
    ]
    nums = {d.number for d in cons}
    prods: dict[str, list[Doc]] = {}
    if nums:
        for p in Doc.objects.filter(kind="produce", status=DocStatus.POSTED).order_by("date", "pk"):
            for n in (p.data or {}).get("sources") or []:
                if n in nums:
                    prods.setdefault(n, []).append(p)
    ids = {int(p.lines[0]["batch_id"]) for ps in prods.values() for p in ps if p.lines and p.lines[0].get("batch_id")}
    us = {x.pk: x for x in Unit.objects.filter(pk__in=ids)}
    info = cat({x.item_id for x in us.values()})
    used = []
    for d in cons:
        ln = next(x for x in d.lines if x.get("batch_id") == u.pk or (x.get("data") or {}).get("piece") == u.pk)
        out = []
        for p in prods.get(d.number or "", []):
            x = us.get(int(p.lines[0]["batch_id"])) if p.lines and p.lines[0].get("batch_id") else None
            if x is not None:
                out.append(
                    {
                        "code": x.code,
                        "name": full_name(info[x.item_id], x.char_id) if x.item_id in info else "",
                        "doc": p.number,
                    }
                )
        used.append(
            {
                "doc": d.number,
                "date": iso(d.date),
                "job": (d.data or {}).get("job") or None,
                "qty": fl(dec(ln.get("qty"))),
                "returned": (d.data or {}).get("returned") or None,
                "products": out,
            }
        )
    return {"job": made.get("job") or None, "from": made.get("from") or [], "used": used}


# ---------------------------------------------------------------- mijozdan qaytarish
# Jo'natish hujjati bo'yicha (miqdor jo'natilgandan oshmaydi): yaroqli — joylash navbatiga, brak — karantin joyiga
# (karantin xonasi/joyi bo'lmasa — navbatga, izoh bilan). Kodli birlik o'z QR'i bilan qaytadi.
RETURN_DAYS = 180


def _returned(sale: Doc) -> dict[int, Decimal]:
    out: dict[int, Decimal] = {}
    for r in Doc.objects.filter(kind="return", status=DocStatus.POSTED, data__base_id=sale.pk):
        for ln in r.lines:
            i = int((ln.get("data") or {}).get("line", -1))
            out[i] = out.get(i, ZERO) + dec(ln.get("qty"))
    return out


def sale_out(d: Doc) -> dict[str, Any]:
    info = cat({int(ln.get("item_id") or 0) for ln in d.lines})
    codes = dict(
        Unit.objects.filter(pk__in=[ln["batch_id"] for ln in d.lines if ln.get("batch_id")]).values_list("pk", "code")
    )
    done = _returned(d)
    lines = []
    for i, ln in enumerate(d.lines):
        it = info.get(int(ln.get("item_id") or 0))
        if it is None:
            continue
        lines.append(
            {
                "line": i,
                "item_id": ln["item_id"],
                "char_id": ln.get("char_id"),
                "batch_id": ln.get("batch_id"),
                "code": codes.get(ln.get("batch_id")),
                "name": full_name(it, ln.get("char_id")),
                "unit": it["unit"],
                "qty": fl(dec(ln.get("qty"))),
                "returned": fl(done.get(i, ZERO)),
            }
        )
    return {
        "id": d.pk,
        "number": d.number,
        "date": iso(d.date),
        "customer": (d.data or {}).get("customer") or None,
        "base": (d.data or {}).get("base") or None,
        "firm": d.firm,
        "warehouse_id": d.warehouse_id,
        "lines": lines,
    }


def sales(q: str) -> list[dict[str, Any]]:
    """Qaytarish uchun jo'natishlar (oxirgi 180 kun): raqam, mijoz yoki jo'natilgan birlik QR kodi bo'yicha."""
    q = q.strip().lower()
    ds = Doc.objects.filter(
        kind="sale", status=DocStatus.POSTED, date__gte=now() - timedelta(days=RETURN_DAYS)
    ).order_by("-date", "-pk")[:300]
    u = Unit.objects.filter(code__iexact=q).first() if q else None
    out = []
    for d in ds:
        if u is not None:
            if not any(ln.get("batch_id") == u.pk for ln in d.lines):
                continue
        elif q and q not in (d.number or "").lower() and q not in str((d.data or {}).get("customer") or "").lower():
            continue
        out.append(sale_out(d))
        if len(out) >= 20:
            break
    return out


@transaction.atomic
def return_post(body: dict[str, Any], tg_id: int | None) -> dict[str, Any]:
    s = Doc.objects.select_for_update().filter(pk=int(body.get("sale_id") or 0), kind="sale", status=DocStatus.POSTED)
    sale = s.first()
    if sale is None:
        raise NotFound("Jo'natish hujjati topilmadi")
    wh = wh_ok(body.get("warehouse_id") or sale.warehouse_id)
    if wh.kind == WhKind.TRANSIT:
        raise Bad("Qaytariladigan omborni tanlang («Yo'lda» emas)")
    reason = str(body.get("reason") or "").strip()
    if not reason:
        raise Bad("Qaytarish sababini yozing")
    rows = body.get("lines") or []
    if not rows:
        raise Bad("Qaytariladigan tovarni belgilang")
    done = _returned(sale)
    qcell = (
        Cell.objects.filter(warehouse=wh, status=CellStatus.ACTIVE, block__purpose=Purpose.QUARANTINE)
        .order_by("code")
        .first()
        or Cell.objects.filter(warehouse=wh, status=CellStatus.QUARANTINE).order_by("code").first()
    )
    t = now()
    d = Doc.objects.create(
        number=next_number("return", t),
        kind="return",
        status=DocStatus.POSTED,
        firm=sale.firm,
        warehouse=wh,
        author=tg_id,
        date=t,
        updated=t,
        version=2,
        data={
            "base_id": sale.pk,
            "base": sale.number,
            "customer": (sale.data or {}).get("customer") or "",
            "reason": reason,
        },
        lines=[],
    )
    ledger.bind(op="return", doc=d, reason=reason)
    src = d.number or ""
    out, n_ok, n_bad = [], 0, 0
    seen: set[int] = set()
    for x in rows:
        try:
            i = int(x.get("line"))
            sl = sale.lines[i]
        except (TypeError, ValueError, IndexError) as e:
            raise Bad("Jo'natish qatori topilmadi") from e
        if i in seen:
            raise Bad("Bir qator ikki marta berilgan")
        seen.add(i)
        q = dec(x.get("qty"))
        left = dec(sl.get("qty")) - done.get(i, ZERO)
        if q <= 0 or q > left + EPS:
            raise Bad(f"Qaytarish mumkin: {fl(left)} — ko'p kiritildi")
        defect = x.get("grade") == "defect"
        loc = qcell if defect else None
        item_id, char_id = int(sl["item_id"]), sl.get("char_id") or None
        bid = None
        if sl.get("batch_id"):
            u = _unit_for_update(sl["batch_id"])
            if u.qty <= EPS:
                # o'sha birlik (QR) o'z kodi bilan qaytadi
                u.qty, u.warehouse, u.loc, u.src = q4(q), wh, loc, src
                u.save()
            else:
                u = new_unit(
                    item_id=item_id,
                    char_id=char_id,
                    firm=sale.firm,
                    warehouse=wh,
                    kind=u.kind,
                    qty=q,
                    loc=loc,
                    width_mm=u.width_mm,
                    length_mm=u.length_mm,
                    parent_code=u.code or "",
                    src=src,
                )
            bid = u.pk
        else:
            add_lot(item_id, char_id, sale.firm, wh, loc, q, src=src)
        n_bad += defect
        n_ok += not defect
        out.append(
            {
                "item_id": item_id,
                "char_id": char_id,
                "batch_id": bid,
                "qty": str(fl(q)),
                "data": {"line": i, "grade": "defect" if defect else "ok"},
            }
        )
    d.lines = out
    d.save(update_fields=["lines"])
    sweep()
    return {
        "id": d.pk,
        "number": d.number,
        "ok": n_ok,
        "defect": n_bad,
        "quarantine": qcell.code if qcell and n_bad else None,
    }


def incoming() -> list[dict[str, Any]]:
    xs = list(Incoming.objects.filter(done=False))
    info = cat({i["item_id"] for x in xs for i in x.items})
    return [
        {
            "id": x.pk,
            "number": x.number,
            "supplier": x.supplier or None,
            "firm": x.firm,
            "warehouse_id": x.warehouse_id,
            "expected": iso(x.expected),
            "items": [
                {
                    "item_id": i["item_id"],
                    "char_id": i.get("char_id"),
                    "name": info[i["item_id"]]["name"],
                    "char": char_name(info[i["item_id"]], i.get("char_id")),
                    "unit": info[i["item_id"]]["unit"],
                    "qty": fl(dec(i["qty"])),
                }
                for i in x.items
                if i["item_id"] in info
            ],
        }
        for x in xs
    ]


# ---------------------------------------------------------------- kesish rejasi
@dataclass
class _Slot:
    """Kesish rejasidagi birlik: qolgan uzunlik (lenta) / eni (rukav) / miqdor va shu birlikdan rejalashtirilgan kesimlar."""

    u: Unit
    rem: Decimal
    cuts: list[dict[str, Any]] = field(default_factory=list)
    rests: list[dict[str, Any]] = field(default_factory=list)


def cut_plan(body: dict[str, Any]) -> dict[str, Any]:
    """Kerakli o'lchamlar (eng kattasi birinchi) — avval qoldiq bo'laklardan (kichigi birinchi), keyin rulonlardan.
    Lenta: giliotina — bo'lak eni × uzunligi, yon qoldiq (eni < 100 mm — chiqindi), rulon qisqaradi."""
    it = item(int(body.get("item_id") or 0))
    dims = it["dims"]
    if not dims:
        raise Bad("Bu tovar o'lchamli emas — kesish rejasi rulon, bo'lak va rukav uchun")
    wh = wh_ok(body.get("warehouse_id"))
    wl = dims == "wl"
    want: list[tuple[Decimal, Decimal, Decimal]] = []
    for n in body.get("needs") or []:
        k = max(1, min(50, int(n.get("n") or 1)))
        w = dec(n.get("w") or 0, "Eni")
        length = dec(n.get("l") or 0, "Uzunligi")
        q = ZERO if wl else dec(n.get("q") or n.get("w") or 0)
        want.extend([(w, length, q)] * k)
    if not want:
        raise Bad("O'lchamlarni kiriting")
    want.sort(key=lambda x: x[0] * x[1] if wl else x[2], reverse=True)
    us = sorted(
        live().select_related("loc").filter(item_id=it["id"], warehouse=wh, code__isnull=False),
        key=lambda u: (u.kind == "roll", u.qty),
    )
    pool = [_Slot(u, (u.length_mm or ZERO) if wl else (u.width_mm or ZERO) if dims == "w" else u.qty) for u in us]

    def fits(s: _Slot, w: Decimal, length: Decimal, need: Decimal) -> bool:
        if wl:
            return (s.u.width_mm or ZERO) >= w and s.rem >= length
        return s.rem >= need - EPS

    missing: list[dict[str, Any]] = []
    for w, length, q in want:
        need = q if dims != "w" else (q or w)
        slot = next((s for s in pool if fits(s, w, length, need)), None)
        if slot is None:
            missing.append(
                {"width_mm": mm(w), "length_mm": mm(length), "qty": fl(area(w, length))} if wl else {"qty": fl(need)}
            )
            continue
        if wl:
            width = slot.u.width_mm or ZERO
            slot.cuts.append({"width_mm": mm(w), "length_mm": mm(length), "qty": fl(area(w, length))})
            if width - w > 0:
                slot.rests.append(
                    {
                        "width_mm": mm(width - w),
                        "length_mm": mm(length),
                        "qty": fl(area(width - w, length)),
                        "scrap": width - w < SCRAP_MM,
                    }
                )
            slot.rem -= length
        else:
            slot.cuts.append({"qty": fl(need)})
            slot.rem = q4(slot.rem - need)
    used = [s for s in pool if s.cuts]
    for s in used:
        if wl and s.rem > 0:
            width = s.u.width_mm or ZERO
            s.rests.append(
                {
                    "width_mm": mm(width),
                    "length_mm": mm(s.rem),
                    "qty": fl(area(width, s.rem)),
                    "scrap": s.rem < SCRAP_MM,
                }
            )
        if not wl and s.rem > EPS:
            s.rests.append({"qty": fl(s.rem), "scrap": s.rem < (Decimal("0.1") if dims == "l" else Decimal(20))})
    cut_qty = sum(float(c["qty"]) for s in used for c in s.cuts)
    return {
        "unit": it["unit"],
        "need_qty": round(cut_qty + sum(float(m["qty"]) for m in missing), 4),
        "scrap_qty": round(sum(float(r["qty"]) for s in used for r in s.rests if r["scrap"]), 4),
        "opened": sum(1 for s in used if s.u.kind == "roll"),
        "pieces": sum(len(s.cuts) for s in used),
        "units": [
            {
                "batch_id": s.u.pk,
                "code": s.u.code,
                "kind": s.u.kind,
                "width_mm": mm(s.u.width_mm),
                "length_mm": mm(s.u.length_mm),
                "qty": fl(s.u.qty),
                "loc": s.u.loc.code if s.u.loc else None,
                "firm": s.u.firm,
                "warehouse_id": s.u.warehouse_id,
                "cuts": s.cuts,
                "rests": s.rests,
            }
            for s in used
        ],
        "missing": missing,
    }


# ---------------------------------------------------------------- joylashtirish (boshlang'ich qoldiq)
@transaction.atomic
def place(body: dict[str, Any], user: Any) -> dict[str, Any]:
    loc = Cell.objects.select_related("warehouse").filter(pk=int(body.get("loc_id") or 0)).first()
    if loc is None:
        raise Bad("Joy (javon) topilmadi — javon stikerini skanerlang")
    it = item(int(body.get("item_id") or 0))
    us_in = body.get("units") or []
    loc_ok(
        loc,
        adding=len(us_in)
        if it["dims"]
        else int(not live().filter(loc=loc, item_id=it["id"], code__isnull=True).exists()),
        width_mm=max((Decimal(str(x["w"])) for x in us_in if x.get("w")), default=None),
    )
    firm = firm_ok(body.get("firm"))
    char_id = int(body["char_id"]) if body.get("char_id") else None
    t = now()
    number = next_number("initial", t)
    ids: list[int] = []
    total = ZERO
    dims = it["dims"]
    if dims:
        us = body.get("units") or []
        if not us:
            raise Bad("O'lchamni kiriting")
        for x in us:
            w = dec_or_none(x.get("w"), "Eni")
            length = dec_or_none(x.get("l"), "Uzunligi")
            q = dec_or_none(x.get("q"))
            qty = qty_of(dims, w, length, q)
            if qty <= 0:
                raise Bad("O'lcham noto'g'ri")
            u = new_unit(
                item_id=it["id"],
                char_id=char_id,
                firm=firm,
                warehouse=loc.warehouse,
                loc=loc,
                kind=unit_kind(dims, length),
                width_mm=w,
                length_mm=qty * 1000 if dims == "l" else length,
                qty=qty,
            )
            ids.append(u.pk)
            total += qty
    else:
        qty = dec(body.get("qty"))
        if qty <= 0:
            raise Bad("Miqdorni kiriting")
        ids.append(add_lot(it["id"], char_id, firm, loc.warehouse, loc, qty).pk)
        total = qty
    pl = Place.objects.create(
        number=number,
        loc=loc,
        item_id=it["id"],
        char_id=char_id,
        qty=q4(total),
        firm=firm,
        date=t,
        author=getattr(user, "tg_id", None),
        unit_ids=ids,
    )
    Doc.objects.create(
        number=number,
        kind="initial",
        status=DocStatus.POSTED,
        firm=firm,
        warehouse=loc.warehouse,
        author=getattr(user, "tg_id", None),
        date=t,
        updated=t,
        version=2,
        data={"place_id": pl.pk},
        lines=[
            {"item_id": it["id"], "char_id": char_id, "batch_id": None, "qty": str(fl(total)), "data": {"units": ids}}
        ],
    )
    return {
        "number": number,
        "item": it["name"],
        "loc": loc.code,
        "qty": fl(total),
        "unit": it["unit"],
        "units": ids if dims else [],
        "label": {"url": f"/app/api/erp/labels/place/{pl.pk}.pdf"},
    }


def place_recent(loc_id: str | None, tg_id: int | None) -> list[dict[str, Any]]:
    qs = Place.objects.select_related("loc")
    if loc_id:
        qs = qs.filter(loc_id=int(loc_id))
    else:
        start = now().replace(hour=0, minute=0, second=0, microsecond=0)
        qs = qs.filter(author=tg_id, date__gte=start)
    ps = list(qs[:100])
    info = cat({p.item_id for p in ps})
    return [
        {
            "id": p.pk,
            "name": info[p.item_id]["name"] if p.item_id in info else f"#{p.item_id}",
            "loc": p.loc.code,
            "number": p.number,
            "firm": p.firm,
            "date": iso(p.date),
            "qty": fl(p.qty),
            "unit": info[p.item_id]["unit"] if p.item_id in info else "",
            "author": p.author,
        }
        for p in ps
    ]


@transaction.atomic
def place_undo(pk: int, tg_id: int | None) -> None:
    pl = Place.objects.select_for_update().filter(pk=pk).first()
    if pl is None:
        raise NotFound("Joylashtirish topilmadi")
    if pl.author != tg_id:
        raise Bad("Faqat o'zingiz joylaganini bekor qila olasiz")
    for u in Unit.objects.select_for_update().filter(pk__in=pl.unit_ids):
        if u.code and u.cuts:
            raise Bad(f"{u.code}: allaqachon kesilgan — bekor qilib bo'lmaydi")
        u.qty = q4(max(ZERO, u.qty - pl.qty)) if u.kind == "lot" else ZERO
        u.save(update_fields=["qty"])
    Doc.objects.filter(number=pl.number, kind="initial").delete()
    pl.delete()
    sweep()


# ---------------------------------------------------------------- yordamchi: tovar bo'yicha tirik qoldiq
def totals(item_ids: Iterable[int]) -> dict[tuple[int, int | None], Decimal]:
    out: dict[tuple[int, int | None], Decimal] = {}
    for item_id, char_id, qty in live().filter(item_id__in=list(item_ids)).values_list("item_id", "char_id", "qty"):
        k = (item_id, char_id)
        out[k] = out.get(k, ZERO) + qty
    return out


def units_for(item_id: int, wh: Warehouse | None = None) -> QuerySet[Unit]:
    qs = live().select_related("loc", "loc__block", "warehouse").filter(item_id=item_id)
    return qs.filter(warehouse=wh) if wh else qs


def default_wh() -> Warehouse:
    w = (
        Warehouse.objects.filter(active=True, kind=WhKind.STORE).first()
        or Warehouse.objects.filter(active=True).first()
    )
    if w is None:
        raise Bad("Ombor sozlanmagan — admin panelda ombor qo'shing")
    return w


def default_firm() -> str:
    f = Firm.objects.first()
    if f is None:
        raise Bad("Firma sozlanmagan — admin panelda firma qo'shing")
    return f.code

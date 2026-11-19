"""Katalog appining ochiq interfeysi (boshqa applar faqat shu orqali): tovar qidiruvi (CRM, savdo), narx hisobi,
nom bo'yicha topish va demo katalog (dev baza uchun)."""

from __future__ import annotations

import math
import re
from collections.abc import Iterable
from decimal import Decimal
from typing import Any

from django.db import transaction

from config.apps.erp.warehouse import services as wh

from .models import Char, Group, Item, Kind


def price_of(item: Item, char: Char | None = None) -> Decimal | None:
    """Sotuv narxi: dona — `price`; mm — 1 mm narxi × kenglik (qadamga yuqoriga yaxlitlanadi); kenglik bo'yicha qo'lda
    narx (`overrides`) — hisobdan ustun."""
    p: dict[str, Any] = item.price or {}
    if p.get("price") in (None, "") and not p.get("overrides"):
        return None
    if char is not None and char.width_mm and (o := (p.get("overrides") or {}).get(str(char.width_mm))) is not None:
        return Decimal(str(o))
    base = Decimal(str(p.get("price") or 0))
    if p.get("mode") == "mm" and char is not None and char.width_mm:
        step = int(p.get("step_mm") or 0)
        w = math.ceil(char.width_mm / step) * step if step > 0 else char.width_mm
        return (base * w).quantize(Decimal(1))
    return base


def _hit(item: Item, char: Char | None, free: dict[tuple[int, int | None], Decimal]) -> dict[str, Any]:
    price = price_of(item, char)
    return {
        "item_id": item.pk,
        "char_id": char.pk if char else None,
        "name": item.name,
        "char": char.name if char else None,
        "unit": item.unit,
        "sku": item.sku or None,
        "price": str(price) if price is not None else None,
        "free": str(free.get((item.pk, char.pk if char else None), Decimal(0))),
    }


def _compact(s: str) -> str:
    return re.sub(r"[\s\-_/.]+", "", s.casefold())


# kirill → lotin (qidiruv uchun): "ремень" → "remen", "лента" → "lenta" — 1C nomlari ruscha, sotuvchi lotincha yozadi
_LAT = str.maketrans(
    {
        **dict(zip("абвгдезийклмнопрстуфхыэ", "abvgdeziyklmnoprstufxie", strict=True)),
        "ё": "yo",
        "ж": "j",
        "ц": "ts",
        "ч": "ch",
        "ш": "sh",
        "щ": "sh",
        "ю": "yu",
        "я": "ya",
        "ъ": "",
        "ь": "",
    }
)


def _lat(s: str) -> str:
    return s.casefold().translate(_LAT)


def search(q: str, limit: int = 20) -> list[dict[str, Any]]:
    """Qidiruv: har so'z nom / kategoriya / variant / artikul / remen belgisi / brendda bo'lsin ("spb1650" = "SPB 1650";
    lotincha ham: "remen" = "ремень", "tishli" — kategoriya). Variantli tovar — har variant alohida qator. Katalog
    kichik — Python'da (SQLite kirillni registrsiz solishtira olmaydi)."""
    toks = [_lat(t) for t in q.split() if t]
    if not toks:
        return []
    rows: list[tuple[Item, Char | None]] = []
    chars: dict[int, list[Char]] = {}
    for c in Char.objects.filter(item__active=True):
        chars.setdefault(c.item_id, []).append(c)
    groups = dict(Group.objects.values_list("pk", "name"))
    for it in Item.objects.filter(active=True):
        grp = groups.get(it.group_id, "") if it.group_id else ""
        base = " ".join((it.name, it.name_ru, it.sku, it.belt_mark, it.brand, grp))
        for ch in chars.get(it.pk) or [None]:
            hay = _lat(f"{base} {ch.name if ch else ''}")
            flat = _compact(hay)
            if all(t in hay or _compact(t) in flat for t in toks):
                rows.append((it, ch))
                if len(rows) >= limit:
                    break
        if len(rows) >= limit:
            break
    free = wh.free({it.pk for it, _ in rows})
    return [_hit(it, ch, free) for it, ch in rows]


def find(name: str, char: str | None = None) -> dict[str, Any] | None:
    """Tovar (va variant) nom bo'yicha → qidiruv qatori ko'rinishida (demo/import uchun)."""
    it = Item.objects.filter(name=name, active=True).first()
    if it is None:
        return None
    ch = Char.objects.filter(item=it, name=char).first() if char else None
    if char and ch is None:
        return None
    return _hit(it, ch, wh.free([it.pk]))


# ------------------------------------------------------------------ demo katalog (dev baza)
# kategoriya → [(nom, birlik, remen belgisi, artikul, narx {mode, price}, variantlar [(nom, kenglik)], qoldiq)]
_P = dict[str, Any]
DEMO: list[tuple[str, _P, list[tuple[str, str, str, str, _P, list[tuple[str, int]], list[int]]]]] = [
    (
        "Klinli remenlar",
        {"kind": "goods", "belt": True},
        [
            ("Ремень клиновой SPA 1250", "dona", "SPA-1250", "SPA1250", {"mode": "piece", "price": 98000}, [], [140]),
            ("Ремень клиновой SPA 1400", "dona", "SPA-1400", "SPA1400", {"mode": "piece", "price": 104000}, [], [60]),
            ("Ремень клиновой SPB 1650", "dona", "SPB-1650", "SPB1650", {"mode": "piece", "price": 185000}, [], [64]),
            ("Ремень клиновой SPB 2000", "dona", "SPB-2000", "SPB2000", {"mode": "piece", "price": 212000}, [], [22]),
            ("Ремень клиновой SPC 3150", "dona", "SPC-3150", "SPC3150", {"mode": "piece", "price": 465000}, [], [8]),
            ("Ремень клиновой A-1250", "dona", "A-1250", "A1250", {"mode": "piece", "price": 54000}, [], [210]),
            ("Ремень клиновой B-1800", "dona", "B-1800", "B1800", {"mode": "piece", "price": 76000}, [], [0]),
            ("Ремень клиновой C-2240", "dona", "C-2240", "C2240", {"mode": "piece", "price": 138000}, [], [35]),
        ],
    ),
    (
        "Tishli remenlar",
        {"kind": "goods", "belt": True},
        [
            (
                "Ремень зубчатый 1040-8M-30",
                "dona",
                "1040-8M",
                "1040-8M-30",
                {"mode": "piece", "price": 412000},
                [],
                [18],
            ),
            ("Ремень зубчатый 5M-450-15", "dona", "450-5M", "450-5M-15", {"mode": "piece", "price": 89000}, [], [43]),
            (
                "Ремень зубчатый 1400-14M-40",
                "dona",
                "1400-14M",
                "1400-14M-40",
                {"mode": "piece", "price": 780000},
                [],
                [6],
            ),
            ("Ремень зубчатый 210XL-037", "dona", "210XL", "210XL037", {"mode": "piece", "price": 46000}, [], [120]),
        ],
    ),
    (
        "Poliklinli remenlar",
        {"kind": "goods", "belt": True},
        [
            (
                "Ремень поликлиновой 8PK 1795",
                "dona",
                "8PK-1795",
                "8PK1795",
                {"mode": "piece", "price": 134000},
                [],
                [27],
            ),
            (
                "Ремень поликлиновой 6PK 1220",
                "dona",
                "6PK-1220",
                "6PK1220",
                {"mode": "piece", "price": 82000},
                [],
                [54],
            ),
            (
                "Ремень поликлиновой 10PJ 1200",
                "dona",
                "10PJ-1200",
                "10PJ1200",
                {"mode": "piece", "price": 61000},
                [],
                [0],
            ),
        ],
    ),
    (
        "Konveyer lentalari",
        {"kind": "goods", "dims": "l", "unit": "m"},
        [
            # narx — 1 mm kenglik × kenglik (1 metr uchun)
            (
                "Лента конвейерная EP-400/3",
                "m",
                "",
                "EP400-3",
                {"mode": "mm", "price": 390},
                [("500 мм", 500), ("650 мм", 650), ("800 мм", 800), ("1000 мм", 1000)],
                [90, 120, 210, 40],
            ),
            (
                "Лента конвейерная EP-200/2",
                "m",
                "",
                "EP200-2",
                {"mode": "mm", "price": 370},
                [("400 мм", 400), ("500 мм", 500), ("650 мм", 650)],
                [60, 180, 75],
            ),
            ("Резинотканевая лента 2-650", "m", "", "RTL2-650", {"mode": "piece", "price": 265000}, [], [150]),
        ],
    ),
    (
        "Rukavlar",
        {"kind": "goods", "dims": "l", "unit": "m"},
        [
            ("Рукав напорный 25 мм", "m", "", "RN25", {"mode": "piece", "price": 42000}, [], [600]),
            ("Рукав напорный 32 мм", "m", "", "RN32", {"mode": "piece", "price": 56000}, [], [350]),
            ("Рукав всасывающий 50 мм", "m", "", "RV50", {"mode": "piece", "price": 98000}, [], [120]),
        ],
    ),
    (
        "Shkivlar va vtulkalar",
        {"kind": "goods"},
        [
            ("Шкив SPB 200-3", "dona", "", "SPB200-3", {"mode": "piece", "price": 650000}, [], [9]),
            ("Втулка Taper Lock 2012", "dona", "", "TL2012", {"mode": "piece", "price": 120000}, [], [30]),
        ],
    ),
]


@transaction.atomic
def demo_seed() -> dict[str, list[int]]:
    """Demo katalog: kategoriyalar, tovarlar (narx, variantlar), ombor qoldig'i. Bor nomlar o'tkaziladi (takrorlanmaydi).
    Qaytaradi — shu chaqiruvda yaratilganlar ID'lari (o'chirish uchun)."""
    made: dict[str, list[int]] = {"groups": [], "items": []}
    for i, (gname, attrs, items) in enumerate(DEMO):
        g, g_new = Group.objects.get_or_create(parent=None, name=gname, defaults={"attrs": attrs, "sort": i})
        if g_new:
            made["groups"].append(g.pk)
        for name, unit, mark, sku, price, chars, stock in items:
            if Item.objects.filter(name=name, active=True).exists():
                continue
            it = Item.objects.create(
                group=g,
                name=name,
                kind=Kind.GOODS,
                unit=unit,
                measured=unit != "dona",
                belt_mark=mark,
                sku=sku,
                price={**price, "step_mm": None, "overrides": {}},
                brand="Belting" if attrs.get("belt") else "",
            )
            made["items"].append(it.pk)
            if chars:
                for (cname, width), qty in zip(chars, stock, strict=True):
                    ch = Char.objects.create(item=it, name=cname, width_mm=width)
                    wh.set_qty(it.pk, ch.pk, Decimal(qty))
            else:
                wh.set_qty(it.pk, None, Decimal(stock[0]), Decimal(min(4, stock[0])))
    return made


@transaction.atomic
def demo_clear(made: dict[str, list[int]]) -> int:
    items = made.get("items", [])
    wh.drop(items)
    n = Item.objects.filter(pk__in=items).delete()[0]
    Group.objects.filter(pk__in=made.get("groups", []), items__isnull=True).delete()
    return n


# ------------------------------------------------------------------ ombor va sex uchun tovar ma'lumoti
UNIT_DIMS = {"m2": "wl", "mm": "w", "m": "l"}


def dims_of(item: Item) -> str | None:
    """O'lcham turi: `attrs.dims` (wl — eni × uzunligi, w — eni, l — uzunlik) yoki birlikdan; donali — None."""
    d = (item.attrs or {}).get("dims")
    if d in ("wl", "w", "l"):
        return d
    return UNIT_DIMS.get(item.unit) if item.measured else None


def _info(it: Item, grp: str, chars: list[Char]) -> dict[str, Any]:
    a = it.attrs or {}
    return {
        "id": it.pk,
        "name": it.name,
        "unit": it.unit,
        "kind": it.kind,
        "dims": dims_of(it),
        "sku": it.sku or None,
        "grp": grp or None,
        "min_qty": float(it.min_qty or 0),
        "barcode": a.get("barcode") or None,
        "legacy": a.get("legacy") or None,
        "base": a.get("base") or "",
        "material_id": a.get("material_id"),
        "active": it.active,
        "chars": {c.pk: {"name": c.name, "width_mm": c.width_mm, "length_mm": c.length_mm} for c in chars},
    }


def items_info(ids: Iterable[int] | None = None, *, active_only: bool = False) -> dict[int, dict[str, Any]]:
    """Tovarlar (ID → ma'lumot): ombor, sex. `ids=None` — hammasi."""
    qs = Item.objects.all()
    if ids is not None:
        qs = qs.filter(pk__in=list(ids))
    if active_only:
        qs = qs.filter(active=True)
    items = list(qs)
    chars: dict[int, list[Char]] = {}
    for c in Char.objects.filter(item__in=items):
        chars.setdefault(c.item_id, []).append(c)
    groups = dict(Group.objects.values_list("pk", "name"))
    return {it.pk: _info(it, groups.get(it.group_id, "") if it.group_id else "", chars.get(it.pk, [])) for it in items}


def by_code(code: str) -> list[dict[str, Any]]:
    """Skaner kodi → tovar(lar): shtrixkod / artikul (aniq) / eski 1C kodi (bir nechta bazada bo'lishi mumkin)."""
    code = code.strip()
    if not code:
        return []
    up = code.upper()
    hits = [
        it
        for it in Item.objects.filter(active=True)
        if (it.attrs or {}).get("barcode") == code or (it.sku and it.sku.upper() == up)
    ]
    if not hits:
        hits = [it for it in Item.objects.filter(active=True) if (it.attrs or {}).get("legacy") == code]
    info = items_info([it.pk for it in hits])
    return [info[it.pk] for it in hits]


def with_min_qty() -> list[int]:
    """Minimal qoldiq belgilangan faol tovarlar (ombor «kam qoldiq» ro'yxati)."""
    return list(Item.objects.filter(active=True, min_qty__gt=0).values_list("pk", flat=True))


@transaction.atomic
def ensure_item(
    name: str,
    *,
    unit: str,
    kind: str = "goods",
    dims: str | None = None,
    sku: str = "",
    group: str = "",
    min_qty: Decimal | int | None = None,
    attrs: dict[str, Any] | None = None,
    chars: list[tuple[str, int | None]] | None = None,
) -> tuple[int, dict[str, int]]:
    """Tovar bor bo'lsa — o'sha, yo'q bo'lsa — yaratiladi (demo/import: ombor, sex). → (item_id, {variant nomi: id})."""
    it = Item.objects.filter(name=name, active=True).first()
    if it is None:
        g = None
        if group:
            g, _ = Group.objects.get_or_create(parent=None, name=group)
        it = Item.objects.create(
            group=g,
            name=name,
            kind=kind,
            unit=unit,
            measured=dims is not None,
            sku=sku,
            min_qty=min_qty,
            attrs={**(attrs or {}), **({"dims": dims} if dims else {})},
        )
    out: dict[str, int] = {}
    for cname, width in chars or []:
        c, _ = Char.objects.get_or_create(item=it, name=cname, defaults={"width_mm": width})
        out[cname] = c.pk
    return it.pk, out

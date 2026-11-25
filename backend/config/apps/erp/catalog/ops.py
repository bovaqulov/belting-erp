"""Katalog boshqaruvi — HTTP API (`/app/api/erp/cat/*`, docs/api/catalog.md) mantiqi. Qoidalar frontend demo backend
(`src/erp/finance/demo/server.lib.ts`) va Jarvis `erp/catalog/manage.py` bilan bir xil: 2 darajali kategoriya, nom
takrori yo'q, belgidan avtomatik nom, omborda qoldig'i bor tovarning birligi o'zgarmaydi, kenglik variantlari,
rukavdan tayyor mahsulot, narx (dona / mm). Qoldiq — ombor ochiq interfeysi orqali.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction

from config.apps.core.http import ApiError
from config.apps.erp.warehouse import services as wh

from . import pricing as PR
from . import specs as S
from .models import Char, Group, Item, Kind
from .naming import UNIT_OF, family, search_text

KINDS = {k for k, _ in Kind.choices}
# tavsiya etilgan kategoriyalar (Jarvis TEMPLATE): (nom, ruscha, odatiy qiymatlar)
# (nom, ruscha, odatiy qiymatlar) — har biri texnik oilaga bog'langan (specs.FAMILIES)
TEMPLATE: list[tuple[str, str, dict[str, Any]]] = [
    ("Rukavlar", "Рукава", {"family": "sleeve", "kind": "material", "dims": "w", "unit": "mm", "belt": True}),
    ("Tishli remenlar", "Зубчатые ремни", {"family": "timing", "kind": "product", "unit": "dona", "belt": True}),
    ("Klinli remenlar", "Клиновые ремни", {"family": "vbelt", "kind": "goods", "unit": "dona", "belt": True}),
    ("Poliklinli remenlar", "Поликлиновые ремни", {"family": "ribbed", "kind": "goods", "unit": "dona", "belt": True}),
    ("Konveyer lentalar", "Конвейерные ленты", {"family": "conveyor", "kind": "material", "dims": "wl", "unit": "m2"}),
    (
        "Konveyer lenta materiallari",
        "Материалы для конвейерных лент",
        {"family": "light", "kind": "material", "dims": "wl", "unit": "m2"},
    ),
    (
        "Yassi remen materiallari",
        "Материалы для плоских ремней",
        {"family": "flat", "kind": "material", "dims": "wl", "unit": "m2"},
    ),
    ("Modulli lentalar", "Модульные ленты", {"family": "modular", "kind": "goods", "unit": "dona"}),
    ("Profillar", "Профили", {"family": "profile", "kind": "material", "dims": "l", "unit": "m"}),
    ("Dumaloq remenlar", "Круглые ремни", {"family": "round", "kind": "material", "dims": "l", "unit": "m"}),
    ("Mexanik ulagichlar", "Механические соединения", {"family": "fastener", "kind": "goods", "unit": "dona"}),
    ("Val qoplamalari", "Футеровка барабанов", {"family": "lagging", "kind": "material", "dims": "l", "unit": "m"}),
    ("Shkivlar va vtulkalar", "Шкивы и втулки", {"family": "pulley", "kind": "goods", "unit": "dona"}),
    ("Boshqa tovarlar", "Прочие товары", {"family": "other", "kind": "goods", "unit": "dona"}),
    ("Xizmatlar", "Услуги", {"family": "service", "kind": "service", "unit": "xizmat"}),
]
MAX_ROWS = 200
MAX_WIDTH = 5000


def bad(msg: str) -> ApiError:
    return ApiError(400, msg)


def not_found(msg: str) -> ApiError:
    return ApiError(404, msg)


def _s(v: Any) -> str:
    return "" if v is None else str(v).strip()


def _dec(v: Any) -> Decimal | None:
    """Raqam (bo'sh joy va vergul bilan ham) yoki None (bo'sh / noto'g'ri)."""
    s = _s(v).replace(" ", "").replace(" ", "").replace(",", ".")
    if not s:
        return None
    try:
        d = Decimal(s)
    except InvalidOperation:
        return None
    return d if d.is_finite() else None


def _n(d: Decimal | float | int | None) -> int | float | None:
    """JSON uchun: butun bo'lsa int."""
    if d is None:
        return None
    d = Decimal(str(d))
    return int(d) if d == d.to_integral_value() else float(d)


def _fold(s: str | None) -> str:
    return (s or "").casefold()


# ------------------------------------------------------------------ kategoriyalar
def _group_json(g: Group, counts: dict[int, int]) -> dict[str, Any]:
    return {
        "id": g.pk,
        "parent_id": g.parent_id,
        "name": g.name,
        "name_ru": g.name_ru or None,
        "attrs": g.attrs or {},
        "sort": g.sort,
        "items": counts.get(g.pk, 0),
    }


def _counts() -> dict[int, int]:
    out: dict[int, int] = {}
    for gid in Item.objects.filter(active=True, group__isnull=False).values_list("group_id", flat=True):
        out[gid] = out.get(gid, 0) + 1
    return out


def groups() -> list[dict[str, Any]]:
    """Avval asosiylar, keyin ichkilar; ichida — tartib, nom."""
    gs = sorted(Group.objects.all(), key=lambda g: (g.parent_id is not None, g.sort, _fold(g.name)))
    counts = _counts()
    return [_group_json(g, counts) for g in gs]


def _attrs(raw: Any) -> dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}
    a: dict[str, Any] = {}
    if raw.get("family"):
        if S.get(raw["family"]) is None:
            raise bad("Texnik oila noto'g'ri")
        a["family"] = raw["family"]
    if raw.get("kind"):
        if raw["kind"] not in KINDS:
            raise bad("Tovar turi noto'g'ri")
        a["kind"] = raw["kind"]
    if raw.get("dims"):
        if raw["dims"] not in UNIT_OF:
            raise bad("O'lcham turi noto'g'ri")
        a["dims"] = raw["dims"]
    if raw.get("unit"):
        a["unit"] = _s(raw["unit"])
    if raw.get("belt"):
        a["belt"] = True
    return a


@transaction.atomic
def save_group(d: dict[str, Any]) -> dict[str, Any]:
    name = _s(d.get("name"))
    if not name:
        raise bad("Kategoriya nomi kerak")
    attrs = _attrs(d.get("attrs"))
    parent_id = int(d.get("parent_id") or 0) or None
    if parent_id:
        p = Group.objects.filter(pk=parent_id).first()
        if p is None:
            raise bad("Ota kategoriya topilmadi")
        if p.parent_id:
            raise bad("Ichki kategoriya ichida yana kategoriya ochilmaydi (2 daraja)")
    gid = int(d.get("id") or 0)
    if any(
        _fold(n) == _fold(name)
        for n in Group.objects.filter(parent_id=parent_id).exclude(pk=gid).values_list("name", flat=True)
    ):
        raise bad(f"«{name}» kategoriyasi bor")
    if gid:
        g = Group.objects.filter(pk=gid).first()
        if g is None:
            raise not_found("Kategoriya topilmadi")
        if parent_id == g.pk or (parent_id and Group.objects.filter(parent_id=g.pk).exists()):
            raise bad("Ichki kategoriyasi bor kategoriya boshqasining ichiga o'tkazilmaydi (2 daraja)")
    else:
        g = Group()
    g.parent_id = parent_id
    g.name = name
    g.name_ru = _s(d.get("name_ru"))
    g.attrs = attrs
    g.sort = int(_dec(d.get("sort")) or 0)
    g.save()
    return _group_json(g, _counts())


def seed_groups() -> list[dict[str, Any]]:
    """Tavsiya etilgan kategoriyalar — bor bo'lsa o'tkaziladi; qo'shilganlar qaytadi."""
    out = []
    for i, (name, name_ru, attrs) in enumerate(TEMPLATE):
        g = Group.objects.filter(parent=None, name__iexact=name).first()
        if g is not None and not (g.attrs or {}).get("family"):  # eski kategoriya — texnik oilasi qo'shiladi
            g.attrs = {**(g.attrs or {}), "family": attrs["family"]}
            g.save(update_fields=["attrs"])
        try:
            out.append(save_group({"name": name, "name_ru": name_ru, "attrs": attrs, "sort": i * 10}))
        except ApiError:
            continue
    return out


@transaction.atomic
def drop_group(gid: int) -> dict[str, bool]:
    g = Group.objects.filter(pk=gid).first()
    if g is None:
        raise not_found("Kategoriya topilmadi")
    if Item.objects.filter(group=g, active=True).exists() or Group.objects.filter(parent=g).exists():
        raise bad("Kategoriyada tovar yoki ichki kategoriya bor — avval ularni ko'chiring")
    Item.objects.filter(group=g).update(group=None)  # arxivdagi (nofaol) tovarlar kategoriyasiz qoladi
    g.delete()
    return {"ok": True}


# ------------------------------------------------------------------ tovarlar
def _price(p: Any) -> dict[str, Any] | None:
    if not isinstance(p, dict):
        return None
    return {
        "mode": "mm" if p.get("mode") == "mm" else "piece",
        "price": p.get("price"),
        "step_mm": p.get("step_mm"),
        "overrides": p.get("overrides") or {},
        "source": p.get("source") or None,
    }


def _rows(items: list[Item]) -> list[dict[str, Any]]:
    names = {g.pk: (g.name, g.parent_id) for g in Group.objects.all()}
    tot = wh.item_totals([it.pk for it in items])
    nchars: dict[int, int] = {}
    for iid in Char.objects.filter(item__in=items).values_list("item_id", flat=True):
        nchars[iid] = nchars.get(iid, 0) + 1
    pol = PR.policy()
    out = []
    for it in items:
        a = it.attrs or {}
        now = PR.price_of(it, None, pol)
        via = PR.uses_source(it)
        grp, pid = names.get(it.group_id or 0, (None, None))
        qty, units = tot.get(it.pk, (Decimal(0), 0))
        out.append(
            {
                "id": it.pk,
                "name": it.name,
                "kind": it.kind,
                "unit": it.unit,
                "measured": it.measured,
                "dims": a.get("dims") or None,
                "brand": it.brand or None,
                "belt_mark": it.belt_mark or None,
                "sku": it.sku or None,
                "group_id": it.group_id,
                "grp": grp,
                "parent_grp": names[pid][0] if pid in names else None,
                "material_id": a.get("material_id"),
                "family": it.family or None,
                "designation": it.designation or None,
                "chars": nchars.get(it.pk, 0),
                "qty": _n(qty.quantize(Decimal("0.0001"))),
                "units": units,
                "price": _price(it.price),
                # amaldagi narx (QQSsiz): AppSheet yoki qo'lda; rukav/qovurg'a — «eni bo'yicha» (eni berilganda)
                "price_now": _n(now),
                "price_from": "appsheet" if via else ("manual" if now is not None else None),
                "price_by": PR.mode_of(it.price_src) if via else None,
            }
        )
    return out


def item_rows(
    q: str = "", group_id: Any = None, kind: str = "", family: str = "", brand: str = ""
) -> list[dict[str, Any]]:
    """Ro'yxat (≤200): q — nom, belgi ("1040 8M"), artikul, kategoriya; group_id — ichkilari bilan; texnik oila, brend."""
    qs = Item.objects.filter(active=True)
    if family:
        qs = qs.filter(family=family)
    if brand:
        qs = qs.filter(brand__iexact=brand)
    gid = int(_dec(group_id) or 0)
    if gid:
        qs = qs.filter(group_id__in=[gid, *Group.objects.filter(parent_id=gid).values_list("pk", flat=True)])
    if kind:
        qs = qs.filter(kind=kind)
    s = _fold(q.strip())
    items = list(qs.select_related("group", "price_src"))
    if s:
        items = [
            it
            for it in items
            if any(
                s in _fold(x)
                for x in (
                    it.name,
                    it.name_ru,
                    it.belt_mark,
                    it.sku,
                    it.designation,
                    (it.attrs or {}).get("search"),
                    it.group.name if it.group else "",
                )
            )
        ]
    items.sort(key=lambda it: _fold(it.name))
    return _rows(items[:MAX_ROWS])


def item_detail(item_id: int, cost_ok: bool = False) -> dict[str, Any]:
    it = Item.objects.select_related("group", "price_src").filter(pk=item_id).first()
    if it is None:
        raise not_found("Tovar topilmadi")
    a = dict(it.attrs or {})
    chars = list(Char.objects.filter(item=it))
    cname = {c.pk: c.name for c in chars}
    mid = a.get("material_id")
    m = Item.objects.filter(pk=mid).first() if mid else None
    products = Item.objects.filter(active=True, attrs__material_id=it.pk).order_by("name")
    return {
        "id": it.pk,
        "name": it.name,
        "name_ru": it.name_ru or None,
        "kind": it.kind,
        "unit": it.unit,
        "measured": it.measured,
        "brand": it.brand or None,
        "belt_mark": it.belt_mark or None,
        "sku": it.sku or None,
        "min_qty": _n(it.min_qty),
        "ikpu": it.ikpu or None,
        "group_id": it.group_id,
        "grp": it.group.name if it.group else None,
        "active": it.active,
        "attrs": a,
        "chars": [{"id": c.pk, "name": c.name, "width_mm": c.width_mm, "length_mm": c.length_mm} for c in chars],
        "material": {"id": m.pk, "name": m.name} if m else None,
        "products": [{"id": p.pk, "name": p.name} for p in products],
        **_tech(it, a),
        "pricing": PR.info(it, cost_ok),
        "stock": [
            {
                "warehouse": u["warehouse"],
                "firm": u["firm"],
                "loc": u["loc"],
                "code": u["code"],
                "width_mm": u["width_mm"],
                "length_mm": u["length_mm"],
                "qty": u["qty"],
                "char": cname.get(u["char_id"]) if u["char_id"] else None,
            }
            for u in wh.item_units(it.pk)
        ],
        "price": _price(it.price),
    }


def _add_char(item: Item, width: Any) -> None:
    w = _dec(width)
    if w is None or w <= 0 or w > MAX_WIDTH:
        raise bad(f"Kenglik noto'g'ri: {_s(width)}")
    if w != w.to_integral_value():
        raise bad(f"Kenglik butun mm bo'lsin: {_s(width)}")
    wi = int(w)
    if Char.objects.filter(item=item, width_mm=wi).exists():
        return
    Char.objects.get_or_create(item=item, name=f"{wi} mm", defaults={"width_mm": wi})


def _widths(d: dict[str, Any]) -> list[Any]:
    w = d.get("widths")
    return list(w) if isinstance(w, list) else []


def _analogs(it: Item) -> list[dict[str, Any]]:
    """Analoglar: bir xil standart kalitli boshqa tovarlar (odatda boshqa brend) — qoldig'i bilan."""
    if not it.match_key:
        return []
    others = list(
        Item.objects.filter(active=True, match_key=it.match_key).exclude(pk=it.pk).order_by("brand", "name")[:30]
    )
    tot = wh.item_totals([o.pk for o in others])
    return [
        {
            "id": o.pk,
            "name": o.name,
            "brand": o.brand or None,
            "unit": o.unit,
            "qty": _n(tot.get(o.pk, (Decimal(0), 0))[0]),
            "same_brand": _fold(o.brand) == _fold(it.brand),
        }
        for o in others
    ]


def _tech(it: Item, a: dict[str, Any]) -> dict[str, Any]:
    fam = S.get(it.family)
    spec = it.spec or {}
    return {
        "family": it.family or None,
        "family_title": fam.title if fam else None,
        "std": fam.std if fam and fam.std != "—" else None,
        "spec": spec,
        "spec_view": S.label_of(fam, spec) if fam else [],
        "computed": S.computed(fam, spec) if fam else [],
        "designation": it.designation or None,
        "hs_code": it.hs_code or None,
        "hs_hint": (S.hs_hint(fam, spec) or None) if fam else None,
        "barcode": a.get("barcode") or None,
        "legacy": list(dict.fromkeys(x for x in [*(a.get("legacy_codes") or []), a.get("legacy")] if x)),
        "base": a.get("base") or None,
        "analogs": _analogs(it),
    }


def _legacy_spec(d: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
    """Eski so'rov (profile, length, lstd, ribs) → (oila, spec)."""
    profile = "".join(_s(d.get("profile")).upper().split())
    if not profile:
        return None
    fam = {"v": "vbelt", "rib": "ribbed"}.get(family(profile), "timing")
    if fam == "vbelt":
        spec = {"section": profile, "length": d.get("length")}
        lstd = _s(d.get("lstd"))
        if lstd:
            spec["lref"] = lstd[:1].upper() + lstd[1:].lower()
        return fam, spec
    if fam == "ribbed":
        return fam, {"profile": profile, "length": d.get("length"), "ribs": d.get("ribs")}
    return fam, {"profile": profile, "length": d.get("length")}


def _resolve(d: dict[str, Any], g: Group | None, dims: str | None) -> tuple[S.Family, dict[str, Any]]:
    """So'rovdan oila va toza spec (xato — ApiError)."""
    ga = {**((g.parent.attrs or {}) if g and g.parent else {}), **((g.attrs or {}) if g else {})}
    fkey = _s(d.get("family"))
    raw = d.get("spec") if isinstance(d.get("spec"), dict) else None
    if not fkey and raw is None and (leg := _legacy_spec(d)):
        fkey, raw = leg
    fkey = fkey or ga.get("family") or "other"
    if fkey == "timing" and dims == "w":
        fkey = "sleeve"  # eni mm bo'yicha saqlanadigan tishli — rukav
    fam = S.get(fkey)
    if fam is None:
        raise bad("Texnik oila noto'g'ri")
    spec, errs = S.clean(fam, raw or {})
    if errs:
        raise bad(next(iter(errs.values())))
    return fam, spec


def _dup(fam: S.Family, spec: dict[str, Any], brand: str, iid: int, unit: str = "") -> Item | None:
    """Takror: bir xil standart kalit + brend (+ birlik — rukav mm va rukav bo'lagi dona alohida tovar)."""
    key = S.match_key(fam, spec)
    if not key:
        return None
    qs = Item.objects.filter(active=True, match_key=key, brand__iexact=brand).exclude(pk=iid)
    return (qs.filter(unit=unit) if unit else qs).order_by("pk").first()


def preview(d: dict[str, Any]) -> dict[str, Any]:
    """Forma uchun jonli ko'rinish: belgi, nom, hisoblangan ko'rsatkichlar, TIF TN taklifi, takror va analoglar.
    Xato bo'lsa — `errors` (maydon → matn), saqlamaydi."""
    fam = S.get(_s(d.get("family")))
    if fam is None:
        return {"errors": {"family": "Texnik oilani tanlang"}}
    spec, errs = S.clean(fam, d.get("spec"))
    brand = _s(d.get("brand")).upper()
    name, full = S.auto_name(fam, spec, brand, _s(d.get("series")))
    iid = int(_dec(d.get("id")) or 0)
    pd = d.get("dims") if "dims" in d else fam.dims
    unit = UNIT_OF.get(pd, "") if pd else ("xizmat" if fam.key == "service" else "dona")
    dup = None if errs else _dup(fam, spec, brand, iid, unit)
    key = S.match_key(fam, spec) if not errs else ""
    analogs = (
        [
            {"id": o.pk, "name": o.name, "brand": o.brand or None}
            for o in Item.objects.filter(active=True, match_key=key).exclude(pk=iid).order_by("brand", "name")[:10]
        ]
        if key
        else []
    )
    return {
        "errors": errs,
        "designation": S.designation(fam, spec) or None,
        "name": name or None,
        "name_ru": full or None,
        "computed": S.computed(fam, spec),
        "hs_hint": S.hs_hint(fam, spec) or None,
        "dup": {"id": dup.pk, "name": dup.name} if dup else None,
        "analogs": analogs,
    }


@transaction.atomic
def save_item(d: dict[str, Any]) -> dict[str, Any]:
    g = Group.objects.filter(pk=int(_dec(d.get("group_id")) or 0)).select_related("parent").first()
    if g is None:
        raise bad("Kategoriyani tanlang")
    ga = {**((g.parent.attrs or {}) if g.parent else {}), **(g.attrs or {})}
    iid = int(_dec(d.get("id")) or 0)
    old = Item.objects.filter(pk=iid, active=True).first() if iid else None
    if iid and old is None:
        raise not_found("Tovar topilmadi")
    pre_fam = S.get(_s(d.get("family")) or ga.get("family"))
    if "dims" in d:
        dims = d.get("dims") or None
    else:  # kategoriya odatiy qiymati; kategoriyada sozlama yo'q bo'lsa — oilaniki (yangi tovar)
        dims = ga.get("dims") or (pre_fam.dims if pre_fam and old is None and not ga else None)
    if dims and dims not in UNIT_OF:
        raise bad("O'lcham turi noto'g'ri")
    if old is not None and not any(k in d for k in ("family", "spec", "profile")):
        d = {**d, "family": old.family or "other", "spec": old.spec or {}}  # texnik qism o'zgarmaydi (faqat nom, narx…)
    fam, spec = _resolve(d, g, dims)
    kind = _s(d.get("kind")) or ga.get("kind") or fam.kind or Kind.GOODS
    if kind not in KINDS:
        raise bad("Tovar turi noto'g'ri")
    unit = UNIT_OF[dims] if dims else ("xizmat" if kind == Kind.SERVICE else _s(d.get("unit")) or "dona")
    brand = _s(d.get("brand")).upper()
    series = _s(d.get("series"))
    auto, full = S.auto_name(fam, spec, brand, series)
    name = " ".join(_s(d.get("name")).split()) or auto
    if not name:
        raise bad("Tovar nomi kerak (yoki texnik ko'rsatkichlar)")
    for oid, oname in Item.objects.filter(active=True).exclude(pk=iid).values_list("pk", "name"):
        if _fold(oname) == _fold(name):
            raise bad(f"«{name}» katalogda bor (#{oid})")
    if (dup := _dup(fam, spec, brand, iid, unit)) is not None:
        raise bad(f"Bu tovar katalogda bor: «{dup.name}» (#{dup.pk}) — bir xil belgi va brend")
    mark = S.designation(fam, spec)
    attrs: dict[str, Any] = {"dims": dims, "series": series or None, "note": _s(d.get("note")) or None}
    if d.get("material_id"):
        attrs["material_id"] = int(_dec(d["material_id"]) or 0) or None
    if "barcode" in d:
        attrs["barcode"] = _s(d.get("barcode")) or None
    if old is not None:
        it = old
        if it.unit != unit and wh.stock_of(it.pk) > 0:
            raise bad("Omborda harakati bor tovarning o'lchov birligi o'zgarmaydi")
        merged = {**(it.attrs or {}), **{k: v for k, v in attrs.items() if v is not None or k in ("barcode", "dims")}}
        for k in ("series", "note"):
            if k in d and not attrs.get(k):
                merged.pop(k, None)
    else:
        it = Item()
        merged = {k: v for k, v in attrs.items() if v is not None or k == "dims"}
    merged["search"] = search_text(name, mark)
    it.kind = kind
    it.name = name
    it.name_ru = _s(d.get("name_ru")) or full or name
    it.group = g
    it.unit = unit
    it.measured = bool(dims)
    it.brand = brand
    it.family = fam.key
    it.spec = spec
    it.designation = mark
    it.match_key = S.match_key(fam, spec)
    it.belt_mark = mark if fam.belt else ""
    it.hs_code = _s(d.get("hs_code")).replace(" ", "")[:12] if "hs_code" in d else (it.hs_code or "")
    it.sku = _s(d.get("sku"))
    min_qty = _dec(d.get("min_qty"))
    if min_qty is not None and min_qty < 0:
        raise bad("Minimal qoldiq manfiy bo'lmaydi")
    it.min_qty = min_qty
    it.ikpu = _s(d.get("ikpu")) if "ikpu" in d or old is None else it.ikpu
    it.attrs = merged
    it.save()
    for w in _widths(d):
        _add_char(it, w)
    PR.link([it.pk])  # narx manbasi (AppSheet) — yangi belgi/brend bo'yicha
    return item_detail(it.pk)


def duplicates() -> list[dict[str, Any]]:
    """Ehtimoliy takrorlar: bir xil standart kalit + brend, bir xil artikul yoki bir xil belgi (brendsiz)."""
    items = list(Item.objects.filter(active=True).order_by("pk"))
    buckets: dict[tuple[str, str], list[Item]] = {}
    for it in items:
        if it.match_key:
            key = f"{it.match_key}|{_fold(it.brand)}|{it.unit}"
            buckets.setdefault(("Belgi, brend va birlik bir xil", key), []).append(it)
        if it.sku:
            buckets.setdefault(("Artikul bir xil", _fold(it.sku)), []).append(it)
    tot = wh.item_totals([it.pk for it in items])
    out = []
    seen: set[frozenset[int]] = set()
    for (why, _), its in buckets.items():
        ids = frozenset(i.pk for i in its)
        if len(its) < 2 or ids in seen:
            continue
        seen.add(ids)
        out.append(
            {
                "why": why,
                "items": [
                    {
                        "id": i.pk,
                        "name": i.name,
                        "brand": i.brand or None,
                        "sku": i.sku or None,
                        "unit": i.unit,
                        "qty": _n(tot.get(i.pk, (Decimal(0), 0))[0]),
                    }
                    for i in its
                ],
            }
        )
    return out


def brands() -> list[str]:
    return sorted(
        {b for b in Item.objects.filter(active=True).exclude(brand="").values_list("brand", flat=True)}, key=_fold
    )


@transaction.atomic
def add_widths(item_id: int, d: dict[str, Any]) -> dict[str, Any]:
    it = Item.objects.filter(pk=item_id, active=True).first()
    if it is None:
        raise not_found("Tovar topilmadi")
    for w in _widths(d):
        _add_char(it, w)
    return item_detail(it.pk)


@transaction.atomic
def make_products(material_id: int, d: dict[str, Any]) -> dict[str, Any]:
    """Rukavdan (eni mm bo'yicha xom ashyo) tayyor mahsulot; bor bo'lsa — unga kenglik qo'shiladi."""
    m = Item.objects.filter(pk=material_id, active=True).first()
    if m is None or (m.attrs or {}).get("dims") != "w":
        raise bad("Tayyor mahsulot faqat rukavdan (eni mm bo'yicha xom ashyo) yaratiladi")
    have = Item.objects.filter(active=True, kind=Kind.PRODUCT, attrs__material_id=m.pk).first()
    if have:
        for w in _widths(d):
            _add_char(have, w)
        return item_detail(have.pk)
    a = m.attrs or {}
    name = m.name[len("Рукав ") :] if m.name.startswith("Рукав ") else m.name
    spec = {k: v for k, v in (m.spec or {}).items() if k in ("profile", "length", "material", "cord")}
    return save_item(
        {
            "group_id": d.get("group_id"),
            "kind": Kind.PRODUCT,
            "dims": None,
            "unit": "dona",
            "family": "timing",
            "spec": spec,
            "brand": m.brand,
            "series": a.get("series"),
            "material_id": m.pk,
            "widths": _widths(d),
            "name": name,
        }
    )


@transaction.atomic
def save_price(item_id: int, d: dict[str, Any]) -> dict[str, Any]:
    """Narx: dona yoki mm bo'yicha; qadam (mm); kenglik bo'yicha qo'lda narx. Narx/qadam ≥ 0; bo'sh override — o'chadi."""
    it = Item.objects.filter(pk=item_id, active=True).first()
    if it is None:
        raise not_found("Tovar topilmadi")
    mode = "mm" if _s(d.get("mode")) == "mm" else "piece"
    price = _dec(d.get("price"))
    step = _dec(d.get("step_mm"))
    if (price is not None and price < 0) or (step is not None and step < 0):
        raise bad("Narx va qadam manfiy bo'lmaydi")
    overrides: dict[str, int | float | None] = {}
    raw = d.get("overrides")
    for w, v in (raw if isinstance(raw, dict) else {}).items():
        n = _dec(v)
        if n is None:
            continue
        if n < 0:
            raise bad(f"{w} mm narxi manfiy bo'lmaydi")
        key = _dec(w)
        if key is None:
            raise bad(f"Kenglik noto'g'ri: {w}")
        overrides[str(_n(key))] = _n(n)
    source = _s(d.get("source")) or (it.price or {}).get("source") or ("appsheet" if it.price_src_id else "manual")
    if source not in ("appsheet", "manual"):
        raise bad("Narx manbasi noto'g'ri")
    it.price = {
        "mode": mode,
        "price": _n(price),
        "step_mm": _n(step) if mode == "mm" and step else None,
        "overrides": overrides,
        "source": source,
    }
    it.save(update_fields=["price"])
    return item_detail(it.pk)


def labels_link(item_id: Any) -> dict[str, Any]:
    """Tovarning omborda stikerli birliklari uchun stiker PDF havolasi."""
    iid = int(_dec(item_id) or 0)
    if not Item.objects.filter(pk=iid).exists():
        raise not_found("Tovar topilmadi")
    ids = [u["id"] for u in wh.item_units(iid) if u["code"]]
    if not ids:
        raise bad("Bu tovarning omborda stikerli birligi yo'q")
    return {"url": f"/app/api/erp/labels/units.pdf?ids={','.join(map(str, ids))}", "count": len(ids)}

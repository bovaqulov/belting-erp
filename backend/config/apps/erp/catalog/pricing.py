"""Narx siyosati — manba AppSheet (Jarvis `integrations/belts.py` qoidalari, docs/plans/2026-11-21-pricing.md).

- AppSheet qatori → `PriceSource`: sotuv narxi (QQSsiz / QQS bilan; jonli `*_virtual` ustun), tannarx, rukavning birlik
  tannarxi (USD, 1 mm eni yoki 1 qovurg'a), marja, Li/Lp/La (Li-standart qatorlardagi Lp ishorasi tuzatiladi).
- Rukavdan kesiladigan remen: `⌈Cost × eni × KURS × (1 + Marja/100) / Y⌉ × Y + QAT'IY` (Y — yaxlitlash, 1000 so'm);
  poliklinli rukav — eni o'rniga qovurg'a soni. KURS va QAT'IY ma'lumotdan o'rganiladi (`learn`).
- Katalog bilan bog'lash: oila + moslik sinfi (8M ≡ RPP8) + uzunlik + brend; klinlida — tovar uzunlik tizimiga mos
  ustun (Li / Lp / La; tizimsiz — Lp).
- Narx tartibi (`price_of`): kenglik bo'yicha qo'lda narx → manba (`price.source`: AppSheet bog'langan bo'lsa
  odatiy, `manual` — qo'lda) → qo'lda narx.
- MAXFIY: tannarx, marja, birlik tannarxi va formula — faqat `cost_ok` (rahbariyat) javobida.
"""

from __future__ import annotations

import logging
import math
import os
from collections import Counter
from datetime import datetime
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from . import parse as P
from . import specs as S
from .models import Char, Item, PricePolicy, PriceSource

log = logging.getLogger(__name__)
KINDS = (("v", "VBELT"), ("t", "TIMING"))
STALE_H = 24


def policy() -> PricePolicy:
    return PricePolicy.objects.get_or_create(pk=1)[0]


def configured() -> bool:
    return any(os.environ.get(f"APPSHEET_{k}_APP_ID") and os.environ.get(f"APPSHEET_{k}_KEY") for _, k in KINDS)


# ------------------------------------------------------------------ AppSheet qatori
def _f(v: Any) -> float:
    try:
        return float(str(v).replace(",", ".").replace(" ", "").replace(" ", "") or 0)
    except ValueError:
        return 0.0


def _live(r: dict[str, Any], col: str) -> float:
    """Ilovada ko'rinadigan (formula bilan jonli) qiymat — `<col>_virtual`; bo'lmasa saqlangan (u ba'zan eski kursda)."""
    v = next((r[k] for k in (f"{col}_virtual", f"{col}_Virtual") if r.get(k) not in (None, "")), None)
    return _f(v) if v is not None else _f(r.get(col))


def prices(r: dict[str, Any]) -> tuple[float, float, float]:
    """(QQSsiz, QQS bilan, tannarx). Jonli qiymat — faqat tannarx bor bo'lsa (tannarxsiz qatorda virtual narx faqat
    qat'iy qo'shimchadan iborat)."""
    net = _live(r, "net_cost_belt") or _live(r, "Net_cost_belt")
    if net:
        return _live(r, "Selling_price"), _live(r, "Selling_price_VAT"), net
    return _f(r.get("Selling_price")), _f(r.get("Selling_price_VAT")), _f(r.get("Net_cost_belt"))


def norm_lens(li: float, lp: float) -> tuple[float, float]:
    """Klinlida doim Lp > Li; Li-standart qatorlarda Lp ishorasi xato (Li−30 o'rniga Li+30) — aks ettiriladi."""
    return (li, 2 * li - lp) if li and lp and li > lp else (li, lp)


def _parsed(src: str, mark: str, name: str, ptype: str = "") -> tuple[str, dict[str, Any], str]:
    """(oila, spec, brend): belgi va nomdan (`parse.py`); brend — nomdan (AppSheet belgisida brend yo'q)."""
    hint = "Клиновые" if src == "v" else "Зубчатые ремни"
    p = P.parse(mark, hint) or P.parse(name, hint)
    if p is None and ptype:
        p = P.parse(f"{mark} {ptype}", hint)
    fam, spec = "", {}
    if p is not None:
        f, sp, errs = P.to_spec(p)
        if not errs:
            fam, spec = f.key, sp
    brand = (p.brand if p else "") or P.brand_of(name)
    return fam, spec, brand


def from_appsheet(src: str, r: dict[str, Any]) -> dict[str, Any]:
    mark = str(r.get("mark") or "").strip()
    name = str(r.get("mark_name_remenuz") or r.get("mark_name") or "").strip()
    sleeve = str(r.get("Goods/Sleeve") or "").strip()
    fam, spec, brand = _parsed(src, mark, name, str(r.get("_type") or ""))
    if fam == "timing" and sleeve == "Рукав":
        spec = {k: v for k, v in spec.items() if k != "width"}
    li, lp = norm_lens(_f(r.get("Li")), _f(r.get("Lp")))
    price, price_vat, net = prices(r)
    return {
        "src": src,
        "ext_id": str(r.get("v-belts_id") or r.get("id") or mark)[:60],
        "mark": mark[:120],
        "name": name[:255],
        "sleeve": sleeve[:16],
        "family": fam,
        "spec": spec,
        "brand": brand,
        "li": li,
        "lp": lp,
        "la": _f(r.get("La")),
        "width": _f(r.get("width") or r.get("width_virtual")),
        "price": round(price),
        "price_vat": round(price_vat),
        "net": round(net),
        "cost_unit": _f(r.get("Cost_per_mm")) or _f(r.get("Cost_per_rib")),
        "margin": _f(r.get("Margin")),
        "origin": str(r.get("Country_Origin") or "")[:60],
    }


def from_jarvis(r: dict[str, Any]) -> dict[str, Any]:
    """Jarvis keshidagi (`belt_item`) qator — u allaqachon `_prices`/`_norm_lens` dan o'tgan."""
    src = r["src"]
    mark, name = r["mark"] or "", r["name"] or ""
    fam, spec, brand = _parsed(src, mark, name)
    if fam == "timing" and r["sleeve"] == "Рукав":
        spec = {k: v for k, v in spec.items() if k != "width"}
    return {
        "src": src,
        "ext_id": str(r["id"])[:60],
        "mark": mark[:120],
        "name": name[:255],
        "sleeve": (r["sleeve"] or "")[:16],
        "family": fam,
        "spec": spec,
        "brand": brand,
        "li": r["li"] or 0,
        "lp": r["lp"] or 0,
        "la": r["la"] or 0,
        "width": r["width"] or 0,
        "price": round(r["price"] or 0),
        "price_vat": round(r["price_vat"] or 0),
        "net": round(r["net"] or 0),
        "cost_unit": r["cost_mm"] or 0,
        "margin": r["margin"] or 0,
        "origin": (r["origin"] or "")[:60],
    }


def learn(rows: list[dict[str, Any]]) -> tuple[int, int] | None:
    """KURS va QAT'IY — tannarxi va eni bor rukav qatorlaridan (eng ko'p uchragan qiymat): Net = Cost × eni × KURS,
    Narx = ⌈Net × (1 + Marja/100) / 1000⌉ × 1000 + QAT'IY."""
    rate: Counter[int] = Counter()
    fixed: Counter[int] = Counter()
    for r in rows:
        c, w, n, m, sp = (_f(r.get(k)) for k in ("Cost_per_mm", "width", "Net_cost_belt", "Margin", "Selling_price"))
        if r.get("Goods/Sleeve") == "Рукав" and c and w and n:
            rate[round(n / (c * w))] += 1
            fixed[round(sp - math.ceil(round(n * (1 + m / 100), 6) / 1000) * 1000)] += 1
    if not rate:
        return None
    return rate.most_common(1)[0][0], fixed.most_common(1)[0][0]


# ------------------------------------------------------------------ formula
def formula_price(pol: PricePolicy, cost_unit: float, margin: float, n: float) -> int:
    """Rukav: n — eni (mm) yoki qovurg'a soni."""
    per = cost_unit * float(pol.usd_rate) * (1 + margin / 100)
    step = max(1, pol.round_to)
    return int(math.ceil(round(per * n, 6) / step) * step + float(pol.fixed_add))


def with_vat(pol: PricePolicy, p: float) -> int:
    return round(p * (1 + float(pol.vat_pct) / 100))


# ------------------------------------------------------------------ katalog bilan bog'lash
def _cls(profile: str) -> str:
    p = (profile or "").upper()
    return S.TIMING[p][2] if p in S.TIMING else p


def _num(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _vcol(lref: str) -> str:
    """Tovar uzunlik tizimi → AppSheet ustuni (tizimsiz — Lp: kompaniya remenlari Lp bo'yicha)."""
    return {"Li": "li", "La": "la", "Le": "la"}.get(lref or "", "lp")


_NOISE = {"BELT", "V", "NR", "LP", "LI", "LA", "LE", "LD", "LW", "PU", "КЛИНОВОЙ", "РЕМЕНЬ", "РУКАВ", "(LD,", "LW)"}


def _words(s: str) -> set[str]:
    return {
        w for w in s.upper().replace("'", "").replace("(", " ").replace(")", " ").split() if not w[:1].isdigit()
    } - _NOISE


def _best(it: Item, cands: list[PriceSource]) -> PriceSource | None:
    """Bir nechta nomzod (bir brendning seriyalari: MEGADYNE BASIC / OLEOSTATIC) — nomdagi seriya so'zlari ko'p mosi.
    Seriya hech biriga mos kelmasa va nomzodlar narxi farq qilsa — bog'lanmaydi (noto'g'ri narxdan yo'q yaxshi)."""
    if len(cands) <= 1:
        return cands[0] if cands else None
    mine = _words(it.name) | _words(it.name_ru)
    scored = sorted(((len(mine & _words(f"{c.mark} {c.name}")), c) for c in cands), key=lambda x: -x[0])
    if scored[0][0] > scored[1][0]:
        return scored[0][1]
    top = [c for sc, c in scored if sc == scored[0][0]]
    return top[0] if len({(int(c.price), c.cost_unit, c.margin) for c in top}) == 1 else None


def link(only: list[int] | None = None) -> dict[str, int]:
    """Faol remen tovarlarini (`only` — faqat shu tovarlar) AppSheet qatorlariga bog'lash (`Item.price_src`). Ustuvorlik: aniq tovar qatori
    (`Товар`, eni ham mos) → rukav qatori (formula)."""
    srcs = list(PriceSource.objects.exclude(family=""))
    t_goods: dict[tuple, list[PriceSource]] = {}
    t_sleeve: dict[tuple, list[PriceSource]] = {}
    v_rows: dict[tuple, list[PriceSource]] = {}
    r_sleeve: dict[tuple, list[PriceSource]] = {}
    r_goods: dict[tuple, list[PriceSource]] = {}
    for s in srcs:
        sp, b = s.spec or {}, s.brand.upper()
        if s.family in ("timing", "sleeve"):
            k = (_cls(sp.get("profile", "")), _num(sp.get("length")), b)
            if s.sleeve == "Рукав":
                t_sleeve.setdefault(k, []).append(s)
            else:
                w = 0.0 if s.sleeve == "Рулон" else (_num(sp.get("width")) or _num(s.width))
                t_goods.setdefault((*k, w), []).append(s)
        elif s.family == "vbelt":
            v_rows.setdefault((str(sp.get("section", "")).upper(), b), []).append(s)
        elif s.family == "ribbed":
            k = (str(sp.get("profile", "")).upper(), _num(sp.get("length")), b)
            if s.sleeve == "Рукав":
                r_sleeve.setdefault(k, []).append(s)
            else:
                r_goods.setdefault((*k, _num(sp.get("ribs"))), []).append(s)
    stats = {"linked": 0, "unlinked": 0}
    changed: list[Item] = []
    if only is not None and not PriceSource.objects.exists():
        return stats
    items = Item.objects.filter(active=True)
    if only is not None:
        items = items.filter(pk__in=only)
    for it in items:
        if it.family not in ("timing", "sleeve", "vbelt", "ribbed"):
            if it.price_src_id is not None:
                it.price_src = None
                changed.append(it)
            continue
        sp, b = it.spec or {}, it.brand.upper()
        cands: list[PriceSource] = []
        if it.family in ("timing", "sleeve"):
            k = (_cls(sp.get("profile", "")), _num(sp.get("length")), b)
            if it.family == "timing":
                cands = t_goods.get((*k, _num(sp.get("width"))), []) or (
                    t_goods.get((*k, 0), []) if not sp.get("width") else []
                )
            cands = cands or t_sleeve.get(k, [])
        elif it.family == "vbelt":
            col, ln = _vcol(str(sp.get("lref", ""))), _num(sp.get("length"))
            for s in v_rows.get((str(sp.get("section", "")).upper(), b), []):
                val = getattr(s, col) or (_num(s.spec.get("length")) if col == "lp" else 0)
                if val and abs(val - ln) < 0.5:
                    cands.append(s)
        else:
            k = (str(sp.get("profile", "")).upper(), _num(sp.get("length")), b)
            cands = r_goods.get((*k, _num(sp.get("ribs"))), []) or r_sleeve.get(k, [])
        hit = _best(it, cands)
        stats["linked" if hit else "unlinked"] += 1
        if (hit.pk if hit else None) != it.price_src_id:
            it.price_src = hit
            changed.append(it)
    Item.objects.bulk_update(changed, ["price_src"], batch_size=500)
    return stats


@transaction.atomic
def store(rows: list[dict[str, Any]], srcs: tuple[str, ...]) -> dict[str, Any]:
    """Manba qatorlarini almashtirish (berilgan `src` lar bo'yicha), so'ng bog'lash."""
    keep: set[tuple[str, str]] = set()
    for r in rows:
        keep.add((r["src"], r["ext_id"]))
        PriceSource.objects.update_or_create(src=r["src"], ext_id=r["ext_id"], defaults=r)
    gone = [s.pk for s in PriceSource.objects.filter(src__in=srcs) if (s.src, s.ext_id) not in keep]
    PriceSource.objects.filter(pk__in=gone).delete()
    st = link()
    return {"rows": len(rows), "removed": len(gone), **st}


def _finish(pol: PricePolicy, note: str, learned: tuple[int, int] | None, when: datetime | None = None) -> None:
    """`when` — ma'lumot holati vaqti (nusxadan yuklansa — nusxa sanasi: eskirganligi to'g'ri ko'rinsin)."""
    if learned and pol.learn:
        pol.usd_rate, pol.fixed_add = Decimal(learned[0]), Decimal(learned[1])
    pol.synced = when or timezone.now()
    pol.sync_note = note[:300]
    pol.save()


def sync_live() -> dict[str, Any]:
    """AppSheet API'dan (kalitlar `.env` da). Xato — istisno (chaqiruvchi yozadi)."""
    import httpx

    rows: list[dict[str, Any]] = []
    learned = None
    done: list[str] = []
    for src, kind in KINDS:
        app, key, tbl = (os.environ.get(f"APPSHEET_{kind}_{k}", "") for k in ("APP_ID", "KEY", "TABLE"))
        if not (app and key and tbl):
            continue

        def find(table: str, app: str = app, key: str = key) -> list[dict[str, Any]]:
            r = httpx.post(
                f"https://api.appsheet.com/api/v2/apps/{app}/tables/{table}/Action",
                headers={"ApplicationAccessKey": key},
                json={"Action": "Find", "Properties": {"Locale": "ru-RU"}, "Rows": []},
                timeout=120,
            )
            r.raise_for_status()
            d = r.json()
            return d if isinstance(d, list) else d.get("Rows", [])

        raw = find(tbl)
        if src == "t":
            try:
                types = {t.get("id"): t.get("Type") for t in find(os.environ.get("APPSHEET_TIMING_TYPES", "Types"))}
            except Exception as exc:
                log.warning("AppSheet Types: %s", exc)
                types = {}
            for r in raw:
                r["_type"] = types.get(r.get("type")) or ""
            learned = learn(raw)
        rows += [from_appsheet(src, r) for r in raw]
        done.append(src)
    if not done:
        raise RuntimeError("AppSheet kalitlari sozlanmagan (APPSHEET_VBELT_* / APPSHEET_TIMING_*)")
    st = store(rows, tuple(done))
    _finish(policy(), f"AppSheet: {st['rows']} qator, bog'landi {st['linked']}", learned)
    return st


def sync_jarvis(path: str) -> dict[str, Any]:
    """Jarvis bazasi nusxasidagi AppSheet keshidan (`belt_item`, `kv.belt_rate/belt_fixed`)."""
    import sqlite3

    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    rows = [from_jarvis(dict(r)) for r in con.execute("SELECT * FROM belt_item")]
    kv = dict(
        con.execute("SELECT key, value FROM kv WHERE key IN ('belt_rate', 'belt_fixed', 'belts_synced')").fetchall()
    )
    learned = (
        (int(float(kv["belt_rate"])), int(float(kv["belt_fixed"])))
        if "belt_rate" in kv and "belt_fixed" in kv
        else None
    )
    st = store(rows, ("v", "t"))
    when = datetime.fromtimestamp(int(kv.get("belts_synced") or 0), tz=timezone.get_current_timezone())
    _finish(
        policy(),
        f"Jarvis nusxasidan (AppSheet {when:%d.%m.%Y %H:%M} holati): {st['rows']} qator, bog'landi {st['linked']}",
        learned,
        when,
    )
    return st


# ------------------------------------------------------------------ narx
def mode_of(src: PriceSource | None) -> str:
    """fixed — dona narxi; width — rukav (eni bo'yicha formula); ribs — poliklinli rukav (qovurg'a bo'yicha)."""
    return _mode(src)


def _mode(src: PriceSource | None) -> str:
    if src is None:
        return ""
    if src.sleeve == "Рукав":
        return "ribs" if src.family == "ribbed" else "width"
    return "fixed"


def src_price(pol: PricePolicy, src: PriceSource, item: Item, width: float | None) -> int | None:
    m = _mode(src)
    if m == "fixed":
        return int(src.price) or None
    if not src.cost_unit:
        return None  # AppSheet'da tannarx kiritilmagan
    if m == "ribs":
        ribs = _num((item.spec or {}).get("ribs"))
        return formula_price(pol, src.cost_unit, src.margin, ribs) if ribs else None
    w = width or _num((item.spec or {}).get("width"))
    return formula_price(pol, src.cost_unit, src.margin, w) if w else None


def uses_source(item: Item) -> bool:
    return item.price_src_id is not None and (item.price or {}).get("source") != "manual"


def price_of(item: Item, char: Char | None = None, pol: PricePolicy | None = None) -> Decimal | None:
    """Sotuv narxi (QQSsiz): kenglik bo'yicha qo'lda → AppSheet (bog'langan, `manual` emas) → qo'lda (dona / 1 mm)."""
    p: dict[str, Any] = item.price or {}
    w = char.width_mm if char is not None and char.width_mm else None
    if w and (o := (p.get("overrides") or {}).get(str(w))) is not None:
        return Decimal(str(o))
    if uses_source(item) and item.price_src is not None:
        v = src_price(pol or policy(), item.price_src, item, w)
        if v is not None:
            return Decimal(v)
    if p.get("price") in (None, ""):
        return None
    base = Decimal(str(p.get("price") or 0))
    if p.get("mode") == "mm" and w:
        step = int(p.get("step_mm") or 0)
        ww = math.ceil(w / step) * step if step > 0 else w
        return (base * ww).quantize(Decimal(1))
    return base


def info(item: Item, cost_ok: bool) -> dict[str, Any]:
    """Tovar oynasi uchun narx bloki. Sotuvchiga — faqat tayyor narxlar; rahbariyatga — tannarx, marja, formula."""
    pol = policy()
    src = item.price_src
    source = (
        "appsheet"
        if uses_source(item)
        else "manual"
        if (item.price or {}).get("price") is not None or (item.price or {}).get("overrides")
        else "none"
    )
    out: dict[str, Any] = {"source": source, "vat_pct": float(pol.vat_pct), "linked": None, "rows": []}
    if src is not None:
        m = _mode(src)
        out["linked"] = {
            "mark": src.mark,
            "name": src.name,
            "origin": src.origin or None,
            "mode": m,
            "synced": (pol.synced or src.synced).isoformat(timespec="minutes"),  # AppSheet ma'lumoti holati
            "price": int(src.price) if m == "fixed" else None,
            "price_vat": int(src.price_vat) if m == "fixed" else None,
            "lens": {k: getattr(src, k) for k in ("li", "lp", "la") if getattr(src, k)} or None,
            "note": None if src.cost_unit or m == "fixed" else "AppSheet'da tannarx kiritilmagan — narx hisoblanmaydi",
        }
        if cost_ok:
            out["linked"]["cost"] = {
                "net": int(src.net) or None,
                "margin": src.margin,
                "cost_unit": src.cost_unit or None,
                "unit": "qovurg'a" if m == "ribs" else "1 mm eni" if m == "width" else None,
                "rate": float(pol.usd_rate),
                "fixed": float(pol.fixed_add),
            }
    # narx jadvali: variantlar (eni) bo'yicha yoki bitta
    chars = list(Char.objects.filter(item=item).order_by("width_mm"))
    targets: list[Char | None] = list(chars) or [None]
    if src is not None and _mode(src) == "width" and not chars and not (item.spec or {}).get("width"):
        targets = []  # rukav o'zi — eni berilganda (pastdagi standart eni)
        w0 = pol.default_width
        v = src_price(pol, src, item, w0)
        if v is not None:
            out["rows"].append(
                {"label": f"{w0} mm (standart eni)", "width": w0, "price": v, "price_vat": with_vat(pol, v)}
            )
    for ch in targets:
        v = price_of(item, ch, pol)
        if v is not None:
            out["rows"].append(
                {
                    "label": ch.name if ch else "1 " + (item.unit or "dona"),
                    "width": ch.width_mm if ch else None,
                    "price": int(v),
                    "price_vat": with_vat(pol, float(v)),
                }
            )
    return out


def quote_width(item: Item, width: float) -> dict[str, int] | None:
    """Ixtiyoriy eni uchun narx (rukav/rukavdan kesiladigan remen) — formula ko'rsatilmaydi."""
    pol = policy()
    if not uses_source(item) or item.price_src is None or _mode(item.price_src) != "width":
        return None
    v = src_price(pol, item.price_src, item, width)
    return {"price": v, "price_vat": with_vat(pol, v)} if v is not None else None


def max_discount(lead: bool, head: bool) -> Decimal:
    pol = policy()
    return pol.max_disc_lead if lead else pol.max_disc_head if head else pol.max_disc_seller


def stale() -> bool:
    s = policy().synced
    return s is None or (timezone.now() - s).total_seconds() > STALE_H * 3600


# ------------------------------------------------------------------ siyosat (API)
POLICY_FIELDS = (
    ("usd_rate", "Kurs", 1, 1_000_000),
    ("fixed_add", "Qat'iy qo'shimcha", 0, 10_000_000),
    ("round_to", "Yaxlitlash", 1, 1_000_000),
    ("vat_pct", "QQS", 0, 100),
    ("default_width", "Standart eni", 1, 1000),
    ("max_disc_lead", "Rahbariyat chegirmasi", 0, 100),
    ("max_disc_head", "Sotuv rahbari chegirmasi", 0, 100),
    ("max_disc_seller", "Sotuvchi chegirmasi", 0, 100),
)
SECRET = ("usd_rate", "fixed_add", "round_to")  # formula — faqat rahbariyatga


def policy_json(cost_ok: bool) -> dict[str, Any]:
    pol = policy()
    total = PriceSource.objects.count()
    linked_src = PriceSource.objects.filter(items__isnull=False).distinct().count()
    out: dict[str, Any] = {
        "vat_pct": float(pol.vat_pct),
        "default_width": pol.default_width,
        "max_disc_lead": float(pol.max_disc_lead),
        "max_disc_head": float(pol.max_disc_head),
        "max_disc_seller": float(pol.max_disc_seller),
        "synced": pol.synced.isoformat(timespec="minutes") if pol.synced else None,
        "sync_note": pol.sync_note or None,
        "stale": stale(),
        "configured": configured(),
        "sources": total,
        "sources_linked": linked_src,
        "items_linked": Item.objects.filter(active=True, price_src__isnull=False).count(),
        "can_edit": cost_ok,
    }
    if cost_ok:
        out.update(
            {
                "usd_rate": float(pol.usd_rate),
                "fixed_add": float(pol.fixed_add),
                "round_to": pol.round_to,
                "learn": pol.learn,
            }
        )
    return out


def save_policy(d: dict[str, Any], by: int | None) -> dict[str, Any]:
    from config.apps.core.http import ApiError

    pol = policy()
    for key, label, lo, hi in POLICY_FIELDS:
        if key not in d:
            continue
        try:
            v = Decimal(str(d[key]).replace(" ", "").replace(",", "."))
        except Exception:
            raise ApiError(400, f"{label}: son kiriting") from None
        if not (lo <= v <= hi):
            raise ApiError(400, f"{label}: {lo}–{hi} oralig'ida bo'lsin")
        if key in ("round_to", "default_width"):
            v = Decimal(int(v))
        if key in ("usd_rate", "fixed_add") and v != getattr(pol, key):
            pol.learn = False  # qo'lda o'zgartirildi — sinxron endi ustiga yozmaydi
        setattr(pol, key, v)
    if "learn" in d:
        pol.learn = bool(d["learn"])
    pol.updated_by = by
    pol.save()
    return policy_json(True)


def unmatched(limit: int = 3000) -> list[dict[str, Any]]:
    """Katalogga bog'lanmagan AppSheet qatorlari (katalogda yo'q yoki belgi/brend farqi) — narx ko'rsatiladi, tannarx
    yo'q."""
    return [
        {
            "id": s.pk,
            "mark": s.mark,
            "name": s.name or None,
            "kind": s.sleeve or None,
            "family": s.family or None,
            "brand": s.brand or None,
            "price": int(s.price) if _mode(s) == "fixed" and s.price else None,
        }
        for s in PriceSource.objects.filter(items__isnull=True).order_by("src", "mark")[:limit]
    ]

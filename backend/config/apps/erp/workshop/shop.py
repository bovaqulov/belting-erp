"""Sex mantig'i (frontend `src/erp/workshop/` — /app/api/erp/shop/*):

taxta (4 ustun) → zakaz: qabul (ishchi) → material skaner bilan sarf (ombordan, lenta — giliotina kesish) → «material
olindi» (to'liq skanerlanmagan bo'lsa — tasdiq bilan) → «tayyor» (mahsulot omborga stikeri bilan) → hamma zakazlari
tayyor bo'lgan manba (CRM bitimi) — `hooks.ready` orqali xabar oladi.
Bir nechta zakaz birga: birga qabul, bitta rukav/lentadan ulushlab sarf (har zakazga ehtiyojiga qarab), birga tayyor.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from contextlib import suppress
from dataclasses import dataclass, field
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.utils import timezone

from config.apps.erp.warehouse import services as wh

from .models import Job, Log, Phase, Take

log = logging.getLogger(__name__)
ZERO = Decimal(0)
EPS = Decimal("0.0005")
ACTIVE = (Phase.NEW, Phase.COLLECTING, Phase.MAKING)
READY_DAYS = 2  # «Tayyor» ustunida shuncha kunlik zakazlar


class Bad(Exception):
    """Biznes qoidasi → 400"""


class NotFound(Exception):
    """→ 404"""


# ---------------------------------------------------------------- tayyor bo'lganda (manba bo'yicha) tinglovchilar
_ready_fns: list[Callable[[str], None]] = []


def on_ready(fn: Callable[[str], None]) -> None:
    if fn not in _ready_fns:
        _ready_fns.append(fn)


def _fire_ready(source: str) -> None:
    for fn in _ready_fns:
        try:
            fn(source)
        except Exception:  # tinglovchi xatosi sexni buzmasin
            log.exception("on_ready tinglovchisi xato: %s", source)


# ---------------------------------------------------------------- sonlar
def dec(v: Any, field: str = "Miqdor") -> Decimal:
    try:
        d = Decimal(str(v if v is not None else "").strip().replace(",", ".").replace(" ", ""))
    except InvalidOperation as e:
        raise Bad(f"{field}: son kiriting") from e
    if not d.is_finite():
        raise Bad(f"{field}: son kiriting")
    return d


def s4(d: Decimal | float | int | None) -> str:
    """Javobda miqdor — satr (frontend `num()` bilan formatlaydi)."""
    if d is None:
        return "0"
    q = Decimal(str(d)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP).normalize()
    return format(q, "f")


def mmf(d: Decimal | None) -> float | int | None:
    if d is None:
        return None
    return int(d) if d == d.to_integral_value() else float(d)


def _who(user: Any) -> str:
    return getattr(user, "name", "") or ""


# ---------------------------------------------------------------- reja: qancha material kerak, qancha olindi
def need_of(j: Job) -> Decimal:
    """Material ehtiyoji rejadagi birlikda: rukav — eni × dona (mm), lenta — (eni × (uzunlik + ulash)) × dona (m²),
    boshqasi — miqdor."""
    if j.route == "rukav":
        return j.qty * j.pieces
    if j.route == "lenta" and j.spec:
        w = dec(j.spec.get("width") or 0)
        length = dec(j.spec.get("length") or 0) + dec(j.spec.get("joint") or 0)
        return (w * length / Decimal(1_000_000) * j.pieces).quantize(Decimal("0.0001"))
    return j.qty


def taken_of(j: Job) -> Decimal:
    return sum((t.qty for t in j.takes.all() if t.item_id == j.material_id), ZERO)


def left_of(j: Job) -> Decimal:
    if not j.material_id:
        return ZERO
    return max(ZERO, need_of(j) - taken_of(j))


def cut_text(j: Job) -> str:
    if j.route == "rukav":
        return f"eni {mmf(j.qty)} mm" + (f" × {j.pieces} dona" if j.pieces > 1 else "")
    if j.route == "lenta" and j.spec:
        joint = j.spec.get("joint") or 0
        return f"{mmf(dec(j.spec.get('width') or 0))} × {mmf(dec(j.spec.get('length') or 0))} mm" + (
            f" + {mmf(dec(joint))} ulash" if joint else ""
        )
    return ""


@dataclass
class _Mat:
    name: str
    unit: str
    item_id: int
    qty: Decimal = ZERO
    taken: Decimal = ZERO
    cuts: list[str] = field(default_factory=list)


def plan(jobs: list[Job]) -> list[dict[str, Any]]:
    """Materiallar bo'yicha jamlangan reja (bitta zakaz yoki guruh) + omborda qayerda borligi."""
    by: dict[int, _Mat] = {}
    for j in jobs:
        if not j.material_id:
            continue
        m = by.get(j.material_id)
        if m is None:
            info = wh.item_info(j.material_id)
            m = by[j.material_id] = _Mat(info["name"], "mm" if info["dims"] == "w" else info["unit"], j.material_id)
        m.qty += need_of(j)
        m.taken += taken_of(j)
        if c := cut_text(j):
            m.cuts.append(c)
    return [
        {
            "name": m.name,
            "unit": m.unit,
            "item_id": m.item_id,
            "qty": s4(m.qty),
            "taken": s4(m.taken),
            "left": s4(max(ZERO, m.qty - m.taken)),
            "cut": ", ".join(m.cuts[:4]) + (f" … (+{len(m.cuts) - 4})" if len(m.cuts) > 4 else ""),
            "candidates": wh.candidates(m.item_id),
        }
        for m in by.values()
    ]


# ---------------------------------------------------------------- javob shakllari
def brief(j: Job, now: Any = None) -> dict[str, Any]:
    t = now or timezone.now()
    size = ""
    if j.route == "lenta" and j.spec:
        size = f"{mmf(dec(j.spec.get('width') or 0))} × {mmf(dec(j.spec.get('length') or 0))} mm"
    elif j.char_name:
        size = j.char_name
    if j.route == "rukav" and j.pieces > 1:
        size = f"{size or f'{mmf(j.qty)} mm'} × {j.pieces} dona"
    return {
        "id": j.pk,
        "number": j.number,
        "order_number": j.order_number or None,
        "phase": j.phase,
        "priority": j.priority,
        "due": j.due.isoformat() if j.due else None,
        "late": bool(j.due and j.phase in ACTIVE and j.due < t),
        "route": j.route,
        "qty": s4(j.qty if j.route == "rukav" else j.qty * (j.pieces if j.route == "lenta" else 1)),
        "unit": j.unit,
        "size": size,
        "item": j.item_name,
        "char": j.char_name or None,
        "customer": j.customer or None,
        "worker": j.worker_name or None,
        "lenta_project": None,
        "spec": j.spec or None,
        "left": s4(left_of(j)),
    }


def detail(j: Job) -> dict[str, Any]:
    info: dict[str, Any] = {}
    with suppress(wh.Bad):
        info = wh.item_info(j.item_id)
    return {
        **brief(j),
        "belt_mark": (info.get("sku") or "") if info else "",
        "brand": "",
        "channel": j.channel or None,
        "seller_name": j.seller_name or None,
        "order_note": j.order_note or None,
        "accepted_at": j.accepted_at.isoformat() if j.accepted_at else None,
        "product_code": j.product_code or None,
        "plan": plan([j]),
        "taken": [
            {
                "id": t.pk,
                "doc": t.doc or None,
                "name": wh.item_info(t.item_id)["name"],
                "unit": "mm" if t.width_mm and not t.length_mm else wh.item_info(t.item_id)["unit"],
                "qty": s4(t.qty),
                "code": t.code or None,
                "width_mm": mmf(t.width_mm),
                "length_mm": mmf(t.length_mm),
                "by": t.by_name or None,
                "created": t.created.isoformat(),
            }
            for t in j.takes.all()
        ],
        "log": [{"action": x.action, "by": x.by or None, "ts": x.ts.isoformat(), "data": x.data} for x in j.log.all()],
    }


def board() -> dict[str, Any]:
    t = timezone.now()
    cols: dict[str, list[dict[str, Any]]] = {p: [] for p in ("new", "collecting", "making", "ready")}
    qs = Job.objects.prefetch_related("takes").filter(phase__in=ACTIVE)
    for j in qs:
        cols[j.phase].append(brief(j, t))
    for j in (
        Job.objects.prefetch_related("takes")
        .filter(phase=Phase.READY, ready_at__gte=t - timedelta(days=READY_DAYS))
        .order_by("-ready_at")[:50]
    ):
        cols["ready"].append(brief(j, t))
    for p in ("new", "collecting", "making"):
        cols[p].sort(key=lambda x: (-x["priority"], x["due"] or "9999", x["id"]))
    return {"cols": cols}


def get(pk: int, lock: bool = False) -> Job:
    qs = Job.objects.select_for_update() if lock else Job.objects.prefetch_related("takes", "log")
    j = qs.filter(pk=pk).first()
    if j is None or j.phase == Phase.CANCELLED:
        raise NotFound("Zakaz topilmadi yoki bekor qilingan")
    return j


def many(ids: list[Any], lock: bool = False) -> list[Job]:
    try:
        keys = [int(x) for x in ids]
    except (TypeError, ValueError) as e:
        raise Bad("Zakazlar noto'g'ri") from e
    if not keys:
        raise Bad("Zakazlarni tanlang")
    qs = Job.objects.select_for_update() if lock else Job.objects.prefetch_related("takes")
    js = list(qs.filter(pk__in=keys).exclude(phase=Phase.CANCELLED))
    if not js:
        raise NotFound("Zakazlar topilmadi")
    return sorted(js, key=lambda j: keys.index(j.pk))


def group(ids: list[Any]) -> dict[str, Any]:
    js = many(ids)
    phases = sorted({j.phase for j in js}, key=["new", "collecting", "making", "ready"].index)
    return {
        "jobs": [brief(j) for j in js],
        "phase": phases[0] if len(phases) == 1 else None,
        "phases": phases,
        "plan": plan(js),
    }


def _log(j: Job, action: str, user: Any, data: dict[str, Any] | None = None) -> None:
    Log.objects.create(job=j, action=action, by=_who(user), ts=timezone.now(), data=data)


# ---------------------------------------------------------------- amallar
def _accept(j: Job, user: Any) -> bool:
    if j.phase != Phase.NEW:
        return j.worker_tg == getattr(user, "tg_id", None) and j.phase in (Phase.COLLECTING, Phase.MAKING)
    j.phase = Phase.COLLECTING
    j.worker_tg = getattr(user, "tg_id", None)
    j.worker_name = _who(user)
    j.accepted_at = timezone.now()
    j.save(update_fields=["phase", "worker_tg", "worker_name", "accepted_at"])
    _log(j, "accept", user)
    return True


@transaction.atomic
def accept(pk: int, user: Any) -> None:
    j = get(pk, lock=True)
    if j.phase != Phase.NEW:
        raise Bad(f"Zakaz allaqachon qabul qilingan ({j.worker_name or '—'})")
    _accept(j, user)


@transaction.atomic
def accept_many(ids: list[Any], user: Any) -> dict[str, list[int]]:
    done, skipped = [], []
    for j in many(ids, lock=True):
        (done if _accept(j, user) else skipped).append(j.pk)
    return {"done": done, "skipped": skipped}


def _plan_unit_amount(r: dict[str, Any], dims: str | None) -> Decimal:
    """Ombor sarf natijasi → rejadagi birlikda: rukav — eni (mm), boshqasi — miqdor."""
    if dims == "w":
        return dec(r.get("width_mm") or 0)
    return dec(r["qty"])


@transaction.atomic
def take(ids: list[Any], body: dict[str, Any], user: Any) -> dict[str, Any]:
    """Skanerlangan birlikdan sarf; bir nechta zakaz bo'lsa — jami sarf ehtiyojiga qarab bo'linadi."""
    js = many(ids, lock=True)
    for j in js:
        if j.phase == Phase.NEW:
            _accept(j, user)
        if j.phase not in (Phase.COLLECTING, Phase.MAKING):
            raise Bad(f"{j.order_number or j.number}: tayyor zakazga material olinmaydi")
    unit_id = int(body.get("batch_id") or 0)
    u = wh.unit_brief(unit_id)
    if u is None:
        raise NotFound("Birlik topilmadi — stikerni qayta skanerlang")
    mats = {j.material_id for j in js if j.material_id}
    if mats and u["item_id"] not in mats:
        raise Bad(f"{u['code']}: «{u['name']}» bu zakaz(lar)ga kerakli material emas")
    label = ", ".join(j.order_number or j.number for j in js)[:120]
    r = wh.consume(
        unit_id,
        by=_who(user),
        tg_id=getattr(user, "tg_id", None),
        job=label,
        qty=body.get("qty"),
        width_mm=body.get("width_mm"),
        length_mm=body.get("length_mm"),
        rests=body.get("rests"),
    )
    total = _plan_unit_amount(r, u["dims"])
    # ulush: ehtiyoji (qolgani) bo'yicha; hammasi to'la bo'lsa — teng
    lefts = [left_of(j) if j.material_id == u["item_id"] else ZERO for j in js]
    weights = lefts if sum(lefts, ZERO) > 0 else [Decimal(1)] * len(js)
    wsum = sum(weights, ZERO)
    out, rest = [], total
    now = timezone.now()
    for i, (j, w) in enumerate(zip(js, weights, strict=True)):
        share = rest if i == len(js) - 1 else (total * w / wsum).quantize(Decimal("0.0001"))
        rest -= share
        if share <= 0:
            continue
        tk = Take.objects.create(
            job=j,
            item_id=u["item_id"],
            unit_id=unit_id,
            code=u["code"] or "",
            qty=share,
            width_mm=dec(r["width_mm"]) if r.get("width_mm") is not None else None,
            length_mm=dec(r["length_mm"]) if r.get("length_mm") is not None else None,
            doc=r["number"],
            by_tg=getattr(user, "tg_id", None),
            by_name=_who(user),
            created=now,
        )
        _log(j, "consume", user, {"qty": s4(share), "code": u["code"], "doc": r["number"]})
        out.append({"job_id": j.pk, "qty": s4(tk.qty)})
    return {"taken": out, "rests": r["rests"], "scrap": r["scrap"], "number": r["number"]}


@transaction.atomic
def untake(pk: int, body: dict[str, Any], user: Any) -> dict[str, Any]:
    """Olingan materialni omborga qaytarish (noto'g'ri yoki ortiqcha olingan): sarf hujjati bekor bo'ladi, bo'lak
    manba omborga joysiz qaytadi. Sarf bir nechta zakazga bo'lingan bo'lsa — hammasidan ayriladi."""
    tk = Take.objects.select_related("job").filter(pk=int(body.get("take_id") or 0), job_id=pk).first()
    if tk is None:
        raise NotFound("Sarf yozuvi topilmadi")
    if not tk.doc:
        raise Bad("Bu sarfning ombor hujjati yo'q — qaytarib bo'lmaydi")
    takes = list(Take.objects.select_related("job").filter(doc=tk.doc))
    jobs = {t.job_id: t.job for t in takes}
    for j in jobs.values():
        if j.phase in (Phase.READY, Phase.CANCELLED):
            raise Bad(f"{j.order_number or j.number}: zakaz {j.get_phase_display().lower()} — material qaytarilmaydi")
    label = ", ".join(j.order_number or j.number for j in jobs.values())[:120]
    r = wh.unconsume(tk.doc, by=_who(user), tg_id=getattr(user, "tg_id", None), job=label)
    for t in takes:
        _log(t.job, "untake", user, {"qty": s4(t.qty), "code": t.code, "doc": r["number"], "base": t.doc})
    Take.objects.filter(pk__in=[t.pk for t in takes]).delete()
    # material yetishmay qolsa — yig'ishga qaytadi
    for j in jobs.values():
        if j.phase == Phase.MAKING and left_of(j) > EPS:
            j.phase = Phase.COLLECTING
            j.save(update_fields=["phase"])
    return {"number": r["number"], "codes": r["codes"], "warehouse": r["warehouse"], "jobs": list(jobs)}


def _collected(j: Job, force: bool, user: Any) -> None:
    if j.phase == Phase.MAKING:
        return
    if j.phase != Phase.COLLECTING:
        raise Bad(f"{j.order_number or j.number}: avval zakazni qabul qiling")
    left = left_of(j)
    if left > EPS and not force:
        raise Bad(
            f"{j.order_number or j.number}: material to'liq skanerlanmadi ({s4(left)} qoldi) — baribir tayyorlashga o'tilsinmi?"
        )
    j.phase = Phase.MAKING
    j.save(update_fields=["phase"])
    _log(j, "collected", user, {"forced": True} if left > EPS else None)


@transaction.atomic
def collected(ids: list[Any], force: bool, user: Any) -> None:
    js = many(ids, lock=True)
    if not force:
        short = [j for j in js if j.phase == Phase.COLLECTING and left_of(j) > EPS]
        if short:
            names = ", ".join(j.order_number or j.number for j in short[:5])
            raise Bad(
                f"{len(short)} ta zakazga material to'liq skanerlanmadi ({names}) — baribir tayyorlashga o'tilsinmi?"
            )
    for j in js:
        _collected(j, force, user)


def out_qty(j: Job) -> Decimal:
    """Omborga kiradigan mahsulot miqdori (mahsulot birligida): rukav — dona; lenta (m²) — eni × uzunligi (ulashsiz)
    × dona; boshqasi — zakaz miqdori."""
    if j.route == "rukav":
        return Decimal(j.pieces)
    if j.route == "lenta" and j.spec and wh.item_info(j.item_id)["dims"] == "wl":
        w, length = dec(j.spec.get("width") or 0), dec(j.spec.get("length") or 0)
        return (w * length / Decimal(1_000_000) * j.pieces).quantize(Decimal("0.0001"))
    return j.qty * (j.pieces if j.route == "lenta" else 1)


def _ready(j: Job, user: Any) -> bool:
    if j.phase == Phase.READY:
        return False
    if j.phase != Phase.MAKING:
        raise Bad(f"{j.order_number or j.number}: avval materialni yig'ing («Material olindi»)")
    spec = j.spec or {}
    r = wh.produce(
        item_id=j.item_id,
        char_id=j.char_id,
        qty=out_qty(j),
        firm=j.firm or None,
        by=_who(user),
        tg_id=getattr(user, "tg_id", None),
        job=j.order_number or j.number,
        width_mm=spec.get("width") if j.route == "lenta" else (j.qty if j.route == "rukav" else None),
        length_mm=spec.get("length") if j.route == "lenta" else None,
        sources=[d for d in j.takes.values_list("doc", flat=True) if d],
    )
    j.phase = Phase.READY
    j.ready_at = timezone.now()
    j.product_unit = r["unit_id"]
    j.product_code = r["code"] or ""
    j.save(update_fields=["phase", "ready_at", "product_unit", "product_code"])
    _log(j, "ready", user, {"code": r["code"], "doc": r["number"]})
    _log(j, "produce", user, {"qty": s4(r["qty"])})
    return True


def _after_ready(sources: set[str]) -> None:
    for src in sources:
        if src and not Job.objects.filter(source=src, phase__in=ACTIVE).exists():
            transaction.on_commit(lambda s=src: _fire_ready(s))


@transaction.atomic
def ready(ids: list[Any], user: Any) -> dict[str, Any]:
    done, skipped = [], []
    js = many(ids, lock=True)
    for j in js:
        (done if _ready(j, user) else skipped).append(j.pk)
    _after_ready({j.source for j in js if j.pk in done})
    q = ",".join(str(x) for x in done or [j.pk for j in js])
    return {"done": done, "skipped": skipped, "sticker": {"url": f"/app/api/erp/shop/sticker.pdf?ids={q}"}}


def sticker_pdf(ids: list[Any]) -> bytes:
    """Zakaz stikerlari: tayyor bo'lsa — mahsulot QR kodi (omborda skanerlanadi), aks holda — zakaz raqami."""
    rows = []
    for j in many(ids):
        lines = [x for x in (j.customer, cut_text(j) or j.char_name, f"{j.number}" if j.order_number else "") if x]
        big = f"{j.pieces} dona" if j.route == "rukav" else f"{s4(out_qty(j))} {j.unit}"
        rows.append((j.product_code or j.number, j.item_name, [j.order_number or j.number, *lines], big))
    return wh.custom_labels(rows)


# ---------------------------------------------------------------- zakaz ochish (CRM / qo'lda)
def _next_number() -> str:
    yy = timezone.now().strftime("%y")
    pfx = f"SX-{yy}-"
    last = Job.objects.filter(number__startswith=pfx).order_by("-number").values_list("number", flat=True).first()
    n = int(last[len(pfx) :]) + 1 if last and last[len(pfx) :].isdigit() else 1
    return f"{pfx}{n:04d}"


def route_for(info: dict[str, Any]) -> tuple[str, int | None]:
    """Mahsulot → (marshrut, material): material katalogdagi `material_id`; rukav (dims=w) yoki lenta (dims=wl)."""
    mid = info.get("material_id")
    if not mid:
        return "", None
    try:
        mat = wh.item_info(int(mid))
    except wh.Bad:
        return "", None
    return {"w": "rukav", "wl": "lenta"}.get(mat["dims"] or "", ""), int(mid)


def needs_shop(item_id: int) -> bool:
    try:
        info = wh.item_info(item_id)
    except wh.Bad:
        return False
    return bool(info.get("material_id")) or info["kind"] == "product"


@transaction.atomic
def open_jobs(
    *,
    source: str,
    order_number: str,
    customer: str,
    lines: list[dict[str, Any]],
    due: Any = None,
    seller_name: str = "",
    note: str = "",
    channel: str = "",
    firm: str = "",
    priority: int = 0,
) -> list[int]:
    """Sexda tayyorlanadigan qatorlar uchun zakazlar (manba bo'yicha bir marta — bor bo'lsa qayta ochilmaydi).
    lines: [{item_id, char_id, qty, spec?}] — `needs_shop` bo'lmaganlari o'tkaziladi."""
    if Job.objects.filter(source=source).exclude(phase=Phase.CANCELLED).exists():
        return []
    made: list[int] = []
    now = timezone.now()
    for x in lines:
        if not x.get("item_id") or not needs_shop(int(x["item_id"])):
            continue
        info = wh.item_info(int(x["item_id"]))
        route, mat = route_for(info)
        char_id = int(x["char_id"]) if x.get("char_id") else None
        char = info["chars"].get(char_id) if char_id else None
        q = dec(x.get("qty") or 1)
        spec = x.get("spec")
        qty, pieces, unit = q, 1, info["unit"]
        if route == "rukav":
            width = (char or {}).get("width_mm") or (x.get("width_mm"))
            if not width:
                raise Bad(f"{info['name']}: rukavdan kesish uchun kenglik (variant) tanlanmagan")
            qty, pieces, unit = Decimal(width), max(1, int(q)), "dona"
        elif route == "lenta":
            if not spec:
                width = (char or {}).get("width_mm") or x.get("width_mm")
                length = q * 1000 if info["unit"] == "m" else dec(x.get("length_mm") or 0)
                spec = {"width": int(width or 0), "length": mmf(length), "joint": int(x.get("joint") or 0)}
            qty, pieces = Decimal(1), 1
        j = Job.objects.create(
            number=_next_number(),
            source=source,
            order_number=order_number,
            route=route,
            item_id=info["id"],
            char_id=char_id,
            item_name=info["name"],
            char_name=(char or {}).get("name", "") if char else "",
            material_id=mat,
            qty=qty,
            unit=unit,
            pieces=pieces,
            spec=spec,
            firm=firm,
            customer=customer,
            channel=channel,
            seller_name=seller_name,
            order_note=note,
            due=due,
            priority=priority,
            created=now,
        )
        Log.objects.create(job=j, action="create", by="", ts=now, data={"source": source})
        made.append(j.pk)
    return made


@transaction.atomic
def cancel(source: str) -> int:
    """Manba bekor bo'ldi: hali boshlanmagan (Yangi) zakazlar bekor; boshlanganlari — qoladi (material sarflangan)."""
    n = 0
    for j in Job.objects.select_for_update().filter(source=source, phase=Phase.NEW):
        j.phase = Phase.CANCELLED
        j.save(update_fields=["phase"])
        Log.objects.create(job=j, action="cancel", by="", ts=timezone.now())
        n += 1
    return n


def status(source: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for p in Job.objects.filter(source=source).values_list("phase", flat=True):
        out[p] = out.get(p, 0) + 1
    return out

"""CRM mantig'i (frontend demo — `src/erp/crm/demo/server.lib.ts` — bilan bir xil): bitim qatori (tegilmagan, keyingi
vazifa, harakatsiz), filtrlar, kanban, ro'yxat, bosqichga o'tkazish, tovarlar, hujjat, lidlar, oylik reja.

Vaqtlar — ISO (UTC, `Z`), summalar — satr ("2400000"), sana — "YYYY-MM-DD". `now` — testlar uchun berilishi mumkin.
"""

from __future__ import annotations

import calendar
import re
from collections.abc import Callable, Iterable
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.db.models import Max, Min, Q, QuerySet
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from config.apps.core.http import ApiError

from .access import Me, sellers
from .models import (
    Activity,
    Customer,
    CustomerKind,
    Deal,
    Division,
    Doc,
    Goal,
    Lead,
    LeadStatus,
    PayTerms,
    Pipeline,
    SignStatus,
    Stage,
    StageHistory,
    StageKind,
    Tunnel,
    TunnelAction,
    deal_title,
)

PAGE = 20
DAY = 86400


# ------------------------------------------------------------------ formatlar va o'qish
def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def money(v: Decimal | float | int | None) -> str:
    d = Decimal(v or 0)
    return str(int(d)) if d == d.to_integral_value() else format(d.normalize(), "f")


def num(v: Any) -> Decimal:
    try:
        return Decimal(re.sub(r"\s", "", str(v if v is not None else "")).replace(",", ".") or "0")
    except InvalidOperation:
        return Decimal(0)


def num_or_none(v: Any) -> Decimal | None:
    return None if v is None or v == "" else num(v)


def int_or_none(v: Any) -> int | None:
    x = num_or_none(v)
    return None if x is None else int(x)


def s(v: Any) -> str:
    return "" if v is None else str(v)


def digits(v: Any) -> str:
    return re.sub(r"\D", "", s(v))


def phone_key(v: Any) -> str:
    """Telefon kaliti: oxirgi 9 raqam (998 prefiksi bo'lsa ham, bo'lmasa ham bir xil)."""
    return digits(v)[-9:]


def to_dt(v: Any) -> datetime | None:
    """ISO yoki datetime-local ("2026-11-15T10:00" — server vaqt mintaqasida)."""
    if not v:
        return None
    dt = parse_datetime(s(v).replace("Z", "+00:00"))
    if dt is None:
        d = parse_date(s(v)[:10])
        dt = datetime(d.year, d.month, d.day, 10) if d else None
    if dt is not None and timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    return dt


def days(dt: datetime | None, now: datetime) -> int:
    return int((now - dt).total_seconds() // DAY) if dt else 0


# ------------------------------------------------------------------ bitim qatori
def deals_qs() -> QuerySet[Deal]:
    return Deal.objects.select_related("stage", "customer").annotate(
        last_act=Max("activity__ts"),
        next_due=Min("activity__due", filter=Q(activity__kind="task", activity__done_at__isnull=True)),
    )


def touched(d: Deal) -> datetime:
    la = getattr(d, "last_act", None)
    return max(d.updated, la) if la else d.updated


def row(d: Deal, now: datetime) -> dict[str, Any]:
    st = d.stage
    is_open = st.kind == StageKind.OPEN
    t = touched(d)
    return {
        "id": d.pk,
        "title": d.title,
        "customer": d.customer.name if d.customer else None,
        "owner_tg": d.owner_tg,
        "amount": money(d.amount),
        "next_task": iso(getattr(d, "next_due", None)) if is_open else None,
        "stage": st.code,
        "stage_since": iso(d.stage_since),
        "created": iso(d.created),
        "touched": iso(t),
        "updated": iso(d.updated),
        "closed": iso(d.closed),
        "close_date": d.close_date.isoformat() if d.close_date else None,
        "rotten": bool(is_open and st.rot_days and days(t, now) >= st.rot_days),
        "rot_days": st.rot_days,
        "tags": list(d.tags or []),
        "prob": d.probability if d.probability is not None else st.probability,
        "source": d.source or None,
        "lost_reason": d.lost_reason or None,
        "pipeline": st.pipeline_id,
        "contact": d.contact or None,
        "discount": money(d.discount),
        "markup": money(d.markup),
        "logistics": money(d.logistics),
        "location": d.location or None,
        "division": d.division or None,
        "buyer_order": d.buyer_order or None,
        "prod_order": d.prod_order or None,
        "prod_no": d.prod_no or None,
        "repeat": d.repeat,
        "parent_id": d.parent_id,
        # SLA: bosqichdagi muddat o'tganmi
        "sla_hours": st.sla_hours if is_open else None,
        "sla_late": bool(is_open and st.sla_hours and d.stage_since + timedelta(hours=st.sla_hours) < now),
        "pay_terms": d.pay_terms,
        "paid_sum": money(d.paid_sum),
        "sign_status": d.sign_status or None,
        "sign_sent_at": iso(d.sign_sent_at),
        "docs_done": d.docs_done,
    }


def scope(me: Me, q: dict[str, str]) -> QuerySet[Deal]:
    """Huquq + so'rov darajasidagi filtrlar (qolgani — `matches`, hisoblangan maydonlar bo'yicha)."""
    qs = me.deals(deals_qs())
    text = (q.get("q") or "").strip()
    if text:
        m = re.fullmatch(r"#?(\d+)", text)
        dg = digits(text)
        cond = Q(title__icontains=text) | Q(customer__name__icontains=text) | Q(customer__inn__icontains=text)
        if m:
            cond |= Q(pk=int(m.group(1)))
        if len(dg) >= 5:
            cond |= Q(customer__phones__icontains=dg)
        qs = qs.filter(cond)
    if owner := q.get("owner"):
        qs = qs.filter(owner_tg=int(owner)) if owner.isdigit() else qs.none()
    src = q.get("source")
    if src == "-":
        qs = qs.filter(source="")
    elif src:
        qs = qs.filter(source=src)
    if amin := num(q.get("amount_min")):
        qs = qs.filter(amount__gte=amin)
    return qs


def matches(r: dict[str, Any], d: Deal, q: dict[str, str], now: datetime) -> bool:
    is_open = d.stage.kind == StageKind.OPEN
    nt = getattr(d, "next_due", None)
    if q.get("overdue") == "true" and not (is_open and nt and nt < now):
        return False
    if q.get("rotten") == "true" and not r["rotten"]:
        return False
    if q.get("notask") == "true" and not (is_open and not nt):
        return False
    idle = int(num(q.get("idle")))
    if idle and not (is_open and days(touched(d), now) >= idle):
        return False
    if closing := q.get("closing"):
        today = now.date()
        if not is_open or not d.close_date:
            return False
        if closing == "week" and not (today <= d.close_date <= today + timedelta(days=7)):
            return False
        if closing == "overdue" and not d.close_date < today:
            return False
    return not ((tag := q.get("tag")) and tag not in (d.tags or []))


def rows(qs: Iterable[Deal], q: dict[str, str], now: datetime) -> list[tuple[Deal, dict[str, Any]]]:
    out = []
    for d in qs:
        r = row(d, now)
        if matches(r, d, q, now):
            out.append((d, r))
    return out


def sorter(sort: str, now: datetime, names: dict[int, str]) -> Callable[[dict[str, Any]], Any]:
    order = {code: i for i, code in enumerate(Stage.objects.values_list("code", flat=True))}
    keys: dict[str, Callable[[dict[str, Any]], Any]] = {
        "idle": lambda r: r["touched"] or "",
        "title": lambda r: r["title"].lower(),
        "customer": lambda r: (r["customer"] or "").lower(),
        "stage": lambda r: order.get(r["stage"], 0),
        "amount": lambda r: -num(r["amount"]),
        "owner": lambda r: names.get(r["owner_tg"] or 0, ""),
        "task": lambda r: (r["next_task"] is None, r["next_task"] or ""),
    }
    return keys.get(sort, lambda r: "")


def sort_rows(rs: list[dict[str, Any]], sort: str, now: datetime) -> list[dict[str, Any]]:
    if sort in ("created", "updated", "") or sort not in (
        "idle",
        "title",
        "customer",
        "stage",
        "amount",
        "owner",
        "task",
    ):
        f = "created" if sort == "created" else "updated"
        return sorted(rs, key=lambda r: r[f] or "", reverse=True)
    names = {u["tg_id"]: u["name"] for u in sellers()}
    return sorted(rs, key=sorter(sort, now, names))


def counts(me: Me, q: dict[str, str], now: datetime) -> dict[str, int]:
    c = {p: 0 for p in Pipeline.objects.values_list("code", flat=True)}
    for d, _ in rows(scope(me, q).filter(stage__kind=StageKind.OPEN), q, now):
        c[d.stage.pipeline_id] = c.get(d.stage.pipeline_id, 0) + 1
    return c


def stage_json(st: Stage) -> dict[str, Any]:
    return {
        "code": st.code,
        "name": st.name,
        "pipeline": st.pipeline_id,
        "kind": st.kind,
        "color": st.color or None,
        "probability": st.probability,
        "guide": st.guide or None,
        "sla_hours": st.sla_hours,
    }


def meta() -> dict[str, Any]:
    from .models import LostReason

    return {
        "pipelines": [{"code": p.code, "name": p.name} for p in Pipeline.objects.all()],
        "stages": [stage_json(st) for st in Stage.objects.all()],
        "users": sellers(),
        "lost_reasons": list(LostReason.objects.values_list("name", flat=True)),
        "divisions": [{"code": c, "name": n} for c, n in Division.choices],
    }


def board(me: Me, q: dict[str, str], now: datetime) -> dict[str, Any]:
    pipe = q.get("pipeline") or "main"
    only = q.get("stage") or ""
    off = int(num(q.get("offset")))
    stages = Stage.objects.filter(pipeline_id=pipe)
    if only:
        stages = stages.filter(code=only)
    base = scope(me, q)
    out = []
    for st in stages:
        is_open = st.kind == StageKind.OPEN
        rs = [r for _, r in rows(base.filter(stage=st), q, now)] if is_open else []
        rs.sort(key=lambda r: r["updated"] or "", reverse=True)
        start = off if only == st.code else 0
        out.append(
            {
                **stage_json(st),
                "rot_days": st.rot_days,
                "count": len(rs),
                "amount": money(sum((num(r["amount"]) for r in rs), Decimal(0))),
                "weighted": money(round(sum((num(r["amount"]) * (r["prob"] or 0) / 100 for r in rs), Decimal(0)))),
                "rotten": sum(1 for r in rs if r["rotten"]),
                "deals": rs[start : start + PAGE],
            }
        )
    return {"counts": counts(me, q, now), "stages": out}


def deal_list(me: Me, q: dict[str, str], now: datetime) -> dict[str, Any]:
    qs = scope(me, q)
    if pipe := q.get("pipeline"):
        qs = qs.filter(stage__pipeline_id=pipe)
    if stage := q.get("stage"):
        qs = qs.filter(stage_id=stage)
    kind = q.get("kind") or "open"
    if kind != "all":
        qs = qs.filter(stage__kind=kind)
    rs = sort_rows([r for _, r in rows(qs, q, now)], q.get("sort") or "updated", now)
    off = int(num(q.get("offset")))
    lim = int(num(q.get("limit"))) or 50
    return {
        "rows": rs[off : off + lim],
        "total": len(rs),
        "amount": money(sum((num(r["amount"]) for r in rs), Decimal(0))),
        "counts": counts(me, q, now),
    }


def get_deal(me: Me, pk: int) -> Deal:
    d = me.deals(deals_qs()).filter(pk=pk).first()
    if d is None:
        raise ApiError(404, "Bitim topilmadi")
    return d


def detail(me: Me, pk: int, now: datetime) -> dict[str, Any]:
    d = get_deal(me, pk)
    return {
        **row(d, now),
        "counterparty_id": d.customer_id,
        "probability": d.probability,
        "need": d.need or None,
        # tunnel zanjiri: manba bitim va undan ochilganlar (ko'ra oladiganlari — ochish uchun)
        "linked": [
            {"id": x.pk, "title": x.title, "stage": x.stage_id, "pipeline": x.stage.pipeline_id, "rel": rel}
            for rel, qs in (("parent", Deal.objects.filter(pk=d.parent_id)), ("child", Deal.objects.filter(parent=d)))
            for x in me.deals(qs.select_related("stage"))
        ],
        "docs": [
            {
                "id": x.pk,
                "deal_id": d.pk,
                "number": x.number,
                "kind": x.kind,
                "date": x.date.isoformat(),
                "status": x.status,
                "state": x.state or None,
                "total": money(x.total),
            }
            for x in Doc.objects.filter(deal=d)
        ],
        "items": list(d.items or []),
        "activity": [act_json(a) for a in Activity.objects.filter(deal=d).order_by("-ts", "-id")],
        "stages": [
            {
                "ts": iso(h.ts),
                "actor": h.actor,
                "from_stage": h.from_stage or None,
                "to_stage": h.to_stage,
                "src": h.src,
            }
            for h in StageHistory.objects.filter(deal=d)
        ],
    }


def act_json(a: Activity) -> dict[str, Any]:
    return {
        "id": a.pk,
        "deal_id": a.deal_id,
        "kind": a.kind,
        "ts": iso(a.ts),
        "actor": a.actor,
        "text": a.text,
        "data": a.data,
        "due": iso(a.due),
        "done_at": iso(a.done_at),
        "assignee": a.assignee,
    }


# ------------------------------------------------------------------ o'zgartirishlar
@transaction.atomic
def move_stage(me: Me, d: Deal, code: str, reason: str, now: datetime, src: str = "web") -> None:
    st = Stage.objects.filter(code=code).first()
    if st is None:
        raise ApiError(400, "Bunday bosqich yo'q")
    if st.kind == StageKind.LOST and not reason:
        raise ApiError(400, "Rad etish sababini tanlang")
    if d.stage_id == code:
        return
    from . import sales

    sales.check_move(d, st)
    StageHistory.objects.create(
        deal=d,
        ts=now,
        actor=me.tg_id or None,
        from_stage=d.stage_id,
        to_stage=code,
        src=src,
        reason=reason if st.kind == StageKind.LOST else "",
    )
    d.stage = st
    d.stage_since = d.updated = now
    d.closed = None if st.kind == StageKind.OPEN else now
    d.lost_reason = reason if st.kind == StageKind.LOST else ""
    d.sla_reminded_at = None
    d.save(update_fields=["stage", "stage_since", "updated", "closed", "lost_reason", "sla_reminded_at"])
    sales.on_enter(me, d, now)
    run_tunnels(me, d, now)


COPY_FIELDS = ("title", "customer", "owner_tg", "amount", "items", "source", "need", "contact", "division")
COPY_FIELDS += (
    "buyer_order",
    "prod_order",
    "prod_no",
    "repeat",
    "close_date",
    "discount",
    "markup",
    "logistics",
    "location",
)


def run_tunnels(me: Me, d: Deal, now: datetime, depth: int = 0) -> None:
    """Bosqichdagi tunnellar: copy — keyingi voronkada bog'langan bitim (bir marta); root — zanjir boshidagi asl bitimni
    shu bosqichga o'tkazish (u ham o'z tunnellarini ishga tushiradi). depth — tasodifiy aylanadan himoya."""
    if depth > 5:
        return
    for t in Tunnel.objects.filter(from_stage_id=d.stage_id).select_related("to_stage", "to_stage__pipeline"):
        to = t.to_stage
        if t.action == TunnelAction.COPY:
            if Deal.objects.filter(parent=d, stage__pipeline_id=to.pipeline_id).exists():
                continue  # bosqichga qaytib kelgan — ikkinchi nusxa ochilmaydi
            child = Deal.objects.create(
                **{f: getattr(d, f) for f in COPY_FIELDS}, parent=d, stage=to, stage_since=now, created=now, updated=now
            )
            child.title = deal_title(child.pk, child.title)
            child.save(update_fields=["title"])
            StageHistory.objects.create(
                deal=child, ts=now, actor=me.tg_id, from_stage="", to_stage=to.code, src="tunnel"
            )
            Activity.objects.create(
                deal=d,
                kind="stage",
                ts=now,
                actor=me.tg_id,
                text=f"«{to.pipeline.name}» voronkasida bitim #{child.pk} ochildi",
            )
            run_tunnels(me, child, now, depth + 1)
        else:
            root = d
            while root.parent_id and depth < 10:
                root = Deal.objects.select_related("stage").get(pk=root.parent_id)
                depth += 1
            if root.pk != d.pk and root.stage_id != to.code:
                StageHistory.objects.create(
                    deal=root, ts=now, actor=me.tg_id, from_stage=root.stage_id, to_stage=to.code, src="tunnel"
                )
                root.stage, root.stage_since, root.updated = to, now, now
                root.closed = None if to.kind == StageKind.OPEN else now
                root.save(update_fields=["stage", "stage_since", "updated", "closed"])
                run_tunnels(me, root, now, depth + 1)


def get_customer(me: Me, pk: Any) -> Customer:
    c = me.customers(Customer.objects.all()).filter(pk=int_or_none(pk) or 0).first()
    if c is None:
        raise ApiError(404, "Mijoz topilmadi")
    return c


def auto_title(items: Any, customer: Customer | None) -> str:
    """Tizim beradigan bitim nomi (raqam — deal_title): birinchi tovar va miqdori, ko'p bo'lsa «+N»; tovarsiz — mijoz nomi.
    Frontend (new-deal) oldindan ko'rsatadigan nom bilan bir xil."""
    rows = [x for x in items if isinstance(x, dict) and s(x.get("name")).strip()] if isinstance(items, list) else []
    if rows:
        x = rows[0]
        q = num(x.get("qty"))
        qty = f" — {q.normalize():f} {s(x.get('unit')) or 'dona'}" if q else ""
        more = f" +{len(rows) - 1}" if len(rows) > 1 else ""
        return f"{s(x.get('name')).strip()}{qty}{more}"[:255]
    return customer.name[:255] if customer is not None else "Yangi bitim"


@transaction.atomic
def new_deal(me: Me, b: dict[str, Any], now: datetime, *, customer: Customer | None = None) -> Deal:
    first = Stage.objects.filter(pipeline_id="main", kind=StageKind.OPEN).first()
    if first is None:
        raise ApiError(500, "CRM bosqichlari sozlanmagan (migratsiya).")
    owner = (int_or_none(b.get("owner_tg")) or me.tg_id) if me.is_head else me.tg_id
    d = Deal.objects.create(
        title=s(b.get("title")).strip()[:255] or auto_title(b.get("items"), customer),
        customer=customer,
        owner_tg=owner,
        amount=num(b.get("amount")),
        stage=first,
        stage_since=now,
        created=now,
        updated=now,
        source=s(b.get("source"))[:32],
        need=s(b.get("need")),
        **card_fields(b),
    )
    d.title = deal_title(d.pk, d.title)
    if not d.location and customer is not None and customer.address:  # joylashuv — mijoz manzilidan
        d.location = customer.address
    d.save(update_fields=["title", "location"])
    if isinstance(b.get("items"), list) and b["items"]:  # tovarlar bilan — summa ulardan hisoblanadi
        save_items(d, b, now)
    StageHistory.objects.create(deal=d, ts=now, actor=me.tg_id, from_stage="", to_stage=first.code, src="web")
    return d


CARD_TEXT = ("contact", "buyer_order", "prod_order", "prod_no")


def card_fields(b: dict[str, Any]) -> dict[str, Any]:
    """Kartochka maydonlari (berilganlari): kontakt, bo'linma, 1C raqamlari, takroriy bitim."""
    out: dict[str, Any] = {}
    for f in CARD_TEXT:
        if f in b:
            out[f] = s(b[f]).strip()[: 200 if f == "contact" else 32]
    if "division" in b:
        v = s(b["division"])
        if v and v not in Division.values:
            raise ApiError(400, "Bo'linma noto'g'ri: Novobelt yoki Belting Rezina.")
        out["division"] = v
    if "repeat" in b:
        out["repeat"] = bool(b["repeat"])
    if "pay_terms" in b:
        if s(b["pay_terms"]) not in PayTerms.values:
            raise ApiError(400, "To'lov sharti: 100% oldindan yoki 50/50.")
        out["pay_terms"] = s(b["pay_terms"])
    if "sign_status" in b:
        v = s(b["sign_status"])
        if v and v not in SignStatus.values:
            raise ApiError(400, "Imzo holati noto'g'ri.")
        out["sign_status"] = v
    if "docs_done" in b:
        out["docs_done"] = bool(b["docs_done"])
    if "location" in b:
        out["location"] = s(b["location"]).strip()[:300]
    for f, hi, label in PRICING:
        if f in b:
            v = num(b[f])
            if v < 0 or (hi is not None and v > hi):
                raise ApiError(400, label)
            out[f] = v
    return out


# bitim narxlash maydonlari: (maydon, yuqori chegara, xato matni)
PRICING: tuple[tuple[str, Decimal | None, str], ...] = (
    ("discount", Decimal(100), "Chegirma 0–100% oralig'ida bo'lsin."),
    ("markup", Decimal(1000), "Ustama 0–1000% oralig'ida bo'lsin."),
    ("logistics", None, "Logistika summasi manfiy bo'lmasin."),
)


def goods_total(items: list[dict[str, Any]]) -> Decimal:
    return sum((item_amount(x) for x in items), Decimal(0))


def priced(d: Deal, sub: Decimal) -> Decimal:
    """Tovarlar summasi → bitim summasi: chegirma, ustama, logistika."""
    return (sub * (1 - d.discount / 100) * (1 + d.markup / 100) + d.logistics).quantize(Decimal(1))


def recalc(d: Deal) -> None:
    """Tovarlar bor bo'lsa — summa ulardan (narxlash bilan); yo'q bo'lsa — qo'lda kiritilgan summa qoladi."""
    if d.items:
        d.amount = priced(d, goods_total(d.items))


def patch_deal(me: Me, d: Deal, b: dict[str, Any], now: datetime) -> None:
    if "owner_tg" in b and int_or_none(b["owner_tg"]) != d.owner_tg:
        if not me.is_head:
            raise ApiError(403, "Mas'ulni faqat sotuv bo'limi rahbari o'zgartiradi")
        d.owner_tg = int_or_none(b["owner_tg"])
    if "title" in b:
        d.title = deal_title(d.pk, s(b["title"]) or d.title)
    if "amount" in b:
        d.amount = num(b["amount"])
    if "probability" in b:
        p = int_or_none(b["probability"])
        d.probability = None if p is None else max(0, min(100, p))
    if "close_date" in b:
        d.close_date = parse_date(s(b["close_date"])[:10]) if b["close_date"] else None
    if "source" in b:
        d.source = s(b["source"])[:32]
    if "need" in b:
        d.need = s(b["need"])
    fields = card_fields(b)
    signed_now = fields.get("sign_status") == SignStatus.SIGNED and d.sign_status != SignStatus.SIGNED
    if fields.get("sign_status") == SignStatus.SENT and d.sign_status != SignStatus.SENT:
        d.sign_sent_at = now  # imzo kuzatuvi: 1 kun ichida imzolanmasa — eslatma (SLA)
    for f, v in fields.items():
        setattr(d, f, v)
    if any(f in fields for f, _, _ in PRICING):
        recalc(d)
    d.updated = now
    d.save()
    if signed_now:
        from . import sales

        sales.advance(me, d, "payment", now, "shartnoma imzolandi")


def item_amount(x: dict[str, Any]) -> Decimal:
    return num(x.get("qty")) * num(x.get("price")) * (1 - num(x.get("discount")) / 100)


def save_items(d: Deal, b: dict[str, Any], now: datetime) -> dict[str, Any]:
    raw_items = b.get("items")
    raw: list[Any] = raw_items if isinstance(raw_items, list) else []
    items = [
        {
            "item_id": int_or_none(x.get("item_id")),
            "char_id": int_or_none(x.get("char_id")),
            "name": s(x.get("name")).strip() or "Nomsiz",
            "unit": s(x.get("unit")) or None,
            "qty": money(num(x.get("qty"))),
            "price": money(num(x.get("price"))),
            "discount": money(num(x.get("discount"))),
        }
        for x in raw
        if isinstance(x, dict)
    ]
    d.items = items
    d.amount = priced(d, goods_total(items)) if items else Decimal(0)
    d.updated = now
    d.save(update_fields=["items", "amount", "updated"])
    return {"items": items, "amount": money(d.amount)}


@transaction.atomic
def make_doc(me: Me, d: Deal, kind: str, now: datetime) -> dict[str, Any]:
    if kind not in ("quote", "order"):
        raise ApiError(400, "Hujjat turi noto'g'ri")
    items = [x for x in d.items or [] if x.get("item_id")]
    if not items:
        raise ApiError(400, "Katalogdagi tovar yo'q — avval tovar qo'shing")
    seq = (Doc.objects.aggregate(m=Max("id"))["m"] or 0) + 1
    doc = Doc.objects.create(
        deal=d,
        number=f"BR-{'TT' if kind == 'quote' else 'BU'}-{now:%y}-{seq:05d}",
        kind=kind,
        date=timezone.localdate(now),
        status="posted" if kind == "quote" else "draft",
        total=priced(d, goods_total(items)),
        lines=[{**x, "amount": money(item_amount(x).quantize(Decimal(1)))} for x in items],
        meta={
            "customer": d.customer.name if d.customer else "",
            "inn": d.customer.inn if d.customer else "",
            "location": d.location,
            "sub": money(goods_total(items).quantize(Decimal(1))),
            "discount": money(d.discount),
            "markup": money(d.markup),
            "logistics": money(d.logistics),
        },
    )
    Activity.objects.create(
        deal=d,
        kind="doc",
        ts=now,
        actor=me.tg_id,
        text=f"{'Tijorat taklifi' if kind == 'quote' else 'Buyurtma qoralamasi'} {doc.number}",
    )
    d.updated = now
    d.save(update_fields=["updated"])
    from . import sales

    sales.advance(me, d, "offer", now, f"{'tijorat taklifi' if kind == 'quote' else 'buyurtma'} {doc.number} tuzildi")
    return doc_json(doc)


def doc_json(doc: Doc, full: bool = False) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": doc.pk,
        "deal_id": doc.deal_id,
        "number": doc.number,
        "kind": doc.kind,
        "date": doc.date.isoformat(),
        "status": doc.status,
        "state": doc.state or None,
        "total": money(doc.total),
    }
    if full:
        d = doc.deal
        lines, meta = list(doc.lines or []), dict(doc.meta or {})
        if not lines:  # eski hujjat (qatorlar nusxasisiz) — bitimning hozirgi katalog tovarlaridan
            items = [x for x in d.items or [] if x.get("item_id")]
            lines = [{**x, "amount": money(item_amount(x).quantize(Decimal(1)))} for x in items]
            meta = {
                "customer": d.customer.name if d.customer else "",
                "inn": d.customer.inn if d.customer else "",
                "location": d.location,
                "sub": money(goods_total(items).quantize(Decimal(1))),
                "discount": money(d.discount),
                "markup": money(d.markup),
                "logistics": money(d.logistics),
                "restored": True,
            }
        from . import didox

        out |= {
            "lines": lines,
            "meta": meta,
            "deal_title": d.title,
            "customer_id": d.customer_id,
            # Didox: ulanganmi, qoralama ID'si va holati (matni bilan), kichik turlar
            "didox": {
                "enabled": didox.enabled(),
                "id": doc.didox_id or None,
                "status": doc.didox_status,
                "status_text": didox.STATUS.get(doc.didox_status) if doc.didox_status is not None else None,
                "at": iso(doc.didox_at),
                "url": didox.CABINET,
                "subtypes": [{"code": k, "name": v} for k, v in didox.SUBTYPES.items()],
            },
        }
    return out


def get_doc(me: Me, pk: int) -> Doc:
    """Hujjat — faqat ko'ra oladigan bitimniki (aks holda 404)."""
    doc = (
        Doc.objects.select_related("deal", "deal__customer")
        .filter(pk=pk, deal__in=me.deals(Deal.objects.all()))
        .first()
    )
    if doc is None:
        raise ApiError(404, "Hujjat topilmadi")
    return doc


@transaction.atomic
def confirm_doc(me: Me, doc: Doc, now: datetime) -> dict[str, Any]:
    """Buyurtma qoralamasini tasdiqlash (o'tkazish)."""
    if doc.kind != "order":
        raise ApiError(400, "Faqat buyurtma qoralamasi tasdiqlanadi.")
    if doc.status != "draft":
        raise ApiError(409, "Buyurtma allaqachon tasdiqlangan.")
    doc.status, doc.state = "posted", "confirmed"
    doc.save(update_fields=["status", "state"])
    Activity.objects.create(
        deal=doc.deal, kind="doc", ts=now, actor=me.tg_id, text=f"Buyurtma {doc.number} tasdiqlandi"
    )
    from . import sales

    sales.advance(me, doc.deal, "contract", now, f"buyurtma {doc.number} tasdiqlandi")
    return doc_json(doc, full=True)


def add_activity(me: Me, d: Deal, b: dict[str, Any], now: datetime) -> dict[str, Any]:
    kind = s(b.get("kind")) or "comment"
    text = s(b.get("text")).strip()
    if not text:
        raise ApiError(400, "Matn bo'sh")
    due = to_dt(b.get("due")) if kind == "task" else None
    if kind == "task" and due is None:
        raise ApiError(400, "Muddatni tanlang")
    a = Activity.objects.create(
        deal=d,
        kind=kind[:16],
        ts=now,
        actor=me.tg_id,
        text=text,
        due=due,
        assignee=(int_or_none(b.get("assignee")) or me.tg_id) if kind == "task" else None,
    )
    return act_json(a)


def task_done(me: Me, pk: int, b: dict[str, Any], now: datetime) -> dict[str, Any]:
    a = (
        Activity.objects.filter(pk=pk, kind="task")
        .filter(Q(assignee=me.tg_id) | Q(deal__in=me.deals(Deal.objects.all())))
        .first()
    )
    if a is None:
        raise ApiError(404, "Vazifa topilmadi")
    a.done_at = a.done_at or now
    if res := s(b.get("result")).strip():
        a.data = {**(a.data or {}), "result": res}
    a.save(update_fields=["done_at", "data"])
    return act_json(a)


# ------------------------------------------------------------------ mijozlar
# STIR / JSHSHIR uzunligi mijoz turiga qarab
INN_RULES: dict[str, tuple[tuple[int, ...], str]] = {
    CustomerKind.COMPANY: ((9,), "Firma STIRi 9 xonali bo'lsin."),
    CustomerKind.STATE: ((9,), "Tashkilot STIRi 9 xonali bo'lsin."),
    CustomerKind.PERSON: ((14,), "JSHSHIR 14 xonali bo'lsin."),
    CustomerKind.IP: ((9, 14), "YaTT: STIR 9 yoki JSHSHIR 14 xonali bo'lsin."),
}
# yangi mijoz yaratishda STIR majburiy turlar (jismoniy shaxs JSHSHIRi, savdogar, firma xodimi — ixtiyoriy)
INN_REQUIRED = (CustomerKind.COMPANY, CustomerKind.IP, CustomerKind.STATE)


def norm_phones(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [("998" + p if len(p) == 9 else p)[:20] for p in (digits(x) for x in raw) if p]


def cust_fields(b: dict[str, Any], c: Customer | None = None) -> dict[str, Any]:
    """Mijoz turi va turga xos maydonlar (berilganlari) — tekshiruv bilan; c — mavjud mijoz (yangilashda).
    Firma xodimi — firma nomi majburiy; savdogar — telefon majburiy; STIR uzunligi — turga qarab."""
    kind = s(b["kind"]) if "kind" in b else (c.kind if c else CustomerKind.COMPANY)
    if kind not in CustomerKind.values:
        raise ApiError(400, "Mijoz turi noto'g'ri.")
    out: dict[str, Any] = {"kind": kind} if "kind" in b else {}
    if "inn" in b:
        inn = digits(b["inn"])
        lens, msg = INN_RULES.get(kind, ((9, 14), "STIR 9 yoki JSHSHIR 14 xonali bo'lsin."))
        if inn and len(inn) not in lens:
            raise ApiError(400, msg)
        out["inn"] = inn
    for f, n in (("position", 120), ("company", 255), ("address", 300)):
        if f in b:
            out[f] = s(b[f]).strip()[:n]
    if "company_inn" in b:
        ci = digits(b["company_inn"])
        if ci and len(ci) != 9:
            raise ApiError(400, "Firma STIRi 9 xonali bo'lsin.")
        out["company_inn"] = ci
    if "phones" in b:
        if not isinstance(b["phones"], list):
            raise ApiError(400, "Telefonlar ro'yxat ko'rinishida bo'lsin.")
        out["phones"] = norm_phones(b["phones"])

    def cur(f: str) -> Any:
        return out[f] if f in out else (getattr(c, f) if c is not None else None)

    if kind == CustomerKind.EMPLOYEE and not str(cur("company") or "").strip():
        raise ApiError(400, "Firma xodimi: qaysi firmadan — firma nomini yozing.")
    if kind == CustomerKind.TRADER and not cur("phones"):
        raise ApiError(400, "Savdogar: telefon raqamini yozing.")
    return out


def cust_json(c: Customer) -> dict[str, Any]:
    return {
        "id": c.pk,
        "kind": c.kind,
        "name": c.name,
        "position": c.position or None,
        "company": c.company or None,
        "company_inn": c.company_inn or None,
        "inn": c.inn or None,
        "phones": list(c.phones or []),
        "owner_tg": c.owner_tg,
        "address": c.address or None,
    }


def find_customers(me: Me, text: str) -> list[dict[str, Any]]:
    t = text.strip()
    if not t:
        return []
    dg = digits(t)
    cond = Q(name__icontains=t) | Q(inn__icontains=t) | Q(company__icontains=t)
    if len(dg) >= 4:
        cond |= Q(phones__icontains=dg)
    return [cust_json(c) for c in me.customers(Customer.objects.all()).filter(cond)[:20]]


def new_customer(me: Me, b: dict[str, Any]) -> dict[str, Any]:
    name = s(b.get("name")).strip()
    if not name:
        raise ApiError(400, "Mijoz nomini yozing")
    f = cust_fields({"phones": [], **b})
    # yangi mijoz: telefon — har doim, STIR — yuridik shaxs / YaTT / davlat tashkilotida (egasi qarori 2026-11-17)
    if not f.get("phones"):
        raise ApiError(400, "Telefon raqamini yozing.")
    kind = f.get("kind", CustomerKind.COMPANY)
    if kind in INN_REQUIRED and not f.get("inn"):
        raise ApiError(400, "STIR raqamini yozing.")
    inn = f.get("inn", "")
    if inn and (twin := me.customers(Customer.objects.filter(inn=inn)).first()):
        raise ApiError(409, f"Bu STIR bilan mijoz bor: «{twin.name}» — ro'yxatdan tanlang.")
    owner = (int_or_none(b.get("owner_tg")) or me.tg_id) if me.is_head else me.tg_id
    return cust_json(Customer.objects.create(name=name[:255], owner_tg=owner, **f))


# ------------------------------------------------------------------ lidlar
def lead_json(lead: Lead, **extra: Any) -> dict[str, Any]:
    return {
        "id": lead.pk,
        "created": iso(lead.created),
        "title": lead.title or None,
        "name": lead.name or None,
        "company": lead.company or None,
        "note": lead.note or None,
        "phone": lead.phone or None,
        "source": lead.source or None,
        "owner_tg": lead.owner_tg,
        "status": lead.status,
        "deal_id": lead.deal_id,
        "first_touch": iso(lead.first_touch),
        "junk_reason": lead.junk_reason or None,
        "product": lead.product or None,
        "size": lead.size or None,
        "qty": lead.qty or None,
        "inn": lead.inn or None,
        "region": lead.region or None,
        "no_answer": lead.no_answer,
        "next_call_at": iso(lead.next_call_at),
        "tg": None
        if lead.tg_chat is None
        else {
            "chat_id": lead.tg_chat_id,
            "username": lead.tg_chat.username or None,
            "unread": lead.tg_chat.unread,
            "channel": lead.tg_chat.connection.channel,
        },
        **extra,
    }


OPEN_LEADS = (LeadStatus.NEW, LeadStatus.WORK, LeadStatus.INTERESTED)


def leads(me: Me, q: dict[str, str]) -> list[dict[str, Any]]:
    st = [x for x in (q.get("status") or ",".join(OPEN_LEADS)).split(",") if x]
    qs = me.own(Lead.objects.select_related("tg_chat__connection").filter(status__in=st))
    owner = q.get("owner") or "" if me.is_head else ""
    if owner == "none":
        qs = qs.filter(owner_tg__isnull=True)
    elif owner:
        qs = qs.filter(owner_tg=int(owner)) if owner.isdigit() else qs.none()
    if t := (q.get("q") or "").strip():
        qs = qs.filter(
            Q(name__icontains=t)
            | Q(company__icontains=t)
            | Q(phone__icontains=digits(t) or t)
            | Q(title__icontains=t)
            | Q(note__icontains=t)
        )
    return [lead_json(x) for x in qs.order_by("-created")]


LEAD_TEXT = {"name": 200, "company": 255, "product": 120, "size": 120, "qty": 60, "region": 80}


def new_lead(me: Me, b: dict[str, Any], now: datetime) -> dict[str, Any]:
    """Lid qabuli: dublikat → ochiq lidga izoh; doimiy mijoz → o'z menejeriga bitim; yangi → navbat bo'yicha sotuvchiga."""
    from . import sales

    ph = digits(b.get("phone"))
    full = "998" + ph if len(ph) == 9 else ph
    inn = digits(b.get("inn"))
    note = s(b.get("note")).strip()
    key = phone_key(full)
    dup_q = (Q(phone__endswith=key) if len(key) == 9 else Q(pk__in=[])) | (Q(inn=inn) if inn else Q(pk__in=[]))
    dup = Lead.objects.filter(dup_q, status__in=OPEN_LEADS).first()
    if dup is not None:
        if note:
            dup.note = f"{dup.note}\n{note}" if dup.note else note
            dup.save(update_fields=["note"])
        return lead_json(dup, duplicate=True)
    if (c := sales.find_customer(full, inn)) is not None:
        return sales.customer_deal(c, {**b, "note": note}, now)
    asked = int_or_none(b.get("owner_tg")) if me.is_head else None
    # sotuvchi o'zi kiritdi (qo'ng'iroq) — o'zi; rahbar / sayt / marketplace — tanlangan yoki navbat bo'yicha
    owner = me.tg_id if (me.tg_id and not me.is_head) else (asked or sales.next_seller(now, {**b, "note": note}))
    lead = Lead.objects.create(
        created=now,
        note=note,
        phone=full[:20],
        inn=inn[:20],
        source=s(b.get("source"))[:32] or "manual",
        owner_tg=owner,
        status=LeadStatus.WORK if owner and owner == me.tg_id else LeadStatus.NEW,
        **{f: s(b.get(f)).strip()[:n] for f, n in LEAD_TEXT.items()},
    )
    return lead_json(lead, duplicate=False)


def edit_lead(lead: Lead, b: dict[str, Any]) -> dict[str, Any]:
    """Kvalifikatsiya ma'lumotlari: ism, kompaniya, telefon, STIR, tasma turi, o'lcham, hajm, izoh, manba."""
    fields: list[str] = []
    for f, n in LEAD_TEXT.items():
        if f in b:
            setattr(lead, f, s(b[f]).strip()[:n])
            fields.append(f)
    if "inn" in b:
        inn = digits(b["inn"])
        if inn and len(inn) not in (9, 14):
            raise ApiError(400, "STIR 9 xonali (yuridik) yoki JSHSHIR 14 xonali bo'lsin.")
        lead.inn = inn
        fields.append("inn")
    if "phone" in b:
        ph = digits(b["phone"])
        lead.phone = ("998" + ph if len(ph) == 9 else ph)[:20]
        fields.append("phone")
    for f in ("note", "source"):
        if f in b:
            setattr(lead, f, s(b[f]).strip()[:32] if f == "source" else s(b[f]).strip())
            fields.append(f)
    if fields:
        lead.save(update_fields=fields)
    return lead_json(lead)


def get_lead(me: Me, pk: int) -> Lead:
    lead = me.own(Lead.objects.all()).filter(pk=pk).first()
    if lead is None:
        raise ApiError(404, "Lid topilmadi")
    return lead


def assign_lead(me: Me, lead: Lead, b: dict[str, Any]) -> dict[str, Any]:
    if not me.is_head:
        raise ApiError(403, "Lidlarni faqat sotuv bo'limi rahbari taqsimlaydi")
    lead.owner_tg = int_or_none(b.get("owner_tg")) or None
    if lead.status == LeadStatus.NEW and lead.owner_tg:
        lead.status = LeadStatus.WORK
    lead.save(update_fields=["owner_tg", "status"])
    return lead_json(lead)


def move_lead(lead: Lead, b: dict[str, Any], now: datetime) -> dict[str, Any]:
    """Ochiq bosqichlar orasida: Yangi → Ishda → Qiziqish bildirdi (yopish — junk / convert)."""
    st = s(b.get("status"))
    if st not in OPEN_LEADS:
        raise ApiError(400, "Bosqich noto'g'ri: yangi, ishda yoki qiziqish bildirdi.")
    if lead.status not in OPEN_LEADS:
        raise ApiError(400, "Yopilgan lidni qayta ochib bo'lmaydi.")
    lead.status = st
    if st != LeadStatus.NEW:
        lead.first_touch = lead.first_touch or now
    lead.save(update_fields=["status", "first_touch"])
    return lead_json(lead)


def junk_lead(lead: Lead, b: dict[str, Any]) -> dict[str, Any]:
    reason = s(b.get("reason")).strip()
    if not reason:
        raise ApiError(400, "Rad etish sababini tanlang — sababsiz yopib bo'lmaydi.")
    lead.status = LeadStatus.JUNK
    lead.junk_reason = reason[:200]
    lead.save(update_fields=["status", "junk_reason"])
    return lead_json(lead)


@transaction.atomic
def convert_lead(me: Me, lead: Lead, now: datetime) -> Deal:
    if lead.status == LeadStatus.CONVERTED:
        raise ApiError(400, "Lid allaqachon bitimga aylangan")
    if lead.status == LeadStatus.JUNK:
        raise ApiError(400, "Yaroqsiz lidni bitimga aylantirib bo'lmaydi")
    from . import sales

    sales.qualify_check(lead)
    key = phone_key(lead.phone)
    chat = lead.tg_chat
    c = Customer.objects.filter(phones__icontains=key).first() if len(key) == 9 else None
    c = (
        c
        or (chat.customer if chat is not None else None)
        or (Customer.objects.filter(inn=lead.inn).first() if lead.inn else None)
    )
    owner = lead.owner_tg or me.tg_id
    if c is None:
        c = Customer.objects.create(
            name=lead.company or lead.name or lead.title or f"Lid #{lead.pk}",
            phones=[lead.phone] if lead.phone else [],
            owner_tg=owner,
            inn=lead.inn,
        )
    title = (
        " ".join(x for x in (lead.product, lead.size) if x)
        or lead.title
        or lead.company
        or lead.name
        or f"Lid #{lead.pk}"
    )
    if lead.qty:
        title = f"{title} — {lead.qty}"
    # lid egasi — bitim egasi (rahbar o'zgartirsa ham sotuvchiga qoladi)
    d = new_deal(
        Me(me.tg_id, me.name, True),
        {"title": title, "owner_tg": owner, "source": lead.source, "need": sales.lead_need(lead)},
        now,
        customer=c,
    )
    if chat is not None and chat.customer_id != c.pk:  # Telegram chati — shu mijozga
        chat.customer = c
        chat.save(update_fields=["customer"])
    lead.status = LeadStatus.CONVERTED
    lead.deal = d
    lead.first_touch = lead.first_touch or now
    lead.owner_tg = lead.owner_tg or d.owner_tg
    lead.save(update_fields=["status", "deal", "first_touch", "owner_tg"])
    return d


# ------------------------------------------------------------------ reja
def goals(me: Me, month: str, now: datetime) -> dict[str, Any]:
    cur = timezone.localdate(now)
    m = re.fullmatch(r"(\d{4})-(\d{2})", month or "")
    y, mo = (int(m.group(1)), int(m.group(2))) if m and 1 <= int(m.group(2)) <= 12 else (cur.year, cur.month)
    first = date(y, mo, 1)
    dim = calendar.monthrange(y, mo)[1]
    cur_first = cur.replace(day=1)
    passed = dim if first < cur_first else 0 if first > cur_first else cur.day
    won = Deal.objects.filter(stage__kind=StageKind.WON, closed__year=y, closed__month=mo)
    plans = {g.owner_tg: g.amount for g in Goal.objects.filter(month=first)}
    out = []
    for u in sellers():
        mine = [d.amount for d in won if d.owner_tg == u["tg_id"]]
        plan = plans.get(u["tg_id"], Decimal(0))
        sales = sum(mine, Decimal(0))
        out.append(
            {
                "tg_id": u["tg_id"],
                "name": u["name"],
                "plan": money(plan),
                "sales": money(sales),
                "pct": round(float(sales / plan * 100), 1) if plan else None,
                "won_deals": len(mine),
                "won_amount": money(sales),
            }
        )
    return {"days": dim, "passed": passed, "can_edit": me.is_head, "rows": out}


def set_goal(me: Me, b: dict[str, Any]) -> None:
    if not me.is_head:
        raise ApiError(403, "Rejani faqat sotuv bo'limi rahbari belgilaydi")
    tg = int_or_none(b.get("owner_tg"))
    month = parse_date(s(b.get("month"))[:7] + "-01")
    if not tg or month is None:
        raise ApiError(400, "Sotuvchi yoki oy noto'g'ri")
    Goal.objects.update_or_create(owner_tg=tg, month=month, defaults={"amount": num(b.get("amount"))})

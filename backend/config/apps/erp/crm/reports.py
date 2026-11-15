"""CRM hisoboti (davr: from..to, kunlar — Toshkent vaqti): asosiy raqamlar, Savdo voronkasi (davrda ochilgan bitimlar
qaysi bosqichgacha yetgani), sotuvchilar (lid, javob tezligi, konversiya, sotuv, yo'qotish, ochiq voronka, muddati o'tgan
vazifa), yo'qotish sabablari, lid manbalari. Rahbar — hamma; sotuvchi — faqat o'zi.

Sotuv — Savdo voronkasida «Tovar jo'natildi»/«Muvaffaqiyatli» ga o'tgan sana davrga tushgan bitimlar (tunnel nusxalari emas).
"""

from __future__ import annotations

import statistics
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any

from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date

from .access import Me, sellers
from .customers import BOUGHT, buy_date
from .deals import money
from .models import Activity, Deal, Lead, LeadStatus, StageHistory, StageKind

# Savdo voronkasining asosiy yo'li (yon bosqich «Tovar yetishmadi» — hisobga kirmaydi)
FUNNEL = ("new", "offer", "contract", "payment", "production", "ready", "shipping", "won")


def period(q: dict[str, str], now: datetime) -> tuple[date, date]:
    today = timezone.localdate(now)
    d1 = parse_date(q.get("from") or "") or today.replace(day=1)
    d2 = parse_date(q.get("to") or "") or today
    if d2 < d1:
        d1, d2 = d2, d1
    return d1, min(d2, d1 + timedelta(days=366))


def _bounds(d1: date, d2: date) -> tuple[datetime, datetime]:
    tz = timezone.get_current_timezone()
    return datetime.combine(d1, time.min, tz), datetime.combine(d2 + timedelta(days=1), time.min, tz)


def _median(xs: list[float]) -> int | None:
    return round(statistics.median(xs)) if xs else None


def report(me: Me, q: dict[str, str], now: datetime) -> dict[str, Any]:
    d1, d2 = period(q, now)
    t1, t2 = _bounds(d1, d2)
    who = [u for u in sellers() if me.is_head or u["tg_id"] == me.tg_id] or [{"tg_id": me.tg_id, "name": me.name}]
    ids = {u["tg_id"] for u in who}
    own = Q() if me.is_head else Q(owner_tg=me.tg_id)

    leads = list(Lead.objects.filter(own, created__gte=t1, created__lt=t2))
    main = Deal.objects.filter(own, stage__pipeline_id="main", parent__isnull=True)
    created = list(main.filter(created__gte=t1, created__lt=t2).select_related("stage"))
    bought = [d for d in main.filter(stage_id__in=BOUGHT) if d1 <= buy_date(d) <= d2]
    lost = list(main.filter(stage__kind=StageKind.LOST, closed__gte=t1, closed__lt=t2))
    open_deals = list(main.filter(stage__kind=StageKind.OPEN).exclude(stage_id__in=BOUGHT))
    overdue = Counter(
        a.assignee
        for a in Activity.objects.filter(kind="task", done_at__isnull=True, due__lt=now, assignee__in=ids)
        if me.is_head or a.assignee == me.tg_id
    )

    # voronka: har bitim qaysi bosqichgacha yetgan (tarix yoki hozirgi bosqich)
    order = {c: i for i, c in enumerate(FUNNEL)}
    reached: dict[int, int] = {d.pk: order.get(d.stage_id, 0) for d in created}
    for h in StageHistory.objects.filter(deal_id__in=reached.keys(), to_stage__in=FUNNEL):
        reached[h.deal_id] = max(reached[h.deal_id], order[h.to_stage])
    funnel = [{"stage": c, "count": sum(1 for r in reached.values() if r >= i)} for i, c in enumerate(FUNNEL)]

    def resp(ls: list[Lead]) -> list[float]:
        return [
            (x.first_touch - x.created).total_seconds() / 60 for x in ls if x.first_touch and x.first_touch >= x.created
        ]

    by_owner: dict[int | None, list[Lead]] = defaultdict(list)
    for x in leads:
        by_owner[x.owner_tg].append(x)

    def money_sum(ds: list[Deal]) -> str:
        return money(sum((d.amount for d in ds), Decimal(0)))

    rows = []
    for u in who:
        tg = u["tg_id"]
        ls = by_owner.get(tg, [])
        won = [d for d in bought if d.owner_tg == tg]
        conv = sum(1 for x in ls if x.status == LeadStatus.CONVERTED)
        rows.append(
            {
                "tg_id": tg,
                "name": u["name"],
                "leads": len(ls),
                "response_min": _median(resp(ls)),
                "lead_conv": round(conv / len(ls) * 100) if ls else None,
                "deals": sum(1 for d in created if d.owner_tg == tg),
                "won": len(won),
                "won_sum": money_sum(won),
                "lost": sum(1 for d in lost if d.owner_tg == tg),
                "open_sum": money_sum([d for d in open_deals if d.owner_tg == tg]),
                "overdue_tasks": overdue.get(tg, 0),
            }
        )

    reasons: dict[str, list[Deal]] = defaultdict(list)
    for d in lost:
        reasons[d.lost_reason or "Sababsiz"].append(d)
    sources: dict[str, list[Lead]] = defaultdict(list)
    for x in leads:
        sources[x.source or "—"].append(x)
    conv_all = sum(1 for x in leads if x.status == LeadStatus.CONVERTED)

    return {
        "from": d1.isoformat(),
        "to": d2.isoformat(),
        "head": me.is_head,
        "kpi": {
            "leads": len(leads),
            "unassigned": sum(1 for x in leads if not x.owner_tg) if me.is_head else 0,
            "response_min": _median(resp(leads)),
            "lead_conv": round(conv_all / len(leads) * 100) if leads else None,
            "deals": len(created),
            "won": len(bought),
            "won_sum": money_sum(bought),
            "lost": len(lost),
            "win_rate": round(len(bought) / (len(bought) + len(lost)) * 100) if bought or lost else None,
            "open_sum": money_sum(open_deals),
        },
        "funnel": funnel,
        "sellers": rows,
        "reasons": [
            {"reason": r, "count": len(ds), "sum": money_sum(ds)}
            for r, ds in sorted(reasons.items(), key=lambda kv: -len(kv[1]))
        ],
        "sources": [
            {"source": s, "leads": len(ls), "converted": sum(1 for x in ls if x.status == LeadStatus.CONVERTED)}
            for s, ls in sorted(sources.items(), key=lambda kv: -len(kv[1]))
        ],
    }

"""CRM robotlari (Celery beat, har 5 daqiqa — tasks.robots):

1. Javobsiz lid: «Yangi» lid 30 daqiqa javobsiz — mas'ul sotuvchiga; taqsimlanmagan lid 15 daqiqa — sotuv rahbarlariga.
2. Muddati o'tgan vazifa — bajaruvchiga.
3. Takroriy savdo: mijoz odatda har N kunda oladi (xaridlar oralig'i medianasi; bitta xarid — 90 kun) — keyingi xaridga
   7 kun qolganda, ochiq savdo bitimi bo'lmasa, oxirgi mas'ulga takroriy bitim (tovarlari bilan) va vazifa ochiladi.

Eslatmalar asosiy bot orqali (core.telegram), har biri bir marta, faqat ish vaqtida (WORK_HOURS, Toshkent) — kechasi
bezovta qilmaydi, ertalab yuboriladi. Yuborilmasa (bot sozlanmagan, tarmoq) — belgilanmaydi, keyingi safar qayta urinadi.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from django.conf import settings
from django.utils import timezone

from config.apps.core.telegram import send_message

from .access import is_sales_head
from .customers import BOUGHT, repeat_cycle
from .deals import iso
from .models import Activity, Customer, Deal, Lead, LeadStatus, Stage, StageHistory, StageKind

log = logging.getLogger(__name__)
WORK_HOURS = (8, 20)
LEAD_REPLY = timedelta(minutes=30)
LEAD_ASSIGN = timedelta(minutes=15)


def _link(path: str) -> str:
    base = settings.JARVIS_PUBLIC_URL
    return f"\n{base}{path}" if base else ""


def working(now: datetime) -> bool:
    h = timezone.localtime(now).hour
    return WORK_HOURS[0] <= h < WORK_HOURS[1]


def lead_reminders(now: datetime) -> int:
    n = 0
    for lead in Lead.objects.filter(
        status=LeadStatus.NEW, reminded_at__isnull=True, owner_tg__isnull=False, created__lte=now - LEAD_REPLY
    ):
        mins = int((now - lead.created).total_seconds() // 60)
        who = lead.name or lead.company or lead.phone or f"Lid #{lead.pk}"
        text = f"⏰ Javobsiz lid: {who} — {mins} daqiqa kutmoqda.\n{lead.note[:200]}".rstrip()
        if send_message(lead.owner_tg or 0, text + _link("/app/erp/crm/?tab=leads")):
            lead.reminded_at = now
            lead.save(update_fields=["reminded_at"])
            n += 1
    free = list(
        Lead.objects.filter(
            status=LeadStatus.NEW, reminded_at__isnull=True, owner_tg__isnull=True, created__lte=now - LEAD_ASSIGN
        )
    )
    if free:
        from config.apps.staff.services import active_users

        heads = [u for u in active_users() if is_sales_head(u)]
        text = f"📥 Taqsimlanmagan lidlar: {len(free)} ta (15 daqiqadan ko'p). Sotuvchiga biriktiring." + _link(
            "/app/erp/crm/?tab=leads"
        )
        if any([send_message(h.tg_id, text) for h in heads]):
            Lead.objects.filter(pk__in=[x.pk for x in free]).update(reminded_at=now)
            n += len(free)
    return n


def sla_reminders(now: datetime) -> int:
    """Bosqich muddati (SLA) o'tgan ochiq bitimlar — mas'ulga, har bosqichda bir marta."""
    n = 0
    for d in Deal.objects.filter(
        stage__kind=StageKind.OPEN, stage__sla_hours__isnull=False, sla_reminded_at__isnull=True
    ).select_related("stage"):
        h = d.stage.sla_hours or 0
        if not d.owner_tg or d.stage_since + timedelta(hours=h) > now:
            continue
        text = f"⏱ Bosqich muddati o'tdi: «{d.title}» — {d.stage.name} ({h} soat).\n{d.stage.guide}".rstrip() + _link(
            f"/app/erp/crm/?deal={d.pk}"
        )
        if send_message(d.owner_tg, text):
            d.sla_reminded_at = now
            d.save(update_fields=["sla_reminded_at"])
            n += 1
    return n


def callback_reminders(now: datetime) -> int:
    """«Javob bermadi» — rejalashtirilgan qayta qo'ng'iroq vaqti keldi (1, 3, 7 kun)."""
    n = 0
    for lead in Lead.objects.filter(
        status__in=[LeadStatus.NEW, LeadStatus.WORK, LeadStatus.INTERESTED],
        next_call_at__lte=now,
        call_reminded_at__isnull=True,
        owner_tg__isnull=False,
    ):
        who = lead.name or lead.company or lead.phone or f"Lid #{lead.pk}"
        tel = f" +{lead.phone}" if lead.phone else ""
        text = f"📞 Qayta qo'ng'iroq: {who}{tel} — {lead.no_answer}-urinishdan keyin." + _link(
            "/app/erp/crm/?tab=leads"
        )
        if send_message(lead.owner_tg or 0, text):
            lead.call_reminded_at = now
            lead.save(update_fields=["call_reminded_at"])
            n += 1
    return n


def task_reminders(now: datetime) -> int:
    n = 0
    for a in Activity.objects.filter(kind="task", done_at__isnull=True, due__lt=now).select_related("deal"):
        if (a.data or {}).get("reminded") or not a.assignee:
            continue
        text = f"⏰ Vazifa muddati o'tdi: {a.text[:200]}\nBitim: {a.deal.title}" + _link(
            f"/app/erp/crm/?deal={a.deal_id}"
        )
        if send_message(a.assignee, text):
            a.data = {**(a.data or {}), "reminded": iso(now)}
            a.save(update_fields=["data"])
            n += 1
    return n


REPEAT_AHEAD = 7  # kun oldin bitim ochiladi
REPEAT_HOUR = 9  # takroriy savdo tekshiruvi — har kuni 09:00 da


def repeat_sales(now: datetime, limit: int = 50) -> int:
    today = timezone.localdate(now)
    first = Stage.objects.filter(pipeline_id="main", kind=StageKind.OPEN).first()
    if first is None:
        return 0
    busy = set(
        Deal.objects.filter(stage__pipeline_id="main", stage__kind=StageKind.OPEN)
        .exclude(stage_id__in=BOUGHT)
        .values_list("customer_id", flat=True)
    )
    n = 0
    for c in (
        Customer.objects.filter(deals__stage_id__in=BOUGHT, deals__parent__isnull=True).exclude(pk__in=busy).distinct()
    ):
        bought = list(Deal.objects.filter(customer=c, stage_id__in=BOUGHT, parent__isnull=True).order_by("stage_since"))
        dates = [timezone.localdate(d.closed or d.stage_since) for d in bought]
        cycle = repeat_cycle(dates)
        last, when = bought[-1], dates[-1] + timedelta(days=cycle)
        if (
            today < when - timedelta(days=REPEAT_AHEAD)
            or Deal.objects.filter(customer=c, repeat=True, created__date__gt=dates[-1]).exists()
        ):
            continue
        d = Deal.objects.create(
            title=f"Takroriy: {c.name}"[:255],
            customer=c,
            owner_tg=last.owner_tg,
            amount=last.amount,
            items=last.items,
            stage=first,
            stage_since=now,
            created=now,
            updated=now,
            source="existing",
            need=f"Odatda har ~{cycle} kunda oladi; oxirgi xarid {dates[-1]:%d.%m.%Y} (bitim #{last.pk}).",
            contact=last.contact,
            division=last.division,
            repeat=True,
        )
        StageHistory.objects.create(deal=d, ts=now, actor=None, from_stage="", to_stage=first.code, src="robot")
        Activity.objects.create(
            deal=d,
            kind="task",
            ts=now,
            text=f"Mijoz bilan bog'laning — takroriy xarid vaqti ({when:%d.%m})",
            due=now + timedelta(days=1),
            assignee=last.owner_tg,
        )
        n += 1
        if n >= limit:
            break
    return n


def run(now: datetime | None = None) -> dict[str, int]:
    now = now or timezone.now()
    out: dict[str, int] = {}
    if working(now):
        loc = timezone.localtime(now)
        if loc.hour == REPEAT_HOUR and loc.minute < 5:  # kuniga bir marta (beat har 5 daqiqa)
            out["repeat"] = repeat_sales(now)
        out["leads"] = lead_reminders(now)
        out["sla"] = sla_reminders(now)
        out["callbacks"] = callback_reminders(now)
        out["tasks"] = task_reminders(now)
    return out

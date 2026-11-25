"""7-bosqich: CRM qatlami — mijoz kartasi (Telegram foydalanuvchisi bo'yicha), voronka, teglar, izohlar, vazifalar,
SLA (javobsiz chatlar) va hisobot. Mavjud CRM (erp/crm) bilan bog'liq emas — o'z jadvallari.

Javob vaqti: mijozning ketma-ket kelgan xabarlaridan BIRINCHISI → keyingi chiquvchi xabar. Javob bergan xodim —
CRM orqali yuborgan (`sent_by`), aks holda chat mas'uli; telefondan yozilgani — "Telegram ilovasidan".
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.utils import timezone

from config.apps.staff import services as staff

from .models import Account, Contact, Dialog, Message, Note, Peer, PeerKind, Stage, Tag, Task

NOTES_MAX = 50
FIELDS = ("name", "company", "phone", "inn", "source", "lost_reason")


def _iso(v: Any) -> str | None:
    return v.isoformat() if v else None


# ------------------------------------------------------------------ mijoz
def contact_for(peer: Peer) -> Contact:
    """Mijoz kartasi (yo'q bo'lsa — Telegram ma'lumotidan yaratiladi). Faqat foydalanuvchi chatlari uchun."""
    c, created = Contact.objects.get_or_create(
        tg_user_id=peer.peer_id, defaults={"name": peer.title, "phone": peer.phone, "source": "Telegram"}
    )
    if created:
        c.stage_at = timezone.now()
        c.save(update_fields=["stage_at"])
    return c


def contacts_map(peer_ids: list[int]) -> dict[int, dict[str, Any]]:
    """Ro'yxat uchun: peer_id → {stage, tags} (bir so'rovda)."""
    out: dict[int, dict[str, Any]] = {}
    for c in Contact.objects.filter(tg_user_id__in=[p for p in peer_ids if p > 0]).prefetch_related("tags"):
        out[c.tg_user_id] = {
            "stage": c.stage,
            "tags": [{"id": t.pk, "name": t.name, "color": t.color} for t in c.tags.all()],
        }
    return out


def contact_json(c: Contact) -> dict[str, Any]:
    notes = list(Note.objects.filter(contact=c)[:NOTES_MAX])
    tasks = list(Task.objects.filter(contact=c)[:50])
    names = staff.user_names(
        {n.author_tg for n in notes} | {t.assignee_tg for t in tasks} | ({c.owner_tg} if c.owner_tg else set())
    )
    now = timezone.now()
    return {
        "id": c.pk,
        "tg_user_id": c.tg_user_id,
        "name": c.name,
        "company": c.company,
        "phone": c.phone,
        "inn": c.inn,
        "source": c.source,
        "stage": c.stage,
        "stage_label": Stage(c.stage).label,
        "stage_at": _iso(c.stage_at),
        "lost_reason": c.lost_reason,
        "amount": str(c.amount) if c.amount is not None else None,
        "owner": {"tg_id": c.owner_tg, "name": names.get(c.owner_tg, "")} if c.owner_tg else None,
        "tags": [{"id": t.pk, "name": t.name, "color": t.color} for t in c.tags.all()],
        "notes": [
            {
                "id": n.pk,
                "text": n.text,
                "author": names.get(n.author_tg, ""),
                "author_tg": n.author_tg,
                "at": _iso(n.created_at),
            }
            for n in notes
        ],
        "tasks": [
            {
                "id": t.pk,
                "title": t.title,
                "due_at": _iso(t.due_at),
                "done_at": _iso(t.done_at),
                "assignee": {"tg_id": t.assignee_tg, "name": names.get(t.assignee_tg, "")},
                "overdue": t.done_at is None and t.due_at < now,
            }
            for t in tasks
        ],
        "created_at": _iso(c.created_at),
    }


@transaction.atomic
def update_contact(c: Contact, body: dict[str, Any], actor: int) -> list[str]:
    """Maydonlar, bosqich, mas'ul, summa, teglar. Bosqich o'zgarsa — tarix izohi. Natija — xatolar ro'yxati (bo'sh — OK)."""
    errs: list[str] = []
    for f in FIELDS:
        if f in body:
            setattr(c, f, str(body[f] or "").strip()[: Contact._meta.get_field(f).max_length])  # type: ignore[union-attr]
    if c.inn and not (c.inn.isdigit() and len(c.inn) in (9, 14)):
        errs.append("STIR 9 xonali (yuridik) yoki 14 xonali (JShShIR) raqam bo'lsin.")
    if "amount" in body:
        raw = str(body["amount"] or "").replace(" ", "").replace(",", ".")
        try:
            c.amount = Decimal(raw) if raw else None
        except InvalidOperation:
            errs.append("Summa — raqam.")
    if "owner_tg" in body:
        c.owner_tg = int(body["owner_tg"]) if body["owner_tg"] else None
    if "stage" in body and body["stage"] != c.stage:
        new = str(body["stage"])
        if new not in Stage.values:
            errs.append("Noma'lum bosqich.")
        elif new == Stage.LOST and not (str(body.get("lost_reason") or c.lost_reason).strip()):
            errs.append("Yo'qotish sababini yozing — tahlil uchun kerak.")
        else:
            Note.objects.create(
                contact=c, author_tg=actor, text=f"Bosqich: {Stage(c.stage).label} → {Stage(new).label}"
            )
            c.stage, c.stage_at = new, timezone.now()
    if errs:
        transaction.set_rollback(True)
        return errs
    c.save()
    if "tags" in body and isinstance(body["tags"], list):
        tags = []
        for t in body["tags"][:20]:
            name = str(t.get("name") if isinstance(t, dict) else t).strip()[:40]
            if name:
                tags.append(Tag.objects.get_or_create(name=name)[0])
        c.tags.set(tags)
    return []


# ------------------------------------------------------------------ SLA va hisobot
def waiting_since(d: Dialog) -> str | None:
    """Mijoz yozgan, javob yo'q — qachondan beri (faqat foydalanuvchi chatlari)."""
    if d.peer.kind != PeerKind.USER or d.peer.is_self or d.last_out or not d.last_date:
        return None
    return _iso(d.last_date)


def _median(xs: list[float]) -> float | None:
    return round(statistics.median(xs), 1) if xs else None


def report(a: Account, days: int) -> dict[str, Any]:
    now = timezone.now()
    since = now - timedelta(days=days)
    sla = a.sla_minutes * 60
    dialogs = {
        d.peer_id: d
        for d in Dialog.objects.filter(account=a, peer__kind=PeerKind.USER, peer__is_self=False).select_related("peer")
    }
    msgs = Message.objects.filter(
        account=a, peer_id__in=list(dialogs), date__gte=since, deleted=False, action__isnull=True
    ).order_by("peer_id", "msg_id")
    per: dict[int, dict[str, Any]] = defaultdict(lambda: {"replies": 0, "times": [], "in_sla": 0, "answered": 0})
    incoming = 0
    pending: dict[int, Any] = {}  # peer → javob kutayotgan birinchi kiruvchi xabar sanasi
    for m in msgs.only("peer_id", "out", "date", "sent_by").iterator(chunk_size=2000):
        if not m.out:
            incoming += 1
            pending.setdefault(m.peer_id, m.date)
            continue
        who = m.sent_by or dialogs[m.peer_id].assignee_tg or 0
        per[who]["replies"] += 1
        start = pending.pop(m.peer_id, None)
        if start is not None:
            dt = (m.date - start).total_seconds()
            per[who]["times"].append(dt / 60)
            per[who]["answered"] += 1
            per[who]["in_sla"] += dt <= sla
    assigned: dict[int, int] = defaultdict(int)
    for d in dialogs.values():
        if d.assignee_tg:
            assigned[d.assignee_tg] += 1
    waiting = sorted(
        (
            (d, (now - d.last_date).total_seconds() / 60)
            for d in dialogs.values()
            if waiting_since(d) and d.last_date and d.last_date >= since
        ),
        key=lambda x: -x[1],
    )
    ids = set(per) | set(assigned)
    names = staff.user_names({i for i in ids if i})
    rows: list[dict[str, Any]] = []
    for tg in ids:
        p = per.get(tg, {"replies": 0, "times": [], "in_sla": 0, "answered": 0})
        rows.append(
            {
                "tg_id": tg or None,
                "name": names.get(tg, "") if tg else "Telegram ilovasidan",
                "assigned": assigned.get(tg, 0),
                "replies": p["replies"],
                "answered": p["answered"],
                "median_min": _median(p["times"]),
                "sla_pct": round(100 * p["in_sla"] / p["answered"]) if p["answered"] else None,
                "waiting": sum(1 for d, _ in waiting if d.assignee_tg == tg) if tg else 0,
            }
        )
    rows.sort(key=lambda r: (-int(r["replies"]), str(r["name"])))
    all_times = [t for p in per.values() for t in p["times"]]
    contacts = Contact.objects.filter(tg_user_id__in=[d.peer.peer_id for d in dialogs.values()])
    funnel = {s: 0 for s in Stage.values}
    for st in contacts.values_list("stage", flat=True):
        funnel[st] += 1
    overdue = Task.objects.filter(contact__in=contacts, done_at=None, due_at__lt=now).count()
    return {
        "days": days,
        "sla_minutes": a.sla_minutes,
        "incoming": incoming,
        "replies": sum(p["replies"] for p in per.values()),
        "median_min": _median(all_times),
        "sla_pct": round(100 * sum(p["in_sla"] for p in per.values()) / len(all_times)) if all_times else None,
        "waiting_now": sum(1 for _, mins in waiting if mins * 60 > sla),
        "waiting": [
            {
                "peer_id": d.peer.peer_id,
                "title": d.peer.title,
                "minutes": round(mins),
                "assignee": names.get(d.assignee_tg or 0, ""),
            }
            for d, mins in waiting[:10]
        ],
        "staff": rows,
        "funnel": [{"stage": s, "label": Stage(s).label, "count": funnel[s]} for s in Stage.values],
        "tasks_overdue": overdue,
    }


# ------------------------------------------------------------------ eslatmalar (Celery beat)
def remind_due() -> int:
    """Muddati kelgan vazifalar — bajaruvchiga Telegram (Jarvis bot) orqali bir marta eslatma."""
    from config.apps.core.telegram import send_message

    now = timezone.now()
    n = 0
    for t in Task.objects.filter(done_at=None, reminded_at=None, due_at__lte=now).select_related("contact")[:200]:
        who = t.contact.name or t.contact.company or "mijoz"
        if send_message(t.assignee_tg, f"⏰ Vazifa muddati keldi: {t.title}\nMijoz: {who}"):
            n += 1
        t.reminded_at = now
        t.save(update_fields=["reminded_at"])
    return n

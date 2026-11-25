"""Chatlar va xabarlarni o'qish (Django tomoni, faqat baza) + JSON shakllari. Telegram'ga murojaat — views → bus.

Papka qoidalari Telegram'dagidek: include ∪ (bayroqlar bo'yicha turlar) − exclude − (ovozsiz / o'qilgan / arxiv).
"""

from __future__ import annotations

from typing import Any

from django.db.models import Q, QuerySet
from django.utils import timezone

from config.apps.staff import services as staff

from . import crm
from .models import Dialog, Folder, Message, Peer, PeerKind

PAGE = 50


def _iso(v: Any) -> str | None:
    return v.isoformat() if v else None


def peer_json(p: Peer) -> dict[str, Any]:
    return {
        "peer_id": p.peer_id,
        "kind": p.kind,
        "title": p.title,
        "username": p.username,
        "phone": p.phone,
        "verified": p.verified,
        "scam": p.scam,
        "deleted": p.deleted,
        "is_self": p.is_self,
        "contact": p.contact,
        "members": p.members,
        "online": p.online,
        "last_seen": _iso(p.last_seen),
        "has_photo": p.photo_id is not None,
    }


def dialog_json(
    d: Dialog, names: dict[int, str] | None = None, crm_map: dict[int, dict[str, Any]] | None = None
) -> dict[str, Any]:
    """names — mas'ullar ismlari (ro'yxat uchun bir so'rovda); berilmasa — o'zi so'raydi."""
    now = timezone.now()
    who = d.assignee_tg
    if who and names is None:
        names = staff.user_names([who])
    assignee = {"tg_id": who, "name": (names or {}).get(who, "")} if who else None
    return peer_json(d.peer) | {
        "top_msg_id": d.top_msg_id,
        "last_date": _iso(d.last_date),
        "last_text": d.last_text,
        "last_out": d.last_out,
        "last_read": d.last_out and d.top_msg_id <= d.read_outbox_max,
        "unread": d.unread,
        "unread_mentions": d.unread_mentions,
        "read_inbox_max": d.read_inbox_max,
        "read_outbox_max": d.read_outbox_max,
        "pinned": d.pinned,
        "archived": d.archived,
        "muted": bool(d.muted_until and d.muted_until > now),
        "draft": d.draft,
        "assignee": assignee,
        "ai_off": d.ai_off,
        "waiting_since": crm.waiting_since(d),
        "crm": (crm_map if crm_map is not None else crm.contacts_map([d.peer.peer_id])).get(d.peer.peer_id),
    }


def message_json(m: Message, read_outbox_max: int) -> dict[str, Any]:
    return {
        "id": m.msg_id,
        "date": _iso(m.date),
        "out": m.out,
        "sender_id": m.sender_id,
        "text": m.text,
        "entities": m.entities,
        "media": m.media,
        "action": m.action,
        "reply_to": m.reply_to,
        "fwd": m.fwd,
        "grouped_id": str(m.grouped_id) if m.grouped_id else None,  # JS raqami 2^53 dan katta bo'lishi mumkin
        "edit_date": _iso(m.edit_date),
        "views": m.views,
        "post_author": m.post_author,
        "reactions": m.reactions,
        "deleted": m.deleted,
        "read": m.out and m.msg_id <= read_outbox_max,
        "sent_by": m.sent_by,
        "by_ai": m.by_ai,
    }


# ------------------------------------------------------------------ chatlar ro'yxati
def folder_q(f: Folder) -> tuple[Q, Q]:
    """(kiritish, chiqarish) shartlari."""
    inc = Q(peer__peer_id__in=f.include) if f.include else Q(pk__in=[])
    fl = f.flags or {}
    if fl.get("contacts"):
        inc |= Q(peer__kind=PeerKind.USER, peer__contact=True)
    if fl.get("non_contacts"):
        inc |= Q(peer__kind=PeerKind.USER, peer__contact=False, peer__is_self=False)
    if fl.get("groups"):
        inc |= Q(peer__kind__in=(PeerKind.GROUP, PeerKind.SUPERGROUP))
    if fl.get("broadcasts"):
        inc |= Q(peer__kind=PeerKind.CHANNEL)
    if fl.get("bots"):
        inc |= Q(peer__kind=PeerKind.BOT)
    exc = Q(peer__peer_id__in=f.exclude) if f.exclude else Q(pk__in=[])
    if fl.get("exclude_muted"):
        exc |= Q(muted_until__gt=timezone.now())
    if fl.get("exclude_read"):
        exc |= Q(unread=0) & ~Q(peer__peer_id__in=f.include or [0])
    if fl.get("exclude_archived"):
        exc |= Q(archived=True)
    return inc, exc


def dialogs_qs(
    account_id: int, *, archived: bool = False, folder: Folder | None = None, q: str = "", who: str = "", me: int = 0
) -> QuerySet[Dialog]:
    qs = Dialog.objects.filter(account_id=account_id).exclude(last_date=None).select_related("peer")
    if who == "mine":
        qs = qs.filter(assignee_tg=me)
    elif who == "waiting":  # mijoz yozgan, javob yo'q
        qs = qs.filter(last_out=False, peer__kind=PeerKind.USER, peer__is_self=False)
    elif who == "free":  # biriktirilmagan mijozlar (shaxsiy chatlar; guruh/kanal — operatorga biriktirilmaydi)
        qs = qs.filter(assignee_tg=None, peer__kind=PeerKind.USER, peer__is_self=False)
    if folder is not None:
        inc, exc = folder_q(folder)
        qs = qs.filter(inc).exclude(exc)
    else:
        qs = qs.filter(archived=archived)
    if q:
        qs = qs.filter(
            Q(peer__title__icontains=q) | Q(peer__username__icontains=q.lstrip("@")) | Q(peer__phone__icontains=q)
        )
    return qs


def dialogs_page(
    account_id: int,
    *,
    archived: bool,
    folder: Folder | None,
    q: str,
    cursor: str,
    limit: int = PAGE,
    who: str = "",
    me: int = 0,
) -> dict[str, Any]:
    """Birinchi sahifada qadalganlar tepada (papkada — papka tartibi bilan); keyin — oxirgi xabar sanasi bo'yicha."""
    qs = dialogs_qs(account_id, archived=archived, folder=folder, q=q, who=who, me=me)
    pinned: list[Dialog] = []
    if not q:
        if folder is not None:
            order = {pid: i for i, pid in enumerate(folder.pinned)}
            pinned = sorted(qs.filter(peer__peer_id__in=folder.pinned), key=lambda d: order.get(d.peer.peer_id, 0))
            rest = qs.exclude(peer__peer_id__in=folder.pinned)
        else:
            pinned = list(qs.filter(pinned=True).order_by("-last_date"))
            rest = qs.filter(pinned=False)
    else:
        rest = qs
    if cursor:
        rest = rest.filter(last_date__lt=cursor)
    rows = list(rest.order_by("-last_date", "-pk")[: limit + 1])
    more = len(rows) > limit
    rows = rows[:limit]
    out = ([] if cursor else pinned) + rows
    names = staff.user_names({d.assignee_tg for d in out if d.assignee_tg})
    cmap = crm.contacts_map([d.peer.peer_id for d in out])
    return {
        "dialogs": [dialog_json(d, names, cmap) | {"pinned": d in pinned} for d in out],
        "next": _iso(rows[-1].last_date) if more and rows else None,
    }


def folders_json(account_id: int) -> list[dict[str, Any]]:
    out = []
    for f in Folder.objects.filter(account_id=account_id):
        inc, exc = folder_q(f)
        unread = Dialog.objects.filter(account_id=account_id).filter(inc).exclude(exc).filter(unread__gt=0).count()
        out.append({"id": f.folder_id, "title": f.title, "emoticon": f.emoticon, "unread_chats": unread})
    archived = Dialog.objects.filter(account_id=account_id, archived=True).exclude(last_date=None)
    return [
        *out,
        {
            "id": "archive",
            "title": "Arxiv",
            "emoticon": "",
            "unread_chats": archived.filter(unread__gt=0).count(),
            "count": archived.count(),
        },
    ]


# ------------------------------------------------------------------ xabarlar
def messages_page(d: Dialog, before: int | None, limit: int = PAGE) -> dict[str, Any]:
    """Uzluksiz oraliqdan (history_min_id … top) sahifa: eng yangidan eskiga, javobda — o'sish tartibida."""
    qs = Message.objects.filter(peer_id=d.peer_id)
    if d.history_min_id is not None:
        qs = qs.filter(msg_id__gte=d.history_min_id)
    if before:
        qs = qs.filter(msg_id__lt=before)
    rows = list(qs.order_by("-msg_id")[:limit])
    rows.reverse()
    senders = {m.sender_id for m in rows if m.sender_id and not m.out and m.sender_id != d.peer.peer_id}
    fwd_ids = {m.fwd.get("from_id") for m in rows if m.fwd and m.fwd.get("from_id")}
    peers = Peer.objects.filter(account_id=d.account_id, peer_id__in=senders | fwd_ids)
    staff_ids = {m.sent_by for m in rows if m.sent_by}
    full_page = len(rows) == limit
    return {
        "messages": [message_json(m, d.read_outbox_max) for m in rows],
        "peers": {str(p.peer_id): {"title": p.title, "username": p.username, "kind": p.kind} for p in peers},
        "staff": {str(k): v for k, v in staff.user_names(staff_ids).items()} if staff_ids else {},
        "has_more": full_page or not d.history_complete,
        "complete": d.history_complete,
        "loaded": d.history_min_id is not None,
    }

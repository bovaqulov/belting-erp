"""Gateway'ning chat/xabar baza yozuvlari (sinxron ORM; gateway `sync_to_async` orqali chaqiradi).

Uzluksiz tarix qoidasi: Dialog.history_min_id — [min … top] oralig'i bazada to'liq. Yangi xabar tepaga qo'shiladi
(catch_up bo'shliqni to'ldiradi), eski sahifa — pastdan (fetch_history).
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from django.db import transaction
from django.utils import timezone

from ..models import Dialog, Folder, Message, Peer
from .convert import preview

PEER_FIELDS = (
    "kind",
    "title",
    "username",
    "phone",
    "photo_id",
    "verified",
    "scam",
    "deleted",
    "is_self",
    "contact",
    "members",
    "online",
    "last_seen",
)
MSG_FIELDS = (
    "date", "out", "sender_id", "text", "entities", "media", "action", "reply_to", "fwd", "grouped_id",
    "edit_date", "views", "post_author", "reactions",
)  # fmt: skip
# sent_by — faqat CRM orqali yuborishda beriladi; Telegram yangilanishi (jonli/qayta sinxron) uni o'chirmasin


def upsert_peers(account_id: int, rows: Iterable[dict[str, Any]]) -> dict[int, int]:
    """Peer'larni yozadi (faqat berilgan maydonlar yangilanadi). Natija: peer_id → Peer.pk."""
    rows = {r["peer_id"]: r for r in rows if r}
    if not rows:
        return {}
    have = {p.peer_id: p for p in Peer.objects.filter(account_id=account_id, peer_id__in=list(rows))}
    new, changed = [], []
    for pid, r in rows.items():
        p = have.get(pid)
        vals = {k: r[k] for k in PEER_FIELDS if k in r}
        if p is None:
            new.append(Peer(account_id=account_id, peer_id=pid, **vals))
            continue
        if any(getattr(p, k) != v for k, v in vals.items()):
            for k, v in vals.items():
                setattr(p, k, v)
            changed.append(p)
    if new:
        Peer.objects.bulk_create(new, ignore_conflicts=True)
    for p in changed:
        p.save()
    return dict(Peer.objects.filter(account_id=account_id, peer_id__in=list(rows)).values_list("peer_id", "pk"))


def peer_pk(account_id: int, pid: int) -> int | None:
    return Peer.objects.filter(account_id=account_id, peer_id=pid).values_list("pk", flat=True).first()


def ensure_peer(account_id: int, pid: int) -> int:
    p, _ = Peer.objects.get_or_create(account_id=account_id, peer_id=pid)
    return p.pk


def upsert_messages(account_id: int, rows: Iterable[dict[str, Any]], peers: dict[int, int]) -> int:
    """Xabarlarni yozadi (peer_id → Peer.pk xaritasi kerak). Natija — yozilganlar soni."""
    objs = []
    for r in rows:
        if not r:
            continue
        pk = peers.get(r["peer_id"]) or ensure_peer(account_id, r["peer_id"])
        peers[r["peer_id"]] = pk
        objs.append(
            Message(
                account_id=account_id,
                peer_id=pk,
                msg_id=r["msg_id"],
                sent_by=r.get("sent_by"),
                by_ai=bool(r.get("by_ai")),
                **{k: r.get(k) for k in MSG_FIELDS},
            )
        )
    with_actor = [o for o in objs if o.sent_by is not None or o.by_ai]
    if objs:
        for o in objs:  # JSON/matn maydonlari NULL bo'lmasin
            o.text = o.text or ""
            o.entities = o.entities or []
            o.post_author = o.post_author or ""
        Message.objects.bulk_create(
            objs,
            update_conflicts=True,
            unique_fields=["peer", "msg_id"],
            update_fields=[*MSG_FIELDS],
            batch_size=200,
        )
        for o in with_actor:  # Telegram'ning qayta yangilanishi muallif belgilarini o'chirmasin
            Message.objects.filter(peer_id=o.peer_id, msg_id=o.msg_id).update(sent_by=o.sent_by, by_ai=o.by_ai)
    return len(objs)


def upsert_dialog(
    account_id: int, peer_pk_: int, fields: dict[str, Any], last: dict[str, Any] | None, known_top: bool = True
) -> None:
    """known_top=False — yangi oxirgi xabar jonli kelmagan (shlyuz o'chiq paytida): oraliqda bo'shliq bo'lishi mumkin,
    uzluksiz tarix qayta boshlanadi (chat ochilganda eng yangi sahifa qayta olinadi)."""
    vals = {k: v for k, v in fields.items() if k != "peer_id"}
    if last is not None:
        vals |= {"last_date": last["date"], "last_text": preview(last), "last_out": bool(last.get("out"))}
    vals["synced_at"] = timezone.now()
    d = Dialog.objects.filter(peer_id=peer_pk_).first()
    if d is None:
        Dialog.objects.create(account_id=account_id, peer_id=peer_pk_, **vals)
        return
    if d.history_min_id is not None and vals.get("top_msg_id", d.top_msg_id) != d.top_msg_id and not known_top:
        vals |= {"history_min_id": None, "history_complete": False}
    for k, v in vals.items():
        setattr(d, k, v)
    d.save()


@transaction.atomic
def save_dialogs_page(
    account_id: int, peers: list[dict[str, Any]], dialogs: list[dict[str, Any]], msgs: list[dict[str, Any]]
) -> int:
    """GetDialogs sahifasi: peer'lar, har dialogning oxirgi xabari, dialog qatorlari."""
    pmap = upsert_peers(account_id, peers)
    for d in dialogs:
        pmap.setdefault(d["peer_id"], ensure_peer(account_id, d["peer_id"]))
    by_top = {(m["peer_id"], m["msg_id"]): m for m in msgs if m}
    tops = [d["top_msg_id"] for d in dialogs]
    known = set(
        Message.objects.filter(account_id=account_id, peer_id__in=list(pmap.values()), msg_id__in=tops).values_list(
            "peer_id", "msg_id"
        )
    )
    upsert_messages(account_id, by_top.values(), pmap)
    for d in dialogs:
        pk = pmap[d["peer_id"]]
        upsert_dialog(
            account_id, pk, d, by_top.get((d["peer_id"], d["top_msg_id"])), known_top=(pk, d["top_msg_id"]) in known
        )
    return len(dialogs)


@transaction.atomic
def save_history(
    account_id: int, pid: int, peers: list[dict[str, Any]], msgs: list[dict[str, Any]], limit: int, offset_id: int
) -> dict[str, Any]:
    """GetHistory sahifasi. offset_id=0 — eng yangi sahifa; aks holda offset_id = joriy history_min_id (pastga davom)."""
    pmap = upsert_peers(account_id, peers)
    pk = pmap.get(pid) or ensure_peer(account_id, pid)
    pmap[pid] = pk
    rows = [m for m in msgs if m and m["peer_id"] == pid]
    d = Dialog.objects.select_for_update().filter(peer_id=pk).first() or Dialog.objects.create(
        account_id=account_id, peer_id=pk
    )
    ids = {m["msg_id"] for m in rows}
    old_min, old_top = d.history_min_id, d.top_msg_id
    upsert_messages(account_id, rows, pmap)
    lo = min(ids) if ids else None
    if offset_id == 0:
        # eng yangi sahifa eski oraliqni qamrasa (eski top shu sahifada) — ular birlashadi
        joined = old_min is not None and (old_top in ids or not old_top)
        d.history_min_id = (
            min(lo, old_min) if joined and lo is not None and old_min is not None else (lo if lo is not None else 0)
        )
        if ids and max(ids) >= d.top_msg_id:
            top = max(rows, key=lambda m: m["msg_id"])
            d.top_msg_id = top["msg_id"]
            d.last_date, d.last_text, d.last_out = top["date"], preview(top), top["out"]
        d.history_complete = len(rows) < limit or (joined and d.history_complete)
    elif old_min is not None and offset_id == old_min:
        if lo is not None:
            d.history_min_id = min(lo, old_min)
        d.history_complete = len(rows) < limit
    d.save()
    return {"loaded": len(rows), "complete": d.history_complete, "min_id": d.history_min_id}


def dialog_state(account_id: int, pid: int) -> dict[str, Any]:
    d = (
        Dialog.objects.filter(account_id=account_id, peer__peer_id=pid)
        .values("history_min_id", "history_complete")
        .first()
    )
    return (
        {"min_id": d["history_min_id"], "complete": d["history_complete"]} if d else {"min_id": None, "complete": False}
    )


# ------------------------------------------------------------------ jonli yangilanishlar
@transaction.atomic
def on_new_message(account_id: int, m: dict[str, Any], peers: list[dict[str, Any]]) -> dict[str, Any]:
    pmap = upsert_peers(account_id, peers)
    pk = pmap.get(m["peer_id"]) or ensure_peer(account_id, m["peer_id"])
    pmap[m["peer_id"]] = pk
    upsert_messages(account_id, [m], pmap)
    d = Dialog.objects.select_for_update().filter(peer_id=pk).first()
    if d is None:
        d = Dialog(account_id=account_id, peer_id=pk)
    if m["msg_id"] >= d.top_msg_id:
        contiguous = d.history_min_id is not None and (
            d.top_msg_id == 0 or Message.objects.filter(peer_id=pk, msg_id=d.top_msg_id).exists()
        )
        d.top_msg_id = m["msg_id"]
        d.last_date, d.last_text, d.last_out = m["date"], preview(m), m["out"]
        if not contiguous:
            d.history_min_id, d.history_complete = None, False
    if not m["out"] and m["msg_id"] > d.read_inbox_max:
        d.unread += 1
    if m["out"]:
        d.read_inbox_max = max(d.read_inbox_max, m["msg_id"])  # o'zimiz yozdik — oldingilari o'qilgan hisoblanadi
        d.unread = 0
    if d.archived and not m["out"] and not d.muted_until:
        d.archived = False  # Telegram: ovozsiz bo'lmagan arxivdagi chat yangi xabarda arxivdan chiqadi
    d.save()
    return {"peer_pk": pk, "unread": d.unread}


def on_edit(account_id: int, m: dict[str, Any], peers: list[dict[str, Any]]) -> bool:
    pmap = upsert_peers(account_id, peers)
    pk = pmap.get(m["peer_id"]) or peer_pk(account_id, m["peer_id"])
    if pk is None:
        return False
    pmap[m["peer_id"]] = pk
    upsert_messages(account_id, [m], pmap)
    Dialog.objects.filter(peer_id=pk, top_msg_id=m["msg_id"]).update(last_text=preview(m))
    return True


def on_delete(account_id: int, ids: list[int], channel_pid: int | None) -> list[int]:
    """O'chirilgan xabarlar belgilanadi (CRM tarixi uchun o'chirilmaydi). Natija — ta'sirlangan peer_id'lar."""
    qs = Message.objects.filter(account_id=account_id, msg_id__in=ids)
    qs = (
        qs.filter(peer__peer_id=channel_pid)
        if channel_pid is not None
        else qs.exclude(peer__kind__in=("channel", "supergroup"))
    )
    pids = list(qs.values_list("peer__peer_id", flat=True).distinct())
    qs.update(deleted=True)
    return pids


def on_read(account_id: int, pid: int, max_id: int, outbox: bool, still_unread: int | None) -> bool:
    d = Dialog.objects.filter(account_id=account_id, peer__peer_id=pid).first()
    if d is None:
        return False
    if outbox:
        d.read_outbox_max = max(d.read_outbox_max, max_id)
    else:
        d.read_inbox_max = max(d.read_inbox_max, max_id)
        if still_unread is not None:
            d.unread = still_unread
        else:
            d.unread = Message.objects.filter(
                peer_id=d.peer_id, out=False, msg_id__gt=d.read_inbox_max, deleted=False
            ).count()
    d.save()
    return True


def on_status(account_id: int, pid: int, online: bool, last_seen: Any) -> None:
    Peer.objects.filter(account_id=account_id, peer_id=pid).update(
        online=online, **({"last_seen": last_seen} if last_seen else {})
    )


def set_dialog_flags(account_id: int, pid: int, **flags: Any) -> bool:
    return bool(Dialog.objects.filter(account_id=account_id, peer__peer_id=pid).update(**flags))


@transaction.atomic
def replace_folders(account_id: int, rows: list[dict[str, Any]]) -> int:
    Folder.objects.filter(account_id=account_id).exclude(folder_id__in=[r["folder_id"] for r in rows]).delete()
    for r in rows:
        Folder.objects.update_or_create(
            account_id=account_id, folder_id=r["folder_id"], defaults={k: v for k, v in r.items() if k != "folder_id"}
        )
    return len(rows)


def mark_read_local(account_id: int, pid: int, max_id: int) -> None:
    Dialog.objects.filter(account_id=account_id, peer__peer_id=pid, read_inbox_max__lt=max_id).update(
        read_inbox_max=max_id
    )
    d = Dialog.objects.filter(account_id=account_id, peer__peer_id=pid).first()
    if d:
        d.unread = Message.objects.filter(
            peer_id=d.peer_id, out=False, msg_id__gt=d.read_inbox_max, deleted=False
        ).count()
        d.save(update_fields=["unread"])


# ------------------------------------------------------------------ 5-bosqich
def mark_deleted(account_id: int, pid: int, ids: list[int]) -> int:
    return Message.objects.filter(account_id=account_id, peer__peer_id=pid, msg_id__in=ids).update(deleted=True)


@transaction.atomic
def save_loose(account_id: int, peers: list[dict[str, Any]], msgs: list[dict[str, Any]]) -> int:
    """Qidiruv / qadalgan xabar natijalari — uzluksiz tarix chegarasiga tegmasdan (faqat xabar va peer yoziladi)."""
    pmap = upsert_peers(account_id, peers)
    return upsert_messages(account_id, msgs, pmap)


def set_reactions(account_id: int, pid: int, msg_id: int, reactions: Any) -> bool:
    return bool(
        Message.objects.filter(account_id=account_id, peer__peer_id=pid, msg_id=msg_id).update(reactions=reactions)
    )


def peer_photo_id(account_id: int, pid: int) -> int | None:
    return Peer.objects.filter(account_id=account_id, peer_id=pid).values_list("photo_id", flat=True).first()

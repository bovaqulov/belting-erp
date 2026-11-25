"""Gateway'ning baza amallari (sinxron ORM). Gateway ularni `sync_to_async` orqali chaqiradi."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from django.db import transaction
from django.utils import timezone

from ..crypto import decrypt, encrypt
from ..models import RUNNABLE, Account, AccountEvent, AccountSession, SessionEntity, Status
from ..serialize import public

if TYPE_CHECKING:
    from .session import Snapshot


def runnable_ids() -> list[int]:
    return list(Account.objects.filter(status__in=RUNNABLE).values_list("id", flat=True))


def account_exists(account_id: int) -> bool:
    return Account.objects.filter(pk=account_id).exists()


def load_snapshot(account_id: int) -> Snapshot | None:
    s = AccountSession.objects.filter(account_id=account_id).first()
    if s is None:
        return None
    key = decrypt(s.auth_key) if s.auth_key else None
    ents = SessionEntity.objects.filter(account_id=account_id).values_list(
        "peer_id", "access_hash", "username", "phone", "name"
    )
    return {
        "dc_id": s.dc_id,
        "server_address": s.server_address,
        "port": s.port,
        "auth_key": key,
        "takeout_id": s.takeout_id,
        "states": s.states,
        "entities": list(ents),
    }


@transaction.atomic
def save_snapshot(account_id: int, snap: Snapshot) -> None:
    if not Account.objects.filter(pk=account_id).exists():
        return  # akkaunt o'chirilgan — saqlanmaydi
    key = snap.get("auth_key")
    AccountSession.objects.update_or_create(
        account_id=account_id,
        defaults={
            "dc_id": snap.get("dc_id") or 0,
            "server_address": snap.get("server_address") or "",
            "port": snap.get("port") or 0,
            "auth_key": encrypt(key) if key else "",
            "takeout_id": snap.get("takeout_id"),
            "states": snap.get("states") or {},
        },
    )
    rows = [
        SessionEntity(
            account_id=account_id, peer_id=p, access_hash=h, username=u or "", phone=ph or "", name=(n or "")[:255]
        )
        for p, h, u, ph, n in snap.get("entities") or ()
    ]
    if rows:
        SessionEntity.objects.bulk_create(
            rows,
            update_conflicts=True,
            unique_fields=["account", "peer_id"],
            update_fields=["access_hash", "username", "phone", "name"],
            batch_size=500,
        )


def clear_session(account_id: int) -> None:
    AccountSession.objects.filter(account_id=account_id).delete()
    SessionEntity.objects.filter(account_id=account_id).delete()


def update_account(account_id: int, **fields: Any) -> dict[str, Any] | None:
    """Maydonlarni yangilaydi; status o'zgarsa va flood bo'lmasa — flood_until tozalanadi. Natija — public dict."""
    a = Account.objects.filter(pk=account_id).first()
    if a is None:
        return None
    if "status" in fields and fields["status"] != Status.FLOOD and "flood_until" not in fields:
        fields["flood_until"] = None
    for k, v in fields.items():
        setattr(a, k, v)
    a.save()
    return public(a)


def tg_user_taken(account_id: int, tg_user_id: int) -> bool:
    return Account.objects.filter(tg_user_id=tg_user_id).exclude(pk=account_id).exists()


def event(account_id: int, kind: str, detail: str = "", actor: int | None = None) -> None:
    if Account.objects.filter(pk=account_id).exists():
        AccountEvent.objects.create(account_id=account_id, kind=kind, detail=detail[:500], actor_tg=actor)


def now() -> Any:
    return timezone.now()

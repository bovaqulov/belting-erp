"""API ko'rinishi (brauzerga) — sessiya ma'lumotisiz."""

from __future__ import annotations

from typing import Any

from .models import Account, Status


def public(a: Account) -> dict[str, Any]:
    """Brauzerga ko'rinadigan akkaunt (sessiya ma'lumoti yo'q)."""
    return {
        "id": a.pk,
        "kind": a.kind,
        "title": a.title,
        "owner_tg": a.owner_tg,
        "phone": a.phone,
        "tg_user_id": a.tg_user_id,
        "username": a.username,
        "name": a.name,
        "premium": a.premium,
        "status": a.status,
        "status_label": Status(a.status).label,
        "status_detail": a.status_detail,
        "flood_until": a.flood_until.isoformat() if a.flood_until else None,
        "limits": a.limits,
        "sla_minutes": a.sla_minutes,
        "connected_at": a.connected_at.isoformat() if a.connected_at else None,
        "created_at": a.created_at.isoformat(),
    }

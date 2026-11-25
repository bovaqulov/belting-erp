"""Audit API (Jarvis server.py): /app/api/audit?dept= — oxirgi 200 yozuv; /app/api/voice/{id} — ovozli xabar fayli.
Ko'rish — panelni ko'ra oladiganlar (ega/admin, Rahbariyat, IT)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

from django.conf import settings
from django.http import HttpRequest, HttpResponse

from config.apps.core.http import ApiError, api, ok
from config.apps.staff import services as staff

from .models import Event
from .services import recent

if TYPE_CHECKING:
    from config.apps.staff.models import User

DENY = "Ruxsat yo'q: auditni rahbariyat va admin ko'radi"


def _viewer(u: User) -> bool:
    return u.can_view()


def voices_dir() -> Path:
    return Path(getattr(settings, "VOICES_DIR", settings.BASE_DIR / "data" / "voices"))


@api(check=_viewer, deny=DENY)
def audit(request: HttpRequest, user: User) -> HttpResponse:
    rows = recent(200, request.GET.get("dept") or None)
    names = staff.user_names({r.tg_id for r in rows if r.tg_id})
    return ok(
        {
            "audit": [
                {
                    "id": r.pk,
                    "ts": r.ts.isoformat(),
                    "tg_id": r.tg_id,
                    "dept": r.dept or None,
                    "chat_id": r.chat_id,
                    "event": r.event,
                    "detail": r.detail or None,
                    "cost": r.cost,
                    "name": names.get(r.tg_id) if r.tg_id else None,
                }
                for r in rows
            ]
        }
    )


@api(check=_viewer, deny=DENY)
def voice(request: HttpRequest, user: User, pk: int) -> HttpResponse:
    """Auditdagi ovozli xabarni tinglash. Fayl — VOICES_DIR/<file>.m4a|.ogg (yo'l `detail.file` dan, tashqariga chiqmaydi)."""
    ev = Event.objects.filter(pk=pk, event="voice").first()
    if ev is None:
        raise ApiError(404, "Topilmadi")
    try:
        rel = str((json.loads(ev.detail or "{}") or {}).get("file") or "")
    except ValueError:
        rel = ""
    if not rel or ".." in rel.replace("\\", "/").split("/") or rel.startswith("/"):
        raise ApiError(400, "Noto'g'ri yo'l")
    base = voices_dir().resolve()
    for ext, mt in ((".m4a", "audio/mp4"), (".ogg", "audio/ogg")):
        p = (base / f"{rel}{ext}").resolve()
        if p.is_relative_to(base) and p.is_file():
            resp = HttpResponse(p.read_bytes(), content_type=mt)
            resp["Cache-Control"] = "private, max-age=3600"
            return resp
    raise ApiError(404, "Fayl yo'q")

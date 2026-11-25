"""Tizim holati (Jarvis `web/system_api.py`): web jarayoni, Celery worker (log yangiligi bo'yicha), baza, ochiq manzil
(tunnel) va loglar — faqat ega/admin. Log matni `redact` orqali (tokenlar yashiriladi); fayl nomi qat'iy tekshiriladi
(LOG_DIR'dan tashqariga chiqib bo'lmaydi)."""

from __future__ import annotations

import logging
import os
import re
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

import httpx
from django.conf import settings
from django.db import connection
from django.db.migrations.recorder import MigrationRecorder
from django.http import HttpRequest, HttpResponse

from config.apps.core.http import ApiError, api, ok
from config.apps.core.redact import redact

if TYPE_CHECKING:
    from config.apps.staff.models import User

logger = logging.getLogger(__name__)
_STARTED = time.time()  # shu web jarayoni ishga tushgan vaqt (modul yuklanishi)
_LOG_NAME = re.compile(r"^[a-z0-9_-]+\.log$")
WORKER_STALE_S = 600  # ping javob bermasa — worker logi shuncha vaqt yozilmasa — worker to'xtagan bo'lishi mumkin
WORKER_LOGS = ("celery-worker.log", "celery_worker.log", "worker.log")
DENY = "Ruxsat yo'q: tizim holatini faqat ega va admin ko'radi"


def log_dir() -> Path:
    return Path(getattr(settings, "LOG_DIR", settings.BASE_DIR / "data" / "logs"))


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, UTC).isoformat(timespec="seconds")


def _logs() -> list[dict[str, Any]]:
    """Joriy log fayllari (aylantirilgan eski nusxalar — `x.log.2026-11-08` — kirmaydi)."""
    d = log_dir()
    if not d.is_dir():
        return []
    now = time.time()
    out = []
    for p in sorted(d.glob("*.log")):
        st = p.stat()
        out.append({"name": p.name, "size": st.st_size, "mtime": _iso(st.st_mtime), "age_s": int(now - st.st_mtime)})
    return out


def _db() -> dict[str, Any]:
    try:  # ulanish — asosiy belgi; versiya/hajm qo'shimcha
        with connection.cursor() as c:
            c.execute("SELECT 1")
    except Exception as exc:
        return {"ok": False, "error": redact(str(exc))[:300]}
    pg = connection.vendor == "postgresql"
    info: dict[str, Any] = {"ok": True, "engine": "PostgreSQL" if pg else "SQLite", "schema": None}
    try:
        info["schema"] = MigrationRecorder.Migration.objects.count()  # qo'llangan migratsiyalar soni
        if pg:
            with connection.cursor() as c:
                c.execute("SELECT pg_database_size(current_database())")
                row = c.fetchone()
                if row:
                    info["size_mb"] = round(row[0] / 1e6, 1)
        else:
            name = Path(str(connection.settings_dict["NAME"]))
            if name.is_file():
                info["size_mb"] = round(name.stat().st_size / 1e6, 1)
    except Exception:  # qo'shimcha ma'lumot — yo'qligi «baza ishlamayapti» degani emas
        logger.debug("baza hajmi/versiyasi olinmadi", exc_info=True)
    return info


def _tunnel(url: str) -> dict[str, Any]:
    """Ochiq manzil haqiqatan javob beradimi (trycloudflare nomi o'chsa — bot tugmalari ishlamaydi)."""
    if not url:
        return {"ok": False, "error": "JARVIS_PUBLIC_URL o'rnatilmagan"}
    try:
        r = httpx.get(f"{url}/app/", timeout=6, follow_redirects=True)
        return {"ok": r.status_code < 500, "status": r.status_code}
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {redact(str(exc))[:200]}"}


def _ping() -> int | None:
    """Celery worker'lar soni (control.ping, 1 s). Broker yo'q / eager rejim — None (log yoshiga qaraladi)."""
    if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
        return None
    try:
        from config.celery import app

        return len(app.control.ping(timeout=1.0) or [])
    except Exception:
        logger.debug("celery ping bo'lmadi", exc_info=True)
        return None


def _admin(u: User) -> bool:
    return u.is_panel


@api(check=_admin, deny=DENY)
def status(request: HttpRequest, user: User) -> HttpResponse:
    url = (getattr(settings, "JARVIS_PUBLIC_URL", "") or "").rstrip("/")
    logs = _logs()
    worker = next((x for x in logs if x["name"] in WORKER_LOGS), None)
    now = time.time()
    return ok(
        {
            "now": _iso(now),
            "web": {"pid": os.getpid(), "started": _iso(_STARTED), "uptime_s": int(now - _STARTED)},
            "worker": {
                "log_age_s": worker["age_s"] if worker else None,
                "replies": (n := _ping()),
                "ok": bool(n) or bool(worker and worker["age_s"] < WORKER_STALE_S),
            },
            "db": _db(),
            "public": {"url": url, **_tunnel(url)},
            "logs": logs,
        }
    )


@api(check=_admin, deny=DENY)
def log(request: HttpRequest, user: User) -> HttpResponse:
    name = request.GET.get("name", "")
    if not _LOG_NAME.match(name):
        raise ApiError(400, "Log nomi noto'g'ri")
    base = log_dir().resolve()
    p = (base / name).resolve()
    if not p.is_relative_to(base) or not p.is_file():
        raise ApiError(404, "Log topilmadi")
    try:
        n = max(10, min(int(request.GET.get("lines", "200")), 2000))
    except ValueError:
        n = 200
    with p.open("rb") as f:  # oxiridan o'qish — katta faylni butunlay xotiraga olmaslik
        f.seek(0, 2)
        size = f.tell()
        f.seek(max(0, size - n * 400))
        tail = f.read().decode("utf-8", errors="replace").splitlines()[-n:]
    return ok({"name": name, "size": size, "lines": [redact(x) for x in tail]})

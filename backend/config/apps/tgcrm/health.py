"""8-bosqich: tizim sog'lig'i — "Tizim holati" paneli va `manage.py tgcrm_doctor` uchun bir xil tekshiruvlar.

Daraja: ok — joyida; warn — ishlaydi, lekin e'tibor; error — ishlamaydi / xavfli.
Eng muhim xavf: dev va prod bir xil TGCRM_SESSION_KEY bilan — prod bazasi dev'ga nusxalansa, bitta sessiya ikki joyda
ishlaydi va Telegram uni o'chiradi (AUTH_KEY_DUPLICATED). Kalitlar har muhitda boshqa bo'lsa, nusxa sessiyasi ochilmaydi.
"""

from __future__ import annotations

import os
import shutil
import time
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet
from django.conf import settings
from django.db.models import Count

from . import bus, files
from .crypto import decrypt
from .models import RUNNABLE, Account, AccountSession, SessionEntity, Status

BAD = (Status.LOGGED_OUT, Status.BANNED, Status.FROZEN, Status.LIMITED, Status.ERROR)


def _check(name: str, level: str, detail: str) -> dict[str, str]:
    return {"name": name, "level": level, "detail": detail}


def media_bytes() -> int:
    total = 0
    root = files.root()
    if not root.is_dir():
        return 0
    for dirpath, _dirs, names in os.walk(root):
        for n in names:
            try:
                total += (Path(dirpath) / n).stat().st_size
            except OSError:
                continue
    return total


def checks() -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    if settings.TGCRM_API_ID and settings.TGCRM_API_HASH:
        out.append(_check("Telegram API", "ok", f"api_id {settings.TGCRM_API_ID}"))
    else:
        out.append(_check("Telegram API", "error", "TGCRM_API_ID / TGCRM_API_HASH yo'q (.env.local)."))
    key = settings.TGCRM_SESSION_KEY
    if not key:
        out.append(
            _check(
                "Sessiya kaliti",
                "warn",
                "TGCRM_SESSION_KEY bo'sh — SECRET_KEY'dan hosil qilinmoqda. Prod'da alohida kalit qo'ying.",
            )
        )
    else:
        try:
            Fernet(key.encode())
            out.append(_check("Sessiya kaliti", "ok", "alohida kalit (har muhitda boshqa bo'lsin)"))
        except ValueError:
            out.append(_check("Sessiya kaliti", "error", "TGCRM_SESSION_KEY noto'g'ri Fernet kaliti."))
    sessions = list(AccountSession.objects.exclude(auth_key="").values_list("account_id", "auth_key"))
    broken = [aid for aid, tok in sessions if decrypt(tok) is None]
    if broken:
        out.append(
            _check(
                "Sessiyalar",
                "error",
                f"{len(broken)} ta sessiya joriy kalit bilan ochilmaydi (akkaunt: {', '.join(map(str, broken))}). Kalit almashgan yoki baza "
                "boshqa muhitdan nusxalangan — ular qayta ulanadi (bu xavfsiz: nusxa sessiyasi ishlamaydi).",
            )
        )
    else:
        out.append(_check("Sessiyalar", "ok", f"{len(sessions)} ta sessiya ochiladi"))
    redis_ok = bus.redis_ok()
    out.append(
        _check(
            "Redis",
            "ok" if redis_ok else "error",
            "javob beryapti" if redis_ok else "ulanib bo'lmadi — shlyuz va real vaqt ishlamaydi",
        )
    )
    info = bus.gateway_info() if redis_ok else None
    if bus.alive():
        up = int(time.time() - float(info["started_at"])) if info and info.get("started_at") else None
        out.append(
            _check(
                "Shlyuz",
                "ok",
                f"ishlayapti{f', {up // 3600} soat {up % 3600 // 60} daq' if up is not None else ''}{f' ({info.get("host")})' if info else ''}",
            )
        )
    elif Account.objects.filter(status__in=RUNNABLE).exists():
        out.append(
            _check("Shlyuz", "error", "ishlamayapti — `manage.py tg_gateway` (prod: servis) ni ishga tushiring.")
        )
    else:
        out.append(_check("Shlyuz", "warn", "ishlamayapti (ulangan akkaunt yo'q)"))
    out.append(
        _check(
            "ffmpeg",
            "ok" if shutil.which("ffmpeg") else "warn",
            "bor" if shutil.which("ffmpeg") else "yo'q — ovozli xabar yuborilmaydi",
        )
    )
    used, cap = media_bytes(), settings.TGCRM_MEDIA_MAX_MB * 1024 * 1024
    lvl = "warn" if used > cap * 0.9 else "ok"
    out.append(
        _check(
            "Media kesh",
            lvl,
            f"{used // 1024 // 1024} / {settings.TGCRM_MEDIA_MAX_MB} MB (eskilari avtomatik o'chiriladi)",
        )
    )
    out.extend(
        _check(
            f"Akkaunt «{a}»",
            "error" if a.status in (Status.BANNED, Status.LOGGED_OUT) else "warn",
            f"{Status(a.status).label}. {a.status_detail}".strip(),
        )
        for a in Account.objects.filter(status__in=BAD)
    )
    return out


def accounts(qs: Any) -> list[dict[str, Any]]:
    info = bus.gateway_info() or {}
    live = info.get("accounts") or {}
    saved = dict(AccountSession.objects.values_list("account_id", "updated_at"))
    ents = dict(SessionEntity.objects.values("account_id").annotate(n=Count("id")).values_list("account_id", "n"))

    def row(a: Account) -> dict[str, Any]:
        g = live.get(str(a.pk)) or {}
        last = g.get("last_update")
        return {
            "id": a.pk,
            "title": str(a),
            "kind": a.kind,
            "status": a.status,
            "status_label": Status(a.status).label,
            "status_detail": a.status_detail,
            "flood_until": a.flood_until.isoformat() if a.flood_until else None,
            "connected": bool(g.get("authorized")),
            "last_update_ago": int(time.time() - float(last)) if last else None,
            "session_saved": saved[a.pk].isoformat() if a.pk in saved else None,
            "entities": ents.get(a.pk, 0),
            "alert_status": a.alert_status,
            "alert_at": a.alert_at.isoformat() if a.alert_at else None,
        }

    return [row(a) for a in qs]

"""Sessiya kalitini (auth_key) shifrlash — Fernet. Kalit: TGCRM_SESSION_KEY; bo'sh bo'lsa SECRET_KEY'dan hosil (dev).

auth_key — akkauntga to'liq kirish huquqi: bazada hech qachon ochiq saqlanmaydi, API javobida qaytmaydi.
"""

from __future__ import annotations

import base64
import hashlib
from functools import cache

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


@cache
def _fernet(key: str, secret: str) -> Fernet:
    if key:
        return Fernet(key.encode())
    raw = hashlib.sha256(f"tgcrm-session:{secret}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(raw))


def fernet() -> Fernet:
    return _fernet(settings.TGCRM_SESSION_KEY, settings.SECRET_KEY)


def encrypt(data: bytes) -> str:
    return fernet().encrypt(data).decode()


def decrypt(token: str) -> bytes | None:
    """Kalit almashgan / buzilgan bo'lsa — None (sessiya qayta ulanishni talab qiladi)."""
    try:
        return fernet().decrypt(token.encode())
    except (InvalidToken, ValueError):
        return None

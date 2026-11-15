"""Brauzerda kirishni bot orqali tasdiqlash: foydalanuvchi /start login_<token> bosadi → token shu Telegram ID ga bog'lanadi.

Notanish odam — pending (tasdiq kutmoqda) bo'lib yoziladi; admin rolini o'zgartirmaguncha kira olmaydi."""

from __future__ import annotations

from typing import Any

from django.utils import timezone

from config.apps.core.models import LoginToken
from config.apps.staff.services import Role, User, apply_pending_heads

ACTIVE = (Role.OWNER, Role.ADMIN, Role.EMPLOYEE)


def confirm_login(token: str, tg: dict[str, Any]) -> str:
    """Telegram'dagi javob matni."""
    t = LoginToken.objects.filter(token=token).first()
    if t is None or t.expired or t.used_at:
        return "Kirish havolasi eskirgan. Saytda «Telegram orqali kirish» ni qayta bosing."
    name = " ".join(x for x in (tg.get("first_name"), tg.get("last_name")) if x) or str(tg["id"])
    user, created = User.objects.get_or_create(
        tg_id=int(tg["id"]), defaults={"name": name, "username": tg.get("username") or "", "role": Role.PENDING}
    )
    if user.role not in ACTIVE:
        return (
            "So'rovingiz qabul qilindi — administrator tasdiqlagach kira olasiz."
            if created or user.role == Role.PENDING
            else "Kirish yopiq. Administratorga murojaat qiling."
        )
    apply_pending_heads(user)
    t.user, t.confirmed_at = user, timezone.now()
    t.save(update_fields=["user", "confirmed_at"])
    return f"✅ Kirish tasdiqlandi, {user.name}. Brauzerga qayting."

"""LentaCUD ruxsati (Jarvis `lenta_api.can_use`): ega/admin yoki «lenta» vositasi bor bo'lim a'zosi — Jarvis
departments.yaml'dagidek: Rahbariyat, Sotuv B2B, Marketplace sotuvi."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from config.apps.staff.models import User

LENTA_DEPTS = ("rahbariyat", "sotuv_b2b", "sotuv_marketplace")


def can_use(u: User | None) -> bool:
    if u is None:
        return False
    if u.role in ("owner", "admin"):
        return True
    return u.role == "employee" and any(d in LENTA_DEPTS for d in u.dept_keys())


DEPT_NAMES = {"uz": "Rahbariyat, Sotuv B2B, Marketplace sotuvi", "ru": "Руководство, Продажи B2B, Продажи маркетплейс"}


def deny_text(lang: str = "uz") -> str:
    if lang == "ru":
        return f"Извините, чертёж ленты доступен только: {DEPT_NAMES['ru']}."
    return f"Kechirasiz, lenta chizmasi faqat quyidagilar uchun: {DEPT_NAMES['uz']}."

"""CRM huquqlari (egasi qarori, 2026-11-14): sotuv bo'limi rahbari — hamma bitim, mijoz, lid va Telegram chatlarini
ko'radi, lidlarni taqsimlaydi, mas'ulni o'zgartiradi; sotuvchi — faqat o'ziga biriktirilganlarni va o'z mijozlarini.
Boshqaning yozuvi — 404 (mavjudligi ham ko'rinmaydi)."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from django.db.models import Q, QuerySet

from config.apps.erp.catalog import services as catalog
from config.apps.staff import services as staff
from config.apps.staff.services import User

# CRM — B2B savdo bo'limi (bo'lim kaliti); "sotuv" — umumiy nom (testlar, kelajak)
SALES_DEPTS = ("sotuv_b2b", "sotuv")


def is_sales_head(u: User) -> bool:
    """Sotuv bo'limi rahbari: owner/admin, Rahbariyat (sees_all), «crm.head» ruxsatli rol (Sotuv rahbari) yoki
    Sotuv — B2B bo'limida xodimlari bor rahbar."""
    return u.can("crm.head") or (bool(set(u.dept_keys()) & set(SALES_DEPTS)) and staff.has_reports(u))


@dataclass(frozen=True)
class Me:
    tg_id: int
    name: str
    is_head: bool
    disc_max: Decimal = Decimal(100)  # narx siyosati: shu foydalanuvchi bera oladigan eng katta chegirma, %

    @classmethod
    def of(cls, u: User) -> Me:
        head = is_sales_head(u)
        return cls(u.tg_id, u.name, head, catalog.max_discount(u.is_panel or u.in_lead_dept(), head))

    def deals(self, qs: QuerySet) -> QuerySet:
        """Bitimlar: rahbar — hammasi; sotuvchi — o'zi mas'ul bo'lganlari."""
        return self.own(qs)

    def sees(self, owner: int | None) -> bool:
        return self.is_head or owner == self.tg_id

    def own(self, qs: QuerySet, field: str = "owner_tg") -> QuerySet:
        return qs if self.is_head else qs.filter(**{field: self.tg_id})

    def customers(self, qs: QuerySet) -> QuerySet:
        """Sotuvchi mijozlari: o'zi mas'ul yoki unda sotuvchining bitimi bor."""
        if self.is_head:
            return qs
        return qs.filter(Q(owner_tg=self.tg_id) | Q(deals__owner_tg=self.tg_id)).distinct()


def sellers() -> list[dict]:
    """Mas'ul tanlovi: Sotuv — B2B bo'limi xodimlari; bo'lim bo'sh bo'lsa — barcha faol xodimlar."""
    rows = list(staff.users_in_departments(SALES_DEPTS)) or list(staff.active_users())
    return [{"tg_id": u.tg_id, "name": u.name or str(u.tg_id)} for u in sorted(rows, key=lambda u: u.name)]

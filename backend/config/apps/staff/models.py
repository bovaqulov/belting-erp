"""Foydalanuvchi = xodim (Telegram orqali kiradi). Bo'limlari — jarvis.Agent(kind=dept): agentlar va xodimlar daraxti bitta."""

from __future__ import annotations

from typing import Any

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

PANEL_ROLES = ("owner", "admin")
# agentlar huquqini IT bo'limi yoki Rahbariyat (sees_all bo'lim) belgilaydi
AGENT_ADMIN_DEPTS = ("it",)


class Role(models.TextChoices):
    OWNER = "owner", "Ega"
    ADMIN = "admin", "Admin"
    EMPLOYEE = "employee", "Xodim"
    PENDING = "pending", "Tasdiq kutmoqda"
    BLOCKED = "blocked", "Bloklangan"


class UserManager(BaseUserManager["User"]):
    def create_user(self, tg_id: int, name: str = "", role: str = Role.EMPLOYEE, **extra: Any) -> User:
        user = self.model(tg_id=tg_id, name=name, role=role, **extra)
        user.set_unusable_password()  # parol yo'q — faqat Telegram
        user.save(using=self._db)
        return user

    def create_superuser(self, tg_id: int, name: str = "", password: str | None = None, **extra: Any) -> User:
        user = self.create_user(tg_id, name, Role.OWNER, is_superuser=True, **extra)
        if password:  # faqat /admin uchun
            user.set_password(password)
            user.save(update_fields=["password"])
        return user


class User(AbstractBaseUser, PermissionsMixin):
    tg_id = models.BigIntegerField("Telegram ID", unique=True)
    name = models.CharField(max_length=200, blank=True)
    username = models.CharField(max_length=64, blank=True)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.PENDING)
    departments = models.ManyToManyField(
        "jarvis.Agent", blank=True, related_name="members", limit_choices_to={"kind": "dept"}
    )
    manager = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="reports")
    lang = models.CharField(max_length=8, default="uz")
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()
    USERNAME_FIELD = "tg_id"
    REQUIRED_FIELDS = ["name"]

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name or str(self.tg_id)

    # /admin uchun
    @property
    def is_staff(self) -> bool:
        return self.role in PANEL_ROLES

    @property
    def is_panel(self) -> bool:
        return self.role in PANEL_ROLES

    def dept_keys(self) -> list[str]:
        return list(self.departments.values_list("key", flat=True))

    def in_lead_dept(self) -> bool:
        return self.departments.filter(sees_all=True).exists()

    def can_view(self) -> bool:
        """Panelni ko'rish: owner/admin, Rahbariyat, IT."""
        return self.is_panel or self.in_lead_dept() or self.departments.filter(key__in=AGENT_ADMIN_DEPTS).exists()

    def can_manage_agents(self) -> bool:
        """Agentlar, huquqlar, jadval: owner/admin, IT bo'limi, Rahbariyat (egasi qarori 2026-11-13)."""
        return self.can_view()

    def me_dict(self, company: str) -> dict[str, Any]:
        return {
            "user": {
                "tg_id": self.tg_id,
                "name": self.name,
                "username": self.username,
                "role": self.role,
                "departments": self.dept_keys(),
            },
            "company": company,
            "can_admin": self.is_panel,
            "can_view": self.can_view(),
            "can_manage_agents": self.can_manage_agents(),
            "can_lenta": False,  # lenta/geo — o'z applari ko'chganda
            "can_geo": False,
            "report_depts": [],
        }

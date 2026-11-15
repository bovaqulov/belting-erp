"""Foydalanuvchi = xodim (Telegram orqali kiradi) va bo'limlar (Department).

Bo'limlar daraxti shu yerda saqlanadi; jarvis bo'lim agentlari (kind=dept) unga `key` orqali ishora qiladi va
saqlanganda `services.sync_departments` bilan shu jadvalni yangilaydi (jarvis → staff, teskarisi yo'q)."""

from __future__ import annotations

from typing import Any

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

PANEL_ROLES = ("owner", "admin")

# ERP modullariga kirish — bo'lim bo'yicha (egasi qarori 2026-11-14). Ega/admin va Rahbariyat (sees_all) — hammasi.
# Kalit — frontend erp/home MODULES dagi key; qiymat — bo'lim (Department) kalitlari.
MODULE_DEPTS: dict[str, tuple[str, ...]] = {
    # CRM — faqat Sales (ishlab chiqarish va logistika — alohida tizim)
    "crm": ("sotuv_b2b", "sotuv"),
    "marketplace": ("sotuv_marketplace",),
    "warehouse": ("ombor", "ishlab_chiqarish", "logistika"),
    "manufacturing": ("ishlab_chiqarish",),
    "logistics": ("logistika", "ombor"),
    "accounting": ("buxgalteriya",),
    "hr": (),  # xodimlar, taklif, rollar — faqat ega/admin va Rahbariyat
}
# agentlar huquqini IT bo'limi yoki Rahbariyat (sees_all bo'lim) belgilaydi
AGENT_ADMIN_DEPTS = ("it",)


class Role(models.TextChoices):
    OWNER = "owner", "Ega"
    ADMIN = "admin", "Admin"
    EMPLOYEE = "employee", "Xodim"
    PENDING = "pending", "Tasdiq kutmoqda"
    BLOCKED = "blocked", "Bloklangan"


class Department(models.Model):
    """Bo'lim. Kalit — jarvis bo'lim agentining kaliti bilan bir xil (agent bo'limga shu kalit bilan ishora qiladi)."""

    key = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=120)
    name_ru = models.CharField(max_length=120, blank=True)
    icon = models.CharField(max_length=40, default="bot")
    color = models.CharField(max_length=9, default="#3e88f7")
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="children")
    sees_all = models.BooleanField(default=False)  # Rahbariyat: hamma modul va ma'lumot
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self) -> str:
        return f"{self.name} ({self.key})"


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
    departments = models.ManyToManyField(Department, blank=True, related_name="members")
    manager = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="reports")
    # bo'lim boshlig'i: [{"dept_group": "sotuv_b2b", "perms": {...}}] — Xodimlar daraxti va «Rahbari» ro'yxati shundan
    heads = models.JSONField(default=list, blank=True)
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

    def modules(self) -> list[str]:
        """Ruxsat etilgan ERP modullari (MODULE_DEPTS). Faol bo'lmagan rol — hech biri."""
        if self.role not in (Role.OWNER, Role.ADMIN, Role.EMPLOYEE):
            return []
        if self.is_panel or self.in_lead_dept():
            return list(MODULE_DEPTS)
        mine = set(self.dept_keys())
        return [m for m, deps in MODULE_DEPTS.items() if mine.intersection(deps)]

    def can_module(self, module: str) -> bool:
        return module in self.modules()

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
            "modules": self.modules(),
        }


class Invite(models.Model):
    """Xodim taklif havolasi: t.me/<bot>?start=inv_<code> — bosgan odam shu bo'lim va rol bilan darhol faol bo'ladi."""

    code = models.CharField(max_length=32, unique=True)
    dept = models.CharField(max_length=64)  # Department.key
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.EMPLOYEE)
    name = models.CharField(max_length=200, blank=True)  # izoh: kim uchun
    created_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name="+")
    uses = models.PositiveIntegerField(default=0)
    max_uses = models.PositiveIntegerField(default=1)
    expires = models.DateTimeField()
    revoked = models.BooleanField(default=False)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created"]

    def __str__(self) -> str:
        return f"{self.dept} · {self.code}"


class PendingHead(models.Model):
    """Botga hali kirmagan @username — kirganda (taklif yoki login) shu bo'lim boshlig'i bo'ladi."""

    username = models.CharField(max_length=64)
    dept_group = models.CharField(max_length=64)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["username", "dept_group"], name="staff_pendinghead_uniq")]

    def __str__(self) -> str:
        return f"@{self.username} → {self.dept_group}"

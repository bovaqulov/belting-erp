"""Xodimlarni boshqarish: rol/bo'lim/rahbar/boshliqlik berish, taklif havolalari, botga kirmagan boshliqlar.

Kim boshqaradi: ega va adminlar (`is_panel`). Qoidalar:
- egani hech kim o'zgartirmaydi; adminlik berish/olish — faqat ega (admin kartasining bo'lim/rahbarini admin ham saqlaydi);
- o'z rolini o'zgartirib bo'lmaydi (o'zini bloklab qo'ymaslik uchun);
- taklif: t.me/<bot>?start=inv_<kod> — bosgan odam shu bo'lim va rol bilan darhol faol (tasdiqsiz) bo'ladi.
"""

from __future__ import annotations

import secrets
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from django.utils.text import slugify

from config.apps.core.http import ApiError

from .models import PERMS, AccessRole, Department, Invite, PendingHead, Role, User

EDIT_ROLES = (Role.EMPLOYEE, Role.ADMIN, Role.PENDING, Role.BLOCKED)
ACTIVE = (Role.OWNER, Role.ADMIN, Role.EMPLOYEE)
INVITE_ROLES = (Role.EMPLOYEE, Role.ADMIN)
ROLE_NAMES = {Role.OWNER: "ega", Role.ADMIN: "admin", Role.EMPLOYEE: "xodim"}


def dept_keys() -> set[str]:
    return set(Department.objects.values_list("key", flat=True))


def _depts(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        raise ApiError(400, "Bo'limlar ro'yxat ko'rinishida bo'lsin.")
    keys = dept_keys()
    bad = [str(k) for k in raw if str(k) not in keys]
    if bad:
        raise ApiError(400, f"Bunday bo'lim yo'q: {', '.join(bad)}")
    return [str(k) for k in raw]


def _heads(raw: Any) -> list[dict[str, Any]]:
    """Boshliqlik doiralari: bo'lim kaliti yoki guruh; huquqlar — {nom: bool}."""
    if not isinstance(raw, list):
        raise ApiError(400, "Boshliqlik ro'yxat ko'rinishida bo'lsin.")
    out = []
    for h in raw:
        if not isinstance(h, dict) or not str(h.get("dept") or h.get("dept_group") or "").strip():
            raise ApiError(400, "Boshliqlik yozuvida bo'lim ko'rsatilmagan.")
        perms = h.get("perms") if isinstance(h.get("perms"), dict) else {}
        out.append(
            {
                "dept_group": str(h.get("dept") or h.get("dept_group")),
                "perms": {str(k): bool(v) for k, v in perms.items()},
            }
        )
    return out


def check_can_edit(actor: User, target: User, role: str | None) -> None:
    if target.role == Role.OWNER:
        raise ApiError(403, "Ega ma'lumotlarini bu yerda o'zgartirib bo'lmaydi.")
    owner = actor.role == Role.OWNER
    if role is None or role == target.role:
        return
    if target.pk == actor.pk:
        raise ApiError(403, "O'z rolingizni o'zgartira olmaysiz — boshqa admin yoki egadan so'rang.")
    if role not in EDIT_ROLES:
        raise ApiError(400, "Rol noto'g'ri: xodim, admin, tasdiq kutmoqda yoki bloklangan.")
    if Role.ADMIN in (role, target.role) and not owner:
        raise ApiError(403, "Adminlik berish yoki olish — faqat ega.")


@transaction.atomic
def update_user(actor: User, target: User, b: dict[str, Any]) -> None:
    role = str(b["role"]) if "role" in b else None
    check_can_edit(actor, target, role)
    fields: list[str] = []
    if role is not None:
        target.role = role
        fields.append("role")
    if "departments" in b:
        keys = _depts(b["departments"])
        target.departments.set(Department.objects.filter(key__in=keys))
        if target.role == Role.PENDING and keys and role is None:  # bo'lim berildi — tasdiqlandi
            target.role = Role.EMPLOYEE
            fields.append("role")
    if "heads" in b:
        target.heads = _heads(b["heads"])
        fields.append("heads")
    if "manager_id" in b:
        mid = b["manager_id"]
        if mid in (None, "", 0):
            target.manager = None
        else:
            m = User.objects.filter(tg_id=int(mid)).first()
            if m is None or m.pk == target.pk:
                raise ApiError(400, "Rahbar noto'g'ri tanlangan.")
            target.manager = m
        fields.append("manager")
    if "roles" in b:
        target.access_roles.set(_roles(b["roles"]))
    if fields:
        target.save(update_fields=list(dict.fromkeys(fields)))


# ------------------------------------------------------------------ rollar
def _roles(raw: Any) -> list[AccessRole]:
    if not isinstance(raw, list):
        raise ApiError(400, "Rollar ro'yxat ko'rinishida bo'lsin.")
    keys = [str(k) for k in raw]
    found = {r.key: r for r in AccessRole.objects.filter(key__in=keys)}
    bad = [k for k in keys if k not in found]
    if bad:
        raise ApiError(400, f"Bunday rol yo'q: {', '.join(bad)}")
    return list(found.values())


def _perms(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        raise ApiError(400, "Ruxsatlar ro'yxat ko'rinishida bo'lsin.")
    keys = list(dict.fromkeys(str(p) for p in raw))
    bad = [k for k in keys if k not in PERMS]
    if bad:
        raise ApiError(400, f"Bunday ruxsat yo'q: {', '.join(bad)}")
    if "crm.head" in keys and "crm" not in keys:
        keys.insert(0, "crm")  # rahbar CRM'ga kira olsin
    return [p for p in PERMS if p in keys]  # katalog tartibida


def role_json(r: AccessRole, members: list[int] | None = None) -> dict[str, Any]:
    return {
        "id": r.pk,
        "key": r.key,
        "name": r.name,
        "note": r.note,
        "perms": list(r.perms or []),
        "system": r.system,
        "members": members
        if members is not None
        else list(User.objects.filter(access_roles=r).values_list("tg_id", flat=True)),
    }


def roles_payload() -> dict[str, Any]:
    roles = list(AccessRole.objects.prefetch_related("members"))
    return {
        "roles": [role_json(r, [u.tg_id for u in r.members.all()]) for r in roles],
        "perms": [{"key": k, "name": n, "group": g} for k, (n, g) in PERMS.items()],
    }


@transaction.atomic
def save_role(b: dict[str, Any], r: AccessRole | None = None) -> dict[str, Any]:
    name = str(b.get("name", r.name if r else "")).strip()
    if not name:
        raise ApiError(400, "Rol nomini yozing.")
    if AccessRole.objects.filter(name__iexact=name).exclude(pk=r.pk if r else None).exists():
        raise ApiError(409, f"«{name}» nomli rol bor.")
    if r is None:
        base = slugify(name) or "rol"
        key, n = base[:36], 2
        while AccessRole.objects.filter(key=key).exists():
            key, n = f"{base[:33]}-{n}", n + 1
        last = AccessRole.objects.order_by("-position").first()
        r = AccessRole(key=key, position=(last.position + 1) if last else 0)
    r.name = name[:80]
    if "note" in b:
        r.note = str(b["note"] or "").strip()[:240]
    if "perms" in b:
        r.perms = _perms(b["perms"])
    r.save()
    return role_json(r)


def delete_role(r: AccessRole) -> None:
    if r.system:
        raise ApiError(409, "Tizim rolini o'chirib bo'lmaydi — ruxsatlarini o'zgartiring.")
    r.delete()


# ------------------------------------------------------------------ taklif
def _local(dt) -> str:
    """Frontend Toshkent vaqtida zonasiz satr bilan solishtiradi (users.lib activeInvites)."""
    return timezone.localtime(dt).replace(tzinfo=None).isoformat(timespec="seconds")


def invite_link(code: str) -> str:
    return f"https://t.me/{settings.TELEGRAM_BOT_USERNAME}?start=inv_{code}"


def invite_json(i: Invite) -> dict[str, Any]:
    return {
        "code": i.code,
        "dept": i.dept,
        "role": i.role,
        "roles": list(i.access_roles or []),
        "name": i.name or None,
        "created_by": i.created_by.tg_id if i.created_by else 0,
        "uses": i.uses,
        "max_uses": i.max_uses,
        "expires": _local(i.expires),
        "revoked": i.revoked,
        "link": invite_link(i.code),
    }


def create_invite(actor: User, b: dict[str, Any]) -> dict[str, Any]:
    if not settings.TELEGRAM_BOT_USERNAME:
        raise ApiError(503, "Taklif havolasi uchun bot nomi kerak: backend .env.local — TELEGRAM_BOT_USERNAME.")
    dept = str(b.get("dept") or "")
    if dept not in dept_keys():
        raise ApiError(400, "Bo'limni tanlang.")
    role = str(b.get("role") or Role.EMPLOYEE)
    if role not in INVITE_ROLES:
        raise ApiError(400, "Taklif roli — xodim yoki admin.")
    if role == Role.ADMIN and actor.role != Role.OWNER:
        raise ApiError(403, "Admin qilib taklif qilish — faqat ega.")
    try:
        uses = int(b.get("max_uses") or 1)
        days = int(b.get("days") or 7)
    except (TypeError, ValueError) as e:
        raise ApiError(400, "Soni va muddat raqam bo'lsin.") from e
    if not 1 <= uses <= 50 or not 1 <= days <= 30:
        raise ApiError(400, "Necha kishi — 1 dan 50 gacha, muddat — 1 dan 30 kungacha.")
    roles = [r.key for r in _roles(b.get("roles") or [])]
    i = Invite.objects.create(
        access_roles=roles,
        code=secrets.token_urlsafe(9),
        dept=dept,
        role=role,
        name=str(b.get("name") or "").strip()[:200],
        created_by=actor,
        max_uses=uses,
        expires=timezone.now() + timedelta(days=days),
    )
    return invite_json(i)


def revoke_invite(code: str) -> None:
    if not Invite.objects.filter(code=code).update(revoked=True):
        raise ApiError(404, "Havola topilmadi.")


def apply_pending_heads(u: User) -> None:
    """Botga kirmagan paytda @username'ga tayinlangan boshliqlik — endi foydalanuvchiga."""
    if not u.username:
        return
    pend = list(PendingHead.objects.filter(username__iexact=u.username))
    if not pend:
        return
    have = {h.get("dept_group") for h in u.heads or []}
    u.heads = [*(u.heads or []), *({"dept_group": p.dept_group, "perms": {}} for p in pend if p.dept_group not in have)]
    u.save(update_fields=["heads"])
    PendingHead.objects.filter(pk__in=[p.pk for p in pend]).delete()


@transaction.atomic
def accept_invite(code: str, tg: dict[str, Any]) -> str:
    """Bot /start inv_<kod>: Telegram'dagi javob matni."""
    i = Invite.objects.select_for_update().filter(code=code).first()
    if i is None or i.revoked or i.expires <= timezone.now() or i.uses >= i.max_uses:
        return "Taklif havolasi eskirgan yoki bekor qilingan. Sizni taklif qilgan odamdan yangisini so'rang."
    dept = Department.objects.filter(key=i.dept).first()
    if dept is None:
        return "Taklifdagi bo'lim endi mavjud emas. Administratorga murojaat qiling."
    name = " ".join(x for x in (tg.get("first_name"), tg.get("last_name")) if x) or str(tg["id"])
    u, created = User.objects.get_or_create(
        tg_id=int(tg["id"]), defaults={"name": name, "username": tg.get("username") or "", "role": i.role}
    )
    if u.role == Role.BLOCKED:
        return "Kirish yopiq. Administratorga murojaat qiling."
    if not created:
        if u.role == Role.PENDING or (i.role == Role.ADMIN and u.role == Role.EMPLOYEE):
            u.role = i.role
        u.username = u.username or tg.get("username") or ""
        u.save(update_fields=["role", "username"])
    u.departments.add(dept)
    roles = list(AccessRole.objects.filter(key__in=i.access_roles or []))
    if roles:
        u.access_roles.add(*roles)
    Invite.objects.filter(pk=i.pk).update(uses=F("uses") + 1)
    apply_pending_heads(u)
    url = f"{settings.JARVIS_PUBLIC_URL}/app/" if settings.JARVIS_PUBLIC_URL else "sayt"
    rl = f" Rol: {', '.join(r.name for r in roles)}." if roles else ""
    return (
        f"✅ Xush kelibsiz, {u.name}! Siz «{dept.name}» bo'limiga {ROLE_NAMES.get(u.role, 'xodim')} sifatida "
        f"qo'shildingiz.{rl}\nKirish: {url}"
    )


# ------------------------------------------------------------------ botga kirmagan boshliqlar
def add_pending_head(b: dict[str, Any]) -> None:
    un = str(b.get("username") or "").strip().lstrip("@")
    dept = str(b.get("dept") or "")
    if not un:
        raise ApiError(400, "@username kiriting")
    if not dept:
        raise ApiError(400, "Bo'limni tanlang")
    u = User.objects.filter(username__iexact=un).first()
    if u is not None:  # allaqachon botda — darhol boshliq
        if u.role == Role.OWNER:
            return
        if not any(h.get("dept_group") == dept for h in u.heads or []):
            u.heads = [*(u.heads or []), {"dept_group": dept, "perms": {}}]
            u.save(update_fields=["heads"])
        return
    PendingHead.objects.get_or_create(username=un, dept_group=dept)

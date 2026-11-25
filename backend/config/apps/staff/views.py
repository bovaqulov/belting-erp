"""Xodimlar: /app/api/users (ro'yxat, tahrir — rol, bo'lim, rahbar, boshliqlik), /app/api/heads (taklif havolalari,
botga kirmagan boshliqlar), /app/api/invites (yaratish, bekor qilish). Qoidalar — manage.py."""

from django.http import HttpRequest, JsonResponse

from config.apps.core.http import ApiError, api, json_body, ok

from . import manage as M
from .models import AccessRole, Department, Invite, PendingHead, User

ADMIN_ONLY = "Xodimlarni faqat ega va adminlar boshqaradi."


@api(
    ("GET",),
    check=lambda u: u.can_view() or u.can_module("hr"),
    deny="Xodimlar ro'yxati faqat rahbariyat, IT, kadrlar va adminlar uchun.",
)
def users(request: HttpRequest, user: User) -> JsonResponse:
    rows = [
        {
            "tg_id": u.tg_id,
            "name": u.name,
            "username": u.username,
            "role": u.role,
            "departments": [d.key for d in u.departments.all()],
            "manager_id": u.manager.tg_id if u.manager else None,
            "heads": u.heads or [],
            "roles": [r.key for r in u.access_roles.all()],
            "phone": None,
            "prefs": None,
            "profile": None,
        }
        for u in User.objects.select_related("manager").prefetch_related("departments", "access_roles")
    ]
    depts = [
        {
            "key": d.key,
            "name": d.name,
            "icon": d.icon,
            "color": d.color,
            "group": d.key,
            "sees_all": d.sees_all,
            "parent": d.parent.key if d.parent else None,
        }
        for d in Department.objects.select_related("parent")
    ]
    pend = [{"id": p.pk, "username": p.username, "dept_group": p.dept_group} for p in PendingHead.objects.all()]
    return ok({"users": rows, "pending_heads": pend, "perm_names": {}, "pref_opts": None, "depts": depts})


@api(("POST",), check=lambda u: u.is_panel, deny=ADMIN_ONLY)
def user_edit(request: HttpRequest, user: User, tg_id: int) -> JsonResponse:
    target = User.objects.filter(tg_id=tg_id).first()
    if target is None:
        raise ApiError(404, "Xodim topilmadi")
    M.update_user(user, target, json_body(request))
    return ok()


@api(("GET", "POST"), check=lambda u: u.can_view())
def heads(request: HttpRequest, user: User) -> JsonResponse:
    """GET — taklif havolalari (frontend faollarini o'zi ajratadi); POST {dept, username} — boshliq tayinlash."""
    if request.method == "POST":
        if not user.is_panel:
            raise ApiError(403, ADMIN_ONLY)
        M.add_pending_head(json_body(request))
        return ok()
    return ok({"invites": [M.invite_json(i) for i in Invite.objects.select_related("created_by")[:100]]})


@api(("DELETE", "POST"), check=lambda u: u.is_panel, deny=ADMIN_ONLY)
def head_del(request: HttpRequest, user: User, pk: int) -> JsonResponse:
    if not PendingHead.objects.filter(pk=pk).delete()[0]:
        raise ApiError(404, "Topilmadi")
    return ok()


@api(("POST",), check=lambda u: u.is_panel, deny=ADMIN_ONLY)
def invites(request: HttpRequest, user: User) -> JsonResponse:
    """POST {dept, role, name, max_uses, days} → taklif (link bilan)."""
    return ok(M.create_invite(user, json_body(request)))


@api(("POST",), check=lambda u: u.is_panel, deny=ADMIN_ONLY)
def invite_revoke(request: HttpRequest, user: User, code: str) -> JsonResponse:
    M.revoke_invite(code)
    return ok()


@api(("GET",), check=lambda u: u.is_panel, deny=ADMIN_ONLY)
def phone_options(request: HttpRequest, user: User) -> JsonResponse:
    """Xodimni ichki raqamga bog'lash variantlari (Jarvis: Yeastar PBX, Moizvonki). Telefoniya hali ulanmagan — bo'sh
    ro'yxatlar va sababi (`errors`): forma «sozlanmagan» deb ko'rsatadi, xodim kartochkasi ishlayveradi."""
    return ok(
        {
            "yeastar": [],
            "moizvonki": [],
            "moizvonki_enabled": False,
            "errors": ["Yeastar sozlanmagan (telefoniya hali ulanmagan)"],
        }
    )


@api(("GET", "POST"), check=lambda u: u.can_view() or u.can_module("hr"))
def roles(request: HttpRequest, user: User) -> JsonResponse:
    """GET — rollar (a'zolari bilan) va ruxsatlar katalogi; POST {name, note, perms} — yangi rol (ega/admin)."""
    if request.method == "POST":
        if not user.is_panel:
            raise ApiError(403, "Rollarni faqat ega va adminlar o'zgartiradi.")
        return ok(M.save_role(json_body(request)))
    return ok(M.roles_payload())


@api(("POST",), check=lambda u: u.is_panel, deny="Rollarni faqat ega va adminlar o'zgartiradi.")
def role_edit(request: HttpRequest, user: User, pk: int) -> JsonResponse:
    r = AccessRole.objects.filter(pk=pk).first()
    if r is None:
        raise ApiError(404, "Rol topilmadi")
    return ok(M.save_role(json_body(request), r))


@api(("POST",), check=lambda u: u.is_panel, deny="Rollarni faqat ega va adminlar o'zgartiradi.")
def role_delete(request: HttpRequest, user: User, pk: int) -> JsonResponse:
    r = AccessRole.objects.filter(pk=pk).first()
    if r is None:
        raise ApiError(404, "Rol topilmadi")
    M.delete_role(r)
    return ok()

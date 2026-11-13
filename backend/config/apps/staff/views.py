"""Xodimlar (o'qish): /app/api/users — frontend UsersResp shakli; /app/api/heads — taklif havolalari (hozircha bo'sh)."""

from django.http import HttpRequest, JsonResponse

from config.apps.core.http import api, ok
from config.apps.jarvis.models import Agent

from .models import User


@api(("GET",), check=lambda u: u.can_view(), deny="Xodimlar ro'yxati faqat rahbariyat, IT va adminlar uchun.")
def users(request: HttpRequest, user: User) -> JsonResponse:
    rows = [
        {
            "tg_id": u.tg_id,
            "name": u.name,
            "username": u.username,
            "role": u.role,
            "departments": [d.key for d in u.departments.all()],
            "manager_id": u.manager.tg_id if u.manager else None,
            "heads": [],
            "phone": None,
            "prefs": None,
            "profile": None,
        }
        for u in User.objects.select_related("manager").prefetch_related("departments")
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
        for d in Agent.objects.filter(kind=Agent.Kind.DEPT).select_related("parent")
    ]
    return ok({"users": rows, "pending_heads": [], "perm_names": {}, "pref_opts": None, "depts": depts})


@api(("GET",), check=lambda u: u.can_view())
def heads(request: HttpRequest, user: User) -> JsonResponse:
    return ok({"invites": []})

"""JSON API yordamchilari: xato shakli `{detail}` (frontend shared/api/client.ts), body o'qish, auth/ruxsat dekoratori.

CSRF: API faqat JSON qabul qiladi (Content-Type: application/json — boshqa saytdan oddiy forma yubora olmaydi, CORS
preflight talab qilinadi) + sessiya cookie SameSite=Lax; shuning uchun API ko'rinishlari csrf_exempt.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from functools import wraps
from typing import Any

from django.http import HttpRequest, HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .auth import resolve_user

log = logging.getLogger(__name__)


class ApiError(Exception):
    """Foydalanuvchiga ko'rsatiladigan xato: nima bo'ldi + qanday tuzatish."""

    def __init__(self, status: int, detail: str | dict[str, Any]):
        """detail — matn yoki obyekt (masalan {message, issues}: frontend `message` ni ko'rsatadi, qolganini o'qiydi)."""
        super().__init__(detail if isinstance(detail, str) else str(detail.get("message") or detail))
        self.status = status
        self.detail = detail


def ok(data: Any = None, status: int = 200) -> JsonResponse:
    return JsonResponse({"ok": True} if data is None else data, status=status, safe=False)


def json_body(request: HttpRequest) -> dict[str, Any]:
    if not request.body:
        return {}
    if not (request.content_type or "").startswith("application/json"):
        raise ApiError(415, "So'rov JSON ko'rinishida bo'lsin (Content-Type: application/json).")
    try:
        data = json.loads(request.body)
    except ValueError as e:
        raise ApiError(400, "So'rov tanasi noto'g'ri JSON.") from e
    if not isinstance(data, dict):
        raise ApiError(400, "So'rov tanasi obyekt bo'lsin.")
    return data


def api(
    methods: tuple[str, ...] = ("GET",),
    *,
    auth: bool = True,
    check: Callable[[Any], bool] | None = None,
    deny: str = "",
):
    """Sinxron API ko'rinishi: metod, kirish (initData yoki sessiya), ruxsat; ApiError → {detail} JSON.

    Ko'rinish `(request, user, **kwargs)` qabul qiladi. check(user) False bo'lsa — 403 (deny matni bilan).
    """

    def deco(fn: Callable[..., HttpResponse]) -> Callable[..., HttpResponse]:
        @csrf_exempt
        @wraps(fn)
        def view(request: HttpRequest, *args: Any, **kwargs: Any) -> HttpResponse:
            try:
                if request.method not in methods:
                    raise ApiError(405, f"{request.method} bu manzil uchun ruxsat etilmagan.")
                user = resolve_user(request)
                if auth and user is None:
                    raise ApiError(401, "Kirish talab qilinadi")
                if check is not None and not check(user):
                    raise ApiError(403, deny or "Bu amal uchun ruxsatingiz yo'q.")
                return fn(request, user, *args, **kwargs)
            except ApiError as e:
                return JsonResponse({"detail": e.detail}, status=e.status)

        return view

    return deco

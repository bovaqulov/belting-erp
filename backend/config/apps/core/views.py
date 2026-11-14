"""Kirish va joriy foydalanuvchi: /app/api/me, login (start/poll/magic), logout."""

from django.conf import settings
from django.contrib.auth import login, logout
from django.core import signing
from django.http import HttpRequest, HttpResponseRedirect, JsonResponse
from django.utils import timezone

from config.apps.staff.models import User

from .http import ApiError, api, ok
from .models import LoginToken

MAGIC_SALT = "core.magic-login"
MAGIC_MAX_AGE = 600


@api(("GET",))
def me(request: HttpRequest, user: User) -> JsonResponse:
    return ok(user.me_dict(settings.JARVIS_COMPANY))


@api(("GET",))
def erp_me(request: HttpRequest, user: User) -> JsonResponse:
    """ERP modullari (marketplace, ombor, moliya) uchun: {tg_id, name, roles[]}. Ega — admin huquqlari bilan."""
    roles = [user.role, "admin"] if user.role == "owner" else [user.role]
    return ok({"tg_id": user.tg_id, "name": user.name, "roles": roles, "warehouses": [], "firms": [], "kinds": []})


@api(("POST",), auth=False)
def login_start(request: HttpRequest, user: User | None) -> JsonResponse:
    bot = settings.TELEGRAM_BOT_USERNAME
    if not bot or not settings.TELEGRAM_BOT_TOKEN:
        raise ApiError(
            503,
            "Telegram orqali kirish hali sozlanmagan (backend .env.local: TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME). "
            "Hozircha administratordan kirish havolasini oling.",
        )
    t = LoginToken.objects.create()
    return ok({"token": t.token, "link": f"https://t.me/{bot}?start=login_{t.token}"})


@api(("GET",), auth=False)
def login_poll(request: HttpRequest, user: User | None) -> JsonResponse:
    t = LoginToken.objects.filter(token=request.GET.get("token", "")).select_related("user").first()
    if t is None or t.expired or t.used_at:
        raise ApiError(410, "Kirish havolasi eskirdi — qaytadan «Telegram orqali kirish» ni bosing.")
    if not t.confirmed_at or t.user is None:
        return ok({"ok": False})
    t.used_at = timezone.now()
    t.save(update_fields=["used_at"])
    login(request, t.user)
    return ok({"ok": True})


@api(("GET",), auth=False)
def login_magic(request: HttpRequest, user: User | None) -> HttpResponseRedirect:
    """Dev: `manage.py login_link <tg_id>` bergan bir martalik havola (10 daqiqa). Production'da o'chiq."""
    if not settings.JARVIS_MAGIC_LOGIN:
        raise ApiError(404, "Topilmadi")
    try:
        tg_id = signing.TimestampSigner(salt=MAGIC_SALT).unsign(request.GET.get("t", ""), max_age=MAGIC_MAX_AGE)
    except signing.BadSignature as e:
        raise ApiError(410, "Havola eskirgan yoki noto'g'ri — yangisini oling.") from e
    u = User.objects.filter(tg_id=int(tg_id), role__in=("owner", "admin", "employee")).first()
    if u is None:
        raise ApiError(403, "Foydalanuvchi topilmadi yoki faol emas.")
    login(request, u)
    return HttpResponseRedirect(request.GET.get("next") or "/app/")


@api(("POST",), auth=False)
def logout_view(request: HttpRequest, user: User | None) -> JsonResponse:
    logout(request)
    return ok()


def magic_link(tg_id: int, base: str = "") -> str:
    t = signing.TimestampSigner(salt=MAGIC_SALT).sign(str(tg_id))
    return f"{base}/app/api/login/magic/?t={t}"  # Next trailingSlash: darhol "/" bilan (308 siz)


def api_not_found(request: HttpRequest) -> JsonResponse:
    """/app/api/ ostidagi noma'lum manzil — HTML emas, {detail} (frontend xato matnini ko'rsatadi)."""
    return JsonResponse({"detail": f"API topilmadi: {request.path} (bu bo'lim backend'da hali yo'q)"}, status=404)

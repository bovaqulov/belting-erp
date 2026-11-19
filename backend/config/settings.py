"""Belting ERP backend sozlamalari (Django + SQLite (demo) / PostgreSQL (prod) + Celery/Redis). Qiymatlar .env.local dan (namuna: .env.example).

Applar: config/apps/<app>; label — qisqa nom (core, staff, jarvis, erp_<modul> …), migratsiyalar shunga bog'langan."""

import hashlib
import os
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlsplit

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env.local")


def env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, "1" if default else "0").strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [x.strip() for x in os.getenv(name, default).split(",") if x.strip()]


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY") or "dev-insecure-key"
DEBUG = env_bool("DJANGO_DEBUG")
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")

# Domen applari — frontend src/ bilan bir xil bo'linish (frontend/ARCHITECTURE.md). Har biri o'z papkasida.
DOMAIN_APPS = [
    "config.apps.core",  # umumiy: auth (Telegram initData, sessiya), JSON API yordamchilari, /me, login
    "config.apps.staff",  # xodimlar (foydalanuvchi modeli), rollar
    "config.apps.jarvis",  # Jarvis — firma agentlari: daraxt, huquqlar, jadval, topshiriq, chat
    "config.apps.bots",  # Telegram botlari (xodim boti, mijoz boti) — keyingi bosqich
    "config.apps.memory",  # agentlar xotirasi
    "config.apps.knowledge",  # bilimlar bazasi (KB), graf
    "config.apps.reports",  # kunlik hisobot shablonlari va hisobotlar
    "config.apps.audit",  # agent so'rovlari va vositalar jurnali
    "config.apps.system",  # tizim holati, loglar
    "config.apps.erp.catalog",
    "config.apps.erp.warehouse",
    "config.apps.erp.workshop",
    "config.apps.erp.picking",
    "config.apps.erp.purchasing",
    "config.apps.erp.sales",
    "config.apps.erp.finance",
    "config.apps.erp.crm",
    "config.apps.erp.logistics",
    "config.apps.erp.marketplace",
    "config.apps.conveyor",  # konveyer lenta chizmasi (LentaCUD)
    "config.apps.geomap",  # mijozlar xaritasi
    "config.apps.analytics",
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    *DOMAIN_APPS,
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
ASGI_APPLICATION = "config.asgi.application"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]


def _database() -> dict:
    """Ma'lumotlar bazasi: DATABASE_URL (postgres://…) berilsa — PostgreSQL (prod), aks holda SQLite (demo/dev)."""
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        return {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": os.getenv("DJANGO_DB_PATH") or BASE_DIR / "data" / "db.sqlite3",
            # parallel o'qish (veb + Celery worker): WAL va kutish
            "OPTIONS": {
                "init_command": "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;",
                "transaction_mode": "IMMEDIATE",
                "timeout": 20,
            },
        }
    u = urlsplit(url)
    if u.scheme not in {"postgres", "postgresql"}:
        raise ValueError(f"DATABASE_URL: faqat postgres:// qo'llanadi, berildi: {u.scheme}://")
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": unquote(u.path.lstrip("/")),
        "USER": unquote(u.username or ""),
        "PASSWORD": unquote(u.password or ""),
        "HOST": u.hostname or "",
        "PORT": str(u.port or ""),
        "CONN_MAX_AGE": int(os.getenv("DB_CONN_MAX_AGE", "60")),
        "CONN_HEALTH_CHECKS": True,
        "OPTIONS": dict(parse_qsl(u.query)),  # masalan ?sslmode=require
    }


DATABASES = {"default": _database()}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "staff.User"

LANGUAGE_CODE = "uz"
TIME_ZONE = "Asia/Tashkent"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Sessiya: frontend /app ostida (Next statik eksport, bitta domen). Telegram WebView ichida cookie emas, X-Init-Data.
SESSION_COOKIE_NAME = "belting_session"
SESSION_COOKIE_AGE = 7 * 24 * 3600
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG

# ---------------------------------------------------------------- Celery + Redis
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_ALWAYS_EAGER = env_bool("CELERY_EAGER")
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_TASK_ACKS_LATE = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_BEAT_SCHEDULE = {
    # agent jadvallari: har daqiqa vaqti kelganlarini navbatga qo'yadi
    "jarvis-schedules-tick": {"task": "config.apps.jarvis.tasks.tick", "schedule": 60.0},
    # marketplace: ulangan kanallar buyurtmalari har 5 daqiqada (FBS muddatlari qisqa — Uzum 2 soat)
    "mp-orders-sync": {"task": "config.apps.erp.marketplace.tasks.sync_orders", "schedule": 300.0},
    # CRM robotlari: muddat kelgan buyurtma → «Muddati BUGUN», javobsiz lid va muddati o'tgan vazifa eslatmalari
    "crm-robots": {"task": "config.apps.erp.crm.tasks.robots", "schedule": 300.0},
}

# ---------------------------------------------------------------- Telegram, Jarvis
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "").strip().lstrip("@")
# webhook: Telegram har so'rovda X-Telegram-Bot-Api-Secret-Token yuboradi; standart — SECRET_KEY dan hosil
TELEGRAM_WEBHOOK_SECRET = (
    os.getenv("TELEGRAM_WEBHOOK_SECRET") or hashlib.sha256(f"tg:{SECRET_KEY}".encode()).hexdigest()[:48]
)
# tashqi HTTPS manzil (tunnel/domen) — webhook shu yerga: {JARVIS_PUBLIC_URL}/app/api/bots/telegram/
JARVIS_PUBLIC_URL = os.getenv("JARVIS_PUBLIC_URL", "").rstrip("/")
JARVIS_LLM = os.getenv("JARVIS_LLM", "claude")  # claude | echo
JARVIS_COMPANY = os.getenv("JARVIS_COMPANY", "Belting rezina")
JARVIS_MAGIC_LOGIN = env_bool("JARVIS_MAGIC_LOGIN", DEBUG)

# ---------------------------------------------------------------- Marketplace kanallari (erp/marketplace)
WB_TOKEN = os.getenv("WB_TOKEN", "").strip().strip("'\"")
OZON_ID = (os.getenv("OZON_CLIENT_ID") or os.getenv("OZON_ID") or "").strip()
OZON_TOKEN = (os.getenv("OZON_API_KEY") or os.getenv("OZON_TOKEN") or "").strip()
UZUM_TOKEN = (os.getenv("UZUM_API_KEY") or os.getenv("UZUM_TOKEN") or "").strip()
# kanalga yozuvchi amallar (bekor qilish, tasdiqlash, jo'natish, postavka) — standart yopiq, faqat o'qish
MP_WRITE = env_bool("MP_WRITE")

# CRM: sotuvchilar Telegram'i — alohida Telegram Business bot (Jarvis botidan mustaqil); webhook sirri — tokendan hosil
BUSINESS_CONNECTION_BOT_TOKEN = os.getenv("BUSINESS_CONNECTION_BOT_TOKEN", "").strip()
# sayt / marketplace formalaridan lid qabuli (POST /app/api/erp/crm/intake, sarlavha X-Intake-Token); bo'sh — yopiq
CRM_INTAKE_TOKEN = os.getenv("CRM_INTAKE_TOKEN", "").strip()
CRM_TG_WEBHOOK_SECRET = (
    os.getenv("CRM_TG_WEBHOOK_SECRET") or hashlib.sha256(f"crm-tg:{SECRET_KEY}".encode()).hexdigest()[:48]
)
# CRM: WhatsApp va Instagram Direct — rasmiy Meta API (crm/meta.py; sozlash — docs/api/crm.md «WhatsApp va Instagram»).
# Webhook: {JARVIS_PUBLIC_URL}/app/api/erp/crm/meta/webhook/ (oxirida «/») — imzo META_APP_SECRET bilan tekshiriladi (bo'sh — yopiq).
META_APP_SECRET = os.getenv("META_APP_SECRET", "").strip()
META_VERIFY_TOKEN = os.getenv("META_VERIFY_TOKEN") or hashlib.sha256(f"crm-meta:{SECRET_KEY}".encode()).hexdigest()[:32]
META_GRAPH_VERSION = os.getenv("META_GRAPH_VERSION", "v21.0").strip()
WA_TOKEN = os.getenv("WA_TOKEN", "").strip()  # WhatsApp Cloud API: tizim foydalanuvchisi (doimiy) tokeni
WA_PHONE_ID = os.getenv("WA_PHONE_ID", "").strip()  # WhatsApp → API Setup → Phone number ID
IG_TOKEN = os.getenv("IG_TOKEN", "").strip()  # Instagram API with Instagram Login: uzoq muddatli token
IG_USER_ID = os.getenv("IG_USER_ID", "").strip()  # Instagram professional akkaunt ID'si
# CRM: Didox (elektron hujjat aylanishi, crm/didox.py) — hujjat qoralamasi (PDF bilan); imzo — E-IMZO, Didox kabinetida.
# Partner token — Didox menejeri beradi; STIR va parol — kompaniya Didox akkaunti (Profil → Akkaunt). Bo'sh — o'chiq.
DIDOX_URL = os.getenv("DIDOX_URL", "https://api-partners.didox.uz").strip().rstrip("/")
DIDOX_PARTNER_TOKEN = os.getenv("DIDOX_PARTNER_TOKEN", "").strip()
DIDOX_TIN = os.getenv("DIDOX_TIN", "").strip()
DIDOX_PASSWORD = os.getenv("DIDOX_PASSWORD", "").strip()
# CRM: IP-telefoniya webhook'i (POST /app/api/erp/crm/calls/webhook/, sarlavha X-Calls-Token) — bo'sh — yopiq (crm/calls.py).
# Operatorlar: ATS ichki raqami → sotuvchi Telegram ID'si, JSON: {"101": 5574861580}
CRM_CALLS_TOKEN = os.getenv("CRM_CALLS_TOKEN", "").strip()
CRM_CALLS_OPERATORS = os.getenv("CRM_CALLS_OPERATORS", "").strip()

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "%(asctime)s %(levelname)s %(name)s: %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "root": {"handlers": ["console"], "level": "INFO"},
    # httpx INFO har so'rov URL'ini yozadi — Telegram Bot API'da URL ichida bot tokeni bor (logga tushmasin)
    "loggers": {"httpx": {"level": "WARNING"}, "httpcore": {"level": "WARNING"}},
}

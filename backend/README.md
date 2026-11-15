# Backend (Django + Celery/Redis; SQLite — demo, PostgreSQL — prod)

Frontend (`../frontend`, Next statik eksport, `/app`) ma'lumotni `/app/api/*` dan oladi — shu backend beradi.
Applar frontend `src/` bilan bir xil domenlarga bo'lingan.

## Tuzilma

```
backend/
  config/                 settings.py, urls.py (/app/api/* — har app urls.py dan), celery.py, asgi.py, wsgi.py
    apps/
      core/               umumiy yadro: kirish, JSON API yordamchilari, Telegram yuborish, registry, check_boundaries ✅
      staff/              xodimlar va bo'limlar (Department): rol, rahbar, boshliqlik; taklif (bot /start inv_<kod>) ✅
      jarvis/             Jarvis agentlari: daraxt, huquqlar, jadval (beat), topshiriq (Celery), chat (SSE)      ✅ to'liq
      bots/               Telegram bot (pyTelegramBotAPI, webhook): login tasdig'i                              ✅
      memory/             xotira faktlari (firma/bo'lim/xodim), tasdiqlash; agent promptiga                       ✅
      knowledge/          bilimlar (matn, PDF), chatlardan ajratish (30 daq), graf (LLM, kesh, jamoalar, kecha 03:00) ✅
      reports/ audit/ system/                                                                                   ⏳ skelet
      erp/marketplace/    WB/Ozon/Uzum: FBS buyurtmalar, skaner bilan yig'ish, WB postavkalar, kartochka auditi          ✅ 1-bosqich
      erp/crm/            bitimlar, kanban, mijozlar, lidlar, reja, huquqlar + sotuvchilar Telegram'i (Business bot)     ✅
      erp/{catalog,warehouse,workshop,picking,purchasing,sales,finance,logistics}/  (label: erp_<modul>)            ⏳ skelet
      conveyor/ geomap/ analytics/                                                                        ⏳ skelet
  data/                   db.sqlite3 (demo baza), celerybeat-schedule (gitignore)
  scripts/                dev.sh (API + worker + beat), tunnel.sh (tunnel + webhook), check.sh (ruff + ty + pytest-testmon)
  .env.local              sozlamalar (namuna: .env.example)
  manage.py  pyproject.toml  uv.lock  conftest.py
```

App label — qisqa nom (`core`, `staff`, `jarvis`, `erp_catalog` …); import yo'li — `config.apps.<app>`.
Yangi app: `config/apps/<nom>/` (apps.py: `name="config.apps.<nom>"`, `label`), `settings.DOMAIN_APPS` ga qo'shish,
`urls.py` dagi `urlpatterns` avtomatik `/app/api/` ostiga ulanadi (oxirgi `/` ixtiyoriy — Next trailingSlash).

## Applar chegaralari (kelajakda mikroservislarga ajratish uchun)

Har app — alohida servis bo'la oladigan modul. `scripts/check.sh` buni `manage.py check_boundaries` bilan majburlaydi:

- **Ochiq interfeys — `<app>/services.py`.** Boshqa app faqat shu modulni import qiladi; `models.py`, `views.py`,
  `manage.py` … — ichki. Faqat tip uchun import — `if TYPE_CHECKING:` ichida (hisobga olinmaydi).
- **`core` — umumiy yadro** (http, auth, telegram, llm): hamma ishlatadi, o'zi hech bir domen appini import qilmaydi.
  Foydalanuvchi — `get_user_model()`; domen qo'shimchalari — `core/registry.py` (masalan CRM `/erp/me` ga `is_head`).
- **Bog'liqlik yo'nalishi pastga:** `bots, erp/*, knowledge, memory → jarvis → staff → core`. Teskari ehtiyoj —
  ro'yxatdan o'tish (hook) orqali: memory/knowledge o'z kontekstini `jarvis.services.register_context` ga
  `apps.ready()` da qo'shadi, jarvis ularni bilmaydi.
- **Boshqa app modeliga FK yo'q — ID saqlanadi** (CRM'dagi `owner_tg` kabi: xodim — `tg_id`, bo'lim — `Department.key`).
  Mavjud `AUTH_USER_MODEL` FK'lari — `check_boundaries.LEGACY_FK`; yangisini qo'shmang.
- **Applararo yozish/hodisa — Celery task yoki `services` funksiyasi** orqali (to'g'ridan-to'g'ri boshqa jadvalga
  yozilmaydi). Yangi skelet domenlar (sex, ombor, moliya …) boshidanoq shunday yoziladi.
- Bo'limlar — `staff.Department`; jarvis bo'lim agenti (kind=dept) unga bir xil `key` bilan ishora qiladi va
  saqlanganda/o'chganda uni yangilaydi (`jarvis/signals.py`).

## Ishga tushirish

```bash
cp .env.example .env.local          # bir marta; DJANGO_SECRET_KEY ni almashtiring
uv sync
uv run python manage.py migrate
uv run python manage.py seed_agents                       # ../../jarvis/backend/departments.yaml dan bo'lim agentlari
uv run python manage.py add_user <tg_id> --name "Ism" --role admin --dept it
scripts/dev.sh                                           # :8000 — uvicorn + celery worker + beat (Redis kerak)
uv run python manage.py login_link <tg_id> --base http://localhost:3000   # brauzerda kirish havolasi (dev)
```

Tashqi manzil (Telegram webhook, telefon): `scripts/tunnel.sh` — cloudflared tunnel → frontend :3000, yangi manzilni
`.env.local` (`JARVIS_PUBLIC_URL`) ga yozadi va webhook'ni o'rnatadi. Tunnel qayta ochilsa — shu skriptni qayta ishga tushiring.
Bot: pyTelegramBotAPI, webhook `/app/api/bots/telegram/` (sir sarlavha bilan); holat: `manage.py webhook_info`.

Baza: `DATABASE_URL` bo'sh — SQLite (`data/db.sqlite3`, demo/dev). Prod — PostgreSQL:
`DATABASE_URL=postgres://user:parol@host:5432/belting?sslmode=require` (`.env.local`), so'ng `manage.py migrate`.
Ulanishlar qayta ishlatiladi: `DB_CONN_MAX_AGE` (standart 60 s).

Frontend: `cd ../frontend && npm run dev` — `/app/api/*` → `JARVIS_BACKEND` (standart `http://127.0.0.1:8000`).

## Kirish

- Telegram Mini App: `X-Init-Data` (HMAC, `TELEGRAM_BOT_TOKEN`).
- Brauzer: `login/start` → bot `login_<token>` ni tasdiqlaydi (bot ulanmaguncha: `manage.py confirm_login <token> <tg_id>`)
  → `login/poll` sessiya ochadi. Dev: `manage.py login_link` (faqat `JARVIS_MAGIC_LOGIN=1`).
- Faol rollar: owner, admin, employee. Panel: owner/admin, Rahbariyat (sees_all), IT. Agentlarni boshqarish — shular.

## Jarvis (API: ../docs/api/agents.md, ../docs/api/chat.md)

- LLM: `JARVIS_LLM=claude` — Claude Agent SDK (Claude Max, API kalitsiz); `echo` — testlar.
- «memory» va «kb» vositalari ulangan: system prompt'ga faol faktlar va savolga mos hujjatlar (core/llm, knowledge/docs).
- Qolgan vositalar (CRM, 1C, ERP …) hali ulanmagan: `runtime.TOOL_REGISTRY` bo'sh, agent buni biladi.
- Jadval: beat har daqiqa `tick` → vaqti kelganlari `run_schedule`; natija mas'ulga Telegram'da.
- Topshiriq: yaratilganda `run_task` (Celery) → holat `doing` → `done`/`failed`, natija + beruvchiga xabar.

## Tekshiruv

`scripts/check.sh` (ruff format/check → ty → chegaralar → pytest --testmon). `NO_TESTS=1` — testsiz, `--all` — barcha testlar.

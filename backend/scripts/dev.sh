#!/bin/zsh
# Dev: API (uvicorn, ASGI — chat SSE uchun) + Celery worker + beat (jadvallar). Redis ishlab turishi kerak (redis-cli ping).
#   scripts/dev.sh            # :8000
#   PORT=8001 scripts/dev.sh
# Frontend (Next dev) /app/api/* ni shu yerga proksi qiladi: frontend/next.config.ts JARVIS_BACKEND (standart :8000).
set -eu
cd "$(dirname "$0")/.."
redis-cli ping >/dev/null || { echo "Redis ishlamayapti: brew services start redis"; exit 1; }
uv run python manage.py migrate -v0
# Telegram webhook (pyTelegramBotAPI): token va JARVIS_PUBLIC_URL bo'lsa — o'rnatiladi (tunnel manzili o'zgarsa qayta)
if grep -q '^TELEGRAM_BOT_TOKEN=.' .env.local && grep -q '^JARVIS_PUBLIC_URL=https' .env.local; then
  uv run python manage.py set_webhook || echo "webhook o'rnatilmadi"
fi
trap 'kill 0' EXIT INT TERM
uv run celery -A config worker -l info --concurrency 2 &
uv run celery -A config beat -l info --schedule data/celerybeat-schedule &
# TelegramCRM shlyuzi (Telethon) — faqat api_id bo'lsa; BITTA nusxa (Redis qulfi), prod bilan bir akkauntni ishlatmang
if grep -q '^TGCRM_API_ID=[0-9]' .env.local; then
  uv run python manage.py tg_gateway &
fi
uv run uvicorn config.asgi:application --host 127.0.0.1 --port "${PORT:-8000}" --reload --reload-dir config &
wait

#!/bin/zsh
# Tashqi HTTPS manzil (cloudflared quick tunnel) → frontend (Next dev :3000, u /app/api/* ni backend'ga proksi qiladi).
# Tunnel har ochilganda manzil o'zgaradi — skript yangi manzilni .env.local (JARVIS_PUBLIC_URL) ga yozadi va
# Telegram webhook'ni qayta o'rnatadi. To'xtatish: Ctrl+C (tunnel ham yopiladi).
#   scripts/tunnel.sh                 # :3000
#   FRONT_PORT=3001 scripts/tunnel.sh
set -u
cd "$(dirname "$0")/.."
PORT=${FRONT_PORT:-3000}
METRICS=127.0.0.1:${TUNNEL_METRICS_PORT:-49321}
LOG=data/tunnel.log

quick_url() {
  curl -s -m 2 "http://$METRICS/quicktunnel" | python3 -c 'import json,sys; h=json.load(sys.stdin).get("hostname",""); print(f"https://{h}" if h else "")' 2>/dev/null
}

PID=""
URL=$(quick_url)
if [[ -n "$URL" ]]; then
  # oldingi tunnel hali ishlayapti (skript to'xtagan, cloudflared qolgan) — manzili o'sha, yangisini ochmaymiz
  echo "Tunnel allaqachon ishlayapti: $URL (to'xtatish: pkill -f 'cloudflared tunnel --no-autoupdate')"
else
  cloudflared tunnel --no-autoupdate --url "http://localhost:$PORT" --metrics "$METRICS" >"$LOG" 2>&1 &
  PID=$!
  trap 'kill $PID 2>/dev/null' EXIT INT TERM
fi

for _ in {1..60}; do
  [[ -n "$URL" ]] && break
  kill -0 $PID 2>/dev/null || { echo "cloudflared to'xtadi:"; tail -5 "$LOG"; exit 1; }
  URL=$(quick_url)
  sleep 1
done
[[ -n "$URL" ]] || { echo "Tunnel manzili olinmadi ($LOG)"; exit 1; }
echo "Tunnel: $URL"

# .env.local → JARVIS_PUBLIC_URL (bor bo'lsa almashtiriladi, yo'q bo'lsa qo'shiladi)
python3 - "$URL" <<'PY'
import re, sys
from pathlib import Path
p, url = Path(".env.local"), sys.argv[1]
t = p.read_text() if p.exists() else ""
line = f"JARVIS_PUBLIC_URL={url}"
t = re.sub(r"(?m)^JARVIS_PUBLIC_URL=.*$", line, t) if re.search(r"(?m)^JARVIS_PUBLIC_URL=", t) else t.rstrip("\n") + f"\n{line}\n"
p.write_text(t)
PY

# DNS tarqalishini kutish, keyin webhook (Telegram manzilni tekshiradi — bir necha urinish)
for _ in {1..30}; do
  [[ $(curl -s -o /dev/null -m 5 -w "%{http_code}" "$URL/app/") != "000" ]] && break
  sleep 2
done
if grep -q '^TELEGRAM_BOT_TOKEN=.' .env.local; then
  for i in {1..5}; do
    uv run --quiet python manage.py set_webhook --url "$URL" && break
    echo "webhook: qayta urinish ($i)"; sleep 5
  done
fi
# CRM: sotuvchilar Telegram'i (alohida Business bot)
if grep -q '^BUSINESS_CONNECTION_BOT_TOKEN=.' .env.local; then
  for i in {1..5}; do
    uv run --quiet python manage.py crm_tg_webhook --url "$URL" && break
    echo "crm webhook: qayta urinish ($i)"; sleep 5
  done
fi
  # TG CRM — Business bot menyusidagi Web App tugmasi (manzil tunnel bilan o'zgaradi)
  uv run --quiet python manage.py tgcrm_menu_button --url "$URL" || echo "TG CRM menyu tugmasi o'rnatilmadi"
echo "Tayyor: $URL/app/  (to'xtatish — Ctrl+C)"
[[ -n "$PID" ]] && wait $PID

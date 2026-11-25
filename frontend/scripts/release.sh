#!/bin/zsh
# Frontend (Next.js statik eksport) build → frontend/releases/<vaqt>/ → frontend/current (atomar symlink).
# Oldingi release'ning _next/static fayllari yangisiga qo'shiladi (ustiga yozilmaydi): ochiq Telegram WebView'lar
# eski chunk'larni so'rasa ham topsin. Oxirgi 5 release saqlanadi. Backend restart shart emas (HTML no-cache).
#   frontend/scripts/release.sh          # build + almashtirish
# Yangi sahifani yoqish: backend/.env → JARVIS_UI_NEXT=report[,admin,lenta] + backend/scripts/safe_restart.sh
set -eu
cd "$(dirname "$0")/.."
# out/ — faqat oraliq natija: releases/ ga nusxalangach (yoki xato bo'lsa ham) o'chiriladi
trap 'rm -rf out' EXIT
TS=$(date +%Y%m%d-%H%M%S)
REL="releases/$TS"

# nvm skriptda funksiya sifatida yuklanmaydi — versiya faqat tekshiriladi (o'zgartirilmaydi)
if [ -f .nvmrc ] && [ "$(node -v | sed 's/^v//; s/\..*//')" != "$(sed 's/^v//; s/\..*//' .nvmrc)" ]; then
  echo "Ogohlantirish: node $(node -v), .nvmrc talabi $(cat .nvmrc)"
fi
npm ci --no-audit --no-fund --loglevel=error
npm run lint
npm test --silent
LOG=$(mktemp -t frontend-build)
npm run build >"$LOG" 2>&1 || { cat "$LOG"; echo "build yiqildi"; exit 1; }
# backend base.UI_PAGES bilan bir xil ro'yxat — yangi sahifa qo'shilsa shu yerga ham
PAGES=(index.html jarvis/index.html dev/index.html report/index.html lenta/index.html geo/index.html geo/share/index.html erp/index.html erp/sex/index.html erp/crm/index.html erp/logistics/index.html erp/moliya/index.html erp/marketplace/index.html erp/ombor/index.html analytics/index.html staff/index.html templates/index.html tgcrm/index.html)
for p in "${PAGES[@]}"; do
  [ -f "out/$p" ] || { tail -n 40 "$LOG"; echo "build natijasi to'liq emas: out/$p yo'q"; exit 1; }
done
rm -f "$LOG"

mkdir -p releases
cp -R out "$REL"
if [ -L current ] && [ -d "$(readlink current)/_next/static" ]; then
  rsync -a --ignore-existing "$(readlink current)/_next/static/" "$REL/_next/static/"
fi
ln -sfn "$REL" current.tmp && mv -fh current.tmp current
echo "Frontend: $(readlink current)"
ls -1dt releases/* | tail -n +6 | xargs rm -rf   # eng yangi 5 tasi qoladi

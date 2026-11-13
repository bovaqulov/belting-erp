# Belting ERP

Jarvis (`~/Desktop/jarvis`) loyihasining qayta qurilgan nusxasi. Asl loyiha O'ZGARTIRILMAYDI — undan faqat o'qiladi.

Tartib: 1) frontend Next.js'ga to'liq ko'chadi va dizaynlar to'g'rilanadi; 2) keyin backend ko'chiriladi va ulanadi.

- `frontend/` — Next.js (statik eksport, `/app`). Tuzilma va qoidalar: [frontend/ARCHITECTURE.md](frontend/ARCHITECTURE.md)
- `backend/` — Django + Celery/Redis, baza: SQLite (demo) / PostgreSQL (prod, `DATABASE_URL`); applar `backend/config/apps/<app>` (frontend domenlari bilan bir xil).
  Tuzilma, ishga tushirish, buyruqlar: [backend/README.md](backend/README.md). API kelishuvlari: `docs/api/`.
  Jarvis (agentlar) — to'liq; qolgan applar skelet.

## Skill'lar (`.claude/skills/`)

UI ishida avval `belting-design` (loyiha dizayn tizimi — ziddiyatda u ustun), keyin kerakli bo'yicha:
`frontend-design` (Anthropic), `vercel-react-best-practices`, `vercel-composition-patterns`, `web-design-guidelines`.
Next.js 16 API'lari uchun — `frontend/node_modules/next/dist/docs/` (frontend/AGENTS.md).

## Tekshiruv (har o'zgarishdan keyin)

Backend: `backend/scripts/check.sh` (uv + ruff + ty + pytest-testmon; paketlar — `uv add`, pip emas).
Frontend (`frontend/` da):

```bash
npx tsc --noEmit -p . && npx eslint . && npm test && rm -rf .next out && npm run build && rm -rf out
```
Moslashuvchanlik majburiy: 360, 390, 768, 1024, 1440 px — gorizontal aylantirish yo'q, telefonda bosish maydoni ≥44px.

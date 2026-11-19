# Frontend — Belting ERP (Next.js, statik eksport)

Belting ERP va Jarvis (firma agentlari) veb-interfeysi: Telegram Mini App va kompyuter brauzeri uchun.
Next.js 16 + React 19, statik eksport (`output: "export"`, `basePath: "/app"`, `trailingSlash`). SSR va API route'lari
yo'q — barcha ma'lumot backend'dan (`../backend`, Django) `/app/api/*` orqali olinadi, bitta domen.

## Sahifalar

| Manzil | Nima |
|---|---|
| `/app` | Bosh sahifa: kirish va bo'limlar |
| `/app/jarvis` | Jarvis: chat, agentlar, xotira, bilimlar |
| `/app/erp/staff` | Xodimlar (HR, ERP moduli) |
| `/app/templates` | Hisobot shablonlari |
| `/app/report` | Kunlik hisobot |
| `/app/erp/sex` | Kesish sexi |
| `/app/lenta` | Konveyer lenta chizmasi |
| `/app/geo`, `/app/geo/share` | Mijozlar xaritasi va ulashish |
| `/app/analytics` | Analitika |
| `/app/dev` | Ishlab chiquvchi sahifasi |

## Ishlab chiqish

```bash
nvm use            # Node 24 (.nvmrc)
npm ci
npm run dev        # http://localhost:3000/app/
npm test           # Vitest (src/**/*.test.ts)
npm run lint
```

`npm run dev` `/app/api/*` so'rovlarini backend'ga proksi qiladi: `JARVIS_BACKEND`, standart `http://127.0.0.1:8000`.
Backend'ni avval ishga tushiring: `cd ../backend && scripts/dev.sh` (batafsil — [../backend/README.md](../backend/README.md)).

Kirish: Telegram Mini App ichida — `initData` bilan avtomatik. Brauzerda — bot orqali tasdiqlash yoki dev uchun
bir martalik havola: `cd ../backend && uv run python manage.py login_link <tg_id> --base http://localhost:3000`.
Telefon yoki Telegram'dan sinash uchun tashqi manzil: `../backend/scripts/tunnel.sh`.

## Tekshiruv (har o'zgarishdan keyin)

```bash
npx tsc --noEmit -p . && npx eslint . && npm test && rm -rf .next out && npm run build && rm -rf out
```

Moslashuvchanlik: 360, 390, 768, 1024, 1440 px — gorizontal aylantirish yo'q, telefonda bosish maydoni ≥44px.

## Build va release

```bash
scripts/release.sh            # lint + test + build → releases/<vaqt>/ → current (atomar symlink, oxirgi 5 tasi saqlanadi)
```

`out/` faqat build paytida bir lahza paydo bo'ladi: tekshiruv va `release.sh` undan keyin uni o'chiradi —
production fayllari faqat `releases/` va `current` da turadi. `release.sh` oldingi release'ning `_next/static` fayllarini saqlab qoladi — ochiq Telegram WebView'lar eski chunk'larni
so'rasa ham topadi. Yangi sahifa qo'shilsa, skriptdagi `PAGES` ro'yxatiga ham yoziladi.

> Belting backend hali `current/` ni o'zi bermaydi: prod'da `/app/*` statik fayllarini veb-server (masalan, nginx)
> `frontend/current/` dan, `/app/api/*` ni esa backend'dan berishi kerak.

## Tuzilma

Batafsil: [ARCHITECTURE.md](ARCHITECTURE.md). Qisqasi: `app/` — faqat marshrut o'rami, kod `src/<domen>/` da
(`shared`, `home`, `ai`, `erp/*`, `conveyor`, `geomap`; nomlar inglizcha), import `@/…` → `src/…`.
Dizayn tizimi — `belting-design` skill'i (`../.claude/skills/belting-design/`).

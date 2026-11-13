# Belting dizayn tokenlari

Manba: `backend/src/jarvis/office/web/static/erp_ui.css` (`:root` va "Dizayn asosi" bo'limi). Yangi rang/o'lcham
ixtiro qilma — shu ro'yxatdan ol; yetmasa, avval shu yerga va erp_ui.css'ga qo'sh.

## Ranglar (Telegram mavzusidan — ichida `--tg-theme-*`, brauzerda Night/Day)

| Token | Vazifa |
|---|---|
| `--page` | sahifa foni |
| `--sec` | ro'yxat/kartochka foni |
| `--text` | asosiy matn, muhim qiymatlar (o'lcham, miqdor) |
| `--sub` | ikkinchi darajali matn (mijoz nomi, izoh) |
| `--hint` | uchinchi daraja (sana, birlik "mm") — muhim raqamga ishlatma |
| `--link`, `--btn`, `--btn-text` | havola, asosiy tugma |
| `--sep`, `--fill` | ajratgich, bosilganda/inaktiv fon |
| `--ok`, `--warn`, `--danger` | umumiy signal |

## Holat (ma'no hamma sahifada bir xil; doim matn yoki ikonka bilan birga)

| Token | Hex | Ma'no | Qayerda |
|---|---|---|---|
| `--st-new` | #3e88f7 | yangi, kutilmoqda | sex "Yangi", yangi lid |
| `--st-work` | #e8961f | jarayonda, yig'ilmoqda | sex "Yig'ilmoqda", qisman |
| `--st-make` | #9a5bea | tayyorlanmoqda | sex "Tayyorlanmoqda" |
| `--st-done` | = --ok | tayyor, to'liq | sex "Tayyor", to'langan |
| `--st-bad` | = --danger | kechikkan, xato, brak | muddat o'tgan, kamomad |

Yorug' rejim (brauzer Day va Telegram `tg-light`) — shu tuslarning to'q varianti, oq fonda va `.st` 14% fonida
≥4.5:1 (2026-11-13 audit): `--ok` #20772d, `--warn` #925d07, `--st-new` #0960e2, `--st-work` #925d0f,
`--st-make` #873be6, brauzerda `--danger` #ca131d. Qorong'i rejimda — jadvaldagi asl ranglar.

Komponent: `<span class="st bad">kechikdi 14.11.26</span>` (nuqta + matn). Tovar turi (xom ashyo/tayyor/tovar)
holat EMAS — neytral `.tag`.

## Shrift

| Rol | Qiymat |
|---|---|
| Matn | tizim shrifti (-apple-system, SF Pro, Segoe UI, Roboto) — Telegram bilan bir xil |
| Identifikator | `--font-code`: "Barlow SC" (Barlow Semi Condensed 500/600/700, lokal, faqat lotin), `.code` |
| `.code.lg` | 1.3em — joy kodi, remen belgisi kartochkada |
| `.code.xl` | 1.75em, 700 — o'lcham/miqdor qahramon raqami (sex) |
| Sex kartochkasi | zakaz raqami 18px code, o'lcham 30px code, birlik `<small>` 17px --sub |
| Sarlavha | `.large` 28px/700; kompyuter `.dk-head h1` 27px |

`.code` faqat lotin identifikatorlarga: `1040-8M`, `A-01-3`, `P00000123`, `BR-BU-26-00031`, `20 mm`, `800 × 12000`.
Kirill tovar nomi ("Рукав …") — oddiy matn.

## O'lcham, radius, soya

| Token | Qiymat | Ishlatish |
|---|---|---|
| `--r-s` | 8px | ikonka kvadrati, kichik tugma |
| `--r-m` | 12px | ro'yxat, kartochka (ichki) |
| `--r-l` | 16px | ustun/panel (tashqi) — ichki ≤ tashqi |
| `--sh-1` | 1px soya + 1px halqa | ko'tarilgan kartochka (sex) |
| `--sh-2` | ikki qatlamli | sheet, popover, suzuvchi |
| `--focus` | --link 75% | `:focus-visible` halqasi 2px, offset 2px |
| Bosish maydoni | telefon ≥44px (`pointer: coarse`: .mini, .chip, .icon-btn, .back, sheet tugmalari; tab 40px), kompyuter ≥32px | |
| Gorizontal chekka | telefon 16px, kompyuter 24–36px | |

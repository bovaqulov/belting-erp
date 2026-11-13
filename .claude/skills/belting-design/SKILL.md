---
name: belting-design
description: Belting ERP / Agent veb-interfeyslarini loyihalash va redizayn qilish (ombor, sex, savdo, katalog, CRM, moliya, admin; Telegram Mini App va kompyuter). Yangi sahifa yoki komponent yasashda, mavjud ekranni "chiroyliroq / qulayroq / professional" qilishda, UI ko'rib chiqishda, dizayn tokenlari, ranglar, shrift, bo'sh holat, jadval, forma, sex ekrani haqida savolda ishlat. erp_ui.css, erp_ui.js, static/erp_*.html, frontend/ Next.js sahifalariga tegishli har qanday vizual ish shu skill bilan boshlanadi.
---

# Belting dizayn tizimi

Manbalar (2026-11-12 yig'ilgan): Anthropic `frontend-design` skill (o'ziga xos yo'nalish, shablon belgilaridan qochish,
skrinshot bilan o'z-o'zini tanqid), Vercel Web Interface Guidelines (MUST/NEVER qoidalar), ECC
`make-interfaces-feel-better` (mayda sayqal), ECC `dashboard-builder` (panel — operator savoliga javob). Bu skill
ularni shu loyihaga moslab birlashtiradi. Qoidalar ziddiyatida — shu fayl ustun.

## 1. Kim, nima uchun (dizayn shundan boshlanadi)

Belting — sanoat remenlari (tishli, klinli, poliklinli), rukav va konveyer lentalari: savdo, ombor, kesish sexi,
marketplace. Foydalanuvchilar:

| Kim | Qayerda | Nima kerak |
|---|---|---|
| Omborchi | telefon, Telegram Mini App, qo'lqopda, yurib | katta tugma, skaner, aniq "qayerga qo'yish", bitta asosiy amal |
| Sex ishchisi | sex kompyuteri/TV, 2–3 m dan | uzoqdan o'qiladigan zakaz raqami, o'lcham, holat rangi |
| Sotuvchi | telefon va kompyuter | mijoz, narx, qoldiq — tez |
| Rahbariyat | kompyuter | raqamlar, kechikish, xavf — bir qarashda |

Til: o'zbek (lotin), sentence case, oddiy fe'l. Tovar nomlari ko'pincha ruscha/kirill (1C dan) — o'zgartirilmaydi.

## 2. Yo'nalish: "ombor yorlig'i aniqligi"

Asos — Telegram uslubi (egasi talabi, 2026-11-12): sozlamalar ro'yxatlari, `--tg-theme-*` ranglari, MainButton,
BackButton. Uni buzma. O'ziga xoslik **bitta joyda**: texnik identifikatorlar (remen belgisi `1040-8M`, joy
`A-01-3`, birlik `P00000123`, buyurtma `BR-BU-26-00031`, o'lcham `20 mm`) — `.code` sinfi: Barlow Semi Condensed
(DIN uslubidagi muhandislik shrifti, lokal `/app/erp/fonts/`), teng kenglikdagi raqamlar, biroz ochiq harf oralig'i.
Xuddi omborda javonga yopishtirilgan yorliqdagidek. Qolgan hamma narsa tinch va intizomli.

Holat ranglari (barcha sahifalarda bir xil ma'no — rangning o'zi emas, matn/ikonka ham bo'lsin):

| Token | Ma'no |
|---|---|
| `--st-new` | yangi, kutilmoqda (ko'k) |
| `--st-work` | jarayonda, yig'ilmoqda (amber) |
| `--st-make` | tayyorlanmoqda (binafsha) |
| `--st-done` | tayyor, to'g'ri (yashil) |
| `--st-bad` | kechikkan, xato, brak (qizil) |

Batafsil tokenlar: `references/tokens.md`.

## 3. Qilma (shablon belgilari)

- Har sarlavha ustida KATTA HARFLI kichik yorliq; har narsani bir xil yumaloq kartochkaga bo'lish; bezak gradientlar.
- Bitta so'zni rang/qalinlik bilan ajratish; `→` ni har tugma matniga qo'shish; dekorativ raqamlash (01/02/03) —
  faqat haqiqiy ketma-ketlikda (sex bosqichlari — ha).
- Har kartochkaga hover-animatsiya, har bo'limga "fade-in". Harakat faqat foydalanuvchi amaliga javob.
- `transition: all`, `outline: none` (o'rnini bosuvchi fokus halqasisiz), faqat rang bilan holat.
- Yangi CSS fayl/kutubxona (Tailwind, React) ERP static sahifalariga — yo'q. `erp_ui.css` + `window.UI` yetadi.

## 4. Majburiy sifat (Vercel/ECC dan, shu loyiha uchun)

- Fokus: `:focus-visible` halqasi hamma tugma/havola/inputda (erp_ui.css'da global).
- Bosish maydoni: telefonda ≥44px (`.mini`, ikonka tugmalar), kompyuterda ≥32px.
- Raqamlar: miqdor, narx, sana, kod — `tabular-nums` (`.num`, `.code`).
- Uzun matn: `.wrap2` yoki ellipsis; flex bolasida `min-width: 0`.
- Bo'sh, yuklanmoqda, xato holatlari — har ro'yxatda (`UI.empty`, `.skel`); bo'sh holat keyingi qadamni aytadi.
- Xato matni: nima bo'ldi + qanday tuzatish ("A-01-3 — Blok B, sizning blokingiz emas (javobgar: Akmal)").
- Harakat: faqat `transform`/`opacity`, `prefers-reduced-motion` hurmat qilinadi (global).
- Kontrast: matn `--text`/`--sub`; `--hint` faqat ikkinchi darajali; qorong'i va yorug' rejimda tekshir.
- Telegram ichida zoom o'chiq (`user-scalable=no`) — ilova kabi ishlashi uchun egasi qarori; brauzerda qoldirilgan.
  Input `font-size ≥16px` (iOS zoom bo'lmasin) saqlansin.

## 5. Ish tartibi (har dizayn vazifasi)

1. **Savol**: ekran kim uchun va asosiy bitta amal nima? (sex: "qaysi zakaz, qanday o'lcham, keyingi qadam").
2. **Oldin skrinshot**: `scripts/shoot.js` — API soxta ma'lumot bilan, kompyuter (1440) va telefon (390) o'lchamida.
   Production tokeni yasama; haqiqiy API'ga yozma.
3. **Reja**: o'zgarishni tokenlar/komponentlar darajasida yoz (yangi rang ixtiro qilma — `tokens.md`).
4. **Qur**: avval umumiy `erp_ui.css`/`erp_ui.js` (hamma sahifaga foyda), keyin sahifa `<style>`.
   Sahifa ichidagi desktop stillari (`body.desk …`) har sahifada o'z nusxasi — mavjud tartib, buzma.
5. **Keyin skrinshot va tanqid**: `references/checklist.md` bo'yicha; "bitta aksessuarni olib tashla".
6. **Tekshir**: `node -e` bilan sahifa skriptlari sintaksisi; Python o'zgarsa `scripts/check.sh`; JS xatosi 0.

## 6. Komponentlar (mavjud, qayta ishlat)

`UI.row/list/sh/sf/empty/badge/seg/sheet/pick/prompt/main/toast/scanQR` (erp_ui.js), `.tiles/.tile`, `.dt` jadval,
`.dk` kompyuter karkasi, `.kb` sex taxtasi, `.flow` bosqichlar, `.code` identifikator, `.st-*` holat belgisi.
Yangi komponent kerak bo'lsa — avval erp_ui.css'ga umumiy qilib qo'sh, keyin ishlat.

## 7. Frontend (Next.js, `frontend/`)

Admin, lenta, geo, report — o'z CSS modullari bor. Xuddi shu tokenlar va qoidalar; `.code` o'rniga o'sha
loyihadagi monospace/raqam uslubini Barlow'ga moslash — alohida vazifa sifatida.

## 8. Skrinshot

Playwright MCP `browser_run_code_unsafe` → `filename: <loyiha>/.claude/skills/belting-design/scripts/shoot.js`.
Natija `.playwright-mcp/shots/*.png` (gitignore'da), qaytgan qiymat — sahifa JS xatolari (bo'sh bo'lsin). Faqat bir
nechta sahifa: fayl boshidagi `ONLY`. Yangi sahifa/maydon — `FX` ga soxta javob va `shot(...)` qatori qo'sh.

## 9. Redizayn holati (yangilab bor)

2026-11-12 — 1-bosqich:
- erp_ui.css: Barlow SC (`/app/erp/fonts/`, erp_setup_api.py), `.code`, `.st`, holat/radius/soya/fokus tokenlari,
  `:focus-visible`, `pointer: coarse` bosish maydoni, `prefers-reduced-motion`, `text-wrap`, toast transition.
- Sex (erp_sex.html): to'liq kenglik taxta, ustun holat rangi, zakaz raqami/o'lcham `.code`, muddat `.st`,
  klaviatura (Enter); zakaz sahifasida o'lcham/soni `.code.xl`, joy kodi `.code`.
- Katalog: remen belgisi, stellaj/joy kodlari `.code`. Ombor "Joylash": joy kodi `.code.lg`; TDZ xatosi tuzatildi.

2026-11-13 — sex: bir nechta zakazni tanlash (taxta va telefon; ustun bo'yicha "hammasi", "O'xshashlari"),
guruh ekrani `grp` (jami material, bitta skanerdan ulushlab sarf, birga tayyor — stikerlar bitta PDF);
API `/app/api/erp/shop/group[/accept|take|collected|ready|sticker]` (shopflow.*_many). Tanlov `.ck` checkbox.

2026-11-13 — Next.js'ga ko'chish boshlandi (egasi: bosqichma-bosqich). UI to'plami `frontend/components/erp/ui.tsx`
(Row/List/Sh/Sf/Empty/Seg/Sheet/MainButton/Shell/useNav/useLoad), `frontend/lib/erp/{env,fmt,icons}.ts`; CSS — backend'dagi
`/app/erp/ui.css` (bitta manba). Sex — `frontend/app/erp/sex/` (production'da `JARVIS_UI_NEXT=…,erp_sex`; eski erp_sex.html
zaxira). Yangi sahifa: `base.UI_PAGES` + sahifa marshrutida `ui_page("erp_x", …)` + release.sh tekshiruvi + `.env` bayrog'i.
Skrinshot selektorlari uchun React'da ham `data-seg/data-k/data-j/data-sb`, `#mainbtn`, `#ml` saqlanadi.
Ko'chish tartibi: ombor → savdo → yig'ish → katalog → bosh sahifa → CRM, xarid, moliya, marketplace → admin.

2026-11-13 — audit: yorug' rejim holat ranglari (≥4.5:1, tokens.md), `pointer: coarse` bosish maydoni 44px
(.mini/.chip/.icon-btn/.back/sheet), zoom faqat Telegram ichida o'chiq (erp_ui.js, lib/telegram `lockZoom`), `Seg` →
`aria-pressed`, `Loaded` — "Qayta urinish", sex taxtasida "Yangilanmadi · HH:MM", `apiBlob/openBlob` (lib/api).

2026-11-14 — Ombor Next.js'ga ko'chdi (`frontend/src/erp/warehouse/`, `/app/erp/ombor`): 11 bo'lim, backend'siz demo rejim
(`docs/api/warehouse.md`). Skaner xabari — `.wh-msg` (yashil/qizil, `--st-done`/`--st-bad`), joy/birlik/o'lcham — `.code`,
kompyuterda ikki ustun (`Split`), telefonda 6 tab + "Amallar". Kit: `Tbl` ga `sel` (tanlangan qator `.picked`).

Keyingi (ustuvorlik bo'yicha): savdo (erp_savdo.html — mijoz/buyurtma kartochkasi, narx, kenglik tanlash) →
yig'ish (erp_yigish.html — omborchi telefoni) → ombor qolgan tablar (sanash, qabul, skaner natijasi) →
bosh sahifa (erp_home.html — rolga qarab "bugun nima qilish kerak") → CRM, moliya, marketplace (kompyuter jadvallari) →
frontend/ (Next.js admin, lenta, geo).

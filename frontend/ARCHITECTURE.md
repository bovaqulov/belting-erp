# Frontend arxitekturasi

Next 16.4.5, statik eksport (`output: "export"`, `basePath: "/app"`, `trailingSlash: true`). URL'lar o'zgarmaydi —
backend `/app/*` ni `out/` dan beradi, ma'lumot faqat `/app/api/*` dan.

## Qoidalar

1. **`app/` — faqat marshrut o'rami.** `page.tsx` / `layout.tsx` metadata + bitta komponentni chaqiradi. Mantiq, holat,
   CSS — `src/<domen>/` da. `src/app/` HECH QACHON yaratilmaydi (Next root `app/` ni tanlaydi).
2. **Bitta tizim — bitta papka.** Domenlar: `ai`, `erp/*`, `conveyor`, `geomap`, `analytics` (+ `shared`, `home`). **`src/` dagi papka va fayl nomlari — inglizcha**;
   `app/` papkalari esa URL (`/app/erp/sex`, `/app/lenta` …) — ular o'zgarmaydi.
3. **Bog'liqlik yo'nalishi:** `shared` ← domenlar ← `app/`. `shared` hech qaysi domenni import qilmaydi;
   domen boshqa domenni import qilmaydi (umumiy narsa kerak bo'lsa — `shared` ga ko'chiriladi).
4. **Importlar:** boshqa papkadan — `@/…` (`@/*` → `./src/*`), bir papka ichida — `./…`. `../` ishlatilmaydi.
5. **Qism = papka (`index.tsx` + `ui.tsx`).** Har bir UI qismi — `kebab-case/` papka:
   - `index.tsx` — qismning "miyasi" va **yagona kirish nuqtasi**: holat, effektlar, ma'lumot yuklash, API, amallar;
     o'zi chizmaydi — `ui.tsx` ga props beradi. Tashqaridan faqat papka orqali: `@/erp/crm/deals/board`
     (`…/board/ui` — HECH QACHON). Ko'rinish komponentini boshqa qism ishlatsa — `index.tsx` uni qayta eksport qiladi.
   - `ui.tsx` — **faqat ko'rinish**: props → JSX. Mahalliy vizual holat (ochiq/yopiq, belgilash oynasi) mumkin;
     API, kontekst, global holat, ma'lumot yuklash, toast/confirm — YO'Q (ular `index.tsx` da).
   - Ichki qismlar xuddi shunday ichma-ich (`deal/items/`, `deal/activity/`).
   - UI'siz papkalar (`api/`, `demo/`, `lib/`, `context/`) — kirish nuqtasi `index.ts(x)`, `ui.tsx` shart emas;
     `index` aniq nomlarni eksport qiladi (`export *` — yo'q).
   - Chegaralar ESLint'da majburiy (`eslint.config.mjs`, `no-restricted-imports`): domenlararo import, ERP modullari
     orasidagi import, qismning `ui` fayliga to'g'ridan-to'g'ri murojaat va `../` — xato.
   - Qism ichida qo'shimcha ko'rinish fayli bo'lishi mumkin (masalan `art.tsx` — rasmlar) — uni faqat o'sha qismning
     `ui.tsx` i import qiladi.
   - Sof mantiq — `*.lib.ts`, test — yonida `*.lib.test.ts`.
   Namuna: `src/erp/crm/`, `src/erp/workshop/`. Ko'chgan: hammasi — home, ai (Jarvis), erp/home, erp/crm, erp/workshop, erp/warehouse, conveyor, geomap (analytics — joy egallovchi); yangi kod — darhol shu tartibda.
6. **CSS:** domen uslubi o'z papkasida (`*.module.css` yoki domen global CSS). Umumiy tokenlar — `shared/styles/`.

## Daraxt

```
frontend/
  app/                          marshrutlar (yupqa o'ram)
    layout.tsx page.tsx         / — bo'lim tanlash (Launcher)
    jarvis/                     Jarvis — faqat AI: agentlar, xotira, bilimlar, graph → @/ai/shell area=jarvis
    staff/                      xodimlar                          → Shell area=staff
    templates/                  hisobot shablonlari               → Shell area=templates
    dev/                        texnik: audit, tizim              → Shell area=dev
    report/                     kunlik hisobot                    → @/ai/report
    lenta/                      lenta chizmasi                    → @/conveyor
    geo/ geo/share/             mijozlar xaritasi                 → @/geomap, @/geomap/share
    analytics/                  analitika (⏳ joy egallovchi)     → @/analytics/AnalyticsApp
    erp/page.tsx                ERP bosh sahifasi (modullar)       → @/erp/home
    erp/layout.tsx  erp/sex/    ERP                               → @/erp/workshop
    erp/crm/                    CRM                               → @/erp/crm
    erp/marketplace/            Marketplace                       → @/erp/marketplace
    erp/ombor/                  Ombor (Warehouse)                 → @/erp/warehouse
    erp/moliya/                 Accounting (Mahsulotlar, Shartnomalar, Maoshlar) → @/erp/finance
    erp/logistics/              logistika                         → @/erp/logistics
  src/
    shared/                     domenlarga bog'liq emas
      api/client.ts             fetch, ApiError, apiBlob/openBlob
      auth/erp-access.ts        ERP ruxsatlari
      telegram/telegram.ts      WebApp o'rami, zoom
      icons/lucide.ts           YAGONA ikonka to'plami (Lucide, [teg, atributlar]) — panel, ERP kit, lenta shu yerdan
      demo/                     backend'siz modullar uchun demo rejim: rejim qarori (404/5xx/tarmoq → demo), localStorage ombori (CRM, Marketplace, Accounting)
      ui/svg-icon.tsx           ui/panel/  (panel UI to'plami, format, panel CSS)  ui/tiles/ (bo'lim kartochkalari)
      styles/globals.css
    home/                       bo'lim tanlash — index.tsx + ui.tsx (+ art.tsx)
    ai/                         Jarvis (umumiy nom) — firma agentlari; har bo'lim — qism = papka (index.tsx + ui.tsx):
      shell/ (login/)           karkas: boot, AdminContext (useAdmin), oynalar, toast, tablar · brauzerda kirish
      agents/ (sheet/ editor/ (access/) schedule/ task/)   agentlar daraxti/ro'yxati, oyna, muharrir, jadval, topshiriq
      users/ (approve/ head-form/ editor/)                 xodimlar daraxti, tasdiqlash, boshliq tayinlash, tahrir
      chat/ memory/ kb/ graph/ audit/ system/ report/ templates/ (editor/)
      org/                      BITTA daraxt: dept-tree.ts (mantiq) + OrgChart (ui) — Agentlar va Xodimlar shu bilan
    erp/
      kit/                      ERP UI to'plami (erp_ui.js'ning React nusxasi; ikonkalar — shared/icons), env, fmt, colors, modal (Modal, useDialogs), layout (AppLayout: chap menyu / telefon tepasi, DemoStrip), table (Tbl), wide (useWide) + kit.css;
                                      workshop/                 ✅ /app/erp/sex — qism = papka: board/ job/ group/ (ekranlar), scan/ take/ (skaner, sarf),
                                common/ (muddat, o'lcham, bosqichlar, material), lib/, api/
      home/        ✅ /app/erp          modullar: CRM, Warehouse (→ ombor), Manufacturing (→ sex), Logistics, Accounting (→ moliya) (index + ui + art)
      warehouse/   ✅ /app/erp/ombor    erp_ombor.html dan, qism = papka, backend'siz — demo rejim (docs/api/warehouse.md):
        index.tsx ui.tsx warehouse.css   ildiz: rejim, ko'rinish (?sec=), menyu (Kundalik/Jarayonlar/Asboblar) | telefonda 6 tab
        api/ demo/ lib/ context.ts       adapter (haqiqiy/demo, stiker/PDF) · brauzer ichidagi backend · turlar va sof mantiq · WhCtx
        scan-bar/ size-ask/ cut/ common/ skaner (navbat, katta xabar, ovoz) · o'lcham oynasi · birlikni kesish · umumiy ko'rinish
        lookup/ lookup-scan/             birlik/tovar/joy kartochkalari · Skaner bo'limi
        panel/ stock/ place/ (item-search/) count/ pick/ accept/ bag/ (ko'chirish + hisobdan chiqarish) cut-plan/ cells/ more/
      picking/     ⏳ /app/erp/yigish   erp_yigish.html   (236)       yig'ish (MP buyurtma terish)
      purchasing/  ⏳ /app/erp/xarid    erp_xarid.html    (169)       xarid
      sales/       ⏳ /app/erp/savdo    erp_savdo.html    (351)       savdo
      finance/     ✅ /app/erp/moliya   Accounting — 3 alohida qism (hub: 3 kartochka), backend'siz — demo rejim (docs/api/catalog.md, accounting.md):
        index.tsx ui.tsx finance.css  ildiz: rejim, kategoriyalar, ko'rinish (?a=&sec=) | karkas (kit/layout)
        api/ demo/ lib/ context.ts    adapter · brauzer ichidagi backend (catalog + contracts.lib + payroll.lib) · sof mantiq · AccCtx
        hub/                          3 kartochka (rasm + jonli holat)
        products/ (form view) groups/ Mahsulotlar: tovarlar, kategoriyalar (/app/api/erp/cat/*)
        contracts/ (form cp)          Shartnomalar: holat (imzosiz/amalda/tugayapti/o'tgan/yopilgan), kontragent tanlagich
        payroll/ (month staff)        Maoshlar (faqat admin/owner): oylik hisob qoralama → tasdiq → to'lov, xodimlar
      marketplace/ 🟡 /app/erp/marketplace — ERP moduli (erp_mp.html dan), qism = papka, backend'siz — demo rejim (docs/api/marketplace.md):
        index.tsx ui.tsx marketplace.css   ildiz: rejim, ko'rinish (?ch=&sec=), menyu raqamlari | karkas: chap menyu / segment + tablar
        api/ demo/ lib/ context.ts         adapter (haqiqiy/demo) · brauzer ichidagi backend · turlar va sof mantiq · MkCtx
        overview/                          Umumiy: kanallar, bugun, kartochka auditi
        orders/ order/ wb/                 buyurtmalar (Ozon/Uzum taxtasi) · yig'ish oynasi (skaner) · WB postavkalari
        soon/ print.ts                     ko'chmagan bo'limlar · chop etish
        ✅ Umumiy, Buyurtmalar · ⏳ Tovarlar, Narx siyosati, Qoldiq, Sharhlar
      logistics/   ✅ /app/erp/logistics  yetkazish: EMU, Yandex Go, Bito, Fargo (ro'yxat; API ulanmagan)
      (katalog — Accounting › Tovarlar ga ko'chdi; ombor tuzilmasi — warehouse'da)
      crm/         ✅ /app/erp/crm      erp_crm.html      (800)       qism = papka (index.tsx + ui.tsx), backend'siz — demo rejim:
        index.tsx ui.tsx  crm.css     ildiz: rejim, bo'limlar (?tab), bitim paneli (?deal), Esc | sarlavha, demo belgisi
        api/  demo/  lib/  context/   adapter (haqiqiy/demo) · brauzer ichidagi backend · turlar va sof mantiq · CrmCtx, moveTo
        badges/                       avatar, vazifa, teglar
        deals/ (board/ list/)         bitimlar: voronka, filtrlar, Smart View, banner · kanban · ro'yxat (+ommaviy amallar)
        deal/ (items/ activity/)      bitim paneli · tovarlar → taklif/buyurtma · yozuvlar va tarix
        leads/ goals/ views/ new-deal/
    conveyor/                   lenta chizmasi — qism = papka; holat — Lenta kontrolleri (model/: controller + useLenta):
      index.tsx ui.tsx          qobiq: boot, kirish, pastki panel, narx, oynalar, to'liq ekran, toast
      form/ (fields/ params/ composer/ customer/)   chap panel; fields/ — Lenta'ga bog'langan maydonlar (istisno: input
                                va uning L bilan sinxroni bir joyda — index.tsx), atomlar — fields/ui.tsx
      viewer/ fullscreen/       chizma ko'ruvchi, to'liq ekran (imo-ishoralar)
      picker/ meta-ask/ projects/ menu/   pastdan chiqadigan oynalar
      kit/ (c, Icon, observeResize, EmptyRow)  model/  lib/  catcher.ts
    geomap/                     mijozlar xaritasi — qism = papka:
      index.tsx ui.tsx          GeoApp: holat, yuklash, xarita asboblari, ommaviy amallar | karkas (panellar, xarita — slot)
      map/                      MapLibre (imperativ) | konteyner
      filter/ style/            sof ko'rinish (index — qayta eksport)
      widgets/ record/ login/ route/ (route.lib) share-panel/ territory/ (territory.lib)
      share/                    /app/geo/share — ochiq havola
      kit/ (Section, Seg, Toggle, Chips, Btn, Field, Stat, Bars, Empty, Spin)  lib/  styles/
    analytics/                  ⏳ mazmuni kelishilmagan
  vitest.config.mts             alias @ → src, testlar: src/**/*.test.ts
```

⏳ — eski static sahifa hali backend'da (`jarvis/backend/src/jarvis/office/web/static/`). Ko'chirishda: `src/erp/<modul>/`
ga komponentlar, `app/erp/<url>/page.tsx` o'ram, `scripts/release.sh` dagi `PAGES` ro'yxatiga qo'shiladi.

## Ma'lum qarz

- Qoida 3 dan istisnolar: `home/index.tsx` → `@/ai/shell` (`LoginView`, `Me`) — keyinroq `shared/auth/` ga o'tadi.
- `app/erp/layout.tsx` umumiy uslubni backend'dan oladi (`/app/erp/ui.css`, Barlow SC shriftlari `/app/erp/fonts/`).
  ERP sahifalari to'liq ko'chgach — `src/erp/kit/` ga o'tadi.
- Reja: bitta API mijozi, bitta login oqimi, ikonkalar/tokenlar birlashuvi,
  katta fayllarni bo'lish (geo.css 1172, GeoApp 723, conveyor controller 676 …), o'lik kod.

## Tekshiruv

```bash
npx tsc --noEmit -p . && npx eslint . && npm test && rm -rf .next out && npm run build && rm -rf out
grep -rnE '@/(components|lib)/|from "\.\./' app src     # bo'sh bo'lishi kerak
```

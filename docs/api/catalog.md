# Katalog API — `/app/api/erp/cat/*` (Accounting › Tovarlar)

Jarvis kontrakti (`office/web/erp_setup_api.py`, mantiq `office/erp/catalog/manage.py`). Frontend: `frontend/src/erp/finance/`
(`/app/erp/moliya`). Backend (belting_erp): `backend/config/apps/erp/catalog/` — modellar (`Group`, `Item`, `Char`; qoldiq — `erp_warehouse.Stock`) va `services.py` (qidiruv, narx — CRM ishlatadi); HTTP API — `views.py` + `ops.py` (mantiq), nom/belgi — `naming.py`
(frontend `lib/catalog.lib.ts` bilan bir xil). Qoidalar frontend demo backendi (`src/erp/finance/demo/server.lib.ts`) bilan bir xil. Demo/haqiqiy tanlovi:
`GET /app/api/erp/me` va `GET /app/api/erp/cat/groups` — 404/5xx/tarmoq → demo.

Xato: `{ "detail": "matn" }` (400 — qoida, 404 — topilmadi, 403 — ruxsat yo'q). Ruxsat: o'qish — ERP modullaridan biriga
kirishi bor har kim (ombor Joylash/qidiruv shu `items` yo'llarini ishlatadi); o'zgartirish — Accounting (buxgalteriya
bo'limi, ega/admin, Rahbariyat). `GET archive` — 1C importi ulanmagan, `[]`. `labels/link` → `{url, count}`: tovarning
omborda stikerli birliklari uchun `labels/units.pdf?ids=…` havolasi (yo'q bo'lsa — 400).

| Yo'l | Javob / qoida |
|---|---|
| `GET groups` | `[{id, parent_id, name, name_ru, attrs: {kind?, dims?, unit?, belt?}, sort, items}]` — avval asosiylar |
| `POST groups` `{id?, parent_id?, name, name_ru?, attrs, sort?}` | kategoriya; 2 daraja (ichki ichida yo'q); bir ota ostida nom takrorlanmaydi |
| `POST groups/{id}/drop` | tovar yoki ichki kategoriya bo'lsa — 400 |
| `POST groups/seed` | tavsiya etilgan 12 kategoriya (bor bo'lsa — o'tkaziladi) → qo'shilganlar |
| `GET items?q=&group_id=&kind=` | `[ItemRow]` (≤200): `{id, name, kind, unit, measured, dims, brand, belt_mark, sku, group_id, grp, parent_grp, material_id, chars, qty, units}`; `q` — nom, belgi ("1040 8M"), artikul; `group_id` — ichkilari bilan |
| `GET items/{id}` | `Item`: + `name_ru, min_qty, ikpu, attrs {dims, family, profile, length, lstd, ribs, series, material_id}, chars [{id, name, width_mm, length_mm}], material, products, stock [{warehouse, firm, loc, code, width_mm, length_mm, qty, char}]` |
| `POST items` `{id?, group_id, kind?, dims?, unit?, profile?, length?, lstd?, ribs?, brand?, series?, name?, sku?, min_qty?, widths?[], material_id?, from_old?}` | `Item`. Nom bo'sh — belgidan (`1040-8M MEGADYNE`, rukav — `Рукав …`); kind/dims — kategoriyadan; birlik dims'dan (`w`→mm, `wl`→m2, `l`→m); faol tovar nomi takrorlanmaydi; omborda harakati bor tovarning birligi o'zgarmaydi |
| `POST items/{id}/widths` `{widths[]}` | kenglik variantlari (0 < w ≤ 5000, takror — o'tkaziladi) → `Item` |
| `POST items/{id}/products` `{group_id, widths[]}` | rukavdan (`dims=w`) tayyor mahsulot: bor bo'lsa — unga kenglik qo'shiladi → `Item` |
| `POST items/{id}/price` `{mode: "piece"\|"mm", price, step_mm?, overrides: {"<kenglik mm>": narx}}` | `Item` (`price` maydoni bilan; `ItemRow` ham `price` qaytaradi). `mm` — narx = 1 mm narxi × kenglik, `step_mm` — kenglik yuqoriga qadamga yaxlitlanadi (5: 6–10 mm bir xil); `overrides` — kenglik bo'yicha qo'lda narx (hisobdan ustun, bo'sh — o'chadi). Narx/qadam ≥ 0. ⚠️ dastlabki versiya — keyin optimallashtiriladi |
| `GET archive?q=` | eski (1C) katalogdan qidirish — `from_old` uchun (frontendda hali yo'q) |
| `POST /app/api/erp/labels/link` `{item_id}` | stiker PDF havolasi `{url, count}` |

Remen belgisi: tishli `<uzunlik>-<profil>` (1040-8M), dyuymli `<uzunlik><profil>` (210XL), klinli `<profil>-<uzunlik> Lp`,
poliklinli `<qovurg'a><profil>-<uzunlik>` (8PK-1795) — `src/erp/finance/lib/catalog.lib.ts` (`beltMark`, `autoName`).

## Texnik oilalar (xalqaro standartlar) — 2026-11-21

Reestr: `backend/config/apps/erp/catalog/specs.py` (frontend formasi — `frontend/src/erp/finance/lib/specs.json`,
`manage.py catalog_specs --export-json` bilan yangilanadi; test bir xilligini tekshiradi). Reja va tadqiqot:
`docs/plans/2026-11-21-catalog.md`.

| Oila (`family`) | Standart | Belgi namunasi | Asosiy maydonlar (`spec`) |
|---|---|---|---|
| `timing` tishli remen | ISO 5296 / 13050 / 17396 | `1040-8M-30`, `270XL`, `610-AT10`, `T10-25 rulon` | profile, length, width, material, cord, build |
| `sleeve` rukav | o'sha | `1040-8M` (nom `Рукав 1040-8M PIX`) | profile, length, material, cord |
| `vbelt` klinli | ISO 4184, DIN 2215/7753 | `SPB-1650 Lp`, `3/B-2000 Li` | section, length, lref (Li/Ld/Lw/Lp/La/Le), build, bands |
| `ribbed` poliklinli | ISO 9982, DIN 7867 | `8PK-1795 Le` | profile, ribs, length, lref |
| `conveyor` rezina lenta | ISO 14890, DIN 22102, ISO 10247 | `EP 400/3 4+2 Y` | carcass, strength, plies, top, bottom, grade, width |
| `light` yengil lenta | ISO 21183-1, FDA / EU 10/2011 | `E 3/1 U0/U0 FDA` | series, cover, thickness, plies, surface, color, food, antistatic |
| `flat`, `modular`, `round`, `profile`, `fastener`, `lagging`, `pulley` | — / ISO 4183, 5294 | seriya / kod | oilaga xos |
| `other`, `service` | — | — | — |

Tovarda: `family`, `spec`, `designation` (standart belgi), `match_key` (analog kaliti: bir xil kalit — o'zaro
almashadi, masalan HTD 8M ≡ RPP8 ≡ SLV8; STD S8M — alohida), `hs_code` (TIF TN; `hs_hint` — taklif), `belt_mark` (remen
oilalarida = designation; ombor/sex/qidiruv), `attrs.barcode`/`barcodes`, `attrs.legacy_codes` (`BR:0Н-…`).

- `POST items` — `{group_id, family, spec, brand, series, name?, name_ru?, sku, barcode, ikpu, hs_code, min_qty, widths}`.
  Nom bo'sh — avtomatik (`<belgi> <BREND> <seriya>`), `name_ru` bo'sh — to'liq ruscha (`Зубчатый ремень 1040-8M PIX`).
  Spec xatosi — 400 (birinchi xato matni). Takror — bir xil `match_key` + brend + birlik: 400. Eski shakl (`profile`,
  `length`, `lstd`, `ribs`) ham qabul qilinadi.
- `GET items?family=&brand=` — qo'shimcha filtrlar; qatorda `family`, `designation`.
- `GET items/<id>` — qo'shimcha: `family_title`, `std`, `spec_view` [{label, value}], `computed` (qadam, tishlar soni,
  remen eni…), `analogs` [{id, name, brand, qty, same_brand}], `legacy`, `barcode`, `hs_code`, `hs_hint`.
- `POST preview` — `{family, spec, brand, series, id?, dims?}` → `{errors, designation, name, name_ru, computed, hs_hint,
  dup, analogs}` (saqlamaydi; forma jonli ko'rinishi).
- `GET duplicates` — [{why, items}]: bir xil belgi + brend + birlik yoki bir xil artikul.
- `GET brands` — faol tovarlar brendlari.

Buyruqlar: `catalog_specs --fill [--dry-run]` — spec'i bo'sh tovarlarni nomdan to'ldirish (`parse.py`);
`catalog_import_1c <office.db> [--dry-run]` — 1C nomenklaturasi (Jarvis `onec_item/onec_char/onec_barcode`): ikki baza
birlashadi, kodlar va shtrixkodlar saqlanadi, takror ishga tushirish xavfsiz.

## Narx siyosati (AppSheet) — 2026-11-21

Mantiq: `backend/config/apps/erp/catalog/pricing.py`; reja va tadqiqot: `docs/plans/2026-11-21-pricing.md`.

- Manba — AppSheet (klinli/poliklinli va tishli remen ilovalari). `PriceSource` — AppSheet qatori (sotuv narxi
  QQSsiz / QQS bilan, tannarx, rukavning birlik tannarxi USD, marja, Li/Lp/La). `Item.price_src` — bog'langan qator
  (oila + moslik sinfi + uzunlik + brend; klinlida uzunlik tizimi ustuni, tizimsiz — Lp; bir nechta seriya — nomdagi
  seriya so'zlari bo'yicha).
- Rukavdan kesiladigan remen: `⌈Cost × eni × KURS × (1 + Marja/100) / Y⌉ × Y + QAT'IY`; poliklinli rukav — qovurg'a
  soni. KURS va QAT'IY — `PricePolicy` (sinxronda AppSheet ma'lumotidan o'rganiladi; qo'lda o'zgartirilsa — o'chadi).
- Narx tartibi (`catalog.services.price_of` → CRM qidiruvi ham): kenglik bo'yicha qo'lda → AppSheet (`price.source`
  ≠ `manual`) → qo'lda narx.
- MAXFIY: tannarx, marja, birlik tannarxi, kurs/qat'iy/yaxlitlash — faqat ega/admin va rahbariyat javobida.

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET | `cat/pricing` | siyosat: QQS, standart eni, chegirma chegaralari, sinxron holati (`synced` — ma'lumot holati vaqti, `stale` > 1 kun), qatorlar soni; rahbariyatga + `usd_rate`, `fixed_add`, `round_to`, `learn` |
| POST | `cat/pricing` | o'zgartirish (faqat rahbariyat; 403) |
| POST | `cat/pricing/sync` | jonli AppSheet sinxroni (rahbariyat; kalitlarsiz — 400) |
| GET | `cat/pricing/unmatched` | katalogga bog'lanmagan AppSheet qatorlari (tannarxsiz) |
| GET | `cat/items/<id>/quote?width=` | rukav / rukavdan remen — ixtiyoriy eni narxi (formula ko'rinmaydi) |

`GET items/<id>` → `pricing`: `{source: appsheet|manual|none, vat_pct, rows: [{label, width, price, price_vat}],
linked: {mark, name, origin, mode: fixed|width|ribs, synced, price, price_vat, lens, note, cost?}}`. `GET items` qatori:
`price_now`, `price_from`, `price_by`. `POST items/<id>/price` — `source: appsheet|manual` (qo'lda saqlash — `manual`).

CRM: bitim va qator chegirmasi — `PricePolicy.max_disc_lead / head / seller` (rahbariyat / sotuv rahbari / sotuvchi);
oshsa — 403; avval saqlangan chegirma qayta saqlashga xalaqit bermaydi.

Buyruqlar: `pricing_sync` (jonli, `.env`: `APPSHEET_VBELT_*`, `APPSHEET_TIMING_*`, `APPSHEET_TIMING_TYPES`),
`pricing_sync --from-jarvis <office.db>` (Jarvis keshidan), `pricing_sync --relink`. Celery beat — har 30 daqiqa
(`catalog-prices`, kalitlarsiz o'tkaziladi).

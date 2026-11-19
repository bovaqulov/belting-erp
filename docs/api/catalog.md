# Katalog API — `/app/api/erp/cat/*` (Accounting › Tovarlar)

Jarvis kontrakti (`office/web/erp_setup_api.py`, mantiq `office/erp/catalog/manage.py`). Frontend: `frontend/src/erp/finance/`
(`/app/erp/moliya`). Backend (belting_erp): `backend/config/apps/erp/catalog/` — modellar (`Group`, `Item`, `Char`; qoldiq — `erp_warehouse.Stock`) va `services.py` (qidiruv, narx — CRM ishlatadi) tayyor, HTTP API hali ochilmagan; ulangunicha frontend brauzer ichidagi
demo backend bilan ishlaydi (`src/erp/finance/demo/server.lib.ts` — shu qoidalar bilan). Demo/haqiqiy tanlovi:
`GET /app/api/erp/me` va `GET /app/api/erp/cat/groups` — 404/5xx/tarmoq → demo.

Xato: `{ "detail": "matn" }` (400 — qoida, 404 — topilmadi, 403 — `catalog.view` / `catalog.create` ruxsati yo'q).

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

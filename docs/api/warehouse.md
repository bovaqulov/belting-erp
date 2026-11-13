# Ombor (Warehouse) API — `/app/api/erp/*`

Jarvis kontrakti (`erp_ombor.html` ishlatgan yo'llar). Frontend: `frontend/src/erp/warehouse/` (`/app/erp/ombor`). Backend (belting_erp):
hali ko'chirilmagan; ulangunicha frontend brauzer ichidagi demo backend bilan ishlaydi
(`src/erp/warehouse/demo/server.lib.ts` — shu hujjatdagi yo'llar va JSON shakllari bilan bir xil, testlar: `server.lib.test.ts`).

Demo/haqiqiy tanlovi: sahifa ochilganda `GET /app/api/erp/me` va `GET /app/api/erp/stock/dashboard` tekshiriladi —
404, 5xx yoki tarmoq xatosi → demo; 200/401/403 → haqiqiy backend. Demo holati — `localStorage["wh.demo.v1"]`.

Xato: `{ "detail": "matn" }` (400 — biznes qoidasi, nima bo'ldi + qanday tuzatish; 404 — topilmadi; 409 — hujjat versiyasi eskirgan).
Miqdorlar — son yoki satr (`"12.5"`); o'lcham turi `dims`: `wl` (eni × uzunligi, mm → m²), `w` (rukav, eni mm), `l` (rulon, uzunlik), `null` (donali).
Birlik turi `kind`: `roll` | `piece` | `lot` (donali partiya, kodsiz) | `product`.

## Foydalanuvchi va ma'lumot

| Yo'l | Javob |
|---|---|
| `GET me` | `{tg_id, name, roles[], warehouses: [{id, name, kind: store\|shop\|production\|transit}], firms: [{id, code, name}], kinds: [{code, title: {uz}, can: ["create","post"]}]}` |
| `GET scan?code=` | `{type: "unit", id, code, item_id, char_id, name, kind, unit, dims, width_mm, length_mm, char, firm, loc, loc_id, stock: [{warehouse_id, warehouse, firm, qty}], pending, pending_qty, parent_code, made: {kind, by_name, posted_at, job}, cuts: [...]}` · `{type: "item", item_id, char_id, name, unit, dims, char, legacy, char_w, char_l}` · `{type: "cell", id, code, parent_id}` · `{type: "choice", options: [{item_id, char_id, name, base, unit, dims}]}` (1C kodi ikki bazada) · `{type: "doc", number}` · `{type: "unknown"}` |
| `GET items?q=` | `[{item_id, char_id, name, sku, unit, dims}]` (q ≥ 2 harf) |
| `GET stock?item_id=&char_id=` | `{total, reserved, free, units: [{batch_id, code, kind, width_mm, length_mm, warehouse, firm, qty}]}` |
| `GET stock/dashboard` | `{stock: {units, items, rolls, pieces, no_loc, value?}, picks, accuracy, counted_positions, slow_days, slow_units, scrap_pct, pending_units, low: [{name, min_qty, unit, qty}], today: {kind: n}, counts: [{number, date, positions, diff}]}` |
| `GET stock/table?warehouse_id=&q=&kind=measured\|piece&low=true` | `{rows: [{item_id, name, sku, qty, unit, min_qty, dims, rolls, pieces, units, locs[], firms[], whs[], cost?}], total: {items, units, rolls, pieces, cost?}, see_cost}` |
| `GET stock/cycle?warehouse_id=` | ABC sikl sanoq: `{due_total, summary: {A\|B\|C: {days, items, due}}, due: [{item_id, name, cls, last, age, locs[], units}]}` |
| `POST stock/cutplan` `{item_id, warehouse_id, needs: [{w, l, n}] \| [{q, n}]}` | `{unit, need_qty, scrap_qty, opened, pieces, units: [{batch_id, code, kind, width_mm, length_mm, qty, loc, firm, warehouse_id, cuts: [{width_mm, length_mm, qty}], rests: [{…, scrap}]}], missing: [...]}` — avval qoldiq (bo'laklar), keyin rulonlar |

## Joylar va birliklar

| Yo'l | Javob |
|---|---|
| `GET cells` | `[{id, code, parent_id, warehouse, units}]` |
| `GET cells/{id}/units` | `[{name, code, kind, width_mm, length_mm, firm, qty, unit}]` |
| `POST cells` `{parent_id, codes[]}` | yangi yaratilganlar `[{id, code}]` (borlari o'tkazib yuboriladi) |
| `GET wh/tree?store_id=` | `{store: {id, name}, restricted, blocks: [{id, code, name, mine, racks: [{code, cells: [{id, code, units}]}]}], loose: [...]}` — `restricted`: omborchi faqat o'z bloklarini ko'radi |
| `GET wh/unplaced?store_id=` | qabul qilingan, joysiz: `[{batch_id, name, code, width_mm, length_mm, doc, firm, qty, unit}]` |
| `POST units/loc` `{batch_ids[], loc_id \| null}` | `{ok}` |
| `POST units` `{item_id, firm, width_mm, length_mm, qty, loc_id, warehouse_id}` | sanashda yangi birlik (hisobda emas, `pending`): `{batch_id, code, qty, width_mm, length_mm, existing}` |
| `DELETE units/{id}` | faqat `pending` birlik; hisobdagisi — 400 |
| `POST labels/print` `{batch_ids \| item_id+char_id \| cell_ids}` | `{queued[]}` — printer navbati |
| `POST labels/pdf` (xuddi shu tana) | PDF fayl |

## Joylashtirish

| Yo'l | Javob |
|---|---|
| `GET cat/items?q=` | `[{id, name, grp, kind: material\|product\|goods\|service, qty, unit}]` |
| `GET cat/items/{id}` | `{id, name, grp, kind, unit, measured, attrs: {dims}, chars: [{id, name}]}` |
| `POST place` `{loc_id, item_id, firm, char_id, qty \| null, units: [{w, l} \| {w} \| {q}] \| null}` | boshlang'ich qoldiq hujjati darhol o'tkaziladi: `{number, item, loc, qty, unit, units: [batch_id], label: {url}}` |
| `GET place/recent?loc_id=` | bugun men joylaganlar (yoki shu javondagilar): `[{id, name, loc, number, firm, date, qty, unit, author}]` |
| `POST place/{id}/undo` | `{ok}` — faqat muallif |

## Hujjatlar

Turlar: `inventory`, `cut`, `transfer`, `writeoff`, `acceptance`, (`sale` — yig'ish orqali, `initial` — joylashtirish orqali).

| Yo'l | Javob |
|---|---|
| `GET docs?kind=&status=draft&limit=` | `[{id, number, warehouse_id, author, date, updated}]` |
| `GET docs/{id}` | `Doc: {id, number, kind, status, firm_id, warehouse_id, author, date, updated, version, data, lines: [{item_id, char_id, batch_id, qty, data}]}` |
| `POST docs` `{kind, firm, header: {warehouse_id, warehouse_to?, base_id?, data?}, lines}` | qoralama `Doc` |
| `POST docs/{id}/save` `{version, header, lines}` | `Doc` (versiya +1; eskisi — 409) |
| `POST docs/{id}/post` `{version}` | o'tkazilgan `Doc`. `cut`: `lines[i].data = {pieces[], rests[], scrap}`, `lines[i].qty` — bo'lak miqdori. `inventory`: `data.result = [{item_id, batch_id, book, counted, diff, moved_from}]`; `data.scope`: `full` — sanalmagan qoldiq hisobdan chiqadi, `items` (+`data.items[]`) — shu tovarlar uchun. `acceptance`: `data.result = [{item_id, expected, counted, diff}]`, `data.final=false` — qisman (qolgani yo'lda) |

## Yig'ish va qabul

| Yo'l | Javob |
|---|---|
| `GET picks` | `[{id, number, date, customer, firm, channel, warehouse, lines, names[]}]` |
| `GET picks/{id}` | `{id, number, customer, firm, warehouse_id, lines: [{line_no, item_id, char_id, name, unit, dims, left, units: [{batch_id, code, loc, qty, width_mm, length_mm, firm}]}]}` — taklif: avval kichigi |
| `POST picks/{id}/ship` `{picks: [{line_no, batch_id \| null, qty, scan}]}` | `{number, total}`; ortiqcha miqdor / qoldiq yetmasa — 400 |
| `GET purchase/incoming` | `[{id, number, supplier, firm, warehouse_id (yo'lda), expected, items: [{item_id, char_id, name, char, unit, qty}]}]` |

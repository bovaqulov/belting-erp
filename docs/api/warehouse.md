# Ombor (Warehouse) API — `/app/api/erp/*`

Jarvis kontrakti (`erp_ombor.html` ishlatgan yo'llar). Frontend: `frontend/src/erp/warehouse/` (`/app/erp/ombor`). Backend:
`backend/config/apps/erp/warehouse/` — **ishlaydi** (`stock.py` mantiq, `labels.py` stikerlar 58×40 QR PDF, `services.py` —
CRM/sex uchun ochiq interfeys, testlar `tests/test_api.py`). Backend bo'lmasa frontend brauzer ichidagi demo bilan ishlaydi
(`src/erp/warehouse/demo/server.lib.ts` — shu yo'llar va JSON shakllari bilan bir xil). Dev ma'lumot: `manage.py wh_demo`.

Qoldiq — birliklar: o'lchamli tovar (lenta, rukav, rulon) — har biri QR kodli (`P00000123`), donali — kodsiz partiya.
Tuzilma: ombor → bino → blok → qator → qavat → joy (qator va qavat — joy kodidan: `A-03-2`).
Ruxsat: `warehouse` moduli; skaner, qidiruv, stikerlar — `manufacturing` ga ham. Tannarx — ega/admin va buxgalteriya.
`labels/print` — printer serverga ulanmagan (400, PDF orqali chop etiladi).
Sex/CRM bilan: `open_pick` (CRM bitimi «Tayyor» → yig'ish navbati), `consume`/`produce` (sex), `on_shipped` (jo'natildi → CRM).

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
| `GET cells` | `[{id, code, parent_id, block_id, warehouse, units}]` |
| `GET cells/{id}/units` | `[{name, code, kind, width_mm, length_mm, firm, qty, unit}]` |
| `POST cells` `{parent_id, codes[], block_id?}` | yangi yaratilganlar `[{id, code}]` (shu omborda borlari o'tkazib yuboriladi; boshqa omborda band kod — 400, hech narsa yaratilmaydi); `block_id` — hamma kod shu blok harfi bilan boshlansin, aks holda 400 |
| `GET moves?unit_id \| item_id \| loc_id \| doc_id \| warehouse_id \| op, before_id, limit` | harakatlar jurnali (eng yangisi birinchi, ≤200): `[{id, at, op, op_title, unit_id, unit_code, item_id, char_id, firm, delta, qty_after, wh_from, wh_to, loc_from, loc_to, doc_id, doc_number, reason, author_name}]` |
| `GET putaway?store_id, item_id, width_mm?, n?` | joylashtirish tavsiyasi (≤5): `[{id, code, reason, units, capacity}]` — 1) shu tovar turgan joy, 2) guruhiga mos xonadagi bo'sh joy, 3) boshqa bo'sh joy; qavat — bel balandligi (B, C) birinchi; bloklangan, to'la, eni sig'maydigan va saqlash bo'lmagan xonalar — chiqmaydi |
| `GET cat/groups` | katalog tovar guruhlari (xona qoidasi uchun) |
| `POST purchase/incoming` `{supplier?, firm, expected?, items: [{item_id, char_id?, qty}]}` | kutilgan kirim (ASN, raqami `KR-26-0001`, «Yo'lda» omborida) — `incoming` shaklida; faqat ombor huquqi |
| `DELETE purchase/incoming/{id}` | bekor qilish — `{ok}`; qisman qabul qilingan — 409, yakunlangan — 404 |
| `GET kpi/dock?store_id, days=30` | qabuldan joylashgacha (dock-to-stock): `{days, placed, avg_h, median_h, within_2h (%), waiting, oldest_h}` |
| `POST docs/{id}/review` | sanash qoralamasini o'tkazishdan oldin ko'rish (hech narsa o'zgarmaydi): `{lines: [{item_id, batch_id, name, book, counted, diff, cls, value, ok}], positions, need, value, can_approve, reasons: [{code, title}]}` |
| `GET transfers/incoming?store_id` | shu omborga yo'lda kelayotgan ko'chirishlar: `[{id, number, date, from, to_id, to, firm, units: [{batch_id, code, name, qty, width_mm, length_mm, received}], lots: [{item_id, char_id, qty, name}], lots_done, done}]` |
| `POST docs/{id}/receive` `{batch_ids?: [], lots?: true, all?: true}` | yo'ldagi ko'chirishni (qisman) qabul qilish — o'sha `Transit` shakli; qabul qilingan birlik qabul qiluvchi omborga o'tadi (joysiz, `src` = hujjat raqami → joylash navbati); to'liq bo'lsa `done: true, arrived_at` |
| `GET wh/levels?store_id` · `POST wh/levels` `{store_id, item_id, min_qty, max_qty}` · `DELETE wh/levels/{id}` | to'ldirish me'yorlari: `[{id, item_id, name, unit, min_qty, max_qty, have}]`; `max < min` — 400 |
| `GET replenish?store_id, from_id?` | to'ldirish taklifi: `{from_id, from, rows: [Level + {need, available, suggest}]}` — qoldig'i `min`dan kam tovarlar `max`gacha, manba ombordagi bor qoldiqdan (`from_id` berilmasa — birinchi saqlash ombori) |
| `GET kpi/summary?store_id, days=30` | ko'rsatkichlar paneli: `{days, store, dock (kpi/dock), ira (kpi/ira, ≥90 kun), outbound {orders, lines, open, shorts, returns, return_lines, return_pct, defect}, production {consumes, used, scrap, scrap_pct, products}, writeoff {docs, value}, space {cells, active, used, pct, blocked, quarantine, by_block: [{code, name, cells, used, pct}]}, activity: [{date, in, out, move}] (14 kun), hot: [{code, moves}] (≤10), slotting: [{unit_id, code, name, loc, hint}]}` — `slotting`: A-sinf tovar D (4-) qavat va undan yuqorida |
| `GET kpi/ira?store_id, days=90` | zaxira yozuvlari aniqligi: `{days, counts, positions, accurate, ira (%), by_cls: {A: {positions, ira}}}` |
| `GET wh/tree?store_id=` | `{store: {id, name}, restricted, blocks: [{id, code, name, mine, racks: [{code, cells: [{id, code, units}]}]}], loose: [...]}` — `restricted`: omborchi faqat o'z bloklarini ko'radi |
| `GET wh/structure?store_id=` | `{store: {id, name, code}, buildings: [{id, name, number, code}], blocks: [{id, code, full, name, building_id}], racks: [{id, block_id, number, code, name, rows, floors}]}` — `code`lar: `AO`, `AO1`, `AO1-A` (`full`), `AO1-A-02` |
| `POST wh/stores/{id}` `{name, kind?, code?}` | `{id, name, kind, code, recoded}`; `code` — 2–3 lotin harfi, yagona (o'zgarsa — joy kodlari qayta quriladi); `kind` — `store` / `shop` / `production`; nom takrorlanmaydi (registrsiz) — 400; yo'ldagi (transit) yoki arxivdagi — 404 |
| `DELETE wh/stores/{id}` | faqat egasi/admin (403); qoldiq yoki yopilmagan yig'ish bor — 409; tarixi yo'q — butunlay (binolar, bloklar, joylar bilan) `{ok, archived: false}`; tarixi bor — arxivga (`active=false`, nomi bo'shaydi) `{ok, archived: true}` |
| `POST wh/buildings` `{store_id, name?, number?}` | `{id, name, number, code}`; `number` berilmasa — keyingi bo'sh (kod `AO2`), nomi — «N-bino»; raqam/nom takrori — 400 |
| `POST wh/blocks` `{store_id, building_id, code, name?}` | `{id, code, name, building_id}`; kod — 1–3 lotin harfi, barcha omborlar bo'yicha yagona (joy kodi butun bazada yagona) — band bo'lsa 400 (qayerdaligi bilan); shu harfli biriktirilmagan joylar blokka o'tadi |
| `POST wh/buildings/{id}` `{name, number?}` | `{id, name, number, code, recoded}`; raqam o'zgarsa — joy kodlari qayta quriladi |
| `DELETE wh/buildings/{id}` | bloklari va joylari bilan `{ok, cells}`; joylardan birida birlik (qoldiq yoki `pending`) bo'lsa — 409 |
| `POST wh/blocks/{id}` `{name, code?, purpose?, groups?}` | `{id, code, full, name, building_id, recoded}`; harf bino ichida yagona, o'zgarsa — joy kodlari qayta quriladi |
| `DELETE wh/blocks/{id}` | joylari bilan `{ok, cells}`; birlik bor — 409 |
| `POST cells/{id}` `{status?, code?}` | joy (`GET cells` shaklida); `status` — `active` / `blocked` (joylashtirib bo'lmaydi — 400) / `quarantine`; `code` — faqat stellajsiz (erkin) joyda |
| `DELETE cells/{id}` | `{ok}`; birlik bor — 409; joylashtirish yozuvlari (`Place`) birga o'chadi |
| `POST wh/racks` `{store_id, block_id, rows, floors, name?, count?, cell_kind?, capacity?, max_width_mm?}` | xonaga `count` (1–20) ta stellaj keyingi raqamlar bilan, joylari `AO1-A-02-01-A … AO1-A-02-04-G`: `{…birinchisi, racks: […], cells}`; qatorlar 1–99, qavatlar 1–24 (A…Z, I/O yo'q) |
| `POST wh/wizard` `{store_id, building_id \| building_name+building_number, block_code, block_name?, racks, rows, floors, rack_name?}` | tuzilma ustasi: bino (bor/yangi) → xona (bor/yangi) → stellajlar — `{building_id, block_id, racks, cells}` |
| `POST wh/racks/{id}` `{rows, floors, name?, cell_kind?, capacity?, max_width_mm?}` | xarakteristika: yetishmagan joylar qo'shiladi, ortiqchalari o'chadi — `{…, added, removed}`; ortiqcha joyda birlik — 409 (hech narsa o'zgarmaydi) |
| `DELETE wh/racks/{id}` | joylari bilan `{ok, cells}`; birlik bor — 409 |
| `GET wh/unplaced?store_id=` | qabul qilingan, joysiz (eng eskisi birinchi): `[{batch_id, name, code, width_mm, length_mm, doc, firm, qty, unit, item_id, since}]` |
| `POST units/loc` `{batch_ids[], loc_id \| null}` | `{ok}` |
| `POST units` `{item_id, firm, width_mm, length_mm, qty, loc_id, warehouse_id}` | sanashda yangi birlik (hisobda emas, `pending`): `{batch_id, code, qty, width_mm, length_mm, existing}` |
| `DELETE units/{id}` | faqat `pending` birlik; hisobdagisi — 400 |
| `POST labels/print` `{batch_ids \| item_id+char_id \| cell_ids \| rack_ids}` | `{queued[]}` — printer navbati |
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
| `GET picks` | `[{id, number, date, customer, firm, channel, warehouse, lines, names[], short}]` — `short`: necha marta «topilmadi» |
| `GET picks/{id}` | `{id, number, customer, firm, warehouse_id, route: [joy kodlari], lines: [{line_no, stop, at, short, item_id, char_id, name, unit, dims, left, units: [{batch_id, code, loc, qty, width_mm, length_mm, firm, tip}]}]}` — qatorlar yig'ish yo'li tartibida (`stop` 1…), `at` — birinchi tavsiya joyi; `tip`: `kam chiqindi` / `aniq mos` / `eng eski (FIFO)`; karantindagi joydan taklif yo'q |
| `POST picks/{id}/ship` `{picks: [{line_no, batch_id \| null, qty, scan}]}` | `{number, total}`; ortiqcha miqdor / qoldiq yetmasa / boshqa tovarning birligi / karantindagi birlik — 400. `sale` hujjati: `data {base, customer, channel}`, qatorlarda `data {loc, scan}` |
| `POST picks/{id}/short` `{line_no, reason, loc?}` | topilmadi — yangilangan buyurtma (`picks/{id}` shakli); `reason`: `missing` · `damaged` · `less` · `label`; tovarning oxirgi sanog'i o'chadi → sanash navbatining boshiga |
| `GET units/{id}/trace` | birlik zanjiri: `{job, from: [{code, item_id, name, qty, unit, doc}], used: [{doc, date, job, qty, returned, products: [{code, name, doc}]}]}` — `from`: mahsulot qaysi material birliklaridan (sarf hujjatlari SR-…); `used`: birlik (yoki undan kesilgan bo'lak) qaysi sarfda ishlatilgan va natijadagi mahsulot |
| `GET sales?q` | qaytarish uchun jo'natishlar (180 kun, ≤20): `[{id, number, date, customer, base, firm, warehouse_id, lines: [{line, item_id, char_id, batch_id, code, name, unit, qty, returned}]}]`; `q` — raqam, mijoz yoki jo'natilgan birlik QR |
| `POST returns` `{sale_id, warehouse_id?, reason, lines: [{line, qty, grade: ok \| defect}]}` | `{id, number (QT-…), ok, defect, quarantine}`; miqdor jo'natilgan − qaytarilgandan oshsa / sabab yo'q — 400 |
| `GET purchase/incoming` | `[{id, number, supplier, firm, warehouse_id (yo'lda), expected, items: [{item_id, char_id, name, char, unit, qty}]}]` |

**Atamalar va kodlar (`warehouse/codes.py`):** ombor `AO` → bino `AO1` → **xona** (API'da `block`) `AO1-A` → **stellaj** (`Rack`, qatorlar × qavatlar) `AO1-A-02` → qator `AO1-A-02-03` → **joy** `AO1-A-02-03-C` (qavat harf, A — eng pastki; I/O yo'q). Kod tuzilmadan hosil bo'ladi va butun bazada yagona; ombor kodi / bino raqami / xona harfi o'zgarsa — ichidagi joy kodlari qayta quriladi (`recoded`). `GET cells` har joyda `rack_id, row, floor, status` beradi. Yorliqlar: `labels/pdf {cell_ids}` — tokcha (katta `03-C` + to'liq QR), `{rack_ids}` — stellaj boshi (katta `AO1-A-02` + QR). Stellajsiz (erkin) joylar — eski kodda.

**Harakatlar jurnali (`ledger.py`, `StockMove`):** birlikning miqdori, ombori, joyi yoki `pending` holati qaysi koddan o'zgarmasin — `Unit` signali o'chmaydigan yozuv qo'shadi (tahrirlash/o'chirish — `ValueError`). `op` — so'rov view nomi yoki hujjat turi (`doc_post` bog'laydi), muallif — so'rov egasi, sabab — hujjat `data.reason`. Kutilayotgan (`pending`) birlik qoldiq emas; shuning uchun har birlik uchun **Σ delta = joriy qoldiq** — `config/apps/erp/conftest.py` har ERP testidan keyin tekshiradi. Mavjud birliklar — `0008_ledger_opening` («Boshlang'ich holat»).

**Qayta yuborishdan himoya:** har POST/DELETE'ga `Idempotency-Key: <uuid>` sarlavhasi qo'yilsa, shu kalit bilan takror so'rov amalni bajarmaydi — birinchi javobni qaytaradi (`IdemKey`).

**Zonalar va joylar (2-bosqich):** xona (`Block`) — `purpose`: `storage` (saqlash) · `receiving` (qabul) · `shipping` (jo'natish) · `quarantine` (karantin) · `production` (sex) · `returns` (qaytarish); `groups` — mos tovar guruhlari (joylashtirish qoidasi). Stellaj (`Rack`) — `cell_kind`: `shelf` · `roll` · `pallet` · `bin` · `floor`; `capacity` — bitta joyga necha birlik, `max_width_mm` — eng keng rulon. Joylashtirishda (`place`, `units/loc`, `units`) — bloklangan joy, sig'im oshishi va eni sig'masligi 400 bilan rad etiladi (`loc_ok`).

**Qabul (3-bosqich):** kutilgan kirim (ASN) → skaner bilan sanash (UI: ko'rmasdan sanash — kutilgan miqdor yashirin) → `acceptance` hujjati. Natija (`data.result`) har qatorda `name`; rejada yo'q kelgan tovar — `{expected: 0, diff: +, extra: true}`. Rejasiz qabul — UI sanalganidan kirim yaratadi va darhol qabul qiladi. Qabul qilingan birliklar — joylash navbatida (`wh/unplaced`), joy tavsiyasi — `putaway`.

**Sanash (4-bosqich):** siklik jadval — A 7, B 30, C 90 kun. Tolerans (`TOL`, sinf bo'yicha): farq foizi VA summasi (`ItemMeta.cost`) chegarada — avtomatik (A — har qanday farq tasdiq talab qiladi; B — 2% va 50 000; C — 5% va 100 000). Chegaradan oshgan pozitsiya bo'lsa `POST docs/{id}/post` → 409; o'tkazish uchun `{approve: true, reason}` (sabab — `REASONS` kodi) va rahbar huquqi (egasi, admin, rahbariyat). Natija qatorlarida `cls, value, ok`; hujjatda `approval {by, reason, need}`, `data.reason` — jurnal yozuvlariga sabab bo'lib tushadi.

**Ichki harakat (5-bosqich):** joydan joyga — `units/loc` (UI: Ko'chirish › Ombor ichida; birliklar → javon yorlig'i yoki `putaway` tavsiyasi). Omborlararo `transfer` endi ikki bosqichli: o'tkazilganda tovar «Yo'lda» omboriga o'tadi (`data.transit, units, lots`), qabul qiluvchi ombor `docs/{id}/receive` bilan skanerlab qabul qiladi (UI: Qabul › Ko'chirishdan kelayotganlar). Hisobdan chiqarish (`writeoff`): sabab majburiy (`data.reason`, `reason_code` — `OFF_REASONS`: `defect`, `damage`, `shortage`, `scrap`, `expired`, `other`); summasi (tannarx × miqdor) 500 000 so'mdan oshsa `post` → 409, rahbar `{approve: true}` bilan o'tkazadi (`data.approval`). To'ldirish (min/max) — `wh/levels`, `replenish`.

**Chiqim va qaytarish (6-bosqich):** birlik tanlovi — o'lchamli tovarda kerakdan katta bo'lganlarning eng kichigi (kesishda chiqindi kam), qolganlari va donali tovar — FIFO (`take_lots` ham FIFO). Yig'ish yo'li (`path_key`): bino → xona → stellaj → qator «ilon izi» (toq stellajda qator o'sib, juftida kamayib) → qavat; joysiz — oxirida. Qaytarish — `return` hujjati (`data {base_id, base, customer, reason}`, qatorlarda `data {line, grade}`): yaroqli — joysiz, `src` = hujjat raqami (joylash navbati); brak — ombordagi birinchi karantin joyiga (xona `purpose=quarantine` yoki joy `status=quarantine`), bo'lmasa — navbatga. To'liq jo'natilgan kodli birlik o'z QR'i bilan qaytadi; qisman jo'natilgandan qaytgan qism — yangi QR (`parent_code` — asl birlik).

**Sex bilan (7-bosqich):** `consume` (SR-…) va `produce` (IC-…) hujjati birlik o'zgarishidan **oldin** yaratiladi — jurnal yozuvlari hujjat raqami va sabab `Sex: <zakaz>` bilan; sarf hujjatining ombori — manba (butun rukav sexga o'tsa ham). `produce(sources=[SR-…])` — mahsulot birligida `made.from` (materiallar, qaytarilgan sarflarsiz). `unconsume(SR-…)` → `SQ-…` hujjati: sarf bo'lagi manba omborga joysiz qaytadi (`src` = SQ → joylash navbati), donali — partiyaga; kesish chiqindisi qaytmaydi; sarf hujjatida `data.returned`.

**Ko'rsatkichlar va internetsiz ish (8-bosqich):** panel — `kpi/summary` (UI: Amallar › Ko'rsatkichlar; yashil — jahon me'yorida: IRA ≥ 95%, qabuldan joylashgacha ≤ 2 soat, qaytarish ≤ 2%, chiqindi ≤ 5%; xonalar bandligi ≥ 70% — ogohlantirish, ≥ 90% — to'la). Frontend har o'zgartiruvchi so'rovga `Idempotency-Key` qo'yadi; internet yo'q bo'lsa skaner amallari (`units/loc`, `docs/{id}/receive`, `picks/{id}/short`) brauzerdagi navbatga (`wh.outbox.v1`) tushadi va ulanganda o'sha kalit bilan tartibda yuboriladi (server rad etgani — «rad etildi» ro'yxatida). Kalitlar (`IdemKey`) 7 kun saqlanadi.

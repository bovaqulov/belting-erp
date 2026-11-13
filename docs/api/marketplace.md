# Marketplace API — `/app/api/erp/mk/*`

Jarvis kontrakti (`office/web/erp_mp_api.py`). Frontend: `frontend/src/erp/marketplace/` (`/app/erp/marketplace`). Backend (belting_erp):
`backend/config/apps/erp/marketplace/` — hozircha skelet; ulangunicha frontend brauzer ichidagi demo backend bilan ishlaydi
(`src/marketplace/demo/server.lib.ts` — shu hujjatdagi yo'llar va JSON shakllari bilan bir xil).

Demo/haqiqiy tanlovi: sahifa ochilganda `GET /app/api/erp/me` va `GET /app/api/erp/mk/overview` tekshiriladi —
404, 5xx yoki tarmoq xatosi → demo; 200/401/403 → haqiqiy backend.

Kanal kodlari: `wb`, `ozon`, `uzum` (buyurtma va qoldiq); `site` (remen.uz — faqat tovarlar va narx).
Bosqichlar: `new` | `assembly` | `transit` | `done` | `cancelled` (`stage=active` — new + assembly).
Xato: `{ "detail": "matn" }` (400 — biznes qoidasi, 404 — topilmadi, 502 — kanal API xatosi).

## 1-bosqich (frontendda tayyor)

| Yo'l | Javob |
|---|---|
| `GET /app/api/erp/me` | `{tg_id, name, roles[]}` — `admin` audit/sozlamalarni ko'radi |
| `GET overview` | `{channels: {wb: {name, n, linked, off, ch_total, push_stock, push_price}, …}, sources: [{id, code, name, source: "onec"\|"erp", sklad[]}], orders: {n, soon}, reviews: {n, bad}, push_errors, audit: [{code, severity, channel, n, text}]}` |
| `GET orders-counts` | `{wb: {new, assembly}, ozon: …, uzum: …}` |
| `GET orders/{ch}/board?stage=` | `{counts: {stage: n}, orders: [Order]}` — muddat bo'yicha, keyin yangisi |
| `POST orders/{ch}/sync` | `{new, updated, imported}` |
| `POST orders/{ch}/{ext}/scan` `{code}` | `{ok, line, title, picked, need, done}`; noto'g'ri tovar / ortiqcha / yig'ilgan → 400 |
| `POST orders/{ch}/{ext}/reset` | `{ok}` |
| `POST orders/{ch}/{ext}/cancel` `{reason}` | `{ok}` |
| `POST orders/uzum/{ext}/confirm` | `{ok}` (CREATED → PACKING) |
| `POST orders/ozon/{ext}/ship` | `{ok, note}` |
| `GET orders/{ch}/{ext}/label` | fayl (PDF/PNG 58×40) |
| `GET audit?code=&ch=` | `[{id, code, severity, text, channel, ext_id, vendor_code, title, photos, detail}]` |
| `POST audit/run` | `{cards}` · `POST audit/{id}/mute` → `{ok}` |
| `GET wb/supplies` | ochiq postavkalar `[{id, name, createdAt, closedAt, done}]` · `POST wb/supplies` `{name}` → `{id}` |
| `GET wb/supplies/{sid}` | `{supply, orders: [Order], boxes: [{id, orders[]}], picking: [PickRow], picked_all, step: 1\|2\|3}` |
| `POST wb/supplies/{sid}/add` `{orders[]}` · `/deliver` · `/boxes` `{amount}` · `/boxes/delete` `{ids[]}` | `{ok}` / `{trbxIds}` |
| `POST wb/supplies/{sid}/boxes/stickers` `{ids}` → `{files[]}` · `GET wb/supplies/{sid}/qr` (PNG) · `POST wb/stickers` `{orders}` → `{stickers: [{id, file}]}` | base64 PNG |

`Order`: `{channel, ext_id, stage, ext_status, ordered, deadline, supply_id, lines: [{key, title, vendor_code, width_mm, mode, qty, codes[]}], picked: [{line, code, by, ts}], assembled_at, number, article, price_uzs, need, left_min, age_min}`.

## Keyingi bosqichlar (Jarvis'da bor, frontendga ko'chmagan)

Tovarlar (`products/{ch}`, `products/{ch}/missing`, `…/draft`, `products/create`, `products/{ch}/card/{id}`, `cards/{ch}`,
`card/{id}`, `relink`, `site/refresh`, `content*`), narx (`price/{ch}`, `…/policy`, `…/read`, `…/push`), qoldiq
(`stock/{ch}`, `…/read`, `…/push`, `settings/{ch}`, `journal`), sharhlar (`reviews`, `…/fetch`, `…/{id}/draft|send|skip`).

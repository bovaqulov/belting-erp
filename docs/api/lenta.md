# LentaCUD API — `/app/api/lenta/*` (konveyer lenta chizmasi)

Backend: `backend/config/apps/conveyor/` — mantiq `lenta/` (Jarvis `office/lenta/` dan aynan ko'chirilgan; golden bo'yicha
TypeScript bilan bir xil natija — `tests/lenta/`, 2377 test), API `views.py`, KB yozuvi `kb.py`, ruxsat `access.py`.
Frontend: `frontend/src/conveyor/` (`/app/lenta`, loyiha — `?p=<id>`).

**Katalog (MAXFIY):** `backend/data/secret/lenta_catalog.json` (git'da yo'q; serverga alohida ko'chiriladi, `chmod 600`) yoki
`LENTA_CATALOG` muhit o'zgaruvchisi. Tannarx, ustama, kurs, xizmat, zapas — brauzerga hech qachon chiqmaydi (`public_catalog`,
`public_state`, `safe_price`). Dopusklar: `settings.LENTA_TOLERANCES` yoki `data/lenta_tolerances.json` (ixtiyoriy).

Ruxsat: ega/admin yoki Rahbariyat, Sotuv B2B, Marketplace sotuvi a'zosi — boshqalar 403; `/app/api/me` → `can_lenta`.
Xato: `{detail}` (matn yoki `{message, issues}` — bloklangan chizma, 409).

| Yo'l | Javob / qoida |
|---|---|
| `GET catalog` | `{catalog (narxsiz), enums, initial, user}` |
| `POST render` `{state, lang}` | `{state, sheets: [{key, title, page, pages, svg}], issues, blocked, message, hints}` |
| `POST price` `{state, lang}` | `{blocked, issues, lines: [{key, title, desc, amount}], totals: {subtotal, vatAmount, final} \| null, message}`; soatiga 120 ta (429); audit `lenta_price` |
| `POST parse` `{text, state?, lang}` | `{state, notes, unknown, source: llm\|fallback, provided}` — Claude (JARVIS_LLM=claude), aks holda qoidalar; audit `lenta_parse` |
| `POST send` `{state, lang, customer?, application?, contact?, project_id?}` | PDF Telegram'ga (o'ziga, "Tahrirlash" tugmasi bilan) → `{ok, file_name, kb_id}`; 409 — bloklangan, 503 — bot yo'q. Mijoz ma'lum bo'lsa — KB'ga (narxsiz) |
| `GET projects?all=1` · `POST projects` `{state, name?, id?, updated?, customer?, application?, contact?}` | ro'yxat (≤300; `all` — faqat ega/admin) · saqlash → `{ok, id, kb_id, updated}`; `updated` eskirgan — 409 |
| `GET/DELETE projects/{id}` | loyiha (`state`, `own`) — egasi yoki ega/admin; o'chirish — faqat egasi |
| `POST clientlog` | JS xatolari (auth'siz, daqiqasiga 20/IP; tgWebAppData logga tushmaydi) |

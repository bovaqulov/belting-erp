# Sex (Manufacturing) API — `/app/api/erp/shop/*`

Frontend: `frontend/src/erp/workshop/` (`/app/erp/sex`). Backend: `backend/config/apps/erp/workshop/` (`shop.py` mantiq,
`services.py` — CRM uchun), testlar `tests/test_api.py`. Dev ma'lumot: `manage.py shop_demo` (ombor demosi ustiga).
Ruxsat: `manufacturing` moduli (Ishlab chiqarish bo'limi, rahbariyat, ega/admin). Xato: `{detail}` — 400/404.

Bosqichlar: `new` → `collecting` (qabul qilindi, material yig'ilmoqda) → `making` → `ready`; `cancelled` — bitim yopildi.
Marshrut: `rukav` — rukavdan eni bo'yicha (`qty` — eni mm, `pieces` — dona), `lenta` — konveyer lenta (`spec: {width, length,
joint}` mm, ehtiyoj m² ulash bilan), bo'sh — oddiy mahsulot. Material — katalogdagi mahsulotning `attrs.material_id`.

| Yo'l | Javob |
|---|---|
| `GET board` | `{cols: {new, collecting, making, ready: [Job]}}` — tayyorlar oxirgi 2 kun |
| `GET jobs/{id}` | `Detail`: Job + `plan [{name, unit, qty, left, taken, item_id, cut, candidates [{loc, block, block_name, code, width_mm, length_mm, qty}]}]`, `taken[]`, `log[]` |
| `POST jobs/{id}/accept` | `{ok}`; qabul qilingan — 400 |
| `POST jobs/{id}/take` `{batch_id, qty}` \| `{batch_id, width_mm, length_mm, rests?}` | ombordan sarf (lenta — giliotina kesish, qoldiq o'z stikeri bilan joyida); boshqa material — 400 |
| `POST jobs/{id}/collected` `{force?}` | material to'liq olinmagan bo'lsa — 400 («baribir»), `force: true` — o'tadi |
| `POST jobs/{id}/ready` | mahsulot omborga (stikerli birlik, hujjat IC-…; `made.from` — zakaz sarflaridagi material birliklari) → `{ok, sticker: {url}}` |
| `POST jobs/{id}/untake` `{take_id}` | olingan materialni omborga qaytarish → `{number (SQ-…), codes[], warehouse, jobs[]}`; sarf bir nechta zakazga bo'lingan bo'lsa — hammasidan ayriladi; tayyor/bekor zakaz — 400; material yetmay qolsa «Tayyorlanmoqda» → «Yig'ilmoqda». `taken[]` qatorlarida `id, doc` |
| `POST jobs/{id}/sticker` | `{url}` — `GET sticker.pdf?ids=` |
| `POST group` `{ids}` | `{jobs, phase, phases, plan}` (materiallar jamlangan) |
| `POST group/accept\|take\|collected\|ready\|sticker` `{ids, …}` | birga; `take` — sarf zakazlar ehtiyojiga qarab bo'linadi → `{taken: [{job_id, qty}]}` |
| `POST cut-preview` `{batch_id, width_mm, length_mm}` | `{have, piece, rests[], scrap, whole}` (bazaga yozmaydi) |

`Job`: `{id, number, order_number, phase, priority, due, late, route, qty, unit, size, item, char, customer, worker, spec, left}`.

## CRM bilan (manba `crm:<bitim id>`)

Bitim «Ishlab chiqarishda» → sexda tayyorlanadigan qatorlarga zakaz (sex kerak bo'lmasa va omborda yetarli — darhol «Tayyor»);
barcha zakazlar tayyor → bitim «Tayyor» (mijozga xabar); «Tayyor» → ombor yig'ish navbati; to'liq jo'natildi → «Jo'natildi»;
bitim yo'qotildi → boshlanmagan zakazlar va yig'ish navbati bekor. (`backend/config/apps/erp/crm/production.py`)

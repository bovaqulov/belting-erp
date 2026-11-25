# TelegramCRM API (`/app/api/tgcrm/*`)

Alohida tizim (Telethon, foydalanuvchi akkauntlari). Reja va cheklovlar: [docs/tgcrm/PLAN.md](../tgcrm/PLAN.md).
Mavjud CRM (`/app/api/erp/crm/*`) bilan bog'liq emas.

Telegram bilan faqat **gateway** jarayoni gaplashadi (`manage.py tg_gateway`, bitta nusxa). Django buyruqni Redis
orqali yuboradi va javobni kutadi; gateway ishlamasa — `503`.

## Huquqlar

- Modul: `staff.MODULE_DEPTS["tgcrm"]` (sotuv bo'limlari, Rahbariyat, ega/admin). Aks holda `403`.
- Rahbar (ega/admin, Rahbariyat, sotuv bo'limida xodimlari bor rahbar) — barcha akkauntlar; firma raqamini ulaydi.
- Xodim — firma raqamlari (`kind=company`) va o'z shaxsiy raqami (`kind=personal`); boshqaradi faqat o'zinikini.
  Ko'rinmaydigan akkaunt — `404`.

## Akkaunt obyekti

```json
{
  "id": 1, "kind": "company|personal", "title": "Sotuv bo'limi", "owner_tg": 100,
  "phone": "+998901112233", "tg_user_id": 777, "username": "ali", "name": "Ali Valiyev", "premium": false,
  "status": "new|code_sent|password|qr|active|offline|flood|limited|frozen|banned|logged_out|error",
  "status_label": "Ulangan", "status_detail": "…", "flood_until": null,
  "limits": {"message": 4096, "caption": 1024, "folders": 10, "pinned": 5, "channels": 500, "file_bytes": 2097152000},
  "connected_at": "…", "created_at": "…", "can_manage": true
}
```

Sessiya (auth_key) hech qachon qaytarilmaydi; bazada Fernet bilan shifrlangan (`TGCRM_SESSION_KEY`).

## Marshrutlar

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET | `tgcrm/status` | `{gateway: bool, configured: bool, me: {tg_id, is_head}}` |
| GET | `tgcrm/accounts` | `{accounts: [Akkaunt]}` |
| POST | `tgcrm/accounts` | `{kind, title}` → `201` Akkaunt. Firma raqami — faqat rahbar, nom majburiy |
| GET / PATCH / DELETE | `tgcrm/accounts/<id>` | PATCH `{title}`. DELETE — sessiya bo'lsa avval Telegram'da yopiladi (gateway kerak) |
| POST | `tgcrm/accounts/<id>/login` | `{step, …}` → `{result, account}` (pastda) |
| POST | `tgcrm/accounts/<id>/logout` | Telegram'da sessiyani yopadi → `status=new` |
| POST | `tgcrm/accounts/<id>/restart` | Clientni qayta ko'tarish |
| GET | `tgcrm/accounts/<id>/events` | `{events: [{kind, detail, actor_tg, at}]}` — oxirgi 100 |

### Kirish qadamlari (`login`)

| `step` | Tana | `result` |
|---|---|---|
| `phone` | `{phone}` | `{status: "code_sent", via}` — kod qayerga ketgani |
| `code` | `{code}` | `{status: "active"}` yoki `{status: "password", hint}` (2FA) |
| `password` | `{password}` | `{status: "active"}` |
| `qr` | — | `{status: "qr", url, expires}` — `url` (tg://login?token=…) QR qilib ko'rsatiladi |
| `qr_state` | — | joriy QR (`url` ~30 s da yangilanadi; 5 daqiqadan keyin `status=new`) |
| `cancel` | — | `{status: "new"}` |

QR muvaffaqiyatli bo'lsa akkaunt `active` (yoki 2FA bo'lsa `password`) bo'ladi — frontend akkauntni `GET` bilan kuzatadi.

### Xatolar (`{detail}`)

`400` noto'g'ri raqam/kod/parol · `403` huquq yo'q · `404` akkaunt yo'q · `409` allaqachon ulangan / bu Telegram
akkaunti boshqa kartada / kirish boshlanmagan · `429` Telegram flood (kutish vaqti bilan) · `503` gateway ishlamayapti
yoki `TGCRM_API_ID` yo'q · `504` gateway javob bermadi.

## Chatlar va xabarlar (2-bosqich)

`peer` — Telegram "marked" id: foydalanuvchi musbat, guruh manfiy, kanal/superguruh `-100…` (URL'da manfiy son bo'ladi).
Ko'rish huquqi — akkaunt bilan bir xil (ko'rinmaydigan akkaunt chatlari — `404`).

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET | `tgcrm/accounts/<id>/dialogs?folder=&q=&cursor=&limit=` | `{dialogs: [Chat], next, synced}`. `folder` — papka id yoki `archive`; bo'sh — asosiy ro'yxat (arxivsiz). Birinchi sahifada qadalganlar tepada; `next` — keyingi sahifa kursori |
| GET | `tgcrm/accounts/<id>/folders` | `{folders: [{id, title, emoticon, unread_chats}]}`; oxirida `{id: "archive", count}` |
| GET | `tgcrm/accounts/<id>/chats/<peer>` | Chat |
| GET | `tgcrm/accounts/<id>/chats/<peer>/messages?before=<msg_id>` | `{messages: [Xabar] (o'sish tartibida), peers: {id: {title, username, kind}}, has_more, complete, stale, notice?}` — dangasa: bazada yetmasa, shlyuz Telegram'dan 50 ta oladi; shlyuz ishlamasa — bazadagisi `stale: true` bilan |
| POST | `tgcrm/accounts/<id>/chats/<peer>/read` | `{max_id}` — o'qildi (faqat operator chatni ochganda) |
| POST | `tgcrm/accounts/<id>/sync` | Ro'yxat va papkalarni qayta sinxronlash (`{dialogs, folders}`) |
| POST | `tgcrm/accounts/<id>/chats/<peer>/send` | `{text, reply_to?}` → `201 {message}`. Matn Telegram markdown'isiz yuboriladi; 4096 belgigacha (`limits.message`). Xatolar: `403` yozish huquqi yo'q / blok, `429` slow mode yoki flood |
| POST | `tgcrm/accounts/<id>/chats/<peer>/typing` | "yozmoqda" (shlyuz 4 s da ko'pi bilan bir marta yuboradi; xato bermaydi) |

**Yozish huquqi** (`can_write` — `dialogs` va `chat` javobida): firma raqami — modulga kirishi bor xodim; shaxsiy raqam —
faqat egasi (rahbar kuzatadi, yozmaydi). CRM orqali yuborilgan xabarda `sent_by` — xodim tg_id; `messages` javobida
`staff: {tg_id: ism}`.

**Chat:** `peer_id, kind (user|bot|group|supergroup|channel), title, username, phone, verified, scam, deleted, is_self, contact,
members, online, last_seen, has_photo, top_msg_id, last_date, last_text, last_out, last_read, unread, unread_mentions,
read_inbox_max, read_outbox_max, pinned, archived, muted, draft`.

**Xabar:** `id, date, out, sender_id, text, entities [{type, offset, length, url?, user_id?, language?}] (UTF-16 offset),
media {kind: photo|video|round|voice|audio|gif|sticker|file|geo|venue|contact|poll|dice|webpage|…, …meta} | null,
action {type, …} | null (xizmat xabari), reply_to, fwd {from_id?, from_name?, date}, grouped_id (satr — albom),
edit_date, views, post_author, reactions [{emoji, custom, count, mine}], deleted (o'chirilgan — saqlanadi), read (✓✓)`.

## Real vaqt — WebSocket `/app/api/tgcrm/ws/`

Kirish: sessiya cookie yoki `?init_data=`. Faqat ko'rinadigan akkauntlar hodisalari; matn yuborilmaydi — brauzer
o'zgargan narsani API'dan qayta oladi. Har 25 s `{"type":"ping"}`.

| `type` | Maydonlar |
|---|---|
| `account` | `account` — holat o'zgardi |
| `dialogs`, `folders` | `account` — ro'yxat/papkalar yangilandi (sinxron) |
| `dialog` | `account, peer` — qadash, arxiv, ovozsiz, qoralama, o'qildi |
| `msg` | `account, peer, op: new\|edit\|delete, msg_id \| ids, out` |
| `read` | `account, peer, outbox, max_id` (outbox — suhbatdosh o'qidi ✓✓) |
| `typing` | `account, peer, user, action: typing\|voice\|video\|round\|photo\|file\|sticker\|cancel` |
| `status` | `account, peer, online` |
| `history` | `account, peer` — eski sahifa yuklandi |

## Media (4-bosqich)

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET | `tgcrm/accounts/<id>/chats/<peer>/media/<msg_id>[?thumb=1][&download=1]` | Fayl. Keshda bo'lmasa — shlyuz Telegram'dan yuklaydi (`thumb` — ~800px rasm / video eskizi). Faqat rasm/video/audio sahifada ochiladi; boshqa turlar (HTML, SVG, PDF …) — `attachment` + `application/octet-stream` (XSS yo'q). `X-Content-Type-Options: nosniff`, `Cache-Control: private` |
| POST | `tgcrm/accounts/<id>/chats/<peer>/send-file` | multipart: `file`, `kind` (`photo`\|`file`\|`video`\|`voice`\|`audio`), `caption?` (≤ `limits.caption`), `reply_to?`. **`X-Requested-With: tgcrm` sarlavhasi majburiy** (CSRF). Rasm sifatida ≤10 MB; fayl ≤ `limits.file_bytes`. `voice` — serverda ffmpeg bilan OGG/Opus'ga o'giriladi |

Xabar `media` ida: `mini` — Telegram'ning xira eskizi (`data:image/jpeg;base64,…`, ~1 KB — yuklab olishsiz darhol),
`thumb` — kichik rasm bor-yo'qligi, ovozda `wave` — 48 ustunli to'lqin (0..31).

Kesh: `TGCRM_MEDIA_DIR` (`backend/data/tgcrm/`), chegara `TGCRM_MEDIA_MAX_MB` (standart 2048) — shlyuz har 30 daqiqada
eng eskilarini o'chiradi; tugallanmagan yuklamalar 1 kundan keyin.

## Amallar, profil, qidiruv (5-bosqich)

Yozuvchi amallar — `can_write` (firma raqami: modul xodimi; shaxsiy: faqat egasi). O'chirish/tahrir/uzatish —
akkaunt jurnaliga (`events`: `msg_delete`, `msg_edit`, `msg_forward`) xodim bilan yoziladi.

| Metod | Yo'l | Tavsif |
|---|---|---|
| POST | `…/chats/<peer>/messages/<id>/edit` | `{text}` — faqat o'z xabari, Telegram 48 soat ichida |
| POST | `…/chats/<peer>/messages/delete` | `{ids: [..≤100], revoke}` — revoke: suhbatdosh uchun ham. Bazada `deleted` bilan qoladi |
| POST | `…/chats/<peer>/messages/forward` | `{ids, to}` — `to` shu akkaunt chati bo'lsin |
| POST | `…/chats/<peer>/messages/<id>/react` | `{emoji}` — bo'sh satr — reaksiyani olib tashlash |
| POST | `…/chats/<peer>/messages/<id>/pin` | `{unpin}` |
| POST | `…/chats/<peer>/pin` · `/archive` · `/mute` | `{pinned}` · `{archived}` · `{seconds: null \| 0 (doimiy) \| N}` |
| GET | `…/chats/<peer>/info` | `{about, pinned_msg_id, pinned: Xabar, members, admins, common_chats, can_write}` |
| GET | `…/chats/<peer>/members?q=` | `{members: [{peer_id, title, username, role: owner\|admin\|"", online, last_seen, has_photo}], limited}` (200 tagacha; kanal — admin bo'lsa) |
| GET | `…/chats/<peer>/search?q=&filter=&offset_id=` | Telegram'dan (butun tarix): `filter` — photo\|video\|file\|link\|voice\|music; `{messages, peers, has_more, total}` |
| GET | `tgcrm/accounts/<id>/search?q=` | Barcha chatlar bo'yicha (bazadagi xabarlar), 2 harfdan: `{results: [{chat, message}]}` (50 ta) |
| GET | `tgcrm/accounts/<id>/peers/<peer>/photo` | Profil rasmi (160px, kesh; `has_photo`) |

Jonli: `UpdateMessageReactions` → `msg` (`op: edit`).

## Operatorlar (6-bosqich)

**Rollar** (`role` — akkaunt javobida): `admin` (ulash/uzish, a'zolar, istalgan chatni biriktirish), `operator` (yozadi,
chatni o'ziga oladi), `viewer` (faqat o'qiydi).
- Firma raqami: sotuv rahbari — admin; `members` ro'yxatidagi — o'z roli; **ro'yxat bo'sh** — modulning hamma xodimi
  operator; ro'yxat bor, xodim unda yo'q — akkaunt ko'rinmaydi.
- Shaxsiy raqam: egasi — admin; ro'yxatdagi (yordamchi) — o'z roli; sotuv rahbari — kuzatuvchi (yozmaydi), lekin uza oladi.

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET / PUT | `tgcrm/accounts/<id>/members` | `{members: [{tg_id, name, role}], open, candidates, can_manage}`; PUT `{tg_id, role \| null}` (admin). Olib tashlangan xodimning chatlari bo'shaydi |
| GET | `tgcrm/accounts/<id>/staff` | Biriktirish uchun xodimlar `{staff: [{tg_id, name}], me}` |
| POST | `…/chats/<peer>/assign` | `{tg_id \| null}` — admin: istalgan operatorga; operator: o'ziga (bo'sh bo'lsa) / o'zinikini bo'shatish |
| POST | `…/chats/<peer>/lock` | "Javob yozyapman" (25 s, yozish davomida yangilanadi) → `{holder, name, mine}`; `{release: true}` — bo'shatish |
| GET | `…/chats/<peer>/lock-state` | `{holder, name, mine}` |

- `dialogs?who=mine|free` — menga biriktirilgan / biriktirilmagan mijozlar (shaxsiy chatlar). Chatda `assignee: {tg_id, name}`.
- Biriktirilmagan mijoz chatiga birinchi javob bergan operator avtomatik mas'ul bo'ladi.
- `send` / `send-file`: boshqa operator qulfi bo'lsa — `409 "<ism> hozir shu chatga javob yozmoqda."`; `force: true` — baribir.
- WebSocket: `{type: "lock", account, peer, user}` (`user: 0` — bo'shadi).
- Jurnal (`events`): `assign`, `member`, `msg_*` — o'qiladigan matn va `actor` (xodim ismi).

## CRM qatlami (7-bosqich)

Mijoz kartasi Telegram foydalanuvchisi bo'yicha (`tg_user_id` = peer_id) — bir nechta akkauntga yozsa ham bitta. Faqat
shaxsiy chatlar (guruh/kanal — `400`). Ko'rish — chatni ko'radigan; o'zgartirish — operator/admin.

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET / PATCH | `…/chats/<peer>/contact` | Karta (yo'q bo'lsa Telegram ma'lumotidan yaratiladi). PATCH: `name, company, phone, inn (9/14 raqam), source, amount, owner_tg (operator), stage, lost_reason, tags: [nom]`. `stage=lost` — `lost_reason` majburiy. Bosqich o'zgarishi — izohga yoziladi |
| POST / DELETE | `…/contact/notes[/<id>]` | Ichki izoh (mijozga yuborilmaydi); o'chirish — muallif yoki admin |
| POST | `…/contact/tasks` · `…/contact/tasks/<id>/done` | `{title, due_at (ISO), assignee_tg?}` · `{undo?}` |
| GET | `tgcrm/tags` | Barcha teglar |
| GET / POST | `tgcrm/accounts/<id>/quick-replies` | Tez javoblar (shu akkaunt + umumiy); POST `{title, text, shared?}` (shared — admin) |
| DELETE | `…/quick-replies/<id>` | Muallif yoki admin |
| GET / PATCH | `tgcrm/accounts/<id>/report?days=7` | Hisobot; PATCH `{sla_minutes}` (admin, 1–1440) |

Bosqichlar: `new` Yangi → `qualified` Ehtiyoj aniqlandi → `offer` Taklif berildi → `negotiation` Muzokara → `won` Sotildi /
`lost` Yo'qotildi.

Chatda: `waiting_since` (mijoz yozgan, javob yo'q — qachondan), `crm: {stage, tags}`; `dialogs?who=waiting` — javobsizlar.
Akkauntda `sla_minutes` (standart 15).

**Hisobot:** `incoming, replies, median_min, sla_pct, waiting_now, waiting[], staff[{name, assigned, replies, answered,
median_min, sla_pct, waiting}], funnel[], tasks_overdue`. Javob vaqti — mijozning ketma-ket xabarlaridan birinchisidan keyingi
javobgacha; javob bergan — `sent_by` (CRM orqali) yoki chat mas'uli; aks holda «Telegram ilovasidan».

**Eslatmalar:** Celery beat `tgcrm-reminders` (5 daqiqa) — muddati kelgan vazifa bajaruvchisiga Jarvis bot orqali bir marta.

## AI yordamchi (egasi qarori 2026-11-19; qayta qurilgan — `docs/tgcrm/AI_PLAN.md`)

Mijoz xabariga **darhol avtomatik** javob — barcha shaxsiy chatlar, **narxsiz**; xodimlar uchun — chat ichida savol-javob.

Oqim: shlyuz yangi kiruvchi xabar → `assistant.schedule` → Celery `tgcrm.tasks.ai_reply` (`ai_delay_sec` keyin) → himoyalar →
agent (Claude Agent SDK, `effort=low`, ichki MCP vositalar) → javob **faqat Telegram Business bot orqali** (`tgcrm/bizbot.py`,
`sendMessage` + `business_connection_id`; ulanish — `erp.crm.services.business_connection(Account.tg_user_id)`).
Telethon orqali AI yubormaydi (Telegram API ToS §1.5; Business bot — Bot ToS §5.4 bo'yicha rasmiy yo'l).
Bot yuborgan xabar shlyuzda `via_business_bot_id` → `by_ai`.

Vositalar: `find_product` (remen belgisi tahlili `tgcrm/belts.py` → 1C holati `tgcrm/stock.py`: bor / zakazga / noma'lum,
eng yaqin o'lchamlar; remen.uz — faqat nom va havola), `take_order` (mahsulot + telefon → mijoz kartasi: telefon, bosqich
«Ehtiyoj aniqlandi», izoh; mas'ulga vazifa + Jarvis bot xabari), `handoff`.
1C manbasi: `JARVIS_ONEC_DB_URL` (eski Jarvis bazasi, faqat o'qish); qoldiq `TGCRM_STOCK_MAX_AGE_H` (24) soatdan eski bo'lsa —
«noma'lum», AI «bor» demaydi. remen.uz `in_stock` ishlatilmaydi (hamma tovarda 100).

Himoyalar: faqat shaxsiy foydalanuvchi chati (guruh/kanal/bot/Saved/777000/o'chirilgan/scam — yo'q), hamkasb (staff) emas,
chatda `ai_off` emas; oxirgi xabar kiruvchi va aynan shu (ketma-ket xabarlar jamlanadi; agent ishlayotganda yangi xabar
kelsa — eskirgan javob yuborilmaydi); `ai_quiet_min` ichida odam yozgan bo'lsa — jim; chatga soatiga `ai_max_per_hour`;
ish savoli bo'lmasa / yozuvchi xaridor bo'lmasa — `SKIP`. Har harakat — `AccountEvent` (`ai_reply`, `ai_order`,
`ai_handoff`, `ai_error`).

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET / PATCH | `tgcrm/accounts/<id>/ai` | `{ai_enabled, ai_instructions, ai_delay_sec (3–600), ai_quiet_min (0–1440), ai_max_per_hour (1–30), can_edit, replies_24h, orders_24h, handoffs_24h, errors_24h, channel: {ok, detail}, stock: {ok, at, detail, items}, log: [{kind, detail, at}]}`; PATCH — admin; kanal tayyor bo'lmasa yoqish — 400 |
| POST | `…/chats/<peer>/ai-off` | `{off}` — shu chatda AI javob bermasin |
| POST | `…/chats/<peer>/ai` | Xodim uchun: `{mode: summary\|draft\|auto}` yoki `{question}` → `{answer}`; `auto` — avtomatik javob nima bo'lardi (yubormasdan, vositalar hech narsa yozmaydi) |

Quruq sinov: `manage.py tgcrm_ai_dryrun --account <id> [--limit 10 --days 7 --peer <id> --stock-max-age <soat>]` —
haqiqiy javobsiz chatlarga javob yozadi, hech narsa yubormaydi.

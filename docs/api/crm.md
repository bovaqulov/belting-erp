# CRM API — `/app/api/erp/crm/*`

Jarvis kontrakti. Frontend: `frontend/src/erp/crm/` (`/app/erp/crm`). Backend: ✅ `backend/config/apps/erp/crm/`
(`views.py` — yo'llar, `deals.py` — mantiq, `access.py` — huquq, `tg.py` — Telegram; testlar: `tests/`).
Frontend demo backendi (`src/erp/crm/demo/server.lib.ts`) — shu kontraktning brauzerdagi nusxasi: backend
`erp/me` va `crm/meta` ni bermasa (404/5xx/tarmoq) ishlaydi. Demo holati — `localStorage["crm.demo.v1"]`.

Xato: `{ "detail": "matn" }` (400 — biznes qoidasi; 403 — huquq yo'q; 404 — topilmadi yoki ko'rish huquqi yo'q;
501 — hali yo'q). Vaqt — ISO (UTC), summa — satr (`"2400000"`), sana — `YYYY-MM-DD`. Mas'ul — `owner_tg` (Telegram ID).

## Yo'llar

| Yo'l | Javob |
|---|---|
| `GET /app/api/erp/me` | `{tg_id, name, roles[], is_head, …}` |
| `GET meta` | `{pipelines: [{code, name}], stages: [{code, name, pipeline, kind: open\|won\|lost, color, probability, guide}], users: [{tg_id, name}], lost_reasons[]}` |
| `GET board?pipeline=&stage=&offset=&<filtr>` | `{counts: {pipeline: n}, stages: [{…stage, rot_days, count, amount, weighted, rotten, deals: [Deal]}]}` — bosqichda 20 tadan |
| `GET deals?pipeline=&stage=&kind=open\|won\|lost\|all&sort=&offset=&limit=&<filtr>` | `{rows: [Deal], total, amount, counts}` |
| `POST deals {counterparty_id, title, amount, owner_tg, source, need, items?, discount?, markup?, logistics?, location?}` | `DealDetail` (birinchi ochiq bosqichda). Nom oldiga `#id`. Tovarlar bo'lsa summa = tovarlar × (1 − chegirma%) × (1 + ustama%) + logistika; `location` bo'sh bo'lsa — mijoz `address` i |
| `GET/POST deals/{id}` | `DealDetail`; POST: `title, amount, close_date, probability, owner_tg, source, need, discount (0–100), markup (0–1000), logistics (≥0), location` — narxlash o'zgarsa, tovarlar bo'lsa summa qayta hisoblanadi |
| `POST deals/{id}/stage {stage, reason, recall?, recall_time?, recall_note?}` (later — sana majburiy, soat standart 10:00, izoh — vazifa matnida) | `DealDetail` (lost — sababsiz 400; tarix yoziladi) |
| `POST deals/{id}/payment {amount, via}` | `DealDetail` — to'lov qo'shiladi; oldindan to'lov yetsa → «Ishlab chiqarishda» |
| `POST intake` (sarlavha `X-Intake-Token` = `CRM_INTAKE_TOKEN`) | sayt / marketplace lidi: `{name, phone, company, inn, product, size, qty, note, source}` → lid (navbat bilan) yoki doimiy mijoz bitimi |
| `POST leads/{id}/edit {…}` · `/noanswer` | kvalifikatsiya maydonlari · javob bermadi (1, 3, 7 kun) |
| `GET/POST routing {rules: [{kind: product\|region, keywords, seller_tg}]}` | lid taqsimlash qoidalari (POST — butun ro'yxat, faqat rahbar); yangi lid: qoidalar tartib bo'yicha (mahsulot — tasma turi/o'lcham/izoh, hudud — hudud/kompaniya/izoh), mos kelmasa — navbat |
| `POST deals/{id}/stage {stage: "later", recall}` | «Keyinroq» — `recall` (kun.oy.yil yoki YYYY-MM-DD, o'tmagan) majburiy; shu kunga «qayta bog'lanish» vazifasi |
| `POST deals/{id}/items {items: [{item_id, char_id, name, unit, qty, price, discount}]}` | `{items, amount}` |
| `POST deals/{id}/doc {kind: quote\|order}` | `{id, number, kind, date, status, total}` — katalogdagi tovar bo'lmasa 400 |
| `GET docs/{id}/pdf` | hujjat PDF'i (`crm/pdf.py`, fpdf2 + DejaVu Sans — kirill/lotin), yuklab olish |
| `POST docs/{id}/send {chat_id}` | mijoz chatiga (faqat o'z chati): Telegram / WhatsApp — PDF fayl (izoh bilan), Instagram — matn (Meta fayl qabul qilmaydi); bitim tarixiga yoziladi |
| `POST docs/{id}/didox {subtype}` · `POST docs/{id}/didox-status` | Didox (`crm/didox.py`): 000 «Erkin hujjat» qoralamasi PDF bilan (`subtype`: 3 shartnoma, 4 to'lov hisobi, 7 buyurtma, 8 spetsifikatsiya, 6 boshqa); sotuvchi — Didox profili, xaridor — mijoz STIRi bo'yicha soliq bazasi (STIRsiz / topilmasa — 400). Imzo (E-IMZO) — Didox kabinetida. Hujjat JSON'ida `didox: {enabled, id, status, status_text, at, url, subtypes}`; holat 3 (ikki tomon imzoladi) — bitimda «Imzolandi». Kalitsiz — 503. Sozlash — «Didox» bo'limi |
| `GET docs/{id}` · `POST docs/{id}/confirm` | hujjat (taklif / buyurtma): `{…Doc, deal_title, lines: [{name, unit, qty, price, discount, amount}], meta: {customer, inn, location, sub, discount, markup, logistics, restored?}}` — yaratilgan paytdagi nusxa (eski hujjat — bitimning hozirgi tovarlaridan, `restored`); faqat ko'ra oladigan bitimniki (aks holda 404). `confirm` — buyurtma qoralamasini tasdiqlash (`status: posted`, `state: confirmed`; taklif — 400, takror — 409). Frontend: CRM ichidagi oyna, chop etish / PDF — brauzer orqali (`deal/doc/doc.lib.ts`) |
| `GET items?q=` | `[{item_id, char_id, name, char, unit, sku, price, free}]` (≤20) — katalog (`erp_catalog`, `catalog.services.search`): har so'z nom / kategoriya / variant / artikul / remen belgisida; `spb1650` = `SPB 1650`, lotincha ham (`remen` = `ремень`); variantli tovar (lenta kengligi) — har variant alohida qator; `price` — dona yoki 1 mm × kenglik; `free` — ombordagi erkin qoldiq (jami − band). Demo katalog: `manage.py catalog_demo [--clear]` (`crm_demo` o'zi chaqiradi) |
| `GET customers?q=` · `POST customers {kind, name, phones[], inn?, address?, position?, company?, company_inn?, owner_tg}` | `[{id, kind, name, position, company, company_inn, inn, phones, owner_tg, address}]` (20 ta; qidiruv — nom, STIR, telefon, firma nomi) · mijoz. `kind`: `company` firma (STIR 9), `employee` firma xodimi (lavozim; firma nomi majburiy, firma STIRi 9), `trader` savdogar (telefon majburiy; `address` — savdo joyi), `ip` YaTT (STIR 9 / JSHSHIR 14), `person` jismoniy shaxs (JSHSHIR 14), `state` davlat tashkiloti (STIR 9). Yangi mijoz (POST): `phones` — har doim majburiy, `inn` — `company`/`ip`/`state` da majburiy (400). Shu STIR bilan mijoz bor — 409 |
| `GET customers/table?q=&owner=&sort=next\|last\|sum\|name&offset=` | `{rows: [{id, name, inn, phones, owner_tg, bought_n, bought_sum, last_buy, cycle, next_buy, overdue, open_n}], total, overdue}` — 100 tadan; xarid — Savdo «Tovar jo'natildi»/«Muvaffaqiyatli» (tunnel nusxalari emas), `cycle` — oraliq medianasi (bitta xarid — 90 kun), `overdue` — keyingi xarid o'tgan va ochiq bitim yo'q |
| `GET/POST customers/{id}` | kartochka `{…, contacts: [{name, role, phone}], note, stats: {bought_n, bought_sum, last_buy, cycle, next_buy}, deals: [...], tg: [o'z chatlari]}`; POST: `kind, name, inn, phones[], position, company, company_inn, contacts[], note, address, owner_tg` (mas'ul — rahbar; tur qoidalari — yuqorida) |
| `GET reports?from=YYYY-MM-DD&to=YYYY-MM-DD` | hisobot (standart — joriy oy): `{from, to, head, kpi: {leads, unassigned, response_min, lead_conv, deals, won, won_sum, lost, win_rate, open_sum}, funnel: [{stage, count}], sellers: [{tg_id, name, leads, response_min, lead_conv, deals, won, won_sum, lost, open_sum, overdue_tasks}], reasons: [{reason, count, sum}], sources: [{source, leads, converted}]}`. Voronka — davrda ochilgan Savdo bitimlari qaysi bosqichgacha yetgani (tarix bo'yicha); sotuv — «Tovar jo'natildi»/«Muvaffaqiyatli» sanasi davrda; javob — lid → birinchi javob (mediana, daqiqa). Rahbar — hamma, sotuvchi — o'zi |
| `POST activity {deal_id, kind, text, due?, assignee?}` | faoliyat (vazifa — `due` majburiy) |
| `POST tasks/{id}/done {result?}` | vazifa (`done_at`, `data.result`) |
| `GET leads?status=new,work,interested&owner=&q=` · `POST leads {name, phone, company, source, note, owner_tg}` | `[Lead]` (ochiq — standart) · `Lead + {duplicate}`. Lid: `tg: {chat_id, username, unread} \| null` — Telegram'dan ochilgan |
| `POST leads/{id}/status {status: new\|work\|interested}` | ochiq bosqichlar orasida (Yangi → Ishda → Qiziqish bildirdi); yopilgan — 400 |
| `POST leads/{id}/assign {owner_tg}` · `/junk {reason}` · `/convert` | `Lead` · `Lead` · `DealDetail` (mijoz telefon bo'yicha topiladi yoki yaratiladi) |
| `GET goals?month=YYYY-MM` · `POST goals {owner_tg, month, amount}` | `{days, passed, can_edit, rows: [{tg_id, name, plan, sales, pct, won_deals, won_amount}]}` |

## Lidlar va Telegram

Sotuvchining ulangan Telegram'iga mijozga bog'lanmagan chatdan yangi odam yozsa — avtomatik «Yangi» lid (`source: telegram`,
mas'ul — shu sotuvchi, `tg_chat`); har chatdan bir marta (yaroqsiz qilingan — qayta ochilmaydi). Sotuvchi javob yozsa — «Ishda»
(`first_touch`); suhbatni sotuvchi boshlagan bo'lsa — darhol «Ishda». `convert` — chat yaratilgan mijozga biriktiriladi.

## Robotlar (backend `robots.py`, Celery beat "crm-robots" — har 5 daqiqa)

| Robot | Qachon | Nima qiladi |
|---|---|---|
| Javobsiz lid | ish vaqti 08–20 | «Yangi» lid 30 daq. javobsiz → mas'ulga Telegram; taqsimlanmagan 15 daq. → sotuv rahbarlariga (`reminded_at`, bir marta) |
| Vazifa muddati | ish vaqti | muddati o'tgan bajarilmagan vazifa → bajaruvchiga (`data.reminded`) |
| Takroriy savdo | har kuni 09:00 | xaridlar oralig'i medianasi (bitta xarid — 90 kun); keyingi xaridga 7 kun qolganda, ochiq savdo bitimi yo'q bo'lsa → `repeat` bitim (oxirgi tovarlar, mas'ul) + vazifa |

Eslatmalar asosiy bot orqali; yuborilmasa belgilanmaydi va keyingi safar qayta uriniladi.

## Sales jarayoni (egasi tavsifi 2026-11-14; mantiq — `sales.py`, migratsiya `0015_sales_stages`)

Bosqichlar (SLA soat): Yangi (24 — taklif 24 soat ichida) → Taklif yuborildi (168; kirganda 2 va 5 kunlik vazifalar) →
Keyinroq → Shartnoma va hisob-faktura (24 — imzo kuzatuvi) → To'lov kutilmoqda (72) → Ishlab chiqarishda → Tayyor (72;
kirganda mijozga Telegram xabari) → Jo'natildi / hujjatlar (72) → Yutildi / Yo'qotildi (sabab majburiy).
Qoidalar: «Ishlab chiqarishda» — oldindan to'lov (100% yoki 50%) tushgach, `POST deals/{id}/payment` dan avtomatik;
«Jo'natildi» — to'liq to'lovsiz 400; «Yutildi» — `docs_done` (yuk xati + dalolatnoma) siz 400. SLA o'tsa — mas'ulga eslatma.
Bitim maydonlari: `pay_terms` (`full`|`half`), `paid_sum`, `sign_status` (`sent`|`signed`, `sign_sent_at`), `docs_done`,
`sla_late`, `sla_hours`; kartochka: `contact`, `division`, `buyer_order`, `prod_order`, `prod_no`, `repeat`.
Lid qabuli: dublikat (telefon / STIR) — ochiq lidga izoh; doimiy mijoz (STIR / telefon / bog'langan Telegram chat) — o'z
menejeriga bitim (ochiq bitimi bo'lsa — izoh); yangi — navbat bo'yicha sotuvchiga (oxirgi 7 kunda eng kam lid olgan;
rahbarlar navbatda emas). Kvalifikatsiya: `product, size, qty, company, inn`; bitimga — tasma turi va kompaniya majburiy;
`noanswer` — 1, 3, 7 kunda qayta qo'ng'iroq, to'rtinchisida yopiladi. Didox / bank / 1C — integratsiyagacha qo'lda.
CRM — faqat Sales voronkasi (ishlab chiqarish va logistika — alohida tizim); tunnel kodi qoldi, hozir tunnel yo'q.

## Ko'rish huquqi (egasi qarori, 2026-11-14)

`GET /app/api/erp/me` → `{tg_id, name, is_head}`. `is_head` — sotuv bo'limi rahbari.

| | Sotuv bo'limi rahbari (`is_head`) | Sotuvchi |
|---|---|---|
| Bitimlar (`board`, `deals`, `deals/{id}`, `deals/bulk`, `activity`, `tags`) | hammasi | faqat `owner_tg = me`; boshqasiniki — 404 (ro'yxatlarda yo'q) |
| Mijozlar (`GET customers`, `POST deals` dagi `counterparty_id`) | hammasi | `owner_tg = me` yoki unda sotuvchining bitimi bor; boshqasiniki — 404 |
| Lidlar (`GET leads`) | hammasi, `owner` filtri bilan (`none` — taqsimlanmagan) | faqat `owner_tg = me`; `owner` filtri e'tiborsiz |
| Lidni taqsimlash (`POST leads/{id}/assign`) | ha | 403 |
| Lidni bitimga aylantirish / yaroqsiz (`convert`, `junk`) | hammasi | faqat o'z lidi |
| Mas'ulni o'zgartirish (`POST deals/{id}` `owner_tg`, `bulk` `action=owner`) | ha | 403 / qatorda xato |
| Yangi bitim, mijoz, lid (`owner_tg`) | istalgan sotuvchi (lid — bo'sh bo'lishi mumkin) | har doim `me` (yuborilgan `owner_tg` e'tiborsiz) |

Rahbar: owner/admin, Rahbariyat (sees_all) yoki «Sotuv — B2B» bo'limida xodimlari bor odam. Tekshiruv backend'da har so'rovda qo'llanadi (frontend faqat keraksiz boshqaruvlarni yashiradi).

Demo uchun qo'shimcha: `POST demo/as {tg_id}` — kim sifatida ishlash (rahbar — `seed.lib.ts` dagi `HEAD_TG`). Haqiqiy backendda bo'lmaydi.

## Telegram — sotuvchilar yozishmalari (backend: ✅ `backend/config/apps/erp/crm/{tg,views}.py`)

Alohida Telegram Business bot (`BUSINESS_CONNECTION_BOT_TOKEN`, Jarvis botidan mustaqil). Sotuvchi: Telegram → Sozlamalar →
Telegram Business → Chat-botlar → botni tanlaydi (qaysi chatlar — o'zi belgilaydi; CRM'dan javob uchun «Xabarlarga javob
berish»). Bot faqat ulangandan keyingi xabarlarni oladi. Frontend rejimi alohida: `tg/chats` 200/401/403 → haqiqiy (CRM
qolgani demo bo'lsa ham), aks holda demo.

| Yo'l | Javob |
|---|---|
| `POST tg/webhook` | Telegram (sarlavha `X-Telegram-Bot-Api-Secret-Token` = `CRM_TG_WEBHOOK_SECRET`): `business_connection`, `business_message`, `edited_business_message`, `deleted_business_messages`; botga oddiy xabar — ulash yo'riqnomasi |
| `GET tg/chats?q=&ch=` | `{bot, head, connection: {enabled, can_reply} \| null, channels, chats: [{id, title, username, seller_tg, seller, last_at, last_text, last_out, unread, channel, can_send}]}` — oxirgi xabar bo'yicha (kanallar — «WhatsApp va Instagram») |
| `GET tg/chats/{id}/messages?before=` | `{chat, messages: [{id, out, kind, text, date, edited, deleted, deleted_at, via_crm, history: [{text, kind, at}], reply: {text, kind, out, ref} \| null, media}], more}` — o'chirilgan xabar matni bilan saqlanadi; tahrirda oldingi matn `history` ga; `reply.ref` — CRM'dagi asl xabar id (ulanishdan oldingi bo'lsa null) — oxirgi 50 (eskidan yangiga); chat egasi ochsa `unread = 0` |
| `POST tg/chats/{id}/send {text, reply_to?}` yoki `{latitude, longitude, reply_to?}` (`reply_to` — CRM xabar id; send-file da ham) | yuborilgan xabar (`out`, `via_crm`) — sotuvchi nomidan; joylashuv — `kind: location`; egasi bo'lmasa 403/404, bot huquqi yo'q — 403, ulanish uzilgan — 409 |
| `POST tg/chats/{id}/send-file` (multipart: `file`, `caption?`, `as_file?`) | rasm (JPEG/PNG/WebP ≤10 MB — rasm sifatida), mp4 — video, audio, qolgani — hujjat; 50 MB gacha |
| `POST tg/chats/{id}/link {customer_id \| null}` | chatni CRM mijoziga biriktirish/ajratish (faqat o'z chati, ko'ra oladigan mijoz); chat JSON'ida `customer: {id, name} \| null`. `POST deals` da `tg_chat_id` — chat yaratilgan bitim mijoziga biriktiriladi (begona chat — 404, bitim yaratilmaydi) |
| `GET tg/messages/{id}/file` | xabar fayli (rasm, video, ovoz, hujjat, stiker) — Telegram'dan backend orqali (20 MB gacha; hujjat — yuklab olish). Xabarda `media: {url, mime, name, size, width, height, duration}` yoki joylashuv `{lat, lon}`; `file_id` brauzerga berilmaydi |
| `WS tg/ws/` (`?init_data=` — Mini App) | real vaqt: `{type: "tg", chat}` — shu chat yangilandi (matnsiz; brauzer API'dan qayta oladi), har 25 s `{type: "ping"}`. Kirish — sessiya cookie yoki initData, Origin — shu sayt/CSRF_TRUSTED_ORIGINS; CRM moduli yo'q — yopiladi (4403). Har kimga faqat o'z chatlari hodisalari. Redis `crm:tg` orqali (`live.py`); uzilsa frontend 1→30 s qayta ulanadi, oraliqda so'rov bilan yangilanadi |

Huquq (egasi qarori 2026-11-14): yozishmalar shaxsiy — har kim (rahbar ham) faqat o'z ulanishidagi chatlarni ko'radi va
javob yozadi. Boshqaning chati, xabari, fayli — 404.
Webhook: `manage.py crm_tg_webhook [--url https://…]` (`--info` — holat); `scripts/tunnel.sh` o'zi o'rnatadi.

## WhatsApp va Instagram Direct (backend: ✅ `backend/config/apps/erp/crm/meta.py`; egasi qarori 2026-11-16 — rasmiy Meta API)

Telegram'dan farqi: kompaniyaning **bitta** WhatsApp raqami (WhatsApp Cloud API) va **bitta** Instagram professional akkaunti
(Instagram API with Instagram Login). Yangi suhbat sotuvchiga taqsimlanadi: telefon CRM mijoziga mos kelsa — uning menejeri
(chat mijozga biriktiriladi), aks holda — lid taqsimlash qoidalari / navbat (`sales.next_seller`). Chat sotuvchining shu
kanaldagi «ulanishi» ostida saqlanadi (`TgConnection.channel = wa|ig`, id `wa:<tg_id>`) — Telegram bilan bir xil jadval va
yo'llar (`tg/chats…`): shaxsiylik, o'qilmagan, real vaqt, lid (`source: whatsapp|instagram`), mijozga biriktirish, chatdan bitim.

| Yo'l / maydon | |
|---|---|
| `GET/POST meta/webhook` | Meta ilovasidagi Callback URL (ikkala mahsulot uchun bitta). GET — obuna tasdig'i (`hub.verify_token` = `META_VERIFY_TOKEN`), POST — imzo `X-Hub-Signature-256` (`META_APP_SECRET`); imzosiz/noto'g'ri — 403. Takror kelgan xabar ikki marta yozilmaydi |
| `GET tg/chats?ch=tg\|wa\|ig` | `ch` bo'lmasa — barcha kanallar. Javobda `channels: {tg\|wa\|ig: {enabled, unread}}` (tab belgilari), har chatda `channel` |
| `POST tg/chats/{id}/send` | WhatsApp / Instagram — mijozning oxirgi xabaridan **24 soat** o'tgan bo'lsa 409 (Meta qoidasi: erkin xabar faqat shu oynada; WhatsApp'da keyin faqat tasdiqlangan shablon). Joylashuv — faqat WhatsApp |
| `POST tg/chats/{id}/send-file` | WhatsApp: rasm (JPEG/PNG ≤5 MB), mp4 video / audio (≤16 MB), qolgani — hujjat. Instagram — 400 (Meta faqat ochiq havola qabul qiladi) |
| `GET tg/messages/{id}/file` | WhatsApp — media ID → vaqtinchalik havola (token bilan); Instagram — CDN havolasi, faqat Meta domenlari |

Xabar ID'lari Meta'da matn (`wamid…`, `mid…`) — bazada barqaror 63-bit xesh (`message_id`), asl ID — `raw.id`.

### Sozlash (administrator; kalitlar faqat `backend/.env.local` da)

1. business.facebook.com — Meta Business akkaunti (kompaniya verifikatsiyasi — WhatsApp limitlari uchun).
2. developers.facebook.com → My Apps → Create App → turi **Business**. App settings → Basic → **App secret** → `META_APP_SECRET`.
3. **WhatsApp**: ilovaga WhatsApp mahsulotini qo'shing → API Setup: raqamni qo'shing va tasdiqlang → **Phone number ID** →
   `WA_PHONE_ID`. Business Settings → System users → doimiy token (`whatsapp_business_messaging`,
   `whatsapp_business_management`) → `WA_TOKEN`.
4. **Instagram**: akkaunt — Professional (Business/Creator). Ilovaga «Instagram API with Instagram Login» → akkauntni ulang →
   uzoq muddatli token (`instagram_business_basic`, `instagram_business_manage_messages`) → `IG_TOKEN`; akkaunt ID → `IG_USER_ID`.
   Instagram ilovasida: Sozlamalar → Xabarlar → ulangan vositalarga ruxsat.
5. Webhook: Callback URL `{JARVIS_PUBLIC_URL}/app/api/erp/crm/meta/webhook/` (oxirida «/» — aks holda Next 308 qaytaradi), Verify token — `META_VERIFY_TOKEN` (`.env.local`
   da o'zingiz qo'ying; bo'lmasa `SECRET_KEY` dan hosil bo'ladi). Obuna: WhatsApp — `messages`; Instagram — `messages`,
   `message_echoes` (Instagram ilovasidan yozilgan javoblar ham CRM'da ko'rinsin).
6. Ilova Live rejimga o'tkaziladi (ruxsatlar uchun Meta App Review talab qilinishi mumkin).

```
META_APP_SECRET=…
META_VERIFY_TOKEN=…           # ixtiyoriy
WA_TOKEN=…   WA_PHONE_ID=…
IG_TOKEN=…   IG_USER_ID=…
META_GRAPH_VERSION=v21.0      # ixtiyoriy
```

Kalitlar bo'lmasa kanal «ulanmagan» (panelda — tushuntirish), yuborish — 503. Eslatma: tez tunnel (`scripts/tunnel.sh`) manzili
har safar o'zgaradi — Meta webhook'i uchun doimiy domen kerak (tunnel bilan faqat sinov).

## Didox — elektron hujjat aylanishi (backend: `crm/didox.py`, `crm/docsend.py`; egasi so'rovi 2026-11-16)

Oqim: CRM hujjati (taklif / buyurtma) → PDF → Didox'da **000 «Erkin hujjat» qoralamasi** (status 0) → sotuvchi Didox
kabinetida (didox.uz) E-IMZO bilan imzolab yuboradi (imzo kaliti — foydalanuvchi kompyuterida, server imzolamaydi) →
mijoz imzolaydi (status 3) — CRM «Holatni yangilash» bilan ko'radi, bitimda «Shartnoma imzosi: Imzolandi».
000 turi faqat Didox ichida ishlaydi (mijoz ham Didox'da bo'lishi kerak); roumingli turlar (002 hisob-faktura, 007 shartnoma) —
keyingi bosqich (rekvizitlar, IKPU, bank — to'liq tuzilma kerak).

API (Didox partner API, ma'lumotnoma asosida — tokenlar berilganda sinov stendida tekshirilsin):
- baza: prod `https://api-partners.didox.uz`, sinov `https://testapi3.didox.uz`; sarlavhalar `Partner-Authorization` (partner
  token) + `user-key` (foydalanuvchi tokeni);
- token: `POST /v1/auth/{STIR}/password/ru {password}` → `token` (360 daqiqa, keshlanadi);
- qoralama: `POST /v1/documents/000/create {data: {Document, Subtype, SellerTin, Seller, BuyerTin, Buyer}, document: "data:application/pdf;base64,…"}` → `_id`;
  sotuvchi — `GET /v1/profile`, xaridor — `GET /v1/utils/info/{STIR}`;
- holat: `GET /v1/documents/{id}?owner=1` → `doc_status` (0 qoralama, 1 mijoz imzosi kutilmoqda, 2 sizning imzongiz, 3 imzolangan, 4 rad, 5/55 o'chirilgan, 5555 bekor).

Sozlash (`backend/.env.local`):

```
DIDOX_PARTNER_TOKEN=…   # Didox menejeri beradi (partner shartnomasi)
DIDOX_TIN=…             # kompaniya STIRi
DIDOX_PASSWORD=…        # Didox akkaunt paroli (didox.uz → Profil → Akkaunt)
DIDOX_URL=https://testapi3.didox.uz   # ixtiyoriy: avval sinov stendida
```

Birinchi imzodan oldin Didox ofertasi imzolangan bo'lishi kerak (kabinetda bir marta).

## Telefon qo'ng'iroqlari (backend: `crm/calls.py`, model `Call`; egasi so'rovi 2026-11-16)

| Yo'l | |
|---|---|
| `GET calls?customer=` | mijoz qo'ng'iroqlari (oxirgi 50): `[{id, phone, direction: in\|out, status: answered\|missed\|busy, started, duration (s), recording_url, owner_tg, note, source, deal_id}]`; rahbar — hammasi, sotuvchi — o'zi gaplashgani / o'z mijozi; begona mijoz — 404 |
| `POST calls {customer_id, deal_id?, phone?, direction, status, duration, note}` | qo'lda yozish (telefon bo'lmasa — mijozning birinchi raqami); ochiq bitim bo'lsa — tarixga «Qo'ng'iroq» |
| `POST calls/webhook/` (sarlavha `X-Calls-Token` = `CRM_CALLS_TOKEN`) | IP-telefoniya (OnlinePBX, Sipuni, Zadarma, Asterisk …) — qo'ng'iroq tugaganda: `{id, phone, direction, status, duration, started_at (ISO), recording_url? (faqat https), operator? (Telegram ID yoki ichki raqam — CRM_CALLS_OPERATORS JSON: {"101": tg_id}), provider?}`. Raqam (oxirgi 9) → mijoz, ochiq bitim → tarix; `id` takrorlansa — yangilanadi. Token bo'sh — 403 |

Bitim kartochkasining o'ng panelida — «Mijoz bilan aloqa»: Chatlar (yozishma, «Ulash» — o'z chatini shu mijozga biriktirish,
`tg/chats/{id}/link`) va Qo'ng'iroqlar (qo'ng'iroq qilish — `tel:`, tarix, yozuv pleyeri, qo'lda yozish).

## Ketma-ketlik — avtomatik bosqich o'tishlari (`sales.advance`; egasi so'rovi 2026-11-16)

Faqat oldinga (orqaga — hech qachon), faqat ochiq bitim; bosqich sharti bajarilmasa (to'lov va h.k.) — o'tmaydi.
Tarixda `src: auto` va «Avtomatik: «…» bosqichiga o'tdi — sabab» izohi.

| Hodisa | Bosqich |
|---|---|
| tijorat taklifi / buyurtma tuzildi, taklif mijozga yuborildi | `offer` Taklif yuborildi |
| buyurtma tasdiqlandi, buyurtma mijozga yuborildi, Didox'ga yuborildi (imzo — «Yuborildi») | `contract` Shartnoma va hisob-faktura |
| shartnoma imzosi «Imzolandi» (qo'lda yoki Didox status 3) | `payment` To'lov kutilmoqda |
| oldindan to'lov tushdi (50% / 100%) | `production` Ishlab chiqarishda |


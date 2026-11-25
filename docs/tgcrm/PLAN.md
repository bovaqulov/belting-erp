# TelegramCRM — tadqiqot va bosqichma-bosqich reja

Holat (2026-11-19): **1-bosqich** — ulash/uzish, haqiqiy akkaunt bilan sinaldi. **2-bosqich** — sinxron tayyor:
haqiqiy akkauntda 1987 chat + 6 papka 41 s da (flood'siz), dangasa tarix, jonli WebSocket. **3-bosqich** — klon UI v1:
2 ustun (telefonda 1), papkalar, qidiruv, matnli yozishma (yuborish, javob, qoralama, "yozmoqda", o'qildi), kim
yuborgani (sent_by). **4-bosqich** — media: xira eskiz → kichik rasm (dangasa) → to'liq (ko'ruvchi oyna), video/GIF/
video-doira/stiker/ovoz/fayl; yuborish (biriktirish, sudrab tashlash, bufer, rasm/fayl tanlovi, foiz), ovozli xabar
(MediaRecorder → ffmpeg OGG/Opus), kesh chegarasi. **5-bosqich** — tahrir, o'chirish (o'zim/hamma), uzatish, reaksiya,
xabar/chat qadash, ovozsiz, arxiv, profil paneli (avatarlar, bio, a'zolar, media/fayl/havola/ovoz), chat ichida va global
qidiruv, audit jurnali. **6-bosqich** — rollar (admin/operator/kuzatuvchi), akkaunt a'zolari, chatni biriktirish
(menga / biriktirilmagan, avto-biriktirish), javob qulfi (Redis, 25 s), o'qiladigan jurnal. **7-bosqich** — CRM qatlami:
mijoz kartasi (voronka, maydonlar, teglar, izohlar, vazifalar + eslatma), tez javoblar ("/"), SLA (javobsizlar, qizil
vaqt), hisobot (xodimlar, mediana, SLA %, voronka). **8-bosqich** — tizim holati paneli va `tgcrm_doctor`, shlyuz holati
(Redis), ogohlantirishlar (Jarvis bot, soatiga bir marta), servis shablonlari (systemd/launchd), prod yo'riqnomasi
([DEPLOY.md](DEPLOY.md)). **Reja bajarildi.** AI yordamchi — alohida reja: [AI_PLAN.md](AI_PLAN.md). Ochiq: mavjud CRM bilan bog'lash.
API: [docs/api/tgcrm.md](../api/tgcrm.md). Backend: `backend/config/apps/tgcrm/`; frontend: `frontend/src/tgcrm/` (`/app/tgcrm`).

Maqsad: alohida tizim — avval Telegram'ning to'liq ishchi klonini (veb), keyin uni CRM darajasiga chiqarish.
Ulanish — **Telethon (MTProto, foydalanuvchi akkaunti)**.
**Mavjud CRM'ga tegilmaydi.** `erp/crm` (Business bot, `tg.py`, `TgChat`/`TgMessage`) o'z holicha qoladi.
Yangi tizim undan import qilmaydi, uning jadvallariga yozmaydi.

---

## 1. Telegram va Telethon cheklovlari (tadqiqot natijasi)

### 1.1 Rasmiy qoidalar (core.telegram.org)

| Qoida | Bizga ta'siri |
|---|---|
| Norasmiy API mijozi bilan kirgan **har bir akkaunt avtomatik kuzatuvga olinadi** | Flood/spam/ommaviy yuborish — **abadiy ban**. Faqat jonli yozishma uchun ishlatamiz. |
| Har bir ilova **o'z `api_id`** ga ega bo'lishi shart; bitta telefon raqamiga bitta `api_id` | my.telegram.org'dan firma raqamida olinadi. Namuna `api_id` → `API_ID_PUBLISHED_FLOOD`. |
| `api_id` egasining raqami bilan kirishda login limitlari yumshoqroq | `api_id` ni asosiy firma raqamida olamiz. |
| Telegram'ning asosiy funksiyalariga aralashish taqiqlangan: o'qildi belgisini soxtalashtirish, online holatni yashirish, o'z-o'zini o'chiruvchi xabarlarni saqlab qolish, "yozmoqda" ni bloklash | O'qildi belgisi faqat operator chatni haqiqatan ochganda yuboriladi. "Ko'rinmas o'qish" funksiyasi qilinmaydi. |
| Ilova nomida "Telegram" so'zi bo'lishi mumkin emas ("Unofficial" bilan boshlanmasa); rasmiy logotip taqiqlangan | UI'da nom: **"TG CRM"** / "Belting Chat"; Telegram logotipi ishlatilmaydi. Kodda `tgcrm`. |
| Telegram ma'lumotlarini **AI/ML modellarini o'qitish, fine-tune qilish yoki deploy qilish** uchun ishlatish taqiqlangan | Jarvis'ga ulash (8-bosqich) oldidan alohida qaror kerak — yozishmalar bilimlar bazasi / o'qitish uchun ishlatilmaydi. |
| Qoidabuzarlik → ogohlantirish → 10 kunda tuzatilmasa API kirish yopiladi | — |
| Har bir raqamga kuniga cheklangan login urinishlari (namuna: 5) → keyin `FLOOD` ertangi kungacha | Login oqimida qayta urinishni cheklaymiz, xatoni aniq ko'rsatamiz. |
| Yangi kirishda boshqa sessiyalarga `updateNewAuthorization` keladi; tasdiqlanmasa `authorization_autoconfirm_period` dan keyin avtomatik tasdiqlanadi | Ulashda foydalanuvchiga "telefoningizda yangi sessiyani tasdiqlang" deb aytiladi. |
| Firebase SMS — faqat rasmiy ilovalarga | Kod Telegram ilovasiga (yoki SMS/qo'ng'iroq) keladi; **QR orqali kirish** — afzal yo'l. |
| **Muzlatilgan (frozen) akkaunt** — faqat o'qish; `FROZEN_METHOD_INVALID` (420), `FROZEN_PARTICIPANT_MISSING`; `help.getAppConfig` → `freeze_since_date`, `freeze_until_date`, `freeze_appeal_url` | Holatni aniqlab, akkaunt kartasida qizil ogohlantirish + apellyatsiya havolasi. Qayta urinmaymiz. |
| Ban bo'lgan, lekin qoidani buzmagan akkaunt — recover@telegram.org | Hujjatda/yordam sahifasida. |

### 1.2 Raqamli limitlar (`help.getAppConfig`, bepul / Premium)

| Kalit | Bepul | Premium |
|---|---|---|
| Xabar matni | 4096 belgi | 4096 |
| `caption_length_limit` (media izohi) | 1024 | 4096 |
| `upload_max_fileparts` × 512 KB (fayl hajmi) | ~2 GB | ~4 GB |
| `dialog_filters_limit` (papkalar) | 10 | 30 |
| `dialogs_pinned_limit` (qadalgan chatlar) | 5 | 10 |
| `channels_limit` (kanal/superguruh) | 500 | 1000 |

Limitlar qattiq kodlanmaydi — ulanishda `help.getAppConfig` dan o'qib, akkauntga yozib qo'yamiz (UI shundan foydalanadi).

### 1.3 Flood (tezlik) limitlari — amalda

Telegram foydalanuvchi akkauntlari uchun aniq raqam e'lon qilmaydi; limit **metod + kirish ma'lumoti** bo'yicha, akkaunt
yoshi, mamlakati, raqam turiga (VoIP — juda qattiq) bog'liq. Ma'lum kuzatuvlar:

| Amal | Kuzatilgan limit | Bizning siyosat |
|---|---|---|
| `messages.getHistory` | ~10 so'rov / 30 s (Telethon `iter_messages` 3000+ da 1 s kutadi) | Tarix **dangasa**: chat ochilganda oxirgi 50 ta; yuqoriga aylantirganda keyingi sahifa. Akkaunt bo'yicha navbat ≤ 1 so'rov/s. |
| `messages.search` | ~30 s kutish har 300 xabarda | Qidiruv avval **o'z bazamizdan**; Telegram qidiruvi — faqat tugma bilan. |
| `contacts.resolveUsername` | ~50 ta qisqa vaqtda → flood; 160+ ketma-ket → ban holatlari | Entity'lar (`id + access_hash`) bazada keshlanadi; username qayta-qayta resolve qilinmaydi. Kuniga limit. |
| `messages.sendMessage` | Foydalanuvchi uchun e'lon qilinmagan; ommaviy/bir xil xabarlar — `PEER_FLOOD` va ban | **Ommaviy tarqatma YO'Q.** Faqat operator yozgan xabar. Akkaunt bo'yicha: chatlar orasida ≥ 1–2 s, notanish odamga birinchi xabar — kuniga kichik limit. |
| Login | Raqamga kuniga ~5 urinish | UI'da qolgan urinish/kutish vaqti. |
| `FloodWaitError` | `.seconds` qaytaradi | `flood_sleep_threshold=30`: qisqasini Telethon o'zi kutadi; uzunini — navbat to'xtatiladi, UI'da "N soniyadan keyin" ko'rsatiladi. |
| `PeerFloodError` | Akkaunt cheklangan (spam) | Yuborish to'xtatiladi, akkaunt holati "cheklangan", @SpamBot orqali tekshirish ko'rsatmasi. |

Takeout sessiyasi (`client.takeout()`) — eksport uchun ba'zi so'rovlarga **yumshoqroq flood limit**, lekin
`TakeoutInitDelayError` (foydalanuvchi tasdiqlashi va kechikish) bor. Faqat ixtiyoriy "to'liq tarixni import" uchun.

### 1.4 Telethon texnik xususiyatlari (v1.46.0 — barqaror; v2 hali alfa → **v1 ishlatamiz**)

- **asyncio, doimiy ulanish.** Django so'rovi yoki Celery task ichida yashamaydi → **alohida "gateway" jarayoni**
  (har akkauntga bitta `TelegramClient`).
- **Bitta sessiya = bitta jarayon.** Bir sessiyani ikki joyda (masalan dev va prod, yoki 2 ta worker) bir vaqtda ishlatish
  → `AUTH_KEY_DUPLICATED`, sessiya butunlay o'ladi. Gateway faqat bitta nusxada; Redis qulfi bilan himoya.
- **`StringSession` yangilanish holatini (pts/qts/date) va entity'larni saqlamaydi** (`MemorySession` — xotirada).
  Qayta ishga tushganda o'tkazib yuborilgan xabarlar (`catch_up`) tiklanmaydi → **o'zimizning bazaga asoslangan
  Session sinfi** (auth_key shifrlangan, update state, entity kesh — PostgreSQL/SQLite).
- `catch_up=True` — ishga tushganda `getDifference` bilan bo'shliqni to'ldiradi (yuqoridagi session sharti bilan).
- `entity_cache_limit` (5000) — undan oshganini sessiyaga yozadi; bizning session buni bazaga saqlaydi.
- Hodisalar `event.chat`/`sender` siz kelishi mumkin → `get_chat()/get_sender()` (keshdan).
- `device_model`, `app_version`, `system_version` — doimiy qiymatlar (har ishga tushganda o'zgarmasin — "yangi qurilma"
  shubhasi bo'lmasin).
- Fayl tezligi uchun `cryptg` (0.6.1).
- **Qo'llab-quvvatlanmaydi:** maxfiy chatlar (secret chat — faqat telefonda), qo'ng'iroqlar (ovoz/video), story yozish
  (cheklangan). Bular klonda bo'lmaydi.

### 1.5 Business bot (mavjud CRM) va Telethon — farq

| | Business bot (hozirgi CRM) | Telethon (yangi TelegramCRM) |
|---|---|---|
| Rasmiylik / ban xavfi | rasmiy, xavf yo'q | norasmiy mijoz — kuzatuvda, noto'g'ri ishlatilsa ban |
| Premium kerakmi | sotuvchida Telegram Business (Premium) | yo'q |
| Eski tarix | yo'q (faqat ulangandan keyin) | bor |
| Guruh/kanal | yo'q, faqat shaxsiy chat | hammasi |
| Fayl | 20 MB | 2–4 GB |
| Funksiyalar | o'qish + javob | to'liq: tahrir, o'chirish, forward, reaksiya, papka, qidiruv... |

**Xavfni kamaytirish qoidalari (majburiy):** yoshi bor, haqiqiy SIM-raqamli akkauntlar (VoIP emas, yangi ochilgan emas);
ommaviy yuborish yo'q; barcha so'rovlar akkaunt navbatidan o'tadi; entity kesh; bitta gateway nusxasi;
prod va dev — **turli akkauntlar** (yoki dev'da gateway o'chiq).

---

## 2. Arxitektura

```
Brauzer (Next.js, /app/tgcrm)  ──HTTP──▶  Django API (/app/api/tgcrm/*)  ──▶  PostgreSQL (chat, xabar, entity, session)
        ▲ SSE (jonli)                         │  buyruq (Redis navbat)               ▲
        └──────── Redis pub/sub ◀─────────────┼──────────────────────────────────────┤
                                              ▼                                      │
                                   tg_gateway (asyncio jarayon)  ──MTProto──▶  Telegram
                                   har akkaunt: TelegramClient + navbat + rate limiter
```

- **Backend app:** `backend/config/apps/tgcrm/` (label `tgcrm`). Chegaralar qoidasiga bo'ysunadi: ochiq interfeys
  `services.py`; boshqa applar modeliga FK yo'q; `erp/crm` ni import qilmaydi.
  - `models.py` — `Account` (raqam, holat, limitlar, flood holati), `Session` (shifrlangan auth_key, dc, update state),
    `Peer` (user/chat/channel: id, access_hash, nom, username, rasm), `Dialog` (akkaunt × peer: o'qilmagan, qadalgan,
    papka, oxirgi xabar), `Message` (matn, entities, media meta, reply, forward, edit/delete, reaksiyalar),
    `Media` (fayl kesh), `Folder`, `Command` (gateway buyruqlari jurnali), `AuditLog` (kim nima yubordi).
  - `gateway/` — `runner.py` (jarayon, akkauntlarni ko'tarish, Redis qulf), `session.py` (Django Session),
    `handlers.py` (NewMessage, MessageEdited, MessageDeleted, MessageRead, UserUpdate/typing, ChatAction),
    `sync.py` (dialoglar, tarix sahifalari), `limiter.py` (akkaunt navbati, token bucket, flood holati),
    `commands.py` (send, edit, delete, forward, read, react, download, upload ...).
  - `views.py` / `urls.py` — REST + SSE. `management/commands/tg_gateway.py` — ishga tushirish.
- **Shifrlash:** `auth_key` — `TGCRM_SESSION_KEY` (env) bilan Fernet (`cryptography`). Bazada ochiq kalit yo'q.
- **Media:** dangasa — ko'rinishda thumbnail (Telegram'dagi stripped thumb'dan ham), to'liq fayl bosilganda
  gateway yuklaydi → `data/tgcrm/media/` → himoyalangan URL orqali beriladi.
- **Frontend:** `frontend/src/tgcrm/` (yangi domen), marshrut `frontend/app/tgcrm/`. ARCHITECTURE.md qoidalari
  (qism = papka `index.tsx` + `ui.tsx`, Tailwind, tokenlar). Telegram Web kodlari (GPL) **ko'chirilmaydi** — interfeys
  Telegram uslubida o'zimiz yoziladi.
- **dev.sh** ga gateway qo'shiladi (setsid bilan alohida jarayon).

---

## 3. Bosqichlar

Har bosqich oxirida: `backend/scripts/check.sh`, frontend tekshiruvi (tsc, eslint, test, build), 360–1440 px,
qo'lda sinov va sizning tasdiqingiz. Keyingi bosqichga faqat tasdiqdan keyin o'tiladi.

### 0-bosqich — tayyorgarlik (siz bilan)
- my.telegram.org → `api_id` / `api_hash` (firma raqamida). `.env.local`: `TGCRM_API_ID`, `TGCRM_API_HASH`,
  `TGCRM_SESSION_KEY`.
- Sinov akkaunti: haqiqiy SIM, kamida bir necha oylik. Prod akkauntlari bilan dev'da ishlamaymiz.
- `uv add telethon cryptg cryptography`.

### 1-bosqich — Gateway asosi va ulanish
- App skeleti, modellar, migratsiya, shifrlangan Django Session.
- Ulash oqimi: raqam → kod → (2FA parol) va **QR orqali kirish**; xatolar: noto'g'ri kod, FLOOD, 2FA, frozen.
- Gateway jarayoni: bitta nusxa (Redis qulf), akkauntlarni ko'taradi, `catch_up`, qayta ulanish, holat (online / flood /
  cheklangan / frozen / chiqib ketgan) bazaga va SSE'ga.
- Limiter + buyruq navbati (Redis) + `FloodWait`/`PeerFlood` siyosati.
- Testlar: Telethon client soxta (fake) bilan — haqiqiy Telegram'ga ulanmasdan.
- **Natija:** sahifada akkauntni ulash/uzish, holati ko'rinadi.

### 2-bosqich — Sinxronlash
- Dialoglar ro'yxati (sahifalab, `offset_date`), papkalar (`GetDialogFilters`), qadalganlar, arxiv.
- Xabarlar: chat ochilganda oxirgi 50 ta, aylantirganda sahifa; bazada saqlanadi.
- Jonli: yangi/tahrir/o'chirish/o'qildi/yozmoqda/online → baza → Redis → SSE.
- Qayta ishga tushganda bo'shliq to'ldirilishi (catch_up) testi.

### 3-bosqich — Klon UI v1 (matn)
- Telegram uslubidagi karkas: kompyuterda 3 ustun (papkalar | chatlar | suhbat (+ profil paneli)),
  telefonda bitta ustunli navigatsiya. Akkaunt almashtirgich.
- Chat ro'yxati: avatar, nom, oxirgi xabar, vaqt, o'qilmagan soni, qadalgan, ovozsiz, onlayn nuqta, qidiruv.
- Suhbat: pufakchalar, kun ajratgichlari, reply, forward belgisi, tahrirlangan, ✓/✓✓, yuqoriga cheksiz yuklash,
  "pastga" tugmasi, matn formatlash (entities), havolalar.
- Yozish: matn, reply, Enter/Shift+Enter, qoralama, "yozmoqda" yuborish, o'qildi — faqat ko'ringanda.

### 4-bosqich — Media
- Rasm/video/GIF/stiker/ovozli/video-doira/fayl/kontakt/joylashuv ko'rinishi; thumbnail → to'liq yuklash.
- Yuborish: fayl/rasm (drag & drop, buferdan), progress, ovozli xabar yozish.
- Media kesh tozalash siyosati (hajm limiti).

### 5-bosqich — To'liq klon funksiyalari
- Tahrir, o'chirish (o'zim/hammadan), forward, reaksiyalar, qadash, ovozsiz qilish, arxiv, papkalar boshqaruvi.
- Guruh/kanal: a'zolar, adminlar, kanal postlari, izohlar; profil paneli (umumiy media, fayllar, havolalar).
- Global qidiruv (avval bazadan), chat ichida qidiruv, kontaktlar.

### 6-bosqich — Ko'p akkaunt va operatorlar
- Bir nechta firma raqami; ERP xodimlariga akkaunt/chat bo'yicha huquq (ko'rish / yozish / admin).
- Chatni operatorga biriktirish, "hozir kim yozmoqda" qulfi (ikki operator bir chatga bir vaqtda javob bermasin).
- Audit: har yuborilgan xabar — qaysi xodim yuborgani.

### 7-bosqich — CRM qatlami
- Chat → **mijoz/lid kartasi** (TelegramCRM ichida, o'z jadvallari): kompaniya, telefon, INN, manba, mas'ul.
- Teglar, holatlar (voronka), izohlar (faqat ichki — mijozga ketmaydi), vazifalar/eslatmalar.
- Tez javoblar (shablonlar) — operator bosib yuboradi (avtomatik ommaviy emas).
- SLA: javobsiz qolgan chatlar, javob vaqti; xodimlar bo'yicha hisobot.
- Mavjud CRM bilan bog'lash — **keyinroq va faqat sizning qaroringiz bilan** (services orqali, CRM kodi o'zgarmasdan
  yoki ikkala tomonda alohida kelishuv bilan).

### 8-bosqich — Mustahkamlash va prod
- Flood/cheklov paneli, akkaunt sog'ligi, ogohlantirishlar (Telegram bot orqali adminga).
- Zaxira nusxa, media kesh limiti, monitoring, prod'da gateway servisi (bitta nusxa).
- AI yordamchi — [AI_PLAN.md](AI_PLAN.md) (javob faqat Business bot orqali, ToS bo'yicha).

---

## 4. Qarorlar (egasi, 2026-11-19)

1. Ikkala tur ulanadi: **firma raqamlari** (`kind=company` — modulga kirishi bor xodimlar ko'radi) va
   **sotuvchilarning shaxsiy raqamlari** (`kind=personal` — faqat egasi va sotuv rahbari).
2. `api_id`/`api_hash` — egasi o'zi `.env.local` ga yozadi (`TGCRM_API_ID`, `TGCRM_API_HASH`).
3. Sinov uchun eski, haqiqiy akkaunt bor.
4. Tarix — dangasa (faqat ochilgan chat, aylantirganda sahifa).

Texnik eslatmalar (1-bosqich): `cryptg` Python 3.12 + bu muhitda kompilyatsiya bo'lmadi — ixtiyoriy tezlatgich, usiz
ishlaydi. Telethon async sessiya qo'llovi "eksperimental" va hamma chaqiruv `await` qilinmaydi → sessiya xotirada
(`MemorySession` asosida), bazaga snapshot gateway tomonidan asinxron yoziladi.

## Manbalar

- Telegram API ToS — https://core.telegram.org/api/terms
- api_id va kuzatuv — https://core.telegram.org/api/obtaining_api_id
- Avtorizatsiya, frozen akkaunt — https://core.telegram.org/api/auth
- Client limitlari (appConfig) — https://core.telegram.org/api/config
- Takeout — https://core.telegram.org/api/takeout
- Telethon xatolar va flood — https://docs.telethon.dev/en/stable/concepts/errors.html
- Telethon FAQ (ban, PeerFlood, sessiya) — https://docs.telethon.dev/en/stable/quick-references/faq.html
- Telethon TelegramClient — https://docs.telethon.dev/en/stable/modules/client.html
- Telethon manbasi (StringSession, iter_messages wait_time) — https://github.com/LonamiWebs/Telethon/tree/v1/telethon

# TG CRM — AI yordamchi (qayta qurish rejasi)

Egasi talabi (2026-11-19): ulangan akkauntga AI yordamchi — mijozlarga darhol avtomatik javob, barcha shaxsiy chatlar,
narx aytilmaydi (menejerga), CRM ichida xodimlarga ham yordamchi. Birinchi tez versiya noto'g'ri ma'lumot berishi
aniqlangani uchun **o'chirildi** (akkaunt 3, `ai_enabled=False`); bu reja — izlanishdan keyin to'g'ri qurish.

## 1. Izlanish natijalari

| # | Topilma | Ta'siri |
|---|---|---|
| 1 | remen.uz API'dagi `in_stock` hamma tovarda 100 (to'ldiruvchi qiymat) | birinchi versiya hamma narsani "bor" der edi — **manba sifatida yaroqsiz** |
| 2 | Haqiqiy qoldiq — eski Jarvis bazasidagi 1C jadvallari (`onec_item` 6918, `onec_stock` NB 6675 / BR 1520) | yagona ishonchli manba; yangi ERP katalogi hali demo (33 tovar) |
| 3 | 1C sinxroni 16.11 18:01 dan beri to'xtagan: 1C server manzili DNS'da ochilmayapti | qoldiq eskirishi mumkin → **yangilik nazorati** shart (eski bo'lsa "bor" demaydi) |
| 4 | Telegram API ToS §1.5: Telegram'dan olingan ma'lumotni AI'ni "deployment" qilishga ishlatish taqiqlangan; §1.4 — foydalanuvchi nomidan amallar faqat uning roziligi bilan | shaxsiy akkauntdan (Telethon) avtomatik AI xabar yuborish — akkaunt xavfi |
| 5 | Bot Developer ToS §5.4: Telegram Business'ga ulangan bot shaxsiy chatlardagi xabarlarga javob berishi **rasman ruxsat etilgan** (egasi chatlarni o'zi tanlaydi, bot faoliyati egadan yashirilmaydi) | to'g'ri kanal — Business bot |
| 6 | Egasi akkaunti @BeltingBusinessBot'ga Business orqali ulangan: `can_reply=True`, webhook ishlayapti (mavjud CRM, `erp/crm/tg.py`) | yuborish uchun hamma narsa tayyor; mavjud CRM kodi o'zgarmaydi |
| 7 | Telethon xabarda `via_business_bot_id` bor | AI (bot) yuborgan xabarni odam yozganidan aniq ajratish mumkin |
| 8 | Business bot xabarida tugma (reply_markup) yo'q; javob oynasi — mijozning oxirgi xabaridan 24 soat | oddiy matn; eski @Remenuz_bot'ning tugmali formati ishlatilmaydi |
| 9 | LLM kechikishi: bir martalik so'rov 3–4 s, doimiy mijoz 1–2 s. Birinchi versiyadagi ~25 s — katta prompt + standart fikrlash darajasi | `effort="low"`, vositalar bilan 1–3 qadam ≈ 5–10 s — yetarli (baribir 8 s jamlash kechikishi bor) |
| 10 | Eski @Remenuz_bot (sinovdan o'tgan): "avval qidir, keyin so'ra", buyurtma = mahsulot + telefon, narx qat'iy taqiq, prompt-injection qoidalari, til moslash, `parse_spec` (remen belgisi tahlili), mavjudlik faqat bor/yo'q/zakazga | prompt va qoidalar shu yerdan ko'chiriladi |

## 2. Qarorlar

- **Kanal**: kiruvchi xabarni Telethon shlyuzi ko'radi (hozirgidek, `assistant.schedule`); javob **faqat Business bot orqali**
  (`sendMessage` + `business_connection_id`). Telethon orqali AI yubormaydi. Ulanish yo'q / chat Business ro'yxatida
  emas / huquq yo'q → javob yo'q, faqat menejerga xabar.
- **Mavjudlik**: 1C (eski Jarvis bazasi, faqat o'qish, `JARVIS_ONEC_DB_URL`). Qoldiq 24 soatdan eski bo'lsa — "bor" deyilmaydi,
  "menejer aniqlab beradi". Mijozga faqat holat: bor / zakazga (son, ombor, kod — hech qachon).
- **remen.uz** — faqat mahsulot nomi va havola (in_stock ishlatilmaydi).
- **Model**: Claude Agent SDK, ichki MCP vositalar, `effort="low"`, `max_turns=6`, o'rnatilgan vositalar taqiqlangan.
- **Narx**: hech qachon. Buyurtma (mahsulot + telefon) → mijoz kartasi (telefon), vazifa, mas'ulga Jarvis bot xabari.

## 3. Bosqichlar (ketma-ket, har biri test bilan)

1. **Remen belgisi tahlilchisi** — `tgcrm/belts.py`: eski `belts.parse` (sof funksiya) + uzunlik solishtirish; eski testlardagi misollar.
2. **1C mavjudlik adapteri** — `tgcrm/stock.py`: ixtiyoriy faqat-o'qish ulanish, yangilik nazorati, profil+uzunlik (+qovurg'a)
   mosligi, eng yaqin o'lchamlar; natija faqat `bor | zakazga | noma'lum`. Testlar — soxta jadval bilan.
3. **Business bot yuborish** — `tgcrm/bizbot.py`: egasining ulanishini topish (Bot API `getBusinessConnection`, mavjud CRM
   jadvaliga bog'lanmasdan), `sendMessage`, xatolarni tasniflash. Shlyuz: `via_business_bot_id` → `Message.by_ai`.
4. **Agent** — `assistant.py` qayta: vositalar `find_product`, `take_order`, `handoff`; eski bot promptidan qoidalar; himoyalar
   (chat turi, odam yozmoqda — bot xabarlari hisobga olinmaydi, soatlik limit, oxirgi xabar, 24 soat oynasi).
5. **Quruq sinov** — `manage.py tgcrm_ai_dryrun`: haqiqiy oxirgi kiruvchi xabarlarga javob yozadi, **yubormaydi**; natijani ko'rib chiqish.
6. **UI** — AI paneli: kanal holati (Business ulanishi, javob huquqi), 1C qoldiq sanasi, "Sinab ko'rish" (yubormasdan javob).
7. **Yoqish** — tekshiruvlar (check.sh, frontend) va quruq sinov yaxshi bo'lsa; birinchi kun AI xabarlarini kuzatish.

## 4. Holat

- [x] Izlanish, xavfli versiya o'chirildi
- [x] 1 belgi tahlilchisi (`belts.py`, 23 test) · [x] 2 1C adapteri (`stock.py`) · [x] 3 Business bot (`bizbot.py`,
  `erp/crm/services.py` — faqat o'qish) · [x] 4 agent (`assistant.py`) · [x] 5 quruq sinov (`tgcrm_ai_dryrun`) · [x] 6 UI
- [x] 7 yoqildi (2026-11-19, akkaunt 3); kuzatuv — panelda «AI jurnali», xatolar `ai_error`

### Quruq sinov natijalari (2026-11-19)

- Haqiqiy 15 ta javobsiz chat: shaxsiy/hamkasb/ta'minotchi xabarlari — SKIP; matnsiz rasm — menejerga uzatildi.
  Topilgan va tuzatilgan: hamkasblar ham ro'yxatda edi (staff tekshiruvi), rasm haqida "ko'ra olmayapman" deyardi (media → handoff),
  kirill javobda lotin so'z aralashgan, ta'minotchining "ro'yxatga yozing" xabariga javob bergan (xaridor emas → SKIP),
  ichki jarayonni sharhlagan ("natijalar mos kelmadi").
- Namunaviy savollar: SPB 1650 (zakazga, yaqini SPB 1600; narx — menejer), ruscha 8PK2553 + B 1450, B 2900 10 ta + telefon
  (buyurtma yozildi), prompt-injection (rad etildi), konveyer lenta (o'lcham + telefon so'raldi). Javob 3–10 s.
- 1C qoldig'i 16.11 dan yangilanmagan (1C server manzili ochilmayapti) — 24 soat chegarasi tufayli AI hozir bor-yo'qni
  "menejer aniqlab beradi" deydi; 1C sinxroni tiklansa avtomatik "bor / zakazga" aytadi.

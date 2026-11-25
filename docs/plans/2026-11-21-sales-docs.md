# Savdo hujjatlari (1C UNF uslubida) — 2026-11-21

Talab: egasi 1C «Управление компанией для Узбекистана» skrinshotlarini yubordi (tezkor amallar, «Документы по
продажам» jurnali, «Расходная накладная» formasi, «Создать на основании») va «Savdo hujjatlarini qurish» ni tanladi.

## 1. Tadqiqot

### 1C (Jarvis `office.db`: `onec_doc` 46 315, `onec_doc_line` 94 914, `onec_payment` 22 340, `onec_settlement`)

| 1C hujjati | Jarvis `tur` | Soni (BR+NB) | Holat / maydonlar |
|---|---|---|---|
| Заказ покупателя | `buyurtma` | 21 979 | holati: «В работе» / «Завершен»; kontragent, shartnoma, ombor, mas'ul |
| Расходная накладная | `sotuv` | 23 477 | o'tkazilgan / yozilgan / o'chirilgan; asos — buyurtma |
| Поступление в кассу / на счет | `kirim_kassa` / `kirim_bank` | 22 340 | operatsiya «От покупателя», asos — «Заказ покупателя № … от …» |
| Счет на оплату, Счет-фактура | — (skrinshotda) | — | buyurtma / yuk xati asosida; schyot-faktura — Didox (ESF) orqali |
| Взаиморасчеты | `onec_settlement` | 1 803 | mijoz × shartnoma: xaridor qarzi, xaridor avansi, saldo |

Raqamlash: baza + prefiks + tartib (`Н-0Н-001904`), har yil boshidan. Qatorlar: tovar, xarakteristika (o'lcham),
miqdor, birlik, narx, summa, QQS (narx «с НДС» — QQS ichida). «Создать на основании» (yuk xatidan): hisob, to'lov
(bank/kassa/karta), schyot-faktura, korrektirovka, voqea.

### Belting ERP'da hozir

- CRM: bitim (tovarlar, chegirma, ustama, logistika, to'lov sharti, 1C raqamlari qo'lda), hujjat — faqat tijorat
  taklifi va buyurtma qoralamasi (PDF, Didox); bitim → sex → ombor yig'ish navbati (`crm:<id>`) → skaner bilan jo'natish
  (ombor «sale» hujjati, qoldiq kamayadi).
- Mijoz — CRM `Customer` (STIR, telefon, manzil, kontaktlar); shartnoma — moliya `Contract` (kontragent STIRi, firma);
  firma — ombor `Firm` (BR, NB); narx — katalog narx siyosati (AppSheet), chegirma chegarasi — rolga qarab.
- `erp/sales` — bo'sh skelet; savdo hujjatlari jurnali, hisob, yuk xati (narx/QQS bilan), to'lov, mijoz qarzi — yo'q.

## 2. Reja

1. **Model** (`erp/sales`): `SaleDoc` — turi (`order` buyurtma, `invoice` hisob, `shipment` yuk xati, `vat_invoice`
   schyot-faktura, `receipt` to'lov), raqam (`<firma>-<tur>-<yy>-<00001>`, o'z hisoblagichi), sana, firma, mijoz (CRM
   ID + nom/STIR nusxasi), shartnoma (moliya ID + matn), ombor, CRM bitimi, asos (`base`), holat (qoralama / o'tkazilgan /
   bekor), qatorlar (tovar, variant, nom, birlik, miqdor, narx, chegirma %, summa, QQS), jami, QQS, to'lov usuli (bank /
   kassa / karta), izoh, muallif.
2. **Mantiq** (`docs.py`): yaratish/tahrirlash (qoralama), o'tkazish / qaytarish, bekor qilish; «asosida yaratish»
   (buyurtma → hisob / yuk xati / to'lov; hisob → yuk xati / to'lov; yuk xati → schyot-faktura / to'lov) — qatorlar,
   mijoz, shartnoma, firma ko'chadi, to'lov summasi — asosning qolgan qarzi; QQS hisobi (narx QQS ichida); chegirma —
   narx siyosati chegarasi; yuk xati o'tkazilsa — ombor yig'ish navbati (`sale:<id>`), CRM bitimidan bo'lsa — bitimning
   o'z navbati ishlatiladi (takror yo'q); jo'natildi — holat «jo'natildi».
3. **Hisob-kitob** (`settle.py`): mijoz qarzi = o'tkazilgan yuk xatlari − to'lovlar (shartnoma kesimida ham);
   buyurtma bo'yicha to'langan / qolgan.
4. **API** (`/app/api/erp/sales/*`): jurnal (tur guruhi, davr, mijoz, holat, qidiruv), hujjat, saqlash, o'tkazish,
   bekor, asosida yaratish, PDF, mijozlar qarzi, mijoz qidiruvi (CRM), shartnomalar (moliya, STIR bo'yicha), tovar
   qidiruvi (katalog narxi bilan). Ruxsat — yangi `sales` moduli (sotuv bo'limlari, buxgalteriya, rahbariyat).
5. **Frontend** (`/app/erp/savdo`): tezkor amallar (buyurtma, hisob, sotish, to'lov qabul qilish; hujjatlar, qarzlar),
   jurnal (1C kabi filtr belgilari, jadval / telefon ro'yxati, mijoz paneli), hujjat formasi (sarlavha, tovarlar
   jadvali, jami/QQS, «O'tkazish va yopish», «Saqlash», «O'tkazish», «Asosida yaratish», chop etish), qarzlar.
6. **Audit:** testlar, `check.sh`, frontend, brauzer 390/1440, hujjat `docs/api/sales.md`, ERP bosh sahifasi.

## 3. Rejani tekshirish (xatolar va tuzatishlar)

| # | Xavf | Tuzatish |
|---|---|---|
| 1 | Bir bitim uchun ikki marta ombor navbati (CRM `crm:<id>` va yuk xati `sale:<id>`) — tovar ikki marta jo'natiladi | Yuk xati bitimga bog'langan bo'lsa — yangi navbat ochilmaydi, bitimning jo'natish holati ko'rsatiladi |
| 2 | O'tkazilgan hujjatni tahrirlash — qarz va ombor buziladi | Tahrir faqat qoralamada; o'tkazilganini avval «qaytarish» (yuk xati jo'natilgan bo'lsa — qaytarib bo'lmaydi) |
| 3 | Raqam 1C raqamlari bilan to'qnashishi (Н-0Н-…) | O'z formati `BR-YX-26-00001` (lotin), alohida hisoblagich |
| 4 | Mijoz CRM'da, shartnoma moliyada (boshqa kontragent jadvali) — FK applararo taqiqlangan | ID + nusxa (nom, STIR); shartnomalar STIR bo'yicha `finance.services` orqali |
| 5 | Sotuvchi boshqa sotuvchining mijozini ko'rishi (CRM qoidasi) | Mijoz qidiruvi `crm.services` orqali foydalanuvchi huquqi bilan; jurnal — sotuvchiga o'z hujjatlari, rahbar/buxgalteriyaga hammasi |
| 6 | Narx/chegirma siyosatini chetlab o'tish | Narx katalogdan (`price_of`), chegirma — `max_discount`; qo'lda narx — qatorda ko'rinadi |
| 7 | QQS yaxlitlash farqi (qator vs jami) | Har qatorda QQS = summa × r / (100 + r), 2 xonali; jami — qatorlar yig'indisi |
| 8 | To'lov asosning qarzidan ko'p | Ruxsat (avans), lekin ogohlantirish; qarz manfiy — «avans» deb ko'rsatiladi |
| 9 | Bekor qilingan hujjat qarzga ta'sir qilishi | Faqat `posted` hujjatlar hisobga olinadi |
| 10 | Telefon (Telegram) — keng jadval sig'maydi | Telefonda ro'yxat qatorlari, forma — bosqichli bo'limlar; ≥44 px bosish |
| 11 | Schyot-faktura Didox'ga yuborilishi talab qilinishi | 1-bosqichda — hujjat va PDF; Didox ESF — keyingi bosqich (crm/didox.py tayyor mijoz bor) |

## 4. Natija (2026-11-21)

| Bosqich | Holat | Tekshiruv |
|---|---|---|
| 1. Model | `SaleDoc`, `Seq`; `sales` moduli (sotuv, buxgalteriya) | — |
| 2. Mantiq | saqlash, o'tkazish/qaytarish/bekor, asosida yaratish, QQS, chegirma siyosati, ombor navbati (bitimdan — takrorsiz), jo'natildi hook'i | `sales/tests/test_api.py` (5 ssenariy) |
| 3. Hisob-kitob | mijozlar qarzi, hujjat bo'yicha to'langan/qolgan | test: 1 480 000 − 1 000 000 = 480 000 |
| 4. API | jurnal, hujjat, amallar, PDF, bitimdan, qarzlar, mijoz/tovar/ma'lumotnomalar | ruxsat va ko'rinish testlari |
| 5. Frontend | `/app/erp/savdo`: tezkor amallar, jurnal (tur belgilari, davr, qidiruv), hujjat formasi (zanjir, kontakt paneli, PDF), qarzlar; ERP bosh sahifasida «Sales»; CRM bitimida «Savdo hujjati» | tsc, eslint, 321 test, build; brauzer 1440/390: buyurtma → yuk xati → to'lov → qarz; bitimdan buyurtma |

Topilgan va tuzatilgan: sana UTC'da qaytishi (endi mahalliy vaqt), brauzer soati boshqa bo'lsa yangi hujjat sanasi
siljishi (sana faqat qo'lda o'zgartirilsa yuboriladi), kiritish maydonlari rangi, narxsiz tovar ogohlantirishi.

Keyingi bosqich (egasi bilan): schyot-fakturani Didox (ESF) ga yuborish; qaytarish (возврат) va korrektirovka; bitim
darajasidagi chegirma/ustama/logistikani buyurtmaga ko'chirish; 1C'dagi eski hujjatlar va qarz qoldiqlarini import
qilish (Jarvis `onec_doc`, `onec_settlement`).

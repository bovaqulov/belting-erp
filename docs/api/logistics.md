# Logistika API

Jo'natmalarni qo'lda yuritish (`/app/erp/logistics`). Tashuvchilar: EMU, Yandex Go, Bito, Fargo (faqat shu to'rttasi).
Ruxsat: `logistics` moduli — logistika va ombor bo'limlari, rahbariyat, ega/admin (aks holda 403). Tashuvchi API'lari
(narx hisoblash, avtomatik kuzatuv) — kalitlar berilgach; hozir trek raqami va holat qo'lda.

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET | `/app/api/erp/logistics/meta` | tashuvchilar, holatlar (`next` — ruxsat etilgan o'tishlar), to'lovchilar |
| GET | `/app/api/erp/logistics/shipments?status=active\|<holat>&carrier=&q=` | ro'yxat (300 ta), `counts` (holat bo'yicha, qidiruv/tashuvchi filtri bilan), `active` |
| POST | `/app/api/erp/logistics/shipments` | yaratish → jo'natma (`number` = `LG-<yy>-<00001>`) |
| GET | `/app/api/erp/logistics/shipments/<id>` | jo'natma + `history` |
| POST | `/app/api/erp/logistics/shipments/<id>` | tahrirlash (faqat faol: yangi/topshirildi/yo'lda; aks holda 409) |
| POST | `/app/api/erp/logistics/shipments/<id>/status` | `{status, note?}` — holat o'tishi (ruxsat etilmagan — 409) |

Jo'natma: `carrier` (emu, yandex_go, bito, fargo), `recipient`*, `phone`, `city`/`address` (kamida bittasi),
`places` (1–999), `weight_kg`, `cost` (so'm; "120 000", "3,5" ham qabul qilinadi), `payer` (us | customer), `track_no`,
`ref` (buyurtma/bitim raqami — matn), `note`. Tekshiruv xatosi — 422 `{"detail": {"<maydon>": "<matn>"}}`.

Holatlar: `new` → `handed` | `cancelled`; `handed` → `transit` | `delivered` | `returned` | `cancelled`;
`transit` → `delivered` | `returned`. `delivered`, `returned`, `cancelled` — yakuniy. Har o'tish `history` ga
`{ts, status, by (tg_id), note}` bo'lib yoziladi.

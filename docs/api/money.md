# Pul API — `/app/api/erp/money/*` (frontend `/app/erp/pul`)

1C «Деньги» o'rnini bosuvchi bo'lim. Reja: `docs/plans/2026-11-21-money.md`; yo'l xaritasi:
`docs/plans/2026-11-21-1c-roadmap.md`. Backend: `backend/config/apps/erp/money` (`ledger.py`).
Ruxsat — `money` moduli (buxgalteriya, rahbariyat, ega/admin).

**Hisob** (`Account`): firma, turi (`cash` kassa / `bank` / `card` ekvayring), nom, hisob raqam, bank, MFO, valyuta,
boshlang'ich qoldiq va sanasi (1C importi), `main` — firma+turi bo'yicha asosiy (sotuv to'lovlari shu yerga).
**Qoldiq** = boshlang'ich + o'tkazilgan kirim − chiqim − chiqib ketgan o'tkazish + kelgan o'tkazish (`amount_to`);
har hisob o'z valyutasida.

**Hujjat** (`MoneyDoc`): `in` kirim (`<firma>-KR-yy-n`), `out` chiqim (`CH`), `transfer` o'tkazish (`OT`). Operatsiya:
kirim — `customer`, `loan`, `other`; chiqim — `supplier`, `salary`, `tax`, `expense`, `loan`, `refund`, `other`.
Kontragent: `customer` (CRM), `supplier` (moliya kontragenti), `employee` (maosh ro'yxati), `other` (matn). Modda —
yo'nalishga mos (bo'sh bo'lsa — operatsiya bo'yicha tizim moddasi). Qoidalar: qoralama → o'tkazilgan → qaytarish /
bekor; chiqim va o'tkazish qoldiqdan oshmaydi (409); qaytarish qoldiqni manfiy qilmaydi (kirim, o'tkazish);
valyuta har xil o'tkazishda `amount_to` majburiy. Sotuv to'lovi (`sales` receipt) o'tkazilsa — ko'zgu kirim
(`source: sales:<id>`, faqat o'qish), sotuvda qaytarilsa — o'chadi.

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET / POST | `accounts[?all=1]`, `accounts/<id>` | hisoblar (qoldiq bilan), yaratish / tahrirlash |
| GET / POST | `items`, `items/<id>` | pul oqimi moddalari |
| GET / POST | `docs?kind=&status=&account_id=&firm=&from=&to=&q=`, `docs/<id>` | jurnal, hujjat, saqlash (`post: true` — darhol o'tkazish) |
| POST | `docs/<id>/post`, `unpost`, `cancel` | amallar |
| GET | `flow?from=&to=&firm=` | pul oqimi: hisoblar (boshi, kirim, chiqim, oxiri), moddalar |
| GET | `parties?kind=customer|supplier|employee&q=` | kontragent qidiruvi |
| GET | `refs` | firmalar, hisob turlari, operatsiyalar |

1C importi: `manage.py money_import_1c <office.db> [--dry-run]` — `onec_cash` (kassalar, bank hisoblari, qoldiq va
sana); qayta import qoldiqni yangilaydi, hujjatlarga tegmaydi.

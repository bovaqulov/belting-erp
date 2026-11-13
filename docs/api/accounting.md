# Accounting API — Shartnomalar va Maoshlar (taklif)

Accounting (`/app/erp/moliya`, frontend `frontend/src/erp/finance/`) — 3 qism: **Mahsulotlar** (`docs/api/catalog.md`),
**Shartnomalar**, **Maoshlar**. Jarvis'da shartnoma uchun faqat `erp.contract` jadvali bor (UI/API yo'q), maosh uchun —
hech narsa. Quyidagi kontrakt — frontend va demo backend (`src/erp/finance/demo/contracts.lib.ts`, `payroll.lib.ts`)
shunga yozilgan; backend (`backend/config/apps/erp/finance/`) shu shakllarni qaytarishi kerak.

Xato: `{ "detail": "matn" }` — 400 qoida, 403 ruxsat, 404 topilmadi.

## Shartnomalar

`Contract`: `{id, number, date, kind: "sale"|"purchase"|"service", counterparty_id, counterparty, inn, firm_id, firm (kod),
currency: UZS|USD|RUB|EUR, amount|null, pay_days|null (0 — oldindan), credit_limit|null, valid_until|null, signed (Didox),
active, note, state, days_left}`. `state` serverda bugungi sanadan: `closed` (active=false) → `draft` (imzosiz) →
`expired` (muddati o'tgan) → `expiring` (≤30 kun) → `active`.

| Yo'l | Javob / qoida |
|---|---|
| `GET /app/api/erp/contracts?q=&kind=&state=` | `[Contract]` — faollar oldin, keyin sana bo'yicha (yangi oldin). `state=attention` — draft + expiring + expired. `q` — raqam, kontragent, INN, izoh |
| `GET /app/api/erp/contracts/{id}` | `Contract` |
| `POST /app/api/erp/contracts` `{id?, number?, date, kind, counterparty_id, firm_id, currency, amount?, pay_days?, credit_limit?, valid_until?, signed, note?}` | `Contract`. Raqam bo'sh — `<firma>-<yil>/<NNN>` (shu firma+yil maksimumidan keyin); raqam takrorlanmaydi; `valid_until ≥ date`; summa/limit/muddat ≥ 0; yopilgan shartnoma tahrirlanmaydi |
| `POST /app/api/erp/contracts/{id}/close` · `/reopen` | `Contract` |
| `GET /app/api/erp/counterparties?q=` | `[{id, name, inn, kind: customer|supplier|both}]` (≤30) |
| `POST /app/api/erp/counterparties` `{name, inn?, kind}` | yangi kontragent; INN 9 raqam (UZ) yoki 10–14 (xorij); nom yoki INN takrori — 400 |
| `GET /app/api/erp/firms` | `[{id, code, name}]` |

## Maoshlar (faqat admin/owner — boshqalarga 403)

`Employee`: `{id, name, position, dept, salary (oklad, so'm), hired (sana), phone, active}`.
`Month`: `{month: "YYYY-MM", state: none|draft|approved|paid, approved_at, rows: [PayRow]}`;
`PayRow`: `{employee_id, name, position, dept, base, bonus, penalty, advance, note, paid_at}`.
Hisoblangan = base + bonus − penalty; to'lanadi = hisoblangan − advance (manfiy bo'lmaydi).

| Yo'l | Javob / qoida |
|---|---|
| `GET /app/api/erp/payroll/staff` · `POST …/staff` `{id?, name, position, dept, salary, hired, phone, active}` | xodimlar; ism va oklad majburiy |
| `GET /app/api/erp/payroll/{month}` | `Month` (hisoblanmagan — `state: none`, `rows: []`) |
| `POST …/{month}/calc` | qoralama: faol va shu oygacha ishga kirgan xodimlardan qatorlar; bor qoralamada — yangi xodimlar qo'shiladi, oklad yangilanadi, bonus/ushlanma/avans saqlanadi. Tasdiqlangan oy — 400 |
| `POST …/{month}/rows/{employee_id}` `{bonus, penalty, advance, note}` | faqat qoralamada |
| `POST …/{month}/approve` · `/unapprove` | qulf / qoralamaga qaytarish (to'lov boshlangan bo'lsa — 400) |
| `POST …/{month}/pay` `{ids?}` | tasdiqlangan oyda to'landi deb belgilash (ids bo'lmasa — hammasi); hamma to'langach `state: paid` |

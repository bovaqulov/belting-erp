# Savdo hujjatlari API — `/app/api/erp/sales/*` (frontend `/app/erp/savdo`)

1C «Управление компанией» uslubidagi savdo hujjatlari. Reja va tadqiqot: `docs/plans/2026-11-21-sales-docs.md`.
Backend: `backend/config/apps/erp/sales` (`docs.py` — mantiq, `pdf.py` — chop etish).

**Ruxsat:** `sales` moduli — sotuv bo'limlari (`sotuv_b2b`, `sotuv`), buxgalteriya, rahbariyat, ega/admin.
**Ko'rinish:** rahbariyat, sotuv bo'limi rahbari, buxgalteriya — hamma hujjat; sotuvchi — o'zi mas'ul hujjatlar
(boshqasiniki — 404); mijoz — CRM qoidasi bilan (sotuvchi — o'z mijozlari).

## Hujjat turlari va zanjir

| `kind` | Nomi | Raqam | Asosida yaratiladi |
|---|---|---|---|
| `order` | Buyurtma (Заказ покупателя) | `BLT-ZK-26-00001` | `invoice`, `shipment`, `receipt` |
| `invoice` | Hisob (Счет на оплату) | `…-HS-…` | `shipment`, `receipt` |
| `shipment` | Yuk xati (Расходная накладная) | `…-YX-…` | `vat_invoice` (bitta), `receipt` |
| `vat_invoice` | Schyot-faktura | `…-SF-…` | — |
| `receipt` | To'lov (Поступление: bank / kassa / karta) | `…-TL-…` | — |

Raqam: `<firma kodi>-<tur>-<yil>-<tartib>`, o'z hisoblagichi (1C raqamlari bilan to'qnashmaydi).
Holat: `draft` (tahrirlanadi) → `posted` (qarz va jo'natishga ta'sir) → `unpost` bilan qaytadi; `cancelled` — faqat
qoralamadan. O'tkazilgan hujjat tahrirlanmaydi (409). Asosida o'tkazilgan hujjat bo'lsa yoki yuk xati jo'natilgan
bo'lsa — qaytarib bo'lmaydi.

**Narx va QQS:** narx — QQS bilan (1C «с НДС»). Qator: `amount = qty × price × (1 − discount/100)`,
`vat = amount × r / (100 + r)` (2 xona); jami — qatorlar yig'indisi. Katalog narxi QQSsiz → tovar qo'shilganda
`price_vat`. Chegirma — narx siyosati chegarasi (`catalog.services.max_discount`, rolga qarab; oshsa 403; avval
saqlangan chegirma qayta saqlashga xalaqit bermaydi).

**Yuk xati va ombor:** o'tkazilganda — ombor yig'ish navbati `sale:<id>` (`ship_state: picking`); omborchi skaner bilan
jo'natgach — `shipped`. CRM bitimidan bo'lsa — `ship_state: deal`, yangi navbat ochilmaydi (bitimning o'z `crm:<id>`
navbati).

**Qarz:** mijoz bo'yicha o'tkazilgan yuk xatlari − to'lovlar (musbat — qarz, manfiy — avans). Hujjatdagi `paid` —
uning asosidagi to'lovlar (buyurtmada — hisob va yuk xatlari asosidagilari ham), `due` — qolgani. To'lov «asosida»
yaratilsa — summa = asosning qolgan qarzi.

## Yo'llar

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET | `docs?groups=orders,shipments,vat,receipts&q=&from=&to=&customer_id=&status=&kind=` | jurnal (≤300, `more`); bekor qilinganlar `status=cancelled` bilan |
| POST | `docs` | yangi: `{kind, firm, customer_id, contract_id, warehouse_id, date, vat_pct, comment, lines \| amount+pay_method, deal_id?, post?}` |
| GET / POST | `docs/<id>` | hujjat (+ `children`, `contact`, `paid`, `due`, `can`) / qoralamani tahrirlash |
| POST | `docs/<id>/post`, `unpost`, `cancel` | o'tkazish, qaytarish, bekor qilish |
| POST | `docs/<id>/create` | `{kind}` — asosida yaratish |
| GET | `docs/<id>/pdf` | chop etish (PDF) |
| POST | `from-deal` | `{deal_id, kind?}` — CRM bitimidan (mijoz, tovarlar; narx QQS bilan) |
| GET | `debts?q=` | mijozlar qarzi |
| GET | `customers?q=`, `customers/<id>` | mijoz qidiruvi (CRM, huquq bilan), kartochka + saldo + shartnomalar |
| GET | `items?q=&vat=` | katalog qidiruvi (narx QQSsiz va QQS bilan, erkin qoldiq) |
| GET | `refs?inn=&firm=` | firmalar, omborlar, mijoz shartnomalari (moliya, STIR bo'yicha), turlar, chegirma chegarasi |

Applararo bog'lanish faqat servislar orqali: `crm.services` (`customers_for`, `customer_card`, `deal_brief`,
`sales_role`), `finance.services.contracts_for`, `warehouse.services` (`firms`, `warehouses`, `open_pick`,
`close_pick`, `on_shipped`), `catalog.services` (`search`, `max_discount`).

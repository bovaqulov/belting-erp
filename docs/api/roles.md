# API: Rollar va ruxsatlar (staff)

Xodimning huquqi = **bo'limidan** (`staff.MODULE_DEPTS`) ∪ **rollaridan** (`staff.AccessRole.perms`).
Ega, adminlar va Rahbariyat bo'limi (`sees_all`) — hammasi. Faol bo'lmagan xodim (kutmoqda, bloklangan) — hech narsa.

## Ruxsatlar katalogi

`staff.models.PERMS` (kalit → nom, guruh). Har ERP moduli (`crm`, `tgcrm`, `sales`, `marketplace`, `warehouse`,
`manufacturing`, `logistics`, `accounting`, `money`, `hr`) va qo'shimcha:

| Kalit | Ma'nosi |
|---|---|
| `crm.head` | CRM rahbari: hamma bitim/lid/mijoz, taqsimlash, mas'ul, reja (`crm/access.is_sales_head`). `crm`siz bo'lmaydi — saqlashda qo'shiladi |

Yangi ruxsat — `PERMS`ga qo'shiladi; tekshirish — `user.can("<kalit>")` (modul — `can_module`).

## Boshlang'ich (tizim) rollari

Sotuvchi, Sotuv rahbari, Buxgalter, Omborchi, Sex ustasi, Logist, Marketplace operatori, Kadrlar, Rahbariyat
(migratsiya `staff/0005_seed_roles`, Jarvis `erp.role_perm` asosida). Ruxsatlari o'zgartiriladi, o'zi o'chirilmaydi.

## Endpointlar

| Metod | Yo'l | Kim | Tavsif |
|---|---|---|---|
| GET | `/app/api/roles` | panel, Rahbariyat, IT, `hr` | `{roles: [{id, key, name, note, perms[], system, members: [tg_id]}], perms: [{key, name, group}]}` |
| POST | `/app/api/roles` | ega/admin | `{name, note?, perms[]}` → rol (kalit nomdan); nom takrori — 409, noma'lum ruxsat — 400 |
| POST | `/app/api/roles/<id>` | ega/admin | `{name?, note?, perms?}` |
| POST | `/app/api/roles/<id>/delete` | ega/admin | tizim roli — 409; a'zolardan olinadi |
| POST | `/app/api/users/<tg_id>` | ega/admin | `{roles: [kalit]}` — xodim rollari (to'liq ro'yxat) |
| POST | `/app/api/invites` | ega/admin | `{…, roles: [kalit]}` — havolani bosgan xodim shu rollarni oladi |

`GET /app/api/users` — har xodimda `roles: [kalit]`; `/app/api/me`, `/app/api/erp/me` — `perms: [kalit]`
(ega/admin/Rahbariyat — katalogning hammasi).

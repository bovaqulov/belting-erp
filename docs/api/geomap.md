# GeoMaps API — `/app/api/geo/*` (mijozlar xaritasi)

Backend: `backend/config/apps/geomap/` — geografiya mantig'i `geo/` (Jarvis `office/geomap/` dan: O'zbekiston chegaralari
geoBoundaries, manzildan viloyat/tuman, geokod — Nominatim, orginfo.uz reyestri, avtomatik hududlar — tuman yoki H3,
marshrut — OSRM, izoxron — Valhalla, yangi mijozlar — Overpass), CRM'dan sinxron `sync.py`, API `views.py`, fon `tasks.py`.
Frontend: `frontend/src/geomap/` (`/app/geo`, ulashilgan havola — `/app/geo/share?t=<token>`).

**Manba — CRM mijozlari** (yozuv `crm:<id>`): nomi, STIR, manzil, mas'ul (`owner_tg`), xaridlar (12 oy — «Jo'natishga» /
«Yutildi» bitimlari), ochiq bitimlar, holat (faol ≤90 kun, sust ≤365, yo'qotilgan, yangi — ochiq bitim bor, xaridsiz).
Sinxron — har 3 soatda (Celery `geomap-refresh`) va birinchi ochilishda; joyni aniqlashtirish — har 10 daqiqada
(`geomap-locate`: orginfo.uz 40 ta, Nominatim 120 ta). Qo'lda qo'yilgan nuqta (`manual`) sinxronda saqlanadi.
Qarz (1C) — ulanmagan: `debt` 0, vidjet qarzni ko'rsatmaydi.

Ruxsat: ega/admin yoki Rahbariyat, Sotuv B2B, Marketing a'zosi (`/app/api/me` → `can_geo`). `full` (ega, admin, Rahbariyat) —
hamma yozuvlar, hududlar, mas'ulni almashtirish (CRM'ga yoziladi); xodim — faqat o'zi mas'ul mijozlar.

| Yo'l | Javob / qoida |
|---|---|
| `GET me` | `{tgId, name, role, full, ownerId}` — `ownerId` yozuvlardagi `owner` bilan solishtiriladi («Mening mijozlarim») |
| `GET records` | `{records: [Rec], synced, note}` · `GET records/{id}` → + `inn, orgUrl, crmUrl, checkins` |
| `POST records/{id}/location` `{lat, lng}` | qo'lda nuqta (Markaziy Osiyo ichida) |
| `GET totals` (full) · `GET meta` · `GET boundaries/{region\|district}` · `GET owners` | CRM jami · viloyat/tuman ro'yxati, ranglar · GeoJSON · mas'ullar va yozuvlar soni |
| `POST bulk` `{ids, action: tag\|owner, value}` | teg (o'z yozuvlari) · mas'ul (full; CRM'da) |
| `GET/POST views`, `DELETE views/{id}` | saqlangan ko'rinishlar (o'ziniki + ulashilgan) |
| `GET/POST territories`, `POST/DELETE territories/{id}`, `POST territories/auto/{preview,save}`, `POST import` | hududlar (draw, radius, auto, import GeoJSON); yozuvlarga birinchi mos hudud |
| `POST route/optimize`, `GET/POST routes`, `DELETE routes/{id}`, `POST isochrone`, `POST prospects` | marshrut, izoxron, yangi mijozlar (bizda borligi — nom kaliti bo'yicha) |
| `POST checkins` `{record_id, note, lat?, lng?, ts?}` | tashrif |
| `GET/POST shares`, `DELETE shares/{token}` | ulashish (parol ixtiyoriy, 1–365 kun) |
| `GET/POST public/{token}` (kirishsiz) | `{name, protected}` · `{password}` → `{name, style, records}` — faqat id, nom, nuqta, viloyat, tuman, holat, manzil; parol xatosi chegaralangan (IP: 10 daq/8, havola: soat/50) |

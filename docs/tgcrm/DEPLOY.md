# TelegramCRM — prod'ga chiqarish

## Tekshiruv ro'yxati

1. **`.env` (prod):** `TGCRM_API_ID`, `TGCRM_API_HASH` (my.telegram.org), `TGCRM_SESSION_KEY` — **har muhitda boshqa**
   (`python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"`), `TELEGRAM_BOT_TOKEN`
   (ogohlantirish va eslatmalar shu bot orqali), `REDIS_URL`, `DATABASE_URL`.
2. **`uv run python manage.py migrate` va `uv run python manage.py tgcrm_doctor`** — xato bo'lsa (chiqish kodi 1) chiqarmang.
3. **Shlyuz — servis, BITTA nusxa:** Linux — `backend/deploy/tgcrm-gateway.service` (systemd), macOS —
   `backend/deploy/uz.belting.tgcrm-gateway.plist` (launchd). Ikkinchi nusxa Redis qulfini ololmay chiqadi.
4. **Celery worker + beat** — `tgcrm-reminders` (vazifa eslatmalari) va `tgcrm-health` (shlyuz/akkaunt ogohlantirishlari),
   har 5 daqiqa.
5. **Frontend:** `frontend/scripts/release.sh` (TG CRM sahifasi tekshiruv ro'yxatida).
6. **Teskari proksi (nginx):** WebSocket `/app/api/tgcrm/ws/` — `Upgrade`/`Connection` sarlavhalari, `proxy_read_timeout`
   ≥ 60 s (har 25 s ping); fayl yuborish — `client_max_body_size` (Telegram chegarasi 2 GB, amalda 100–200 MB yetadi).
7. **Disk:** media kesh `backend/data/tgcrm/` — `TGCRM_MEDIA_MAX_MB` (standart 2048) dan oshsa eskilari o'chiriladi.

## Eng muhim xavf: bitta sessiya ikki joyda

Telegram bitta sessiya ikki joydan ishlatilsa uni butunlay o'chiradi (`AUTH_KEY_DUPLICATED`) — akkaunt qayta ulanadi.
- dev va prod **turli** `TGCRM_SESSION_KEY` bilan: prod bazasi dev'ga nusxalansa, sessiyalar dev'da ochilmaydi (xavfsiz;
  `tgcrm_doctor` "N ta sessiya joriy kalit bilan ochilmaydi" deb ko'rsatadi);
- dev'da prod akkauntlarini ulamang; dev shlyuzi faqat sinov akkaunti bilan.

## Zaxira nusxa

- Sessiyalar, chatlar, mijoz kartalari — **bazada** (odatiy DB zaxirasi).
- `TGCRM_SESSION_KEY` — **alohida** saqlang (parol menejeri). Kalitsiz zaxiradagi sessiyalar ochilmaydi — akkauntlar
  QR bilan qayta ulanadi (xabarlar, kartalar yo'qolmaydi).
- Media kesh — zaxira shart emas (Telegram'dan qayta yuklanadi).

## Kuzatuv

- "Tizim holati" (TG CRM → Akkauntlar, rahbar/admin): shlyuz, Redis, sessiyalar, ffmpeg, kesh, akkauntlar sog'lig'i.
- Ogohlantirishlar (Jarvis bot): sessiya tugadi, bloklandi, muzlatildi, spam-cheklov, flood ≥ 10 daq, 10 daqiqadan ortiq
  aloqa yo'q, shlyuz o'chdi — soatiga bir marta; kimga: shaxsiy raqam egasi, akkaunt adminlari, sotuv rahbarlari.
- Jurnal: `journalctl -u tgcrm-gateway` / `backend/data/logs/tg_gateway.log`.

## Telegram qoidalari (eslatma)

Ommaviy tarqatma yo'q; o'qildi belgisi faqat haqiqiy ko'rilganda; yozishmalar AI modellarini o'qitish uchun ishlatilmaydi
(Telegram API ToS) — AI yordamchi qo'shishdan oldin alohida qaror. Batafsil: `docs/tgcrm/PLAN.md` §1.

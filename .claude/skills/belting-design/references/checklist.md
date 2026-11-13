# Dizayn tekshiruv ro'yxati (har UI o'zgarishidan keyin)

## 1. Ishlaydimi (birinchi)
- [ ] `scripts/shoot.js` ishga tushirildi va **JS xatolari ro'yxati bo'sh**. `node -e new Function(...)` sintaksis
      tekshiruvi YETMAYDI: 2026-11-12 da "Joylash" tabida `mineB` e'londan oldin ishlatilgan (TDZ) — sintaksis o'tdi,
      sahifa yiqildi; faqat skrinshot skripti topdi.
- [ ] Yangi API maydoni ishlatilgan bo'lsa — shoot.js FX soxta ma'lumotiga qo'shildi (aks holda "Xatolik" ekrani
      soxta ma'lumot yetishmaganidan bo'lishi mumkin — haqiqiy xato bilan adashtirma).
- [ ] Bo'sh, yuklanmoqda, xato holatlari ko'rildi.

## 2. Kim uchun
- [ ] Ekranning bitta asosiy amali aniq (MainButton yoki bitta katta tugma).
- [ ] Sex: zakaz raqami, o'lcham, holat 2–3 m dan o'qiladi (kompyuter skrinshotini 50% kichraytirib ko'r).
- [ ] Ombor (telefon): bitta qo'l bilan, qo'lqopda — tugmalar ≥44px, skaner maydoni tepada.

## 3. Tizimga mos
- [ ] Ranglar faqat tokenlardan (`tokens.md`); holat rangi = holat ma'nosi, matn/ikonka bilan.
- [ ] Identifikatorlar `.code`; muhim qiymat `--text` (xira `--hint` emas).
- [ ] Telegram uslubi saqlangan (ro'yxat, sheet, MainButton); Telegram ichida tepa panel yashirin.
- [ ] Yorug' va qorong'i rejimda kontrast yetarli.

## 4. Sayqal (bitta aksessuarni olib tashla)
- [ ] Takror ma'lumot yo'q (bir narsa ikki joyda yozilmagan).
- [ ] Bezak uchun yorliq/raqamlash/gradient yo'q; KATTA HARFLI yorliq faqat mavjud `.sh` bo'lim sarlavhasida.
- [ ] `transition: all` yo'q; harakat faqat amalga javob; `prefers-reduced-motion` ishlaydi (global).
- [ ] `:focus-visible` ko'rinadi; ikonka-tugmada `aria-label`; bosiladigan div'da `tabindex` + Enter.
- [ ] Uzun nom (kirill tovar nomi, uzun mijoz) — ellipsis/2 qator, maket buzilmaydi.
- [ ] Raqamlar `tabular-nums` (`.num`/`.code`), sana `d8()`, summa `num()/short()`.

## 5. Yakun
- [ ] Python tegilgan bo'lsa `backend/scripts/check.sh`; static fayl — server qayta ishga tushmasa ham yangilanadi
      (yangi marshrut bo'lsa `safe_restart.sh web`).
- [ ] O'zgarish "oldin/keyin" skrinshot bilan foydalanuvchiga ko'rsatildi.

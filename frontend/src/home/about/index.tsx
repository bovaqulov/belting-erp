// Ochiq tanishtiruv sahifasi (/ va /app/about): ma'lumot statik — API chaqirilmaydi, kirish talab qilinmaydi.
import { SECTIONS } from "@/home/sections";

import { AboutView, type Row } from "./ui";

const MODULES: Row[] = [
  { title: "CRM", sub: "Mijozlar, voronkalar, bitimlar va vazifalar" },
  { title: "Savdo", sub: "Buyurtma, hisob, yuk xati, schyot-faktura, to'lov, qarzlar" },
  { title: "Ombor", sub: "Qoldiq, kirim-chiqim, joylash va sanash" },
  { title: "Sex", sub: "Kesish sexi: zakazlar, taxta, lenta sarfi" },
  { title: "Marketplace", sub: "WB, Ozon, Uzum: buyurtmalar, tovarlar, narx, qoldiq" },
  { title: "Logistika", sub: "Yetkazish: EMU, Yandex Go, Bito, Fargo" },
  { title: "Pul", sub: "Kassa va bank: kirim, chiqim, o'tkazish, pul oqimi" },
  { title: "Moliya", sub: "Mahsulotlar, shartnomalar va maoshlar" },
  { title: "Xodimlar", sub: "Taklif qilish, tuzilma va rollar" },
];

const STEPS: Row[] = [
  { title: "Lid", sub: "Murojaat Telegram, qo'ng'iroq yoki saytdan keladi" },
  { title: "Savdo", sub: "Taklif, narx va buyurtma — bitim CRM'da" },
  { title: "Ishlab chiqarish", sub: "Sexda kesish va tayyorlash" },
  { title: "Yetkazish", sub: "Ombordan yig'ish va jo'natish" },
  { title: "Kuzatuv", sub: "To'lov, qarz va takroriy buyurtmalar" },
];

export default function About() {
  return <AboutView sections={SECTIONS} modules={MODULES} steps={STEPS} />;
}

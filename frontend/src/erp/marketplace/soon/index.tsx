// Hali ko'chirilmagan bo'lim: nima bo'lishini aytadi (bo'sh ekran emas).
import { Empty } from "@/erp/kit/ui";
import { CHN, SEC, type View } from "@/erp/marketplace/lib";

const WHAT: Record<string, string> = {
  products: "Oilalar (remen + brend, turli kengliklar), kartochkalar va ERP bilan bog'lash, yangi kartochka yaratish.",
  price: "Narx siyosati: komissiya, soliq, logistika, foyda — hisoblangan va minimal narx, kanalga jo'natish.",
  stock: "Qoldiq: 1C/ERP dan kanalga avtomatik jo'natish, bufer va ulush qoidalari, o'zgaradiganlar ro'yxati.",
  reviews: "Sharh va savollar: AI qoralama → tekshirib yuborish.",
};

export function Soon({ view }: { view: Extract<View, { home: false }> }) {
  return (
    <Empty icon="clock" title={`${CHN[view.ch]} · ${SEC[view.sec].t} — keyingi bosqichda`}>
      {WHAT[view.sec]}
    </Empty>
  );
}

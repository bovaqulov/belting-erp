// Marketplace navigatsiyasi (egasi qarori 2026-11-14): avval bo'lim (chap menyu), keyin kanal (sahifa tepasidagi tablar).
// Holat URL'da: ?ch=wb&sec=orders (Umumiy — parametrsiz). Sof funksiyalar — test qilinadi.
export type Ch = "wb" | "ozon" | "uzum" | "site";
export type Sec = "orders" | "products" | "price" | "stock" | "reviews";
export type View = { home: true } | { home: false; ch: Ch; sec: Sec };

export const CHN: Record<Ch, string> = { wb: "Wildberries", ozon: "Ozon", uzum: "Uzum", site: "remen.uz" };
/** Buyurtma va qoldiq bilan ishlaydigan kanallar (sayt — faqat katalog va narx) */
export const ORDER_CHS = ["wb", "ozon", "uzum"] as const;
export type OrderCh = (typeof ORDER_CHS)[number];

export const SEC: Record<Sec, { t: string; icon: string }> = {
  orders: { t: "Buyurtmalar", icon: "cart" },
  products: { t: "Tovarlar", icon: "package" },
  price: { t: "Narx siyosati", icon: "coins" },
  stock: { t: "Qoldiq", icon: "layers" },
  reviews: { t: "Sharhlar", icon: "message" },
};
export const SECS: Record<Ch, Sec[]> = {
  wb: ["orders", "products", "price", "stock", "reviews"],
  ozon: ["orders", "products", "price", "stock"],
  uzum: ["orders", "products", "price", "stock"],
  site: ["products", "price"],
};
export const CHS = Object.keys(SECS) as Ch[];
/** Menyu tartibi */
export const SEC_ORDER: Sec[] = ["orders", "products", "price", "stock", "reviews"];
/** Frontendda tayyor bo'limlar; qolganlari menyuda "tez orada" */
export const READY: Sec[] = ["orders"];
/** Kanal logotipi (public/brand/mp/; remen.uz — oq fonda, qorong'i rejimda ko'rinsin) */
export const CH_LOGO: Record<Ch, string> = { wb: "/app/brand/mp/wb.png", ozon: "/app/brand/mp/ozon.svg", uzum: "/app/brand/mp/uzum.svg", site: "/app/brand/mp/site.png" };

/** Shu bo'lim bor kanallar (sahifa tepasidagi tablar) */
export const chsOf = (sec: Sec): Ch[] => CHS.filter((c) => SECS[c].includes(sec));

/** Bo'limga o'tish: joriy kanalda shu bo'lim bo'lsa — kanal saqlanadi, bo'lmasa — bo'lim bor birinchi kanal */
export function goSec(v: View, sec: Sec): View {
  const ch = !v.home && SECS[v.ch].includes(sec) ? v.ch : chsOf(sec)[0];
  return { home: false, ch, sec };
}

const isCh = (v: string | null): v is Ch => !!v && v in SECS;

/** URL → ko'rinish; noto'g'ri qiymat — eng yaqin to'g'risi (kanal bor, bo'lim yo'q → kanalning birinchi bo'limi) */
export function parseView(search: string): View {
  const p = new URLSearchParams(search);
  const ch = p.get("ch");
  if (!isCh(ch)) return { home: true };
  const sec = p.get("sec") as Sec | null;
  return { home: false, ch, sec: sec && SECS[ch].includes(sec) ? sec : SECS[ch][0] };
}

export const viewQs = (v: View): string => (v.home ? "" : `?ch=${v.ch}&sec=${v.sec}`);

/** Kanalga o'tish: joriy bo'lim u kanalda bo'lsa — saqlanadi */
export function switchCh(v: View, ch: Ch): View {
  const sec = !v.home && SECS[ch].includes(v.sec) ? v.sec : SECS[ch][0];
  return { home: false, ch, sec };
}

export const viewTitle = (v: View): string => (v.home ? "Umumiy" : `${CHN[v.ch]} · ${SEC[v.sec].t}`);

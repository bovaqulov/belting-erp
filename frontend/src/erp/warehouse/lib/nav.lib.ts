// Ombor navigatsiyasi: kompyuterda chap menyu (3 guruh, 11 bo'lim), telefonda 5 tab + "Amallar" (qolgan bo'limlar ro'yxati).
// Holat URL'da: ?sec=inv (Panel — parametrsiz). Sof funksiyalar — test qilinadi.
export type Sec = "panel" | "stock" | "scan" | "place" | "inv" | "pick" | "acc" | "move" | "off" | "plan" | "cells";
/** Telefondagi "Amallar" — o'zi bo'lim emas, qolgan bo'limlar ro'yxati */
export type View = Sec | "more";

export const SEC: Record<Sec, { t: string; icon: string; s: string }> = {
  panel: { t: "Panel", icon: "chart", s: "Bugungi holat" },
  stock: { t: "Qoldiq", icon: "layers", s: "Tovarlar jadvali, filtr, CSV" },
  scan: { t: "Skaner", icon: "scan", s: "Birlik, tovar yoki joy ma'lumoti" },
  place: { t: "Joylashtirish", icon: "pin", s: "Tovarni javonga qo'yish" },
  inv: { t: "Sanash", icon: "clipboard", s: "Inventarizatsiya va ABC sikl sanoq" },
  pick: { t: "Yig'ish", icon: "cart", s: "Buyurtmani skaner bilan yig'ib jo'natish" },
  acc: { t: "Qabul", icon: "truck", s: "Yo'ldagi kirimni skaner bilan qabul qilish" },
  move: { t: "Ko'chirish", icon: "swap", s: "Omborlar orasida" },
  off: { t: "Hisobdan chiqarish", icon: "trash", s: "Brak, kamomad, chiqindi — sabab bilan" },
  plan: { t: "Kesish rejasi", icon: "scissors", s: "Qaysi rulondan, eng kam chiqindi bilan" },
  cells: { t: "Joylar", icon: "pin", s: "Zona-javon-qavat yorliqlari" },
};

export const NAV: { title: string; items: Sec[] }[] = [
  { title: "Kundalik", items: ["panel", "stock", "scan"] },
  { title: "Jarayonlar", items: ["place", "inv", "pick", "acc", "move", "off"] },
  { title: "Asboblar", items: ["plan", "cells"] },
];
const ALL = NAV.flatMap((g) => g.items);

/** Telefon tablari; qolganlari "Amallar" ichida */
export const TABS: View[] = ["panel", "place", "scan", "inv", "pick", "more"];
export const MORE: Sec[] = ALL.filter((s) => !TABS.includes(s));

const isSec = (v: string | null): v is Sec => !!v && (ALL as string[]).includes(v);

export function parseView(search: string): View {
  const s = new URLSearchParams(search).get("sec");
  return s === "more" ? "more" : isSec(s) ? s : "panel";
}
export const viewQs = (v: View): string => (v === "panel" ? "" : `?sec=${v}`);
export const viewTitle = (v: View): string => (v === "more" ? "Amallar" : SEC[v].t);

/** Telefonda qaysi tab yonadi: "Amallar" ichidagi bo'lim — "Amallar" */
export const tabOf = (v: View): View => (TABS.includes(v) ? v : "more");
/** Kompyuterda "Amallar" yo'q — Panel */
export const deskView = (v: View): Sec => (v === "more" ? "panel" : v);

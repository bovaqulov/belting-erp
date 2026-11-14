// Ombor navigatsiyasi: kompyuterda chap menyu (2 guruh, 6 bo'lim), telefonda 4 tab + "Amallar" (qolgan bo'limlar ro'yxati).
// Holat URL'da: ?sec=inv (Joylashtirish — parametrsiz). Sof funksiyalar — test qilinadi.
export type Sec = "place" | "inv" | "acc" | "move" | "off" | "cells";
/** Telefondagi "Amallar" — o'zi bo'lim emas, qolgan bo'limlar ro'yxati */
export type View = Sec | "more";

export const SEC: Record<Sec, { t: string; icon: string; s: string }> = {
  place: { t: "Joylashtirish", icon: "pin", s: "Tovarni javonga qo'yish" },
  inv: { t: "Sanash", icon: "clipboard", s: "Inventarizatsiya va ABC sikl sanoq" },
  acc: { t: "Qabul", icon: "truck", s: "Yo'ldagi kirimni skaner bilan qabul qilish" },
  move: { t: "Ko'chirish", icon: "swap", s: "Omborlar orasida" },
  off: { t: "Hisobdan chiqarish", icon: "trash", s: "Brak, kamomad, chiqindi — sabab bilan" },
  cells: { t: "Joylar", icon: "pin", s: "Zona-javon-qavat yorliqlari" },
};

export const NAV: { title: string; items: Sec[] }[] = [
  { title: "Jarayonlar", items: ["place", "inv", "acc", "move", "off"] },
  { title: "Asboblar", items: ["cells"] },
];
const ALL = NAV.flatMap((g) => g.items);
/** bosh bo'lim (?sec= parametrsiz) */
export const HOME: Sec = "place";

/** Telefon tablari; qolganlari "Amallar" ichida */
export const TABS: View[] = ["place", "inv", "acc", "move", "more"];
export const MORE: Sec[] = ALL.filter((s) => !TABS.includes(s));

const isSec = (v: string | null): v is Sec => !!v && (ALL as string[]).includes(v);

export function parseView(search: string): View {
  const s = new URLSearchParams(search).get("sec");
  return s === "more" ? "more" : isSec(s) ? s : HOME;
}
export const viewQs = (v: View): string => (v === HOME ? "" : `?sec=${v}`);
export const viewTitle = (v: View): string => (v === "more" ? "Amallar" : SEC[v].t);

/** Telefonda qaysi tab yonadi: "Amallar" ichidagi bo'lim — "Amallar" */
export const tabOf = (v: View): View => (TABS.includes(v) ? v : "more");
/** Kompyuterda "Amallar" yo'q — bosh bo'lim */
export const deskView = (v: View): Sec => (v === "more" ? HOME : v);

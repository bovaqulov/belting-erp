// ERP formatlari — erp_ui.js bilan bir xil natija (eski va yangi sahifalar bir xil ko'rinsin).

type Num = number | string | null | undefined;

/** 1 478 000,5 — guruhlash bo'shliq, kasr vergul (o'zbek yozuvi) */
export function num(v: Num, d = 2): string {
  if (v === null || v === undefined || v === "" || isNaN(Number(v))) return "";
  return Number(v).toLocaleString("en-US", { maximumFractionDigits: d }).replace(/,/g, " ").replace(".", ",");
}

const p2 = (x: number) => String(x).padStart(2, "0");

/** 14.11.26 */
export function d8(s: string | null | undefined): string {
  if (!s) return "";
  const d = new Date(s);
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
}

/** 14.11 10:05 */
export function dt(s: string | null | undefined): string {
  if (!s) return "";
  const d = new Date(s);
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export const hhmm = (d = new Date()): string => `${p2(d.getHours())}:${p2(d.getMinutes())}`;

/** "1 250,5" → "1250.5" */
export const dnum = (s: string | null | undefined): string => String(s ?? "").replace(/\s/g, "").replace(",", ".");

export const CH: Record<string, string> = {
  wholesale: "Ulgurji",
  retail: "Chakana",
  wb: "Wildberries",
  ozon: "Ozon",
  uzum: "Uzum",
  site: "Sayt",
  intercompany: "Firmalararo",
};

const UNITN: Record<string, string> = { m2: "m²", mm: "mm", m: "m", dona: "dona" };
export const un = (u: string | null | undefined): string => (u ? (UNITN[u] ?? u) : "");

/** Birlik o'lchami: "120×12000 mm" yoki "eni 120 mm" */
export function usz(x: { width_mm?: Num; length_mm?: Num }): string {
  if (x.width_mm && x.length_mm) return `${num(x.width_mm, 0)}×${num(x.length_mm, 0)} mm`;
  if (x.width_mm) return `eni ${num(x.width_mm, 0)} mm`;
  return "";
}

/** 1,5 mln · 250 ming · 1,25 mlrd (erp_ui.js short) */
export function short(v: Num): string {
  const n = Number(v || 0);
  const a = Math.abs(n);
  return a >= 1e9 ? num(n / 1e9, 2) + " mlrd" : a >= 1e6 ? num(n / 1e6, 1) + " mln" : a >= 1e4 ? num(n / 1e3, 0) + " ming" : num(n, 0);
}

/** hozir · 5 daq oldin · 3 soat oldin · 14.11.26 */
export function ago(s: string | null | undefined, now = Date.now()): string {
  if (!s) return "";
  const m = (now - new Date(s).getTime()) / 6e4;
  return m < 1 ? "hozir" : m < 60 ? `${Math.round(m)} daq oldin` : m < 1440 ? `${Math.round(m / 60)} soat oldin` : d8(s);
}

/** Mahalliy sana YYYY-MM-DD */
export const iso = (d: Date = new Date()): string => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

// Bitrix avtomatik yozgan ruscha qoliplar (bitim/lid nomlari) — ekranda o'zbekcha; bazadagi asl nom o'zgarmaydi
const TITLE_UZ: [RegExp, string][] = [
  [/^Сделка\s*#/, "Bitim #"],
  [/^Лид\s*#/, "Lid #"],
  [/Входящий звонок/g, "Kiruvchi qo'ng'iroq"],
  [/Исходящий звонок/g, "Chiquvchi qo'ng'iroq"],
  [/Пропущенный звонок/g, "Javobsiz qo'ng'iroq"],
  [/Входящий/g, "Kiruvchi"],
  [/Исходящий/g, "Chiquvchi"],
  [/Пропущенный/g, "Javobsiz"],
  [/^Гость(?=\s|$)/, "Mehmon"],
  [/Повторная продажа по сценарию Ежемесячные покупки/g, "Takroriy sotuv (oylik xaridlar)"],
];
export const dtitle = (t: string | null | undefined): string => TITLE_UZ.reduce((a, [re, to]) => a.replace(re, to), String(t ?? ""));

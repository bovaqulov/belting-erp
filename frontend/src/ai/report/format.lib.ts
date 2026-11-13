// Formatlash — eski sahifalar bilan bir xil natija.

/** "1 250 000 so'm", "1 250,5 so'm" — bo'sh yoki son bo'lmasa "". ru-RU minglikni bo'shliq bilan ajratadi, vergul esa
 *  kasr ajratgichi — uni bo'shliqqa almashtirish "1 250 5" qilib qo'yardi. */
export function money(raw: string | number): string {
  if (raw === "" || raw === null || raw === undefined) return "";
  const n = Number(raw);
  if (Number.isNaN(n)) return "";
  return n.toLocaleString("ru-RU") + " so'm";
}

/** Kiritilgan son matni → backend formati: bo'shliqlar olib tashlanadi, birinchi vergul → nuqta. */
export function normNumber(v: string): string {
  return v.replace(/\s/g, "").replace(",", ".");
}

/** "2026-11-07" → "07.11.2026" */
export function isoToDmy(iso: string): string {
  return iso.split("-").reverse().join(".");
}

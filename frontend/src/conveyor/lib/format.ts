// Lenta sonlari — eski lenta.html 346–348 (num, fmtN, money) so'zma-so'z.
import type { Lang } from "./types";

/** "1 250,5" → 1250.5; son bo'lmasa 0 (eski num) */
export const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return isFinite(n) ? n : 0;
};

/** 0.1 gacha yaxlitlab, ru-RU (NBSP → oddiy bo'shliq, kasr — vergul). Son bo'lmasa "". (eski fmtN) */
export const fmtN = (n: unknown): string => {
  const v = Math.round(Number(n) * 10) / 10;
  return isFinite(v) ? v.toLocaleString("ru-RU").replace(/ /g, " ").replace(",", ",") : "";
};

/** Butun so'm: "1 250 000 so'm" / "… сум" (eski money; til — LANG) */
export const money = (n: number, lang: Lang): string =>
  Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ") + (lang === "ru" ? " сум" : " so'm");

/** Forma maydonidagi son ko'rinishi (eski syncForm: fmtN(v).replace(/ /g, "")) */
export const fieldNum = (n: unknown): string => fmtN(n).replace(/ /g, "");

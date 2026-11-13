// Hisobot formasi mantig'i (sahifadan alohida — testlanadi).
import { normNumber } from "./format.lib";

export type FieldType = "text" | "money" | "number";
export interface Field {
  key: string;
  label: string;
  type: FieldType;
}
export interface ReportData {
  template: { title: string; fields: Field[] };
  date: string;
  values: Record<string, string | number>;
  /** ERP va telefoniya raqamlari — saqlanmagan maydonlar shular bilan oldindan to'ladi (xodim tuzatadi) */
  auto?: Record<string, string | number>;
  user: string;
}

/** Yuboriladigan qiymatlar: son maydonlarida bo'shliqlar olib tashlanib vergul → nuqta. Bo'sh maydon `null` bo'lib
 *  ketadi — backend saqlangan qiymatni o'chiradi (aks holda tozalangan maydon eski qiymatda qolib ketardi). */
export function collectValues(fields: Field[], raw: Record<string, string>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const f of fields) {
    const v = (raw[f.key] ?? "").trim();
    out[f.key] = v === "" ? null : f.type === "text" ? v : normNumber(v);
  }
  return out;
}


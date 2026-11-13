// Umumiy ko'rinish va kartochka auditi: turlar (Jarvis /app/api/erp/mk/overview, /audit kontrakti).
import type { OrderCh } from "./nav.lib";

export type Severity = "crit" | "warn" | "info";
export type Source = { id: number; code: string; name: string; source: "onec" | "erp"; sklad: string[] };
export type ChannelSum = { name: string; n: number; linked: number; off: number; ch_total: number; push_stock: boolean; push_price: boolean };
export type AuditSum = { code: string; severity: Severity; channel: OrderCh; n: number; text: string };
export type Overview = {
  channels: Record<OrderCh, ChannelSum>;
  sources: Source[];
  orders: { n: number; soon: number };
  reviews: { n: number; bad: number };
  push_errors: number;
  audit: AuditSum[];
};
export type Issue = {
  id: number;
  code: string;
  severity: Severity;
  text: string;
  channel: OrderCh;
  ext_id: string;
  vendor_code: string | null;
  title: string | null;
  photos: number | null;
  detail: Record<string, string | number | string[]> | null;
};

export const SRC: Record<Source["source"], string> = { onec: "1C", erp: "ERP" };
export const SEV_COLOR: Record<Severity, string> = { crit: "red", warn: "orange", info: "gray" };

/** Qoldiq manbasi satri: "Asosiy ombor: 1C (Склад 1) · Sex: ERP" */
export const sourcesText = (ss: Source[]): string =>
  ss.map((w) => `${w.name}: ${SRC[w.source]}${w.source === "onec" && w.sklad.length ? ` (${w.sklad.join(", ")})` : ""}`).join(" · ");

/** Muammo tafsiloti bir qatorda */
export const issueDetail = (x: Pick<Issue, "vendor_code" | "ext_id" | "photos" | "detail">): string =>
  [
    x.vendor_code,
    x.ext_id,
    x.photos !== null && x.photos !== undefined ? `${x.photos} rasm` : null,
    Object.entries(x.detail ?? {})
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("; ") || null,
  ]
    .filter(Boolean)
    .join(" · ");

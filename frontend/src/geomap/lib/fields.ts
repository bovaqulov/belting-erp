// Maydonlar, filtr dvigateli va formatlash. Sof funksiyalar (vitest bilan sinaladi).
import type { Cond, FieldKey, FieldType, Filter, Op, Quality, Rec, Rule } from "./types";

export const FIELDS: { key: FieldKey; label: string; type: FieldType }[] = [
  { key: "name", label: "Nomi", type: "text" },
  { key: "status", label: "Holat", type: "enum" },
  { key: "region", label: "Viloyat", type: "enum" },
  { key: "district", label: "Tuman", type: "enum" },
  { key: "owner", label: "Mas'ul", type: "enum" },
  { key: "sales", label: "Savdo (12 oy)", type: "number" },
  { key: "salesCount", label: "Xaridlar soni (12 oy)", type: "number" },
  { key: "lastSale", label: "Oxirgi xarid", type: "date" },
  { key: "debt", label: "Qarz", type: "number" },
  { key: "overdue", label: "Kechikish (kun)", type: "number" },
  { key: "deals", label: "Ochiq bitimlar", type: "number" },
  { key: "type", label: "Kompaniya turi", type: "enum" },
  { key: "industry", label: "Soha", type: "enum" },
  { key: "tag", label: "Teg", type: "enum" },
  { key: "territory", label: "Hudud", type: "enum" },
  { key: "q", label: "Joylashuv aniqligi", type: "enum" },
  { key: "address", label: "Manzil", type: "text" },
];

export const FIELD_TYPE = Object.fromEntries(FIELDS.map((f) => [f.key, f.type])) as Record<FieldKey, FieldType>;
export const FIELD_LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.label])) as Record<FieldKey, string>;

export const OPS: Record<FieldType, { op: Op; label: string }[]> = {
  text: [
    { op: "contains", label: "o'z ichiga oladi" },
    { op: "not_contains", label: "o'z ichiga olmaydi" },
    { op: "eq", label: "teng" },
    { op: "empty", label: "bo'sh" },
    { op: "not_empty", label: "bo'sh emas" },
  ],
  enum: [
    { op: "in", label: "biri" },
    { op: "not_in", label: "hech biri emas" },
    { op: "empty", label: "bo'sh" },
    { op: "not_empty", label: "bo'sh emas" },
  ],
  number: [
    { op: "gt", label: ">" },
    { op: "gte", label: "≥" },
    { op: "lt", label: "<" },
    { op: "lte", label: "≤" },
    { op: "between", label: "oralig'ida" },
    { op: "eq", label: "=" },
  ],
  date: [
    { op: "last_days", label: "oxirgi N kunda" },
    { op: "older_days", label: "N kundan eski" },
    { op: "after", label: "dan keyin" },
    { op: "before", label: "dan oldin" },
    { op: "empty", label: "yo'q" },
    { op: "not_empty", label: "bor" },
  ],
};

export const STATUS_LABEL: Record<string, string> = {
  faol: "Faol (≤90 kun)",
  sust: "Sust (91–365 kun)",
  "yo'qotilgan": "Yo'qotilgan (>1 yil)",
  yangi: "Yangi (ochiq bitim)",
  xaridsiz: "Xaridsiz",
};
export const STATUS_COLOR: Record<string, string> = {
  faol: "#30a46c",
  sust: "#f5a524",
  "yo'qotilgan": "#e5484d",
  yangi: "#3a8dff",
  xaridsiz: "#8a94a8",
};
export const QUALITY_LABEL: Record<Quality, string> = {
  exact: "Aniq (bino)",
  street: "Ko'cha",
  manual: "Qo'lda qo'yilgan",
  district: "Tuman markazi (taxminiy)",
  region: "Viloyat markazi (taxminiy)",
  none: "Noma'lum",
};
export const QUALITY_COLOR: Record<Quality, string> = {
  exact: "#30a46c",
  street: "#5bb98c",
  manual: "#12a594",
  district: "#f5a524",
  region: "#e5484d",
  none: "#8a94a8",
};

export function fieldValue(r: Rec, f: FieldKey): string | number | null {
  const v = (r as unknown as Record<string, unknown>)[f];
  if (v === undefined || v === null || v === "") return null;
  return v as string | number;
}

const DAY = 86_400_000;

function daysAgo(d: string, now: number): number {
  return Math.floor((now - Date.parse(d.slice(0, 10))) / DAY);
}

export function matchCond(r: Rec, c: Cond, now = Date.now()): boolean {
  const raw = fieldValue(r, c.field);
  const v = c.value;
  switch (c.op) {
    case "empty":
      return raw === null;
    case "not_empty":
      return raw !== null;
    case "contains":
      return raw !== null && String(raw).toLowerCase().includes(String(v ?? "").toLowerCase());
    case "not_contains":
      return raw === null || !String(raw).toLowerCase().includes(String(v ?? "").toLowerCase());
    case "eq":
      return FIELD_TYPE[c.field] === "number" ? Number(raw ?? 0) === Number(v) : String(raw ?? "").toLowerCase() === String(v ?? "").toLowerCase();
    case "neq":
      return String(raw ?? "") !== String(v ?? "");
    case "in":
      return Array.isArray(v) && v.length > 0 ? (v as string[]).includes(String(raw ?? "")) : true;
    case "not_in":
      return Array.isArray(v) ? !(v as string[]).includes(String(raw ?? "")) : true;
    case "gt":
      return Number(raw ?? 0) > Number(v);
    case "gte":
      return Number(raw ?? 0) >= Number(v);
    case "lt":
      return Number(raw ?? 0) < Number(v);
    case "lte":
      return Number(raw ?? 0) <= Number(v);
    case "between": {
      const [a, b] = (v as [number, number]) ?? [0, 0];
      const n = Number(raw ?? 0);
      return n >= Number(a) && n <= Number(b);
    }
    case "last_days":
      return raw !== null && daysAgo(String(raw), now) <= Number(v);
    case "older_days":
      return raw === null || daysAgo(String(raw), now) > Number(v);
    case "after":
      return raw !== null && String(raw).slice(0, 10) > String(v ?? "");
    case "before":
      return raw !== null && String(raw).slice(0, 10) < String(v ?? "");
  }
  return true;
}

function matchRule(r: Rec, rule: Rule, now: number): boolean {
  if (rule.kind === "cond") return matchCond(r, rule, now);
  if (!rule.rules.length) return true;
  return rule.match === "all" ? rule.rules.every((x) => matchRule(r, x, now)) : rule.rules.some((x) => matchRule(r, x, now));
}

export function matchFilter(r: Rec, f: Filter, now = Date.now()): boolean {
  const s = f.search.trim().toLowerCase();
  if (s && !(r.name.toLowerCase().includes(s) || (r.address ?? "").toLowerCase().includes(s) || (r.orgAddress ?? "").toLowerCase().includes(s) || (r.ownerName ?? "").toLowerCase().includes(s)))
    return false;
  if (!f.rules.length) return true;
  return f.match === "all" ? f.rules.every((x) => matchRule(r, x, now)) : f.rules.some((x) => matchRule(r, x, now));
}

export const EMPTY_FILTER: Filter = { match: "all", rules: [], search: "" };

export function countRules(f: Filter): number {
  const n = (rs: Rule[]): number => rs.reduce((a, r) => a + (r.kind === "cond" ? 1 : n(r.rules)), 0);
  return n(f.rules) + (f.search.trim() ? 1 : 0);
}

// ---------------- formatlash ----------------
export function money(n: number | null | undefined): string {
  const v = Number(n || 0);
  const a = Math.abs(v);
  // chegaralar yaxlitlashdan keyingi qiymat bo'yicha: 999 600 -> "1.0 mln" ("1000 ming" emas)
  if (a >= 999.5e6) return `${(v / 1e9).toFixed(a >= 9.95e9 ? 0 : 1)} mlrd`;
  if (a >= 999.5e3) return `${(v / 1e6).toFixed(a >= 9.95e6 ? 0 : 1)} mln`;
  if (a >= 1e3) return `${Math.round(v / 1e3)} ming`;
  return String(Math.round(v));
}

export function num(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n)).replace(/,/g, " ");
}

/** Qurilma mahalliy vaqti, zonasiz "YYYY-MM-DDTHH:MM:SS" — backend ham shunday (server mahalliy vaqti) saqlaydi. */
export function localIso(d: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** "2026-11-10T14:05:00" -> "10.11.2026 14:05"; faqat sana bo'lsa — "10.11.2026". */
export function dateUz(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}${m[4] ? ` ${m[4]}` : ""}` : iso;
}

export function km(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km` : `${Math.round(m)} m`;
}

export function duration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} soat ${m} daq` : `${m} daq`;
}

export function haversine(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const toR = (x: number) => (x * Math.PI) / 180;
  const dLat = toR(b[0] - a[0]);
  const dLng = toR(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

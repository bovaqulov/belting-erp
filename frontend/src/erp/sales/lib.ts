// Savdo hujjatlari (1C «Управление компанией» uslubida): turlar, holatlar, URL ko'rinishi, qator va jami hisobi
// (backend docs.py bilan bir xil: summa = miqdor × narx × (1 − chegirma %), QQS = summa × r / (100 + r) — narx QQS bilan).
// Sof funksiyalar (test: lib.test.ts).

export type Kind = "order" | "invoice" | "shipment" | "vat_invoice" | "receipt";
export type Status = "draft" | "posted" | "cancelled";
export type Group = "orders" | "shipments" | "vat" | "receipts";
export type PayMethod = "bank" | "cash" | "card";

export const KIND: Record<Kind, { t: string; icon: string; color: string; act: string }> = {
  order: { t: "Buyurtma", icon: "cart", color: "blue", act: "Buyurtma yaratish" },
  invoice: { t: "Hisob", icon: "file-text", color: "indigo", act: "Hisob yozish" },
  shipment: { t: "Yuk xati", icon: "truck", color: "orange", act: "Sotish (yuk xati)" },
  vat_invoice: { t: "Schyot-faktura", icon: "receipt", color: "purple", act: "Schyot-faktura" },
  receipt: { t: "To'lov", icon: "coins", color: "green", act: "To'lov qabul qilish" },
};
export const STATUS: Record<Status, { t: string; st: string }> = {
  draft: { t: "Qoralama", st: "" },
  posted: { t: "O'tkazilgan", st: "done" },
  cancelled: { t: "Bekor", st: "bad" },
};
export const GROUPS: [Group, string][] = [
  ["orders", "Buyurtma va hisoblar"],
  ["shipments", "Yuk xatlari"],
  ["vat", "Schyot-fakturalar"],
  ["receipts", "To'lovlar"],
];
export const PAY: Record<PayMethod, string> = { bank: "Bank (hisob raqamga)", cash: "Kassa (naqd)", card: "Karta" };

export type Line = {
  item_id: number | null;
  char_id: number | null;
  name: string;
  char?: string | null;
  unit: string;
  qty: string;
  price: string;
  discount: string;
  amount?: string;
  vat?: string;
};
export type DocRow = {
  id: number;
  kind: Kind;
  kind_name: string;
  number: string;
  date: string;
  status: Status;
  firm: string;
  customer_id: number | null;
  customer: string | null;
  total: string;
  vat: string;
  ship_state: string | null;
  ship_name: string | null;
  pay_method: PayMethod | null;
  base: { id: number; number: string; kind: Kind } | null;
  owner_tg: number | null;
  deal_id: number | null;
  paid?: string;
};
export type Contact = { id: number; name: string; inn: string | null; company: string | null; phones: string[]; address: string | null; contacts: { name?: string; role?: string; phone?: string }[]; owner_tg: number | null };
export type Doc = DocRow & {
  due: string | null;
  contract_id: number | null;
  contract: string | null;
  warehouse_id: number | null;
  warehouse: string | null;
  customer_inn: string | null;
  lines: Line[];
  vat_pct: string;
  comment: string;
  children: DocRow[];
  contact: Contact | null;
  can: { edit: boolean; post: boolean; unpost: boolean; cancel: boolean; create: Kind[] };
  disc_max: string;
};
export type Refs = {
  firms: { id: number; code: string; name: string }[];
  warehouses: { id: number; name: string; code: string | null; kind: string }[];
  contracts: { id: number; number: string; label: string }[];
  disc_max: string;
  all: boolean;
};
export type ItemHit = { item_id: number; char_id: number | null; name: string; char: string | null; unit: string; sku: string | null; price: string | null; price_vat: string | null; free: string };
export type Debt = { customer_id: number; customer: string; inn: string | null; shipped: string; paid: string; balance: string; last: string };

// ------------------------------------------------------------------ ko'rinish (URL: ?v=docs&g=orders&doc=12)
export type View = { v: "home" | "docs" | "debts"; doc: number | null; groups: Group[]; customer: number | null };
export const HOME: View = { v: "home", doc: null, groups: [], customer: null };

export function parseView(search: string): View {
  const p = new URLSearchParams(search);
  const v = p.get("v");
  const groups = (p.get("g") ?? "").split(",").filter((g): g is Group => GROUPS.some(([k]) => k === g));
  const doc = Number(p.get("doc")) || null;
  const customer = Number(p.get("c")) || null;
  return { v: v === "docs" || v === "debts" ? v : doc ? "docs" : "home", doc, groups, customer };
}

export function viewQs(v: View): string {
  const p = new URLSearchParams();
  if (v.v !== "home") p.set("v", v.v);
  if (v.groups.length) p.set("g", v.groups.join(","));
  if (v.customer) p.set("c", String(v.customer));
  if (v.doc) p.set("doc", String(v.doc));
  const s = p.toString();
  return s ? `?${s}` : "";
}

// ------------------------------------------------------------------ hisob
const n = (s: string | number | null | undefined): number => {
  const x = Number(String(s ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
};
const r2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;

/** Qator summasi va QQS (narx QQS bilan) */
export function lineCalc(l: Pick<Line, "qty" | "price" | "discount">, vatPct: number): { amount: number; vat: number } {
  const amount = r2(n(l.qty) * n(l.price) * (1 - n(l.discount) / 100));
  return { amount, vat: vatPct ? r2((amount * vatPct) / (100 + vatPct)) : 0 };
}

export function totals(lines: Pick<Line, "qty" | "price" | "discount">[], vatPct: number): { total: number; vat: number } {
  return lines.reduce(
    (a, l) => {
      const c = lineCalc(l, vatPct);
      return { total: r2(a.total + c.amount), vat: r2(a.vat + c.vat) };
    },
    { total: 0, vat: 0 },
  );
}

/** 1657600 → «1 657 600», 177600.5 → «177 600,50» */
export function sum(v: string | number | null | undefined): string {
  const x = n(v);
  const neg = x < 0;
  const [i, f] = Math.abs(x).toFixed(2).split(".");
  const s = i.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "−" : ""}${s}${f === "00" ? "" : `,${f}`}`;
}

/** Katalog topilmasidan qator (narx — QQS bilan) */
export const hitLine = (h: ItemHit): Line => ({
  item_id: h.item_id,
  char_id: h.char_id,
  name: h.name,
  char: h.char,
  unit: h.unit || "dona",
  qty: "1",
  price: h.price_vat ?? "0",
  discount: "0",
});

/** 2026-11-20T16:13 → «20.11.2026 16:13» */
export const when = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)} ${iso.slice(11, 16)}`;

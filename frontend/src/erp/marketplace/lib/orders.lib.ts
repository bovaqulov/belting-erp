// Buyurtmalar: turlar va sof mantiq (Jarvis /app/api/erp/mk/orders/* kontrakti bilan bir xil shakllar).
import { num } from "@/erp/kit/fmt";

import type { OrderCh } from "./nav.lib";

export type Stage = "new" | "assembly" | "transit" | "done" | "cancelled";
export type BoardStage = "active" | Stage;

export type Line = { key?: string; title?: string | null; vendor_code?: string | null; width_mm?: number | null; mode?: string | null; qty: number; codes?: string[]; photo?: string | null };
export type Picked = { line: number; code: string; by?: number; ts?: string };

export type Order = {
  channel: OrderCh;
  ext_id: string;
  stage: Stage;
  ext_status: string | null;
  ordered: string | null;
  deadline: string | null;
  supply_id: string | null;
  lines: Line[];
  picked: Picked[];
  assembled_at: string | null;
  number: string | null;
  article: string | null;
  price_uzs: number | null;
  issues?: { reason: string }[] | null;
  // hisoblangan (board)
  need: number;
  left_min: number | null;
  age_min: number | null;
};

export type Board = { counts: Partial<Record<Stage, number>>; orders: Order[] };
export type Counts = Record<OrderCh, { new: number; assembly: number }>;

export const STG: Record<BoardStage, string> = {
  active: "Harakat kerak",
  new: "Yangi",
  assembly: "Yig'ishda",
  transit: "Yo'lda",
  done: "Yetkazildi",
  cancelled: "Bekor",
};
/** WB kabinetidagi tartib va nomlar (postavka orqali ishlaydi) */
export const WB_STG: [Stage, string][] = [
  ["new", "Yangilari"],
  ["assembly", "Yig'ilmoqda"],
  ["transit", "Yetkazib berishda"],
  ["done", "Yakunlanganlar"],
  ["cancelled", "Bekor qilinganlar"],
];
/** Bosqich → holat belgisi (.st): ma'no hamma sahifada bir xil */
export const STG_ST: Record<Stage, "new" | "work" | "make" | "done" | "bad"> = {
  new: "new",
  assembly: "work",
  transit: "make",
  done: "done",
  cancelled: "bad",
};

/** Bosqich → ikonka kvadrati rangi (telefon ro'yxati) */
export const STG_COLOR: Record<Stage, string> = { new: "blue", assembly: "orange", transit: "purple", done: "green", cancelled: "gray" };

export const isActive = (s: Stage): boolean => s === "new" || s === "assembly";

/** Muddatgacha qolgan vaqt: "3 soat 20 daq", o'tgan bo'lsa — "muddat o'tdi" */
export function leftText(min: number | null): string {
  if (min === null) return "";
  if (min < 0) return "muddat o'tdi";
  const h = Math.floor(min / 60);
  return h ? `${h} soat ${min % 60} daq` : `${min} daq`;
}

/** Buyurtmadan beri: "40 daq. oldin", "5 s. 12 daq. oldin" */
export function agoText(min: number | null): string {
  if (min === null) return "";
  return min < 60 ? `${min} daq. oldin` : `${Math.floor(min / 60)} s. ${min % 60} daq. oldin`;
}
/** Buyurtma yoshi rangi: 12 soatdan — ogohlantirish, 24 dan — kechikish */
export const ageCls = (min: number | null): "ok" | "warn" | "bad" | "" =>
  min === null ? "" : min > 24 * 60 ? "bad" : min > 12 * 60 ? "warn" : "ok";

export const pickedOn = (o: Pick<Order, "picked">, line: number): number => o.picked.filter((p) => p.line === line).length;

/** Xaridor to'lagan narx (kanal so'mga o'girgan): "412 000 so'm" */
export const sold = (o: Pick<Order, "price_uzs">): string => (o.price_uzs !== null ? `${num(o.price_uzs, 0)} so'm` : "");

export const firstTitle = (o: Pick<Order, "lines" | "article">): string => o.lines[0]?.title || o.article || "";

export type PickRow = { title: string | null; vendor_code: string | null; width_mm: number | null; mode: string | null; qty: number; orders: string[]; sum: number; prices: number[] };

/** Tanlanma ro'yxati: bir xil tovar bitta qatorga (omborchi bir yurishda oladi) — Jarvis orders.picking bilan bir xil */
export function picking(rows: Pick<Order, "ext_id" | "lines" | "price_uzs">[]): PickRow[] {
  const agg = new Map<string, PickRow>();
  for (const r of rows)
    for (const ln of r.lines) {
      const k = ln.vendor_code || ln.key || ln.title || "";
      let a = agg.get(k);
      if (!a) {
        a = { title: ln.title ?? null, vendor_code: ln.vendor_code ?? null, width_mm: ln.width_mm ?? null, mode: ln.mode ?? null, qty: 0, orders: [], sum: 0, prices: [] };
        agg.set(k, a);
      }
      const q = Number(ln.qty) || 1;
      a.qty += q;
      a.orders.push(r.ext_id);
      if (r.price_uzs !== null) {
        a.sum += r.price_uzs;
        a.prices.push(r.price_uzs / q);
      }
    }
  return [...agg.values()].sort((x, y) => (x.title ?? "").localeCompare(y.title ?? ""));
}

/** QQS stavkasi (O'zbekiston, 2026): narxlar QQS bilan, QQS ichidan ajratiladi */
export const VAT = 0.12;
/** QQS bilan summadan: QQSsiz qism va QQS (yaxlitlanmagan) */
export const splitVat = (gross: number): { net: number; vat: number } => {
  const net = gross / (1 + VAT);
  return { net, vat: gross - net };
};

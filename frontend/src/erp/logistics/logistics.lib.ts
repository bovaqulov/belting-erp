// Logistika: turlar, tashuvchi va holat nomlari/ranglari, forma ↔ API, xato matni. Sof funksiyalar (test: logistics.lib.test.ts).
import { ApiError } from "@/shared/api/client";

export type CarrierKey = "emu" | "yandex_go" | "bito" | "fargo";
export type StatusKey = "new" | "handed" | "transit" | "delivered" | "returned" | "cancelled";
export type Payer = "us" | "customer";
export type Filter = "active" | "delivered" | "all";

export interface Shipment {
  id: number;
  number: string;
  carrier: CarrierKey;
  status: StatusKey;
  recipient: string;
  phone: string;
  city: string;
  address: string;
  places: number;
  weight_kg: number | null;
  cost: number | null;
  payer: Payer;
  track_no: string;
  ref: string;
  note: string;
  next: StatusKey[];
  created: string;
  updated: string;
  history?: { ts: string; status: StatusKey; by: number | null; note: string }[];
}

export interface ShipmentList {
  shipments: Shipment[];
  counts: Record<StatusKey, number>;
  active: number;
}

export const CARRIERS: { key: CarrierKey; title: string; color: string }[] = [
  { key: "emu", title: "EMU", color: "#e5484d" },
  { key: "yandex_go", title: "Yandex Go", color: "#e6b422" },
  { key: "bito", title: "Bito", color: "#3e88f7" },
  { key: "fargo", title: "Fargo", color: "#2fa37a" },
];
export const carrier = (k: string) => CARRIERS.find((c) => c.key === k) ?? { key: k, title: k, color: "#8e8e93" };

/** holat: nomi, `.st` varianti, holatga o'tkazish tugmasi matni */
export const STATUS: Record<StatusKey, { title: string; st: string; act: string }> = {
  new: { title: "Yangi", st: "new", act: "Yangi" },
  handed: { title: "Topshirildi", st: "work", act: "Tashuvchiga topshirildi" },
  transit: { title: "Yo'lda", st: "work", act: "Yo'lda" },
  delivered: { title: "Yetkazildi", st: "done", act: "Yetkazildi" },
  returned: { title: "Qaytdi", st: "bad", act: "Qaytib keldi" },
  cancelled: { title: "Bekor", st: "", act: "Bekor qilish" },
};

export const FILTERS: Filter[] = ["active", "delivered", "all"];
export const filterQs = (f: Filter): string => (f === "all" ? "" : `status=${f}`);

export interface Form {
  carrier: CarrierKey | "";
  recipient: string;
  phone: string;
  city: string;
  address: string;
  places: string;
  weight_kg: string;
  cost: string;
  payer: Payer;
  track_no: string;
  ref: string;
  note: string;
}

export const EMPTY: Form = {
  carrier: "",
  recipient: "",
  phone: "",
  city: "",
  address: "",
  places: "1",
  weight_kg: "",
  cost: "",
  payer: "us",
  track_no: "",
  ref: "",
  note: "",
};

const s = (v: number | null): string => (v === null ? "" : String(v).replace(".", ","));

export const toForm = (x: Shipment): Form => ({
  carrier: x.carrier,
  recipient: x.recipient,
  phone: x.phone,
  city: x.city,
  address: x.address,
  places: String(x.places),
  weight_kg: s(x.weight_kg),
  cost: s(x.cost),
  payer: x.payer,
  track_no: x.track_no,
  ref: x.ref,
  note: x.note,
});

/** Brauzerdagi oldindan tekshiruv (server ham tekshiradi): xato matni yoki null */
export function check(f: Form): string | null {
  if (!f.carrier) return "Tashuvchini tanlang";
  if (!f.recipient.trim()) return "Qabul qiluvchini yozing";
  if (!f.city.trim() && !f.address.trim()) return "Shahar yoki manzilni yozing";
  const p = Number(f.places || "1");
  if (!Number.isInteger(p) || p < 1 || p > 999) return "Joylar soni 1–999";
  return null;
}

/** Serverdagi xato: matn yoki {maydon: matn} — birinchi matn */
export function errText(e: unknown): string {
  if (e instanceof ApiError && e.detail && typeof e.detail === "object") {
    const v = Object.values(e.detail as Record<string, unknown>).find((x) => typeof x === "string");
    if (typeof v === "string") return v;
  }
  return (e as Error).message;
}

/** so'm: 120 000 */
export const sum = (n: number | null): string => (n === null ? "" : Math.round(n).toLocaleString("ru-RU").replace(/ /g, " "));

/** 2026-11-21T09:05:00+05:00 → 21.11 09:05 */
export const when = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)} ${iso.slice(11, 16)}`;

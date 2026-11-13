// Sex: turlar, bosqichlar (Yangi → Yig'ilmoqda → Tayyorlanmoqda → Tayyor), sof yordamchilar.
import { dnum, num } from "@/erp/kit/fmt";

export type Phase = "new" | "collecting" | "making" | "ready";
export const PH: Phase[] = ["new", "collecting", "making", "ready"];
export const PHN: Record<Phase, string> = {
  new: "Yangi",
  collecting: "Yig'ilmoqda",
  making: "Tayyorlanmoqda",
  ready: "Tayyor",
};
export const PHC: Record<Phase, string> = {
  new: "new",
  collecting: "work",
  making: "make",
  ready: "done",
};
export const ACT: Record<string, string> = {
  accept: "qabul qildi",
  consume: "material oldi",
  collected: "material olindi",
  ready: "tayyor",
  create: "ochildi",
  produce: "omborga kirdi",
  plan: "reja",
  done: "bosqich",
  brak: "brak",
};

export type Job = {
  id: number;
  number: string;
  order_number?: string | null;
  phase: Phase;
  priority?: number;
  due?: string | null;
  late?: boolean;
  route?: string;
  qty: string;
  unit?: string;
  size?: string;
  item: string;
  char?: string | null;
  customer?: string | null;
  worker?: string | null;
  lenta_project?: number | null;
  spec?: Record<string, number> | null;
  left?: string;
};
export type Cand = {
  loc?: string;
  block?: string;
  block_name?: string;
  code?: string;
  width_mm?: number;
  length_mm?: number;
  qty: string;
};
export type Plan = {
  name: string;
  unit: string;
  qty: string | number;
  left: string | number;
  taken: string | number;
  item_id: number;
  cut?: string;
  candidates: Cand[];
};
export type Taken = {
  name: string;
  unit: string;
  qty: string;
  code?: string;
  width_mm?: number;
  length_mm?: number;
  by?: string;
  created: string;
};
export type Detail = Job & {
  belt_mark?: string;
  brand?: string;
  channel?: string;
  seller_name?: string;
  order_note?: string;
  accepted_at?: string;
  product_code?: string;
  plan: Plan[];
  taken: Taken[];
  log: { action: string; by?: string; ts: string; data?: { qty?: string } }[];
};
export type Board = { cols: Record<Phase, Job[]> };
export type Group = {
  jobs: Job[];
  phase: Phase | null;
  phases: Phase[];
  plan: Plan[];
};
export type Unit = {
  type: string;
  id: number;
  code: string;
  name: string;
  unit: string;
  item_id: number;
  loc?: string;
  width_mm?: number;
  length_mm?: number;
  stock?: { qty: string }[];
};
export type View =
  { k: "board" } | { k: "job"; id: number } | { k: "grp"; ids: number[] };

export const ord = (j: Job) => j.order_number || j.number;
export const rukavSize = (j: Job) =>
  j.size || (j.route === "rukav" ? `eni ${num(j.qty, 0)} mm` : "");

/** Bir xil mahsulot (o'xshashlarini birga tanlash) */
export const same = (a: Job, b: Job) =>
  a.item === b.item &&
  (a.size || "") === (b.size || "") &&
  String(a.qty) === String(b.qty);

/** Skaner topgan birlik → sarf oynasi */
export type Take = { u: Unit; have: number; p?: Plan };

/** Sarf: oddiy material — miqdor; lenta (m²) — bo'lak eni × uzunligi, qoldiq avtomatik (ishchi xato deb bilsa — o'lchab kiritadi) */
export type Dim = { width_mm: string; length_mm: string };
export type TakeBody = { qty: string } | (Dim & { rests?: Dim[] });
export type CutPreview = { have: string; piece: Dim & { qty: string }; rests: (Dim & { qty: string })[]; scrap: string; whole: boolean };

export const pos = (v: string) => Number(dnum(v)) > 0;
export const dimTxt = (d: Dim) => `${num(d.width_mm, 0)} × ${num(d.length_mm, 0)}`;

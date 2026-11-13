// Demo ombor boshlang'ich ma'lumotlari: konveyer lentalari (m², eni × uzunligi), rukav (eni), tishli remen rulon (m),
// donali remenlar; 2 firma, 4 ombor (bittasi — yo'lda), bloklar va javonlar, yig'ish navbati, yo'ldagi kirim.
// Urug' doimiy: bir xil `now` — bir xil ma'lumot (testlar uchun).
import type { Dims, UnitKind, WhKind } from "@/erp/warehouse/lib";

export const DB_VERSION = 1;

export type DbItem = {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  kind: "material" | "product" | "goods";
  dims: Dims;
  grp: string;
  barcode: string | null;
  legacy: string | null;
  base: string;
  min_qty: number;
  cls: "A" | "B" | "C";
  cost: number;
  last_count: string | null;
  chars: { id: number; name: string; barcode: string }[];
};
export type DbBatch = {
  id: number;
  code: string | null;
  item_id: number;
  char_id: number | null;
  firm: string;
  wh: number;
  loc_id: number | null;
  kind: UnitKind;
  width_mm: number | null;
  length_mm: number | null;
  qty: number;
  parent_code: string | null;
  made: { kind: string; by_name: string; posted_at: string; job: string | null } | null;
  cuts: { by_name: string; posted_at: string; job: string | null; number: string; width_mm: number | null; length_mm: number | null; qty: number }[];
  pending: boolean;
  /** qabul hujjati raqami — joylash navbati uchun */
  src: string | null;
  created: string;
};
export type DbCell = { id: number; code: string; wh: number; block_id: number | null };
export type DbBlock = { id: number; wh: number; code: string; name: string; mine: boolean };
export type DbDoc = {
  id: number;
  number: string | null;
  kind: string;
  status: "draft" | "posted";
  firm: string;
  wh: number;
  wh_to: number | null;
  author: number;
  date: string;
  updated: string;
  version: number;
  data: Record<string, unknown>;
  lines: { item_id: number; char_id: number | null; batch_id: number | null; qty: string; data: Record<string, unknown> }[];
};
export type DbPick = {
  id: number;
  number: string;
  date: string;
  customer: string | null;
  firm: string;
  channel: string | null;
  wh: number;
  lines: { line_no: number; item_id: number; char_id: number | null; left: number }[];
};
export type DbIncoming = {
  id: number;
  number: string;
  supplier: string;
  firm: string;
  wh: number;
  expected: string;
  items: { item_id: number; char_id: number | null; qty: number }[];
};
export type DbPlace = { id: number; number: string; loc_id: number; item_id: number; qty: number; firm: string; date: string; author: number; batch_ids: number[] };

export type Db = {
  v: number;
  seq: number;
  me: { tg_id: number; name: string; roles: string[] };
  firms: { id: number; code: string; name: string }[];
  warehouses: { id: number; name: string; kind: WhKind }[];
  blocks: DbBlock[];
  cells: DbCell[];
  items: DbItem[];
  batches: DbBatch[];
  docs: DbDoc[];
  picks: DbPick[];
  incoming: DbIncoming[];
  places: DbPlace[];
};

export const ME_ID = 1001;
const DAY = 864e5;

export function seed(now: number): Db {
  const at = (days: number, h = 10) => new Date(Math.floor(now / DAY) * DAY - days * DAY + h * 36e5).toISOString();
  let id = 100;
  const nid = () => ++id;

  const blocks: DbBlock[] = [
    { id: 1, wh: 1, code: "A", name: "Konveyer lentalar", mine: true },
    { id: 2, wh: 1, code: "B", name: "Remenlar", mine: true },
  ];
  const cells: DbCell[] = [];
  let cid = 0;
  const addCells = (z: string, racks: number, floors: number, block: number | null, wh = 1) => {
    for (let r = 1; r <= racks; r++) for (let f = 1; f <= floors; f++) cells.push({ id: ++cid, code: `${z}-${String(r).padStart(2, "0")}-${f}`, wh, block_id: block });
  };
  addCells("A", 3, 2, 1);
  addCells("B", 2, 3, 2);
  addCells("C", 1, 2, null);
  addCells("D", 1, 2, null, 2);
  const cell = (code: string) => cells.find((c) => c.code === code)!.id;

  const items: DbItem[] = [
    { id: 1, name: "Konveyer lenta EP 400/3 4+2", sku: "EP400-3", unit: "m2", kind: "material", dims: "wl", grp: "Konveyer lentalar", barcode: "4780100000011", legacy: "00117", base: "BLT", min_qty: 50, cls: "A", cost: 185000, last_count: at(12), chars: [] },
    { id: 2, name: "Konveyer lenta EP 200/2 2+1", sku: "EP200-2", unit: "m2", kind: "material", dims: "wl", grp: "Konveyer lentalar", barcode: "4780100000028", legacy: "00123", base: "BLT", min_qty: 30, cls: "A", cost: 120000, last_count: at(41), chars: [] },
    { id: 3, name: "Rukav PVX 3 mm (ochiq)", sku: "RUK-3", unit: "dona", kind: "material", dims: "w", grp: "Rukavlar", barcode: "4780100000035", legacy: null, base: "BLT", min_qty: 0, cls: "C", cost: 45000, last_count: null, chars: [] },
    { id: 4, name: "Ремень 1040-8M-30", sku: "1040-8M-30", unit: "dona", kind: "goods", dims: null, grp: "Tishli remenlar", barcode: "4780100000042", legacy: "00231", base: "RMN", min_qty: 10, cls: "A", cost: 98000, last_count: at(35), chars: [] },
    { id: 5, name: "Ремень SPB 1650 Lw", sku: "SPB1650", unit: "dona", kind: "goods", dims: null, grp: "Klinli remenlar", barcode: "4780100000059", legacy: "00123", base: "RMN", min_qty: 20, cls: "B", cost: 64000, last_count: at(20), chars: [] },
    { id: 6, name: "Ремень поликлиновой 8PK 1200", sku: "8PK1200", unit: "dona", kind: "goods", dims: null, grp: "Poliklinli remenlar", barcode: "4780100000066", legacy: null, base: "RMN", min_qty: 5, cls: "C", cost: 52000, last_count: at(30), chars: [] },
    { id: 7, name: "Tishli remen T10 (ochiq, rulon)", sku: "T10-OPEN", unit: "m", kind: "material", dims: "l", grp: "Tishli remenlar", barcode: "4780100000073", legacy: null, base: "BLT", min_qty: 20, cls: "B", cost: 76000, last_count: at(70), chars: [] },
    { id: 8, name: "Ремень HTD 1400-14M", sku: "1400-14M", unit: "dona", kind: "goods", dims: null, grp: "Tishli remenlar", barcode: null, legacy: null, base: "RMN", min_qty: 4, cls: "B", cost: 210000, last_count: null,
      chars: [{ id: 81, name: "40 mm", barcode: "4780100000080" }, { id: 82, name: "55 mm", barcode: "4780100000097" }] },
  ];

  const b = (o: Partial<DbBatch> & Pick<DbBatch, "item_id" | "firm" | "wh" | "kind" | "qty">): DbBatch => ({
    id: nid(),
    code: null,
    char_id: null,
    loc_id: null,
    width_mm: null,
    length_mm: null,
    parent_code: null,
    made: null,
    cuts: [],
    pending: false,
    src: null,
    created: at(60),
    ...o,
  });
  const batches: DbBatch[] = [
    b({ code: "P00000101", item_id: 1, firm: "BLT", wh: 1, loc_id: cell("A-01-1"), kind: "roll", width_mm: 800, length_mm: 40000, qty: 32,
      cuts: [{ by_name: "Akmal", posted_at: at(5, 11), job: "BR-BU-26-00027", number: "KS-26-0041", width_mm: 800, length_mm: 12500, qty: 10 }] }),
    b({ code: "P00000102", item_id: 1, firm: "BLT", wh: 1, loc_id: cell("A-01-2"), kind: "piece", width_mm: 800, length_mm: 12500, qty: 10, parent_code: "P00000101",
      made: { kind: "cut", by_name: "Akmal", posted_at: at(5, 11), job: "BR-BU-26-00027" } }),
    b({ code: "P00000103", item_id: 1, firm: "BLT", wh: 1, kind: "piece", width_mm: 650, length_mm: 3000, qty: 1.95, created: at(140) }),
    b({ code: "P00000104", item_id: 2, firm: "BLT", wh: 1, loc_id: cell("A-02-1"), kind: "roll", width_mm: 500, length_mm: 30000, qty: 15 }),
    b({ code: "P00000105", item_id: 2, firm: "RMN", wh: 1, loc_id: cell("A-02-2"), kind: "piece", width_mm: 500, length_mm: 4200, qty: 2.1 }),
    b({ code: "P00000106", item_id: 3, firm: "BLT", wh: 1, loc_id: cell("A-03-1"), kind: "piece", width_mm: 120, qty: 1 }),
    b({ code: "P00000107", item_id: 3, firm: "BLT", wh: 1, loc_id: cell("A-03-1"), kind: "piece", width_mm: 150, qty: 1 }),
    b({ code: "P00000108", item_id: 7, firm: "BLT", wh: 1, loc_id: cell("B-02-1"), kind: "roll", length_mm: 50000, qty: 50 }),
    b({ code: "P00000109", item_id: 7, firm: "BLT", wh: 1, kind: "piece", length_mm: 12000, qty: 12, created: at(120) }),
    b({ code: "P00000110", item_id: 2, firm: "BLT", wh: 1, kind: "piece", width_mm: 500, length_mm: 2000, qty: 1, pending: true }),
    b({ code: "P00000111", item_id: 1, firm: "BLT", wh: 3, kind: "piece", width_mm: 800, length_mm: 5000, qty: 4 }),
    b({ item_id: 4, firm: "RMN", wh: 1, loc_id: cell("B-01-1"), kind: "lot", qty: 14 }),
    b({ item_id: 5, firm: "RMN", wh: 1, loc_id: cell("B-01-2"), kind: "lot", qty: 8 }),
    b({ item_id: 6, firm: "RMN", wh: 2, loc_id: cell("D-01-1"), kind: "lot", qty: 30 }),
    b({ item_id: 6, firm: "RMN", wh: 1, kind: "lot", qty: 3 }),
    b({ item_id: 8, char_id: 81, firm: "RMN", wh: 1, loc_id: cell("B-01-3"), kind: "lot", qty: 6 }),
  ];

  const posted = (number: string, kind: string, days: number, data: Record<string, unknown> = {}): DbDoc => ({
    id: nid(), number, kind, status: "posted", firm: "BLT", wh: 1, wh_to: null, author: 1002, date: at(days, 9), updated: at(days, 17), version: 2, data, lines: [],
  });
  const docs: DbDoc[] = [
    posted("INV-26-0011", "inventory", 10, { positions: 25, diff: 0 }),
    posted("INV-26-0012", "inventory", 3, { positions: 18, diff: 2 }),
    posted("KS-26-0041", "cut", 5, { scrap: 0.4, used: 10.4 }),
    posted("KS-26-0045", "cut", 0, { scrap: 0.15, used: 3.2 }),
    posted("KO-26-0019", "transfer", 0),
  ];

  const picks: DbPick[] = [
    { id: 1, number: "BR-BU-26-00031", date: at(1), customer: "Olmaliq KMK", firm: "BLT", channel: null, wh: 1,
      lines: [{ line_no: 1, item_id: 1, char_id: null, left: 4.8 }, { line_no: 2, item_id: 4, char_id: null, left: 2 }] },
    { id: 2, number: "BR-BU-26-00034", date: at(0), customer: "Ozon buyurtmasi 0187", firm: "RMN", channel: "ozon", wh: 1,
      lines: [{ line_no: 1, item_id: 5, char_id: null, left: 3 }] },
    { id: 3, number: "BR-BU-26-00035", date: at(0), customer: "Qizilqum sement", firm: "BLT", channel: null, wh: 1,
      lines: [{ line_no: 1, item_id: 7, char_id: null, left: 6 }, { line_no: 2, item_id: 8, char_id: 81, left: 1 }, { line_no: 3, item_id: 3, char_id: null, left: 1 }] },
  ];
  const incoming: DbIncoming[] = [
    { id: 1, number: "PO-26-0007", supplier: "Bando (Xitoy)", firm: "RMN", wh: 4, expected: at(-1), items: [{ item_id: 4, char_id: null, qty: 20 }, { item_id: 5, char_id: null, qty: 30 }] },
    { id: 2, number: "PO-26-0008", supplier: "Optibelt", firm: "RMN", wh: 4, expected: at(-4), items: [{ item_id: 8, char_id: 82, qty: 6 }, { item_id: 6, char_id: null, qty: 50 }] },
  ];

  return {
    v: DB_VERSION,
    seq: id,
    me: { tg_id: ME_ID, name: "Demo omborchi", roles: ["admin"] },
    firms: [
      { id: 1, code: "BLT", name: "Belting MChJ" },
      { id: 2, code: "RMN", name: "Remen Savdo MChJ" },
    ],
    warehouses: [
      { id: 1, name: "Asosiy ombor", kind: "store" },
      { id: 2, name: "Do'kon — Chilonzor", kind: "shop" },
      { id: 3, name: "Kesish sexi", kind: "production" },
      { id: 4, name: "Yo'lda", kind: "transit" },
    ],
    blocks,
    cells,
    items,
    batches,
    docs,
    picks,
    incoming,
    places: [],
  };
}

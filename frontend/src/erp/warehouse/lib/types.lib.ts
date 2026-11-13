// Ombor API turlari — Jarvis /app/api/erp/* kontrakti (erp_ombor.html ishlatgan shakllar). docs/api/warehouse.md.

/** Birlik o'lchami turi: wl — eni × uzunligi (konveyer lenta, m²), w — eni (rukav), l — uzunlik (rulon, m), null — donali */
export type Dims = "wl" | "w" | "l" | null;
export type UnitKind = "roll" | "piece" | "lot" | "product";
export type WhKind = "store" | "shop" | "production" | "transit";

export type Warehouse = { id: number; name: string; kind: WhKind };
export type Firm = { id: number; code: string; name: string };
/** Hujjat turi va foydalanuvchining shu turdagi huquqlari (create, post …) */
export type DocKindRight = { code: string; title?: { uz?: string }; can: string[] };
export type Me = { tg_id: number; name: string; roles: string[]; warehouses: Warehouse[]; firms: Firm[]; kinds: DocKindRight[] };

export type StockAt = { warehouse_id: number; warehouse: string; firm: string; qty: string | number };

export type ScanUnit = {
  type: "unit";
  id: number;
  code: string;
  item_id: number;
  char_id: number | null;
  name: string;
  kind: UnitKind;
  unit: string;
  dims: Dims;
  width_mm: number | null;
  length_mm: number | null;
  char?: string | null;
  firm: string;
  loc: string | null;
  loc_id: number | null;
  stock: StockAt[];
  pending?: boolean;
  pending_qty?: number;
  parent_code?: string | null;
  made?: { kind: string; by_name?: string; posted_at?: string; job?: string | null } | null;
  cuts?: { by_name?: string; posted_at?: string; job?: string | null; number?: string; width_mm?: number | null; length_mm?: number | null; qty: number }[];
};
export type ScanItem = {
  type: "item";
  item_id: number;
  char_id: number | null;
  name: string;
  unit: string;
  dims: Dims;
  char?: string | null;
  legacy?: string | null;
  char_w?: number | null;
  char_l?: number | null;
  sku?: string | null;
};
export type ScanCell = { type: "cell"; id: number; code: string; name?: string; parent_id: number };
export type ChoiceOpt = { item_id: number; char_id: number | null; name: string; base: string; char?: string | null; unit: string; dims: Dims };
export type ScanRes = ScanUnit | ScanItem | ScanCell | { type: "choice"; options: ChoiceOpt[] } | { type: "doc"; number: string } | { type: "unknown" };

export type Dashboard = {
  stock: { units: number; items: number; rolls: number; pieces: number; no_loc: number; value?: number };
  picks: number | null;
  accuracy: number | null;
  counted_positions: number;
  slow_days: number;
  slow_units: number;
  scrap_pct: number | null;
  pending_units: number;
  low: { name: string; min_qty: number; unit: string; qty: number }[];
  today: Record<string, number>;
  counts: { number: string; date: string; positions: number; diff: number }[];
};

export type Cls = "A" | "B" | "C";
export type CycleRow = { item_id: number; name: string; cls: Cls; last: string | null; age: number; locs: string[]; units: number };
export type Cycle = { due_total: number; summary: Record<Cls, { days: number; items: number; due: number }>; due: CycleRow[] };

export type StockRow = {
  item_id: number;
  name: string;
  sku: string | null;
  qty: number;
  unit: string;
  min_qty: number;
  dims: Dims;
  rolls: number;
  pieces: number;
  units: number;
  locs: string[];
  firms: string[];
  whs: string[];
  cost?: number;
};
export type StockTable = { rows: StockRow[]; total: { items: number; units: number; rolls: number; pieces: number; cost?: number }; see_cost: boolean };

export type ItemStock = {
  total: number;
  reserved: number;
  free: number;
  units: { batch_id: number | null; code: string | null; kind: UnitKind; width_mm: number | null; length_mm: number | null; warehouse: string; firm: string; qty: number }[];
};
export type ItemHit = { item_id: number; char_id: number | null; name: string; sku: string | null; unit: string; dims: Dims; char?: string | null; legacy?: string | null };

export type Cell = { id: number; code: string; parent_id: number; warehouse: string; units: number };
export type CellUnit = { name: string; code: string | null; kind: UnitKind; width_mm: number | null; length_mm: number | null; firm: string; qty: number; unit: string };

export type DocLine = { item_id: number; char_id: number | null; batch_id: number | null; qty: string; data?: Record<string, unknown> };
export type Doc = {
  id: number;
  number: string | null;
  kind: string;
  status: "draft" | "posted";
  firm_id: number;
  warehouse_id: number;
  author: number;
  date: string;
  updated: string;
  version: number;
  data: Record<string, unknown>;
  lines: (DocLine & { data: Record<string, unknown> })[];
};
export type DocBrief = { id: number; number: string | null; warehouse_id: number; author: number; date: string; updated: string };

/** Kesish natijasi (hujjat o'tkazilgandan keyin lines[0].data) */
export type CutRes = { pieces: number[]; rests?: number[]; scrap?: number };
export type InvDiff = { item_id: number; batch_id: number | null; book: number; counted: number; diff: number; moved_from?: number | null };
export type AccDiff = { item_id: number; expected: number; counted: number; diff: number };
export type Posted = Doc & { data: Record<string, unknown> & { result?: (InvDiff | AccDiff)[] } };

export type PickBrief = { id: number; number: string; date: string; customer: string | null; firm: string; channel: string | null; warehouse: string; lines: number; names: string[] };
export type PickUnit = { batch_id: number | null; code: string | null; loc: string | null; qty: number; width_mm: number | null; length_mm: number | null; firm: string };
export type PickLine = { line_no: number; item_id: number; char_id: number | null; name: string; unit: string; dims: Dims; left: number; units: PickUnit[] };
export type PickOrder = { id: number; number: string; customer: string | null; firm: string; warehouse_id: number; lines: PickLine[] };

export type CutPlanUnit = {
  batch_id: number;
  code: string;
  kind: UnitKind;
  width_mm: number | null;
  length_mm: number | null;
  qty: number;
  loc: string | null;
  firm: string;
  warehouse_id: number;
  cuts: { width_mm?: number; length_mm?: number; qty: number }[];
  rests: { width_mm?: number; length_mm?: number; qty: number; scrap: boolean }[];
};
export type CutPlan = {
  unit: string;
  need_qty: number;
  scrap_qty: number;
  opened: number;
  pieces: number;
  units: CutPlanUnit[];
  missing: { width_mm?: number; length_mm?: number; qty: number }[];
};
export type Need = { w: number; l: number; n: number } | { q: number; n: number };

export type Block = { id: number; code: string; name: string; mine: boolean; racks: { code: string; cells: { id: number; code: string; units: number }[] }[] };
export type WhTree = { store: { id: number; name: string }; restricted: boolean; blocks: Block[]; loose: { id: number; code: string; units: number }[] };
export type Unplaced = { batch_id: number; name: string; code: string | null; width_mm: number | null; length_mm: number | null; doc: string; firm: string; qty: number; unit: string };
export type PlaceRec = { id: number; name: string; loc: string; number: string; firm: string; date: string; qty: number; unit: string; author: number };
export type CatHit = { id: number; name: string; grp: string | null; kind: "material" | "product" | "goods" | "service"; qty: number; unit: string };
export type CatItem = { id: number; name: string; grp: string | null; kind: CatHit["kind"]; unit: string; measured: boolean; attrs?: { dims?: Dims }; chars: { id: number; name: string }[] };
export type Placed = { number: string; item: string; loc: string; qty: number; unit: string; units: number[]; label: { url: string } };

export type Incoming = {
  id: number;
  number: string;
  supplier: string | null;
  firm: string;
  warehouse_id: number;
  expected: string | null;
  items: { item_id: number; char_id: number | null; name: string; char?: string | null; unit: string; qty: number }[];
};

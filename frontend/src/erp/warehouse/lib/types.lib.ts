// Ombor API turlari — Jarvis /app/api/erp/* kontrakti (erp_ombor.html ishlatgan shakllar). docs/api/warehouse.md.

/** Birlik o'lchami turi: wl — eni × uzunligi (konveyer lenta, m²), w — eni (rukav), l — uzunlik (rulon, m), null — donali */
export type Dims = "wl" | "w" | "l" | null;
export type UnitKind = "roll" | "piece" | "lot" | "product";
export type WhKind = "store" | "shop" | "production" | "transit";

export type Warehouse = { id: number; name: string; kind: WhKind; code?: string };
/** Joy holati: bloklangan — joylashtirib bo'lmaydi, karantin — tekshiruvdagi tovar uchun */
export type CellStatus = "active" | "blocked" | "quarantine";
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

export type Cell = {
  id: number;
  code: string;
  parent_id: number;
  block_id: number | null;
  rack_id?: number | null;
  /** stellajdagi qator va qavat (1 — eng past) */
  row?: number | null;
  floor?: number | null;
  status?: CellStatus;
  warehouse: string;
  units: number;
};
/** Ombor tuzilmasi: ombor → bino → xona (blok) → stellaj → qator × qavat = joy (A-1-03-2: xona-stellaj-qator-qavat) */
export type WhBuilding = { id: number; name: string; number?: number; code?: string };
/** Xona vazifasi: saqlash, qabul, jo'natish, karantin, sex, qaytarish */
export type Purpose = "storage" | "receiving" | "shipping" | "quarantine" | "production" | "returns";
/** Joy turi (stellaj bo'yicha) */
export type CellKind = "shelf" | "roll" | "pallet" | "bin" | "floor";
export type WhBlock = { id: number; code: string; full?: string; name: string; building_id: number | null; purpose?: Purpose; groups?: string[] };
/** Stellaj — xonada (blokda): qatorlar × qavatlar; joylari `A-1-03-2` (xona-stellaj-qator-qavat) */
export type WhRack = {
  id: number;
  block_id: number;
  number: number;
  code: string;
  name: string;
  rows: number;
  floors: number;
  cell_kind?: CellKind;
  /** bitta joyga necha birlik (null — cheklanmagan) */
  capacity?: number | null;
  /** eng katta eni, mm (null — cheklanmagan) */
  max_width_mm?: number | null;
};
/** Joylashtirish tavsiyasi */
export type PutawayTip = { id: number; code: string; reason: string; units: number; capacity: number | null };
export type WhStructure = { store: { id: number; name: string; code?: string }; buildings: WhBuilding[]; blocks: WhBlock[]; racks: WhRack[] };
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
export type AccDiff = { item_id: number; name?: string; expected: number; counted: number; diff: number; /** rejada yo'q edi */ extra?: boolean };
export type Posted = Doc & { data: Record<string, unknown> & { result?: (InvDiff | AccDiff)[] } };

export type PickBrief = { id: number; number: string; date: string; customer: string | null; firm: string; channel: string | null; warehouse: string; lines: number; names: string[]; short?: number };
/** tip — nega tavsiya: «kam chiqindi», «aniq mos», «eng eski (FIFO)» */
export type PickUnit = { batch_id: number | null; code: string | null; loc: string | null; qty: number; width_mm: number | null; length_mm: number | null; firm: string; tip?: string };
/** stop — yig'ish yo'lidagi tartib raqami, at — birinchi tavsiya joyi, short — necha marta «topilmadi» */
export type PickLine = { line_no: number; item_id: number; char_id: number | null; name: string; unit: string; dims: Dims; left: number; units: PickUnit[]; stop?: number; at?: string | null; short?: number };
export type PickOrder = { id: number; number: string; customer: string | null; firm: string; warehouse_id: number; lines: PickLine[]; route?: string[] };
/** Jo'natish hujjati (qaytarish uchun): line — qator indeksi, returned — qaytarilgani */
export type SaleLine = { line: number; item_id: number; char_id: number | null; batch_id: number | null; code: string | null; name: string; unit: string; qty: number; returned: number };
export type Sale = { id: number; number: string; date: string; customer: string | null; base: string | null; firm: string; warehouse_id: number; lines: SaleLine[] };
/** Birlik zanjiri: from — mahsulot materiallari; used — birlik qaysi sarfda ishlatilgan va natijadagi mahsulot */
export type TraceFrom = { code: string | null; item_id: number; name: string; qty: number; unit: string; doc: string };
export type Trace = {
  job: string | null;
  from: TraceFrom[];
  used: { doc: string; date: string; job: string | null; qty: number; returned: string | null; products: { code: string | null; name: string; doc: string }[] }[];
};
/** Sanash aniqligi (IRA) */
export type IraKpi = { days: number; counts: number; positions: number; accurate: number; ira: number | null; by_cls: Record<string, { positions: number; ira: number | null }> };
/** Ko'rsatkichlar paneli (GET kpi/summary) */
export type Kpi = {
  days: number;
  store: string;
  dock: DockKpi;
  ira: IraKpi;
  outbound: { orders: number; lines: number; open: number; shorts: number; returns: number; return_lines: number; return_pct: number | null; defect: number };
  production: { consumes: number; used: number; scrap: number; scrap_pct: number | null; products: number };
  writeoff: { docs: number; value: number };
  space: { cells: number; active: number; used: number; pct: number | null; blocked: number; quarantine: number; by_block: { code: string; name: string; cells: number; used: number; pct: number | null }[] };
  activity: { date: string; in: number; out: number; move: number }[];
  hot: { code: string; moves: number }[];
  slotting: { unit_id: number; code: string | null; name: string; loc: string | null; hint: string }[];
};
export type ReturnRes = { id: number; number: string; ok: number; defect: number; quarantine: string | null };

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
export type Unplaced = {
  batch_id: number;
  name: string;
  code: string | null;
  width_mm: number | null;
  length_mm: number | null;
  doc: string;
  firm: string;
  qty: number;
  unit: string;
  item_id?: number;
  /** qabul qilingan vaqt — joylashni qancha kutyapti */
  since?: string | null;
};
/** Qabuldan joylashgacha (dock-to-stock), soatlarda; jahon yaxshi ko'rsatkichi ≤ 2 soat */
export type DockKpi = { days: number; placed: number; avg_h: number | null; median_h: number | null; within_2h: number | null; waiting: number; oldest_h: number | null };
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

/** Harakatlar jurnali yozuvi (o'chmaydi): qoldiq o'zgarishi (delta), qayerdan → qayerga, hujjat, sabab, kim */
export type Move = {
  id: number;
  at: string;
  op: string;
  op_title: string;
  unit_id: number | null;
  unit_code: string | null;
  item_id: number;
  char_id: number | null;
  firm: string;
  delta: number;
  qty_after: number;
  wh_from: string | null;
  wh_to: string | null;
  loc_from: string | null;
  loc_to: string | null;
  doc_id: number | null;
  doc_number: string | null;
  reason: string;
  author_name: string;
};

/** Yo'ldagi ko'chirish (qabul qiluvchi ombor uchun): birliklar skanerlab, partiyalar — «hammasi keldi» bilan qabul qilinadi */
export type Transit = {
  id: number;
  number: string | null;
  date: string;
  from: string;
  to_id: number | null;
  to: string;
  firm: string;
  units: { batch_id: number; code: string | null; name: string; qty: number; width_mm: number | null; length_mm: number | null; received: boolean }[];
  lots: { item_id: number; char_id: number | null; qty: number; name: string }[];
  lots_done: boolean;
  done: boolean;
};
/** To'ldirish me'yori (min/max) va joriy qoldiq */
export type Level = { id: number; item_id: number; name: string; unit: string; min_qty: number; max_qty: number; have: number };
export type Replenish = { from_id: number | null; from: string | null; rows: (Level & { need: number; available: number; suggest: number })[] };

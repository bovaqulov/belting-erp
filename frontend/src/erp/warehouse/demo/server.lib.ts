// Brauzer ichidagi soxta ombor backend: Jarvis /app/api/erp/* yo'llari va JSON shakllari (erp_ombor.html ishlatgani),
// holat haqiqatan o'zgaradi (Db joyida): kesish rulonni qisqartiradi, sanash farqni yozadi, jo'natish qoldiqni kamaytiradi.
// handle() sof: tarmoq yo'q, vaqt `now` bilan beriladi.
import type {
  Cell,
  CellUnit,
  Cls,
  Cycle,
  CycleRow,
  Dashboard,
  Doc,
  DocBrief,
  Incoming,
  ItemHit,
  ItemStock,
  Me,
  PickBrief,
  PickOrder,
  ReturnRes,
  Sale,
  Trace,
  Kpi,
  IraKpi,
  PlaceRec,
  ScanRes,
  ScanUnit,
  StockRow,
  StockTable,
  Unplaced,
  WhTree,
  CatHit,
  CatItem,
  CutPlan,
  CutPlanUnit,
  WhBlock,
  WhBuilding,
  WhKind,
  Move,
  Transit,
  Level,
  Replenish,
  AccDiff,
  DockKpi,
  Purpose,
  PutawayTip,
  CellKind,
  CellStatus,
  WhRack,
  WhStructure,
} from "@/erp/warehouse/lib";
import { bldCode, blkCode, cellCode as mkCell, floorLetter, MAX_FLOORS, MAX_ROWS, rackCode } from "@/erp/warehouse/lib";

import { ME_ID, type Db, type DbBatch, type DbBlock, type DbBuilding, type DbCell, type DbDoc, type DbIncoming, type DbItem, type DbRack } from "./seed.lib";

export type Res = { status: number; body: unknown };
type B = Record<string, unknown>;

const A = "/app/api/erp";
const DAY = 864e5;
const EPS = 1e-9;
const ok = (body: unknown): Res => ({ status: 200, body });
const fail = (status: number, detail: string): Res => ({ status, body: { detail } });
class Bad extends Error {}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const iso = (now: number) => new Date(now).toISOString();
const sameDay = (a: string, now: number) => Math.floor(Date.parse(a) / DAY) === Math.floor(now / DAY);
const KINDS: [string, string][] = [
  ["inventory", "Inventarizatsiya"],
  ["cut", "Kesish"],
  ["transfer", "Ko'chirish"],
  ["writeoff", "Hisobdan chiqarish"],
  ["acceptance", "Qabul"],
  ["sale", "Jo'natish"],
  ["initial", "Boshlang'ich qoldiq"],
];
const PFX: Record<string, string> = { inventory: "INV", cut: "KS", transfer: "KO", writeoff: "HC", acceptance: "QB", sale: "JN", initial: "BQ", return: "QT" };
const CLS_DAYS: Record<Cls, number> = { A: 7, B: 30, C: 90 }; // siklik sanash: haftalik / oylik / choraklik
// sanash toleransi (backend TOL): farq foizi VA summasi chegarada — avtomatik; oshsa — rahbar tasdig'i + sabab
const TOL: Record<Cls, [number, number]> = { A: [0, 0], B: [2, 50_000], C: [5, 100_000] };
const REASONS: Record<string, string> = {
  count_error: "Oldingi sanash yoki kiritish xatosi",
  mislocated: "Boshqa joyda turgan edi",
  damage: "Shikastlangan / yaroqsiz",
  loss: "Yo'qotish (o'g'irlik, aniqlanmagan)",
  unrecorded_in: "Hujjatsiz kirim",
  unrecorded_out: "Hujjatsiz chiqim",
  other: "Boshqa",
};
type InvRow = { item_id: number; batch_id: number | null; book: number; counted: number; diff: number; moved_from: number | null };
function tolerance(db: Db, rows: InvRow[]): (InvRow & { cls: Cls; value: number; ok: boolean })[] {
  return rows.map((r) => {
    const it = db.items.find((x) => x.id === r.item_id);
    const cls = (it?.cls ?? "C") as Cls;
    const diff = Math.abs(r.counted - r.book);
    const value = r4(diff * (it?.cost ?? 0));
    const [pct, cap] = TOL[cls];
    const ok = diff <= EPS || (r.book > EPS && (diff / r.book) * 100 <= pct && value <= cap);
    return { ...r, cls, value, ok };
  });
}
const supervisor = (db: Db) => db.me.roles.some((r) => r === "owner" || r === "admin");

/** sanashni o'tkazishdan oldin ko'rish: nusxada bajarib, holatni qaytaramiz (backend inventory_review) */
function inventoryReview(db: Db, d: DbDoc, now: number) {
  // bazaning nusxasida bajaramiz — asl baza va hujjat obyekti o'zgarmaydi
  const copy = JSON.parse(JSON.stringify(db)) as Db;
  const dc = copy.docs.find((x) => x.id === d.id)!;
  postInventory(copy, dc, now);
  const rows = dc.data.result as InvRow[];
  const lines = tolerance(db, rows).map((r) => ({ ...r, name: itemOf(db, r.item_id).name }));
  const bad = lines.filter((r) => !r.ok);
  return { lines, positions: lines.length, need: bad.length, value: r4(bad.reduce((a, r) => a + r.value, 0)), can_approve: supervisor(db), reasons: Object.entries(REASONS).map(([code, title]) => ({ code, title })) };
}

// ---------------------------------------------------------------- yordamchilar
const nid = (db: Db) => ++db.seq;
const itemOf = (db: Db, id: number): DbItem => {
  const it = db.items.find((x) => x.id === id);
  if (!it) throw new Bad(`Tovar #${id} topilmadi`);
  return it;
};
const whName = (db: Db, id: number | null) => db.warehouses.find((w) => w.id === id)?.name ?? "—";
const cellCode = (db: Db, id: number | null) => (id ? (db.cells.find((c) => c.id === id)?.code ?? null) : null);
const charName = (it: DbItem, id: number | null) => (id ? (it.chars.find((c) => c.id === id)?.name ?? null) : null);
const fullName = (it: DbItem, char: number | null) => [it.name, charName(it, char)].filter(Boolean).join(" · ");
const transit = (db: Db) => new Set(db.warehouses.filter((w) => w.kind === "transit").map((w) => w.id));
/** Hisobdagi tirik qoldiq: miqdori bor, sanashda kutilmayapti, yo'lda emas */
const live = (db: Db) => {
  const tr = transit(db);
  return db.batches.filter((b) => b.qty > EPS && !b.pending && !tr.has(b.wh));
};
const firmOk = (db: Db, code: unknown): string => {
  if (typeof code !== "string" || !db.firms.some((f) => f.code === code)) throw new Bad("Firma noto'g'ri");
  return code;
};
const whOk = (db: Db, id: unknown): number => {
  const n = Number(id);
  if (!db.warehouses.some((w) => w.id === n)) throw new Bad("Ombor noto'g'ri");
  return n;
};
const numOf = (v: unknown): number => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

function nextCode(db: Db): string {
  const max = db.batches.reduce((a, b) => Math.max(a, b.code ? Number(b.code.slice(1)) || 0 : 0), 0);
  return `P${String(max + 1).padStart(8, "0")}`;
}
function nextNumber(db: Db, kind: string): string {
  const p = PFX[kind] ?? "DOC";
  const max = db.docs.reduce((a, d) => (d.number?.startsWith(`${p}-26-`) ? Math.max(a, Number(d.number.slice(p.length + 4)) || 0) : a), 0);
  return `${p}-26-${String(max + 1).padStart(4, "0")}`;
}
function newBatch(db: Db, o: Partial<DbBatch> & Pick<DbBatch, "item_id" | "firm" | "wh" | "kind" | "qty">, now: number): DbBatch {
  const b: DbBatch = {
    id: nid(db),
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
    created: iso(now),
    ...o,
  };
  db.batches.push(b);
  return b;
}
/** Donali tovar partiyalari (item/kenglik/firma/ombor) dan qty olish; yetmasa — xato */
function takeLots(db: Db, item: number, char: number | null, firm: string | null, wh: number, qty: number) {
  const lots = live(db).filter((b) => b.kind === "lot" && b.item_id === item && (b.char_id ?? null) === (char ?? null) && b.wh === wh && (!firm || b.firm === firm));
  const have = lots.reduce((a, b) => a + b.qty, 0);
  if (have + EPS < qty) throw new Bad(`${fullName(itemOf(db, item), char)}: ${whName(db, wh)} da ${r4(have)} bor, kerak ${r4(qty)}`);
  let left = qty;
  for (const b of lots.sort((x, y) => x.created.localeCompare(y.created) || x.id - y.id)) {
    const t = Math.min(b.qty, left);
    b.qty = r4(b.qty - t);
    left -= t;
    if (left <= EPS) break;
  }
}
function addLot(db: Db, item: number, char: number | null, firm: string, wh: number, loc: number | null, qty: number, now: number, src: string | null = null): DbBatch {
  const cur = db.batches.find((b) => b.kind === "lot" && !b.pending && b.item_id === item && (b.char_id ?? null) === char && b.firm === firm && b.wh === wh && b.loc_id === loc && b.src === src);
  if (cur) {
    cur.qty = r4(cur.qty + qty);
    return cur;
  }
  return newBatch(db, { item_id: item, char_id: char, firm, wh, loc_id: loc, kind: "lot", qty: r4(qty), src }, now);
}
const sweep = (db: Db) => {
  db.batches = db.batches.filter((b) => b.code || b.qty > EPS);
};

// ---------------------------------------------------------------- javob shakllari
function scanUnit(db: Db, b: DbBatch): ScanUnit {
  const it = itemOf(db, b.item_id);
  return {
    type: "unit",
    id: b.id,
    code: b.code ?? "",
    item_id: b.item_id,
    char_id: b.char_id,
    name: fullName(it, b.char_id),
    kind: b.kind,
    unit: it.unit,
    dims: it.dims,
    width_mm: b.width_mm,
    length_mm: b.length_mm,
    char: charName(it, b.char_id),
    firm: b.firm,
    loc: cellCode(db, b.loc_id),
    loc_id: b.loc_id,
    stock: b.pending || b.qty <= EPS ? [] : [{ warehouse_id: b.wh, warehouse: whName(db, b.wh), firm: b.firm, qty: b.qty }],
    pending: b.pending,
    pending_qty: b.pending ? b.qty : 0,
    parent_code: b.parent_code,
    made: b.made,
    cuts: b.cuts,
  };
}

function docOut(db: Db, d: DbDoc): Doc {
  return {
    id: d.id,
    number: d.number,
    kind: d.kind,
    status: d.status,
    firm_id: db.firms.find((f) => f.code === d.firm)?.id ?? 0,
    warehouse_id: d.wh,
    author: d.author,
    date: d.date,
    updated: d.updated,
    version: d.version,
    data: d.data,
    lines: d.lines,
  };
}

function me(db: Db): Me {
  return { ...db.me, warehouses: db.warehouses.filter((w) => w.active !== false).map(({ id, name, kind, code }) => ({ id, name, kind, code })), firms: db.firms, kinds: KINDS.map(([code, uz]) => ({ code, title: { uz }, can: ["create", "post"] })) };
}

function dashboard(db: Db, now: number): Dashboard {
  const ls = live(db);
  const recent = (kind: string) => db.docs.filter((d) => d.kind === kind && d.status === "posted" && Date.parse(d.date) > now - 30 * DAY);
  const inv = recent("inventory").sort((a, b) => b.date.localeCompare(a.date));
  const pos = inv.reduce((a, d) => a + Number(d.data.positions ?? 0), 0);
  const diff = inv.reduce((a, d) => a + Number(d.data.diff ?? 0), 0);
  const cuts = recent("cut");
  const used = cuts.reduce((a, d) => a + Number(d.data.used ?? 0), 0);
  const scrap = cuts.reduce((a, d) => a + Number(d.data.scrap ?? 0), 0);
  const today: Record<string, number> = {};
  for (const d of db.docs) if (d.status === "posted" && sameDay(d.date, now)) today[d.kind] = (today[d.kind] ?? 0) + 1;
  const total = (id: number) => ls.filter((b) => b.item_id === id).reduce((a, b) => a + b.qty, 0);
  return {
    stock: {
      units: ls.length,
      items: new Set(ls.map((b) => b.item_id)).size,
      rolls: ls.filter((b) => b.kind === "roll").length,
      pieces: ls.filter((b) => b.kind === "piece").length,
      no_loc: ls.filter((b) => !b.loc_id).length,
      value: Math.round(ls.reduce((a, b) => a + b.qty * itemOf(db, b.item_id).cost, 0)),
    },
    picks: db.picks.length,
    accuracy: pos ? r4((1 - diff / pos) * 100) : null,
    counted_positions: pos,
    slow_days: 90,
    slow_units: ls.filter((b) => Date.parse(b.created) < now - 90 * DAY).length,
    scrap_pct: used ? r4((scrap / used) * 100) : null,
    pending_units: db.batches.filter((b) => b.pending).length,
    low: db.items
      .filter((it) => it.min_qty > 0 && total(it.id) < it.min_qty)
      .map((it) => ({ name: it.name, min_qty: it.min_qty, unit: it.unit, qty: r4(total(it.id)) })),
    today,
    counts: inv.map((d) => ({ number: d.number ?? "", date: d.date, positions: Number(d.data.positions ?? 0), diff: Number(d.data.diff ?? 0) })),
  };
}

function cycle(db: Db, wh: number, now: number): Cycle {
  const ls = live(db).filter((b) => b.wh === wh);
  const ids = [...new Set(ls.map((b) => b.item_id))];
  const rows: (CycleRow & { due: boolean })[] = ids.map((id) => {
    const it = itemOf(db, id);
    const mine = ls.filter((b) => b.item_id === id);
    const age = it.last_count ? Math.floor((now - Date.parse(it.last_count)) / DAY) : 0;
    return {
      item_id: id,
      name: it.name,
      cls: it.cls,
      last: it.last_count,
      age,
      locs: [...new Set(mine.map((b) => cellCode(db, b.loc_id)).filter((x): x is string => !!x))].sort(),
      units: mine.length,
      due: !it.last_count || age >= CLS_DAYS[it.cls],
    };
  });
  const summary = Object.fromEntries(
    (["A", "B", "C"] as Cls[]).map((c) => [c, { days: CLS_DAYS[c], items: rows.filter((r) => r.cls === c).length, due: rows.filter((r) => r.cls === c && r.due).length }]),
  ) as Cycle["summary"];
  const due = rows
    .filter((r) => r.due)
    .sort((a, b) => a.cls.localeCompare(b.cls) || Number(!!a.last) - Number(!!b.last) || b.age - a.age)
    .map((r): CycleRow => ({ item_id: r.item_id, name: r.name, cls: r.cls, last: r.last, age: r.age, locs: r.locs, units: r.units }));
  return { due_total: due.length, summary, due };
}

function stockTable(db: Db, q: URLSearchParams): StockTable {
  const wh = q.get("warehouse_id") ? Number(q.get("warehouse_id")) : null;
  const s = (q.get("q") ?? "").trim().toLowerCase();
  const kind = q.get("kind") ?? "";
  const low = q.get("low") === "true";
  const ls = live(db).filter((b) => !wh || b.wh === wh);
  const rows: StockRow[] = [];
  for (const it of db.items) {
    const mine = ls.filter((b) => b.item_id === it.id);
    if (!mine.length) continue;
    if (s && ![it.name, it.sku, it.barcode, it.legacy, ...it.chars.map((c) => c.barcode)].some((x) => x?.toLowerCase().includes(s))) continue;
    if (kind === "measured" && !it.dims) continue;
    if (kind === "piece" && it.dims) continue;
    const qty = r4(mine.reduce((a, b) => a + b.qty, 0));
    if (low && !(it.min_qty > 0 && qty < it.min_qty)) continue;
    rows.push({
      item_id: it.id,
      name: it.name,
      sku: it.sku,
      qty,
      unit: it.unit,
      min_qty: it.min_qty,
      dims: it.dims,
      rolls: mine.filter((b) => b.kind === "roll").length,
      pieces: mine.filter((b) => b.kind === "piece").length,
      units: mine.length,
      locs: [...new Set(mine.map((b) => cellCode(db, b.loc_id)).filter((x): x is string => !!x))].sort(),
      firms: [...new Set(mine.map((b) => b.firm))],
      whs: [...new Set(mine.map((b) => whName(db, b.wh)))],
      cost: Math.round(qty * it.cost),
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return {
    rows,
    total: {
      items: rows.length,
      units: rows.reduce((a, r) => a + r.units, 0),
      rolls: rows.reduce((a, r) => a + r.rolls, 0),
      pieces: rows.reduce((a, r) => a + r.pieces, 0),
      cost: rows.reduce((a, r) => a + (r.cost ?? 0), 0),
    },
    see_cost: true,
  };
}

function scan(db: Db, raw: string): ScanRes {
  const code = raw.trim();
  const up = code.toUpperCase();
  const b = db.batches.find((x) => x.code === up);
  if (b) return scanUnit(db, b);
  const c = db.cells.find((x) => x.code === up);
  if (c) return { type: "cell", id: c.id, code: c.code, parent_id: c.wh };
  for (const it of db.items) {
    const ch = it.chars.find((x) => x.barcode === code);
    if (ch) return { type: "item", item_id: it.id, char_id: ch.id, name: it.name, unit: it.unit, dims: it.dims, char: ch.name, sku: it.sku };
    if (it.barcode === code || it.sku?.toUpperCase() === up) return { type: "item", item_id: it.id, char_id: null, name: it.name, unit: it.unit, dims: it.dims, sku: it.sku };
  }
  const leg = db.items.filter((it) => it.legacy === code);
  if (leg.length > 1)
    return { type: "choice", options: leg.map((it) => ({ item_id: it.id, char_id: null, name: it.name, base: it.base, unit: it.unit, dims: it.dims })) };
  if (leg.length === 1) {
    const it = leg[0];
    return { type: "item", item_id: it.id, char_id: null, name: it.name, unit: it.unit, dims: it.dims, legacy: it.base, sku: it.sku };
  }
  const d = db.docs.find((x) => x.number === up);
  if (d?.number) return { type: "doc", number: d.number };
  return { type: "unknown" };
}

function itemStock(db: Db, item: number, char: number | null): ItemStock {
  const ls = live(db).filter((b) => b.item_id === item && (!char || b.char_id === char));
  const total = r4(ls.reduce((a, b) => a + b.qty, 0));
  const reserved = r4(db.picks.flatMap((p) => p.lines).filter((l) => l.item_id === item && (!char || l.char_id === char)).reduce((a, l) => a + l.left, 0));
  return {
    total,
    reserved,
    free: r4(Math.max(0, total - reserved)),
    units: ls.map((b) => ({ batch_id: b.code ? b.id : null, code: b.code, kind: b.kind, width_mm: b.width_mm, length_mm: b.length_mm, warehouse: whName(db, b.wh), firm: b.firm, qty: b.qty })),
  };
}

function cellOut(db: Db, c: DbCell, ls = live(db)): Cell {
  return { id: c.id, code: c.code, parent_id: c.wh, block_id: c.block_id, rack_id: c.rack_id ?? null, row: c.row ?? null, floor: c.floor ?? null, status: c.status ?? "active", warehouse: whName(db, c.wh), units: ls.filter((b) => b.loc_id === c.id).length };
}

function cells(db: Db): Cell[] {
  const ls = live(db);
  return db.cells.filter((c) => !transit(db).has(c.wh)).map((c) => cellOut(db, c, ls));
}

/** Joylashtirishdan oldin: bloklangan joyga qo'yib bo'lmaydi (backend loc_ok) */
/** Joylashtirishdan oldin (backend loc_ok): bloklangan — yo'q; stellaj sig'imi va eng katta eni — oshsa rad */
function locOk(db: Db, id: number | null, o: { adding?: number; width?: number | null; exclude?: number[] } = {}): void {
  const c = id ? db.cells.find((x) => x.id === id) : null;
  if (!c) return;
  if (c.status === "blocked") throw new Bad(`${c.code} — bloklangan joy: boshqa joy tanlang`);
  const r = c.rack_id ? db.racks.find((x) => x.id === c.rack_id) : null;
  if (!r) return;
  if (r.max_width_mm && o.width && o.width > r.max_width_mm) throw new Bad(`${c.code} — eni ${r.max_width_mm} mm gacha: ${o.width} mm sig'maydi`);
  if (r.capacity) {
    const has = live(db).filter((b) => b.loc_id === c.id && !(o.exclude ?? []).includes(b.id)).length;
    if (has + (o.adding ?? 1) > r.capacity) throw new Bad(`${c.code} to'la (${has}/${r.capacity}) — boshqa joy tanlang`);
  }
}

const PURPOSES: Purpose[] = ["storage", "receiving", "shipping", "quarantine", "production", "returns"];
const KINDS_C: CellKind[] = ["shelf", "roll", "pallet", "bin", "floor"];
const purposeOf = (v: unknown, d: Purpose = "storage"): Purpose => {
  const p = (v ?? d) as Purpose;
  if (!PURPOSES.includes(p)) throw new Bad("Xona vazifasi noto'g'ri — saqlash, qabul, jo'natish, karantin, sex yoki qaytarish");
  return p;
};
const groupsOf = (v: unknown): string[] => {
  if (v === undefined || v === null || v === "") return [];
  if (!Array.isArray(v)) throw new Bad("Tovar guruhlari — ro'yxat");
  return [...new Set(v.map((x) => String(x).trim().slice(0, 120)).filter(Boolean))].sort().slice(0, 30);
};
/** joy turi, sig'imi, eng katta eni — berilmaganlari o'zgarmaydi (yangi: tokcha, cheklovsiz) */
function rackAttrs(body: B, r?: DbRack): Partial<DbRack> {
  const out: Partial<DbRack> = {};
  if ("cell_kind" in body || !r) {
    const k = (body.cell_kind ?? "shelf") as CellKind;
    if (!KINDS_C.includes(k)) throw new Bad("Joy turi noto'g'ri — tokcha, rulon, poddon, quti yoki pol");
    out.cell_kind = k;
  }
  for (const [f, lim, what] of [["capacity", 999, "Sig'im (birlik)"], ["max_width_mm", 10000, "Eng katta eni (mm)"]] as const) {
    if (!(f in body) && r) continue;
    const v = body[f];
    if (v === undefined || v === null || v === "" || v === 0 || v === "0") {
      out[f] = null;
      continue;
    }
    const n = Number(v);
    if (!Number.isInteger(n)) throw new Bad(`${what} — butun son`);
    if (n < 1 || n > lim) throw new Bad(`${what} — 1 dan ${lim} gacha`);
    out[f] = n;
  }
  return out;
}

/** joylashtirish tavsiyasi (backend putaway bilan bir xil) */
function putaway(db: Db, q: URLSearchParams): PutawayTip[] {
  const wh = whOk(db, q.get("store_id"));
  const it = itemOf(db, Number(q.get("item_id")));
  const need = Math.max(1, Number(q.get("n") ?? 1) || 1);
  const w = q.get("width_mm") ? Number(q.get("width_mm")) : null;
  const ls = live(db);
  const PREF = [2, 3, 1, 4, 5, 6];
  const out: [number, number, string, PutawayTip][] = [];
  for (const c of db.cells.filter((x) => x.wh === wh && x.rack_id && (x.status ?? "active") === "active")) {
    const b = db.blocks.find((x) => x.id === c.block_id);
    if (!b || (b.purpose ?? "storage") !== "storage") continue;
    const r = db.racks.find((x) => x.id === c.rack_id)!;
    if (r.max_width_mm && w && w > r.max_width_mm) continue;
    const here = ls.filter((x) => x.loc_id === c.id);
    const used = here.length;
    if (r.capacity && used + need > r.capacity) continue;
    const gs = b.groups ?? [];
    const grp = it.grp ?? "";
    let rank: number, why: string;
    if (here.some((x) => x.item_id === it.id)) [rank, why] = [0, "shu tovar shu yerda — jamlash"];
    else if (grp && gs.includes(grp) && !used) [rank, why] = [1, `«${grp}» xonasi, bo'sh`];
    else if (grp && gs.includes(grp)) [rank, why] = [2, `«${grp}» xonasi`];
    else if (!used && !gs.length) [rank, why] = [3, "bo'sh joy"];
    else if (!used) [rank, why] = [4, "bo'sh joy (boshqa guruh xonasi)"];
    else continue;
    const fp = PREF.includes(c.floor ?? 0) ? PREF.indexOf(c.floor!) : 9;
    out.push([rank, fp, c.code, { id: c.id, code: c.code, reason: why, units: used, capacity: r.capacity ?? null }]);
  }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2])).slice(0, 5).map((x) => x[3]);
}

// ---- kodlar (codes.lib): AO1-A-02-03-C — backend _bcode/_xcode/_rcode/_recode bilan bir xil
const whCodeOf = (db: Db, wh: number) => db.warehouses.find((w) => w.id === wh)?.code ?? "";
const bCode = (db: Db, b: DbBuilding) => bldCode(whCodeOf(db, b.wh), b.number);
const xCode = (db: Db, x: DbBlock) => {
  const b = db.buildings.find((y) => y.id === x.building_id);
  return b ? blkCode(bCode(db, b), x.code) : x.code;
};
const rCode = (db: Db, r: DbRack) => rackCode(xCode(db, db.blocks.find((b) => b.id === r.block_id)!), r.number);
const rackOut = (db: Db, r: DbRack): WhRack => ({ id: r.id, block_id: r.block_id, number: r.number, code: rCode(db, r), name: r.name, rows: r.rows, floors: r.floors, cell_kind: r.cell_kind ?? "shelf", capacity: r.capacity ?? null, max_width_mm: r.max_width_mm ?? null });
const blockOut = (db: Db, b: DbBlock): WhBlock => ({ id: b.id, code: b.code, full: xCode(db, b), name: b.name, building_id: b.building_id, purpose: b.purpose ?? "storage", groups: b.groups ?? [] });
const bldOut = (db: Db, b: DbBuilding): WhBuilding => ({ id: b.id, name: b.name, number: b.number, code: bCode(db, b) });

function recode(db: Db, pick: (c: DbCell) => boolean): number {
  const cs = db.cells.filter((c) => pick(c) && c.rack_id && c.row && c.floor);
  const next = new Map(cs.map((c) => [c.id, mkCell(rCode(db, db.racks.find((r) => r.id === c.rack_id)!), c.row!, c.floor!)]));
  const taken = db.cells.find((c) => !next.has(c.id) && [...next.values()].includes(c.code));
  if (taken) throw new Bad(`${taken.code} — bunday joy allaqachon bor: boshqa kod tanlang`);
  for (const c of cs) c.code = next.get(c.id)!;
  return cs.length;
}

function structure(db: Db, store: number): WhStructure {
  return {
    store: { id: store, name: whName(db, store), code: whCodeOf(db, store) },
    buildings: db.buildings.filter((b) => b.wh === store).sort((a, b) => a.number - b.number).map((b) => bldOut(db, b)),
    blocks: db.blocks.filter((b) => b.wh === store).map((b) => blockOut(db, b)),
    racks: db.racks.filter((r) => r.wh === store).map((r) => rackOut(db, r)),
  };
}

const STORE_KINDS: WhKind[] = ["store", "shop", "production"];

function storeOf(db: Db, id: number) {
  const w = db.warehouses.find((x) => x.id === id);
  if (!w || w.active === false || !STORE_KINDS.includes(w.kind)) return null;
  return w;
}

function editStore(db: Db, id: number, body: B): Res {
  const w = storeOf(db, id);
  if (!w) return fail(404, "Ombor topilmadi");
  const name = String(body.name ?? "").trim().slice(0, 120);
  if (!name) throw new Bad("Ombor nomini yozing, masalan «Asosiy ombor»");
  if (db.warehouses.some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) throw new Bad(`«${name}» nomli ombor allaqachon bor`);
  const kind = (body.kind ?? w.kind) as WhKind;
  if (!STORE_KINDS.includes(kind)) throw new Bad("Ombor turi noto'g'ri — Ombor, Do'kon yoki Sex");
  const code = body.code == null ? w.code : String(body.code).trim().toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(code)) throw new Bad("Ombor kodi — 2–3 lotin harfi, masalan AO (Asosiy ombor)");
  if (db.warehouses.some((x) => x.id !== id && x.code === code)) throw new Bad(`${code} kodi boshqa omborda band`);
  const changed = code !== w.code;
  w.name = name;
  w.kind = kind;
  w.code = code;
  const recoded = changed ? recode(db, (c) => c.wh === id) : 0;
  return ok({ id: w.id, name: w.name, kind: w.kind, code: w.code, recoded });
}

function dropStore(db: Db, id: number): Res {
  const w = storeOf(db, id);
  if (!w) return fail(404, "Ombor topilmadi");
  if (db.batches.some((b) => b.wh === id && b.qty > EPS)) return fail(409, `«${w.name}» da qoldiq bor — avval boshqa omborga ko'chiring yoki hisobdan chiqaring`);
  if (db.picks.some((x) => x.wh === id)) return fail(409, `«${w.name}» da yopilmagan yig'ish bor`);
  const used = db.batches.some((b) => b.wh === id) || db.docs.some((d) => d.wh === id || d.wh_to === id) || db.incoming.some((x) => x.wh === id);
  if (!used) {
    const cells = new Set(db.cells.filter((c) => c.wh === id).map((c) => c.id));
    db.places = db.places.filter((x) => !cells.has(x.loc_id));
    db.cells = db.cells.filter((c) => c.wh !== id);
    db.racks = db.racks.filter((r) => r.wh !== id);
    db.blocks = db.blocks.filter((b) => b.wh !== id);
    db.buildings = db.buildings.filter((b) => b.wh !== id);
    db.warehouses = db.warehouses.filter((x) => x.id !== id);
    return ok({ ok: true, archived: false });
  }
  w.active = false;
  w.name = `${w.name} (o'chirilgan #${id})`.slice(0, 120);
  w.code = "";
  return ok({ ok: true, archived: true });
}

// ---- binolar
function bldIn(db: Db, wh: number, number: unknown, name: unknown, me?: DbBuilding): [number, string] {
  const used = new Set(db.buildings.filter((b) => b.wh === wh && b.id !== me?.id).map((b) => b.number));
  const num = number === undefined || number === null || number === "" ? (me?.number ?? Array.from({ length: 99 }, (_, i) => i + 1).find((i) => !used.has(i))!) : Number(number);
  if (!Number.isInteger(num) || num < 1 || num > 99) throw new Bad("Bino raqami — 1 dan 99 gacha");
  if (used.has(num)) throw new Bad(`${bldCode(whCodeOf(db, wh), num)} — bu raqamli bino allaqachon bor`);
  const nm = String(name ?? "").trim().slice(0, 120) || `${num}-bino`;
  if (db.buildings.some((b) => b.wh === wh && b.id !== me?.id && b.name.toLowerCase() === nm.toLowerCase())) throw new Bad(`«${nm}» — bu omborda allaqachon bor`);
  return [num, nm];
}

function addBuilding(db: Db, body: B): WhBuilding {
  const wh = whOk(db, body.store_id);
  const [num, nm] = bldIn(db, wh, body.number, body.name);
  const b: DbBuilding = { id: nid(db), wh, number: num, name: nm };
  db.buildings.push(b);
  return bldOut(db, b);
}

// ---- tuzilmani tahrirlash/o'chirish (backend edit_building … drop_cell bilan bir xil)
/** Joylarda birlik (qoldiq yoki sanashda kutilayotgan) bo'lsa — 409 xabari, aks holda null */
function busyCells(db: Db, ids: Set<number>, what: string): Res | null {
  const busy = [...new Set(db.batches.filter((b) => b.loc_id !== null && ids.has(b.loc_id) && (b.qty > EPS || b.pending)).map((b) => cellCode(db, b.loc_id) ?? ""))].slice(0, 5);
  return busy.length ? fail(409, `${what}: ${busy.join(", ")} da birlik bor — avval boshqa joyga ko'chiring`) : null;
}

function dropCells(db: Db, ids: Set<number>): void {
  db.places = db.places.filter((x) => !ids.has(x.loc_id));
  db.cells = db.cells.filter((c) => !ids.has(c.id));
}

function editBuilding(db: Db, id: number, body: B): Res {
  const b = db.buildings.find((x) => x.id === id);
  if (!b) return fail(404, "Bino topilmadi");
  const [num, nm] = bldIn(db, b.wh, body.number, body.name ?? b.name, b);
  const changed = num !== b.number;
  b.number = num;
  b.name = nm;
  const blocks = new Set(db.blocks.filter((x) => x.building_id === id).map((x) => x.id));
  const recoded = changed ? recode(db, (c) => c.block_id !== null && blocks.has(c.block_id)) : 0;
  return ok({ ...bldOut(db, b), recoded });
}

function dropBuilding(db: Db, id: number): Res {
  const b = db.buildings.find((x) => x.id === id);
  if (!b) return fail(404, "Bino topilmadi");
  const blocks = new Set(db.blocks.filter((x) => x.building_id === id).map((x) => x.id));
  const cells = new Set(db.cells.filter((c) => c.block_id !== null && blocks.has(c.block_id)).map((c) => c.id));
  const busy = busyCells(db, cells, `«${b.name}»`);
  if (busy) return busy;
  dropCells(db, cells);
  db.racks = db.racks.filter((x) => !blocks.has(x.block_id));
  db.blocks = db.blocks.filter((x) => !blocks.has(x.id));
  db.buildings = db.buildings.filter((x) => x.id !== id);
  return ok({ ok: true, cells: cells.size });
}

// ---- xonalar (blok)
function xonaCode(code: unknown): string {
  const k = String(code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{1,2}$/.test(k)) throw new Bad("Xona kodi — 1–2 lotin harfi (masalan A yoki AB): joy kodida turadi (AO1-A-02-03-C)");
  return k;
}

function addBlock(db: Db, body: B): WhBlock {
  const wh = whOk(db, body.store_id);
  const bld = db.buildings.find((b) => b.id === Number(body.building_id) && b.wh === wh);
  if (!bld) throw new Bad("Bino noto'g'ri — ro'yxatdan tanlang");
  const code = xonaCode(body.code);
  if (db.blocks.some((b) => b.building_id === bld.id && b.code === code)) throw new Bad(`${blkCode(bCode(db, bld), code)} — bu binoda ${code} xona allaqachon bor`);
  const b: DbBlock = { id: nid(db), wh, code, name: String(body.name ?? "").trim().slice(0, 120), mine: true, building_id: bld.id, purpose: purposeOf(body.purpose), groups: groupsOf(body.groups) };
  db.blocks.push(b);
  return blockOut(db, b);
}

function editBlock(db: Db, id: number, body: B): Res {
  const b = db.blocks.find((x) => x.id === id);
  if (!b) return fail(404, "Xona topilmadi");
  const code = body.code === undefined || body.code === null || body.code === "" ? b.code : xonaCode(body.code);
  if (code !== b.code && db.blocks.some((x) => x.id !== id && x.building_id === b.building_id && x.code === code)) throw new Bad(`Bu binoda ${code} xona allaqachon bor`);
  const changed = code !== b.code;
  b.code = code;
  if (body.name !== undefined && body.name !== null) b.name = String(body.name).trim().slice(0, 120);
  if (body.purpose !== undefined && body.purpose !== null) b.purpose = purposeOf(body.purpose);
  if (body.groups !== undefined && body.groups !== null) b.groups = groupsOf(body.groups);
  const recoded = changed ? recode(db, (c) => c.block_id === id) : 0;
  return ok({ ...blockOut(db, b), recoded });
}

function dropBlock(db: Db, id: number): Res {
  const b = db.blocks.find((x) => x.id === id);
  if (!b) return fail(404, "Xona topilmadi");
  const cells = new Set(db.cells.filter((c) => c.block_id === id).map((c) => c.id));
  const busy = busyCells(db, cells, `${b.code} xona`);
  if (busy) return busy;
  dropCells(db, cells);
  db.racks = db.racks.filter((x) => x.block_id !== id);
  db.blocks = db.blocks.filter((x) => x.id !== id);
  return ok({ ok: true, cells: cells.size });
}

// ---- joy: holat, o'chirish
const STATUSES: CellStatus[] = ["active", "blocked", "quarantine"];

function editCell(db: Db, id: number, body: B): Res {
  const c = db.cells.find((x) => x.id === id);
  if (!c) return fail(404, "Joy topilmadi");
  if (body.status !== undefined && body.status !== null) {
    if (!STATUSES.includes(body.status as CellStatus)) throw new Bad("Holat noto'g'ri — faol, bloklangan yoki karantin");
    c.status = body.status as CellStatus;
  }
  if (body.code !== undefined && body.code !== null && body.code !== "") {
    if (c.rack_id) throw new Bad("Stellaj joyining kodi tuzilmadan olinadi — stellaj, xona yoki bino kodini o'zgartiring");
    const code = String(body.code).trim().toUpperCase();
    if (code.length > 24 || !/^[A-Z0-9-]+$/.test(code)) throw new Bad("Joy kodi — lotin harf, raqam va «-»");
    if (db.cells.some((x) => x.id !== id && x.code === code)) throw new Bad(`${code} — bunday joy allaqachon bor`);
    c.code = code;
  }
  return ok(cellOut(db, c));
}

function dropCell(db: Db, id: number): Res {
  if (!db.cells.some((x) => x.id === id)) return fail(404, "Joy topilmadi");
  const ids = new Set([id]);
  const busy = busyCells(db, ids, "Joy");
  if (busy) return busy;
  dropCells(db, ids);
  return ok({ ok: true });
}

// ---- stellajlar (backend add_rack / edit_rack / drop_rack / wizard bilan bir xil)
function rackSize(body: B): [number, number] {
  const rw = Number(body.rows);
  const fl = Number(body.floors);
  if (!Number.isInteger(rw) || !Number.isInteger(fl)) throw new Bad("Qatorlar va qavatlar soni — butun son");
  if (rw < 1 || rw > MAX_ROWS || fl < 1 || fl > MAX_FLOORS) throw new Bad(`Qatorlar 1–${MAX_ROWS}, qavatlar 1–${MAX_FLOORS} (A…${floorLetter(MAX_FLOORS)}) bo'lsin`);
  return [rw, fl];
}

function newCells(db: Db, r: DbRack, places: [number, number][]): number {
  const rc = rCode(db, r);
  const cs = places.map(([q, f]): DbCell => ({ id: 0, code: mkCell(rc, q, f), wh: r.wh, block_id: r.block_id, rack_id: r.id, row: q, floor: f, status: "active" }));
  const ex = db.cells.find((c) => cs.some((x) => x.code === c.code));
  if (ex) throw new Bad(`${ex.code} — bunday joy allaqachon bor`);
  for (const c of cs) db.cells.push({ ...c, id: nid(db) });
  return cs.length;
}

function addRack(db: Db, body: B): Res {
  const wh = whOk(db, body.store_id);
  const blk = db.blocks.find((b) => b.id === Number(body.block_id) && b.wh === wh);
  if (!blk) throw new Bad("Xona noto'g'ri — ro'yxatdan tanlang");
  if (!db.buildings.some((b) => b.id === blk.building_id)) throw new Bad("Xona binoga biriktirilmagan — avval binoni tanlang");
  const [rw, fl] = rackSize(body);
  const cnt = Number(body.count ?? 1);
  if (!Number.isInteger(cnt) || cnt < 1 || cnt > 20) throw new Bad("Bir yo'la 1–20 ta stellaj");
  const start = Math.max(0, ...db.racks.filter((x) => x.block_id === blk.id).map((x) => x.number)) + 1;
  const out: WhRack[] = [];
  let total = 0;
  for (let i = 0; i < cnt; i++) {
    const r: DbRack = { id: nid(db), wh, block_id: blk.id, number: start + i, name: String(body.name ?? "").trim().slice(0, 120), rows: rw, floors: fl, ...rackAttrs(body) };
    db.racks.push(r);
    const places: [number, number][] = [];
    for (let q = 1; q <= rw; q++) for (let f = 1; f <= fl; f++) places.push([q, f]);
    total += newCells(db, r, places);
    out.push(rackOut(db, r));
  }
  return ok({ ...out[0], racks: out, cells: total });
}

function editRack(db: Db, id: number, body: B): Res {
  const r = db.racks.find((x) => x.id === id);
  if (!r) return fail(404, "Stellaj topilmadi");
  const [rw, fl] = rackSize(body);
  const mine = db.cells.filter((c) => c.rack_id === id);
  const inside = (c: DbCell) => !!c.row && !!c.floor && c.row <= rw && c.floor <= fl;
  const extra = new Set(mine.filter((c) => !inside(c)).map((c) => c.id));
  const busy = busyCells(db, extra, `${rCode(db, r)} stellaj`);
  if (busy) return busy;
  const have = new Set(mine.filter(inside).map((c) => `${c.row}-${c.floor}`));
  dropCells(db, extra);
  const places: [number, number][] = [];
  for (let q = 1; q <= rw; q++) for (let f = 1; f <= fl; f++) if (!have.has(`${q}-${f}`)) places.push([q, f]);
  const added = newCells(db, r, places);
  r.rows = rw;
  r.floors = fl;
  if (body.name !== undefined && body.name !== null) r.name = String(body.name).trim().slice(0, 120);
  Object.assign(r, rackAttrs(body, r));
  return ok({ ...rackOut(db, r), added, removed: extra.size });
}

function dropRack(db: Db, id: number): Res {
  const r = db.racks.find((x) => x.id === id);
  if (!r) return fail(404, "Stellaj topilmadi");
  const cells = new Set(db.cells.filter((c) => c.rack_id === id).map((c) => c.id));
  const busy = busyCells(db, cells, `${rCode(db, r)} stellaj`);
  if (busy) return busy;
  dropCells(db, cells);
  db.racks = db.racks.filter((x) => x.id !== id);
  return ok({ ok: true, cells: cells.size });
}

function wizard(db: Db, body: B): Res {
  const wh = whOk(db, body.store_id);
  const bld = body.building_id ? db.buildings.find((b) => b.id === Number(body.building_id) && b.wh === wh) : null;
  if (body.building_id && !bld) return fail(404, "Bino topilmadi");
  const bid = bld ? bld.id : addBuilding(db, { store_id: wh, name: body.building_name, number: body.building_number }).id;
  const code = xonaCode(body.block_code);
  const blk = db.blocks.find((b) => b.building_id === bid && b.code === code) ?? addBlock(db, { store_id: wh, building_id: bid, code, name: body.block_name ?? "", purpose: body.purpose, groups: body.groups });
  const r = addRack(db, { ...body, store_id: wh, block_id: blk.id, name: body.rack_name ?? "", count: body.racks ?? 1 });
  if (r.status !== 200) return r;
  const out = r.body as { racks: WhRack[]; cells: number };
  return ok({ building_id: bid, block_id: blk.id, racks: out.racks, cells: out.cells });
}

// ---- chiqim (backend: path_key, _rank, pick_out, pick_short, sales, return_post)
const SHORT_REASONS: Record<string, string> = { missing: "Joyida yo'q", damaged: "Shikastlangan", less: "Kam chiqdi", label: "Yorlig'i yo'q / o'qilmaydi" };
type PKey = [number, number, string, number, number, number, string];
/** Yig'ish yo'li: bino → xona → stellaj → qator («ilon izi») → qavat; joysiz — oxirida */
export function pathKey(db: Db, id: number | null): PKey {
  const c = id ? db.cells.find((x) => x.id === id) : undefined;
  if (!c) return [1, 0, "", 0, 0, 0, ""];
  const b = c.block_id ? db.blocks.find((x) => x.id === c.block_id) : undefined;
  const bn = b?.building_id ? (db.buildings.find((x) => x.id === b.building_id)?.number ?? 0) : 0;
  const r = c.rack_id ? db.racks.find((x) => x.id === c.rack_id) : undefined;
  if (r && c.row && c.floor) return [0, bn, b?.code ?? "", r.number, r.number % 2 ? c.row : -c.row, c.floor, c.code];
  return [0, bn, b?.code ?? "", 1e6, 0, 0, c.code];
}
const keyCmp = (a: PKey, b: PKey): number => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
};
const quarantined = (db: Db, b: DbBatch) => !!b.loc_id && db.cells.find((c) => c.id === b.loc_id)?.status === "quarantine";
const fifo = (x: DbBatch, y: DbBatch) => x.created.localeCompare(y.created) || x.id - y.id;
function rank(us: DbBatch[], need: number, dims: boolean): [DbBatch, string][] {
  const f = [...us].sort(fifo);
  if (!dims) return f.map((b) => [b, "eng eski (FIFO)"]);
  const fits = us.filter((b) => b.qty + EPS >= need).sort((x, y) => x.qty - y.qty || fifo(x, y));
  return [...fits.map((b): [DbBatch, string] => [b, Math.abs(b.qty - need) <= EPS ? "aniq mos" : "kam chiqindi"]), ...f.filter((b) => b.qty + EPS < need).map((b): [DbBatch, string] => [b, "eng eski (FIFO)"])];
}

function pickOut(db: Db, id: number): PickOrder {
  const p = db.picks.find((x) => x.id === id);
  if (!p) throw new Bad("Buyurtma topilmadi yoki allaqachon jo'natilgan");
  const ls = live(db).filter((b) => b.wh === p.wh && !quarantined(db, b));
  const rows = p.lines.map((l) => {
    const it = itemOf(db, l.item_id);
    const ranked = rank(
      ls.filter((b) => b.item_id === l.item_id && (it.dims || (b.char_id ?? null) === (l.char_id ?? null))),
      l.left,
      !!it.dims,
    );
    const first = ranked[0]?.[0];
    const key: PKey = first ? pathKey(db, first.loc_id) : [2, 0, "", 0, 0, 0, ""];
    return {
      key,
      line: {
        line_no: l.line_no,
        item_id: l.item_id,
        char_id: l.char_id,
        name: fullName(it, l.char_id),
        unit: it.unit,
        dims: it.dims,
        left: l.left,
        at: first ? cellCode(db, first.loc_id) : null,
        short: l.short?.length ?? 0,
        stop: 0,
        units: ranked.map(([b, tip]) => ({ batch_id: b.code ? b.id : null, code: b.code, loc: cellCode(db, b.loc_id), qty: b.qty, width_mm: b.width_mm, length_mm: b.length_mm, firm: b.firm, tip })),
      },
    };
  });
  const lines = rows.sort((a, b) => keyCmp(a.key, b.key)).map((x, i) => ({ ...x.line, stop: i + 1 }));
  return { id: p.id, number: p.number, customer: p.customer, firm: p.firm, warehouse_id: p.wh, lines, route: lines.flatMap((x) => (x.at ? [x.at] : [])) };
}

function pickShort(db: Db, id: number, body: Record<string, unknown>, now: number): PickOrder {
  const p = db.picks.find((x) => x.id === id);
  if (!p) throw new Bad("Buyurtma topilmadi yoki allaqachon jo'natilgan");
  const ln = p.lines.find((l) => l.line_no === Number(body.line_no));
  if (!ln) throw new Bad("Buyurtma qatori topilmadi");
  const code = String(body.reason ?? "");
  if (!(code in SHORT_REASONS)) throw new Bad("Sababni tanlang");
  ln.short = [...(ln.short ?? []), { at: iso(now), loc: String(body.loc ?? ""), reason: code, by: db.me.name }];
  itemOf(db, ln.item_id).last_count = null;
  return pickOut(db, id);
}

function returned(db: Db, sale: DbDoc): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of db.docs.filter((d) => d.kind === "return" && d.status === "posted" && d.data.base_id === sale.id))
    for (const l of r.lines) {
      const i = Number(l.data.line ?? -1);
      out.set(i, r4((out.get(i) ?? 0) + numOf(l.qty)));
    }
  return out;
}

function saleOut(db: Db, d: DbDoc): Sale {
  const done = returned(db, d);
  return {
    id: d.id,
    number: d.number ?? "",
    date: d.date,
    customer: (d.data.customer as string) || null,
    base: (d.data.base as string) || null,
    firm: d.firm,
    warehouse_id: d.wh,
    lines: d.lines.map((l, i) => {
      const it = itemOf(db, l.item_id);
      return { line: i, item_id: l.item_id, char_id: l.char_id, batch_id: l.batch_id, code: l.batch_id ? (db.batches.find((b) => b.id === l.batch_id)?.code ?? null) : null, name: fullName(it, l.char_id), unit: it.unit, qty: numOf(l.qty), returned: done.get(i) ?? 0 };
    }),
  };
}

function salesOut(db: Db, q0: string, now: number): Sale[] {
  const q = q0.trim().toLowerCase();
  const u = q ? db.batches.find((b) => b.code?.toLowerCase() === q) : undefined;
  return db.docs
    .filter((d) => d.kind === "sale" && d.status === "posted" && now - Date.parse(d.date) <= 180 * 864e5)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    .filter((d) => (u ? d.lines.some((l) => l.batch_id === u.id) : !q || (d.number ?? "").toLowerCase().includes(q) || String(d.data.customer ?? "").toLowerCase().includes(q)))
    .slice(0, 20)
    .map((d) => saleOut(db, d));
}

function returnPost(db: Db, body: Record<string, unknown>, now: number): ReturnRes {
  const sale = db.docs.find((d) => d.id === Number(body.sale_id) && d.kind === "sale" && d.status === "posted");
  if (!sale) throw new Bad("Jo'natish hujjati topilmadi");
  const wh = Number(body.warehouse_id ?? sale.wh);
  if (db.warehouses.find((w) => w.id === wh)?.kind === "transit") throw new Bad("Qaytariladigan omborni tanlang («Yo'lda» emas)");
  const reason = String(body.reason ?? "").trim();
  if (!reason) throw new Bad("Qaytarish sababini yozing");
  const rows = (body.lines as { line: number; qty: string | number; grade?: string }[] | undefined) ?? [];
  if (!rows.length) throw new Bad("Qaytariladigan tovarni belgilang");
  const done = returned(db, sale);
  const qc =
    db.cells.filter((c) => c.wh === wh && (c.status ?? "active") === "active" && db.blocks.find((b) => b.id === c.block_id)?.purpose === "quarantine").sort((a, b) => a.code.localeCompare(b.code))[0] ??
    db.cells.filter((c) => c.wh === wh && c.status === "quarantine").sort((a, b) => a.code.localeCompare(b.code))[0];
  const number = nextNumber(db, "return");
  const d: DbDoc = { id: nid(db), number, kind: "return", status: "posted", firm: sale.firm, wh, wh_to: null, author: ME_ID, date: iso(now), updated: iso(now), version: 2, data: { base_id: sale.id, base: sale.number, customer: sale.data.customer ?? "", reason }, lines: [] };
  db.docs.push(d);
  let ok = 0;
  let bad = 0;
  const seen = new Set<number>();
  for (const x of rows) {
    const i = Number(x.line);
    const sl = sale.lines[i];
    if (!sl) throw new Bad("Jo'natish qatori topilmadi");
    if (seen.has(i)) throw new Bad("Bir qator ikki marta berilgan");
    seen.add(i);
    const q = numOf(x.qty);
    const left = r4(numOf(sl.qty) - (done.get(i) ?? 0));
    if (!(q > 0) || q > left + EPS) throw new Bad(`Qaytarish mumkin: ${left} — ko'p kiritildi`);
    const defect = x.grade === "defect";
    const loc = defect && qc ? qc.id : null;
    let bid: number | null = null;
    if (sl.batch_id) {
      let u = db.batches.find((b) => b.id === sl.batch_id);
      if (!u) throw new Bad("Birlik topilmadi — stikerni qayta skanerlang");
      if (u.qty <= EPS) Object.assign(u, { qty: r4(q), wh, loc_id: loc, src: number });
      else u = newBatch(db, { item_id: u.item_id, char_id: u.char_id, firm: sale.firm, wh, kind: u.kind, qty: r4(q), loc_id: loc, width_mm: u.width_mm, length_mm: u.length_mm, parent_code: u.code, src: number, code: nextCode(db) }, now);
      bid = u.id;
    } else addLot(db, sl.item_id, sl.char_id, sale.firm, wh, loc, q, now, number);
    if (defect) bad++;
    else ok++;
    d.lines.push({ item_id: sl.item_id, char_id: sl.char_id, batch_id: bid, qty: String(r4(q)), data: { line: i, grade: defect ? "defect" : "ok" } });
  }
  sweep(db);
  return { id: d.id, number, ok, defect: bad, quarantine: qc && bad ? qc.code : null };
}

function whTree(db: Db, store: number): WhTree {
  const ls = live(db);
  const units = (id: number) => ls.filter((b) => b.loc_id === id).length;
  const cs = db.cells.filter((c) => c.wh === store);
  return {
    store: { id: store, name: whName(db, store) },
    restricted: false,
    blocks: db.blocks
      .filter((b) => b.wh === store)
      .map((b) => {
        const mine = cs.filter((c) => c.block_id === b.id);
        const racks = [...new Set(mine.map((c) => c.code.split("-").slice(0, 2).join("-")))];
        return { id: b.id, code: b.code, name: b.name, mine: b.mine, racks: racks.map((r) => ({ code: r, cells: mine.filter((c) => c.code.startsWith(r + "-") || c.code === r).map((c) => ({ id: c.id, code: c.code, units: units(c.id) })) })) };
      }),
    loose: cs.filter((c) => !c.block_id).map((c) => ({ id: c.id, code: c.code, units: units(c.id) })),
  };
}

// ---------------------------------------------------------------- hujjatni o'tkazish
const qtyOf = (it: DbItem, w: number | null, l: number | null, q: number | null): number =>
  it.dims === "wl" ? r4(((w ?? 0) * (l ?? 0)) / 1e6) : it.dims === "w" ? 1 : r4(q ?? 0);

function postCut(db: Db, d: DbDoc, now: number) {
  let scrap = 0;
  let used = 0;
  for (const ln of d.lines) {
    const b = db.batches.find((x) => x.id === ln.batch_id);
    if (!b || b.qty <= EPS) throw new Bad("Birlik topilmadi yoki qoldig'i yo'q");
    const it = itemOf(db, b.item_id);
    const pieces: number[] = [];
    const rests: number[] = [];
    let sc = 0;
    if (it.dims === "wl") {
      const w = numOf(ln.data.width_mm);
      const l = numOf(ln.data.length_mm);
      const W = b.width_mm ?? 0;
      const L = b.length_mm ?? 0;
      if (!(w > 0 && l > 0)) throw new Bad("O'lchamni kiriting");
      if (w > W + EPS || l > L + EPS) throw new Bad(`${b.code}: ${W}×${L} mm — ${w}×${l} sig'maydi`);
      const p = newBatch(db, { code: nextCode(db), item_id: b.item_id, firm: b.firm, wh: b.wh, kind: "piece", width_mm: w, length_mm: l, qty: r4((w * l) / 1e6), parent_code: b.code,
        made: { kind: "cut", by_name: db.me.name, posted_at: iso(now), job: null } }, now);
      pieces.push(p.id);
      if (W - w > EPS) {
        const side = r4(((W - w) * l) / 1e6);
        if (W - w < 100) sc += side;
        else rests.push(newBatch(db, { code: nextCode(db), item_id: b.item_id, firm: b.firm, wh: b.wh, kind: "piece", width_mm: W - w, length_mm: l, qty: side, parent_code: b.code }, now).id);
      }
      b.length_mm = L - l;
      b.qty = r4((W * b.length_mm) / 1e6);
      if (b.length_mm < 100) {
        sc += b.qty;
        b.qty = 0;
        b.length_mm = 0;
      } else rests.push(b.id);
      ln.qty = String(p.qty);
      used += p.qty + sc;
      b.cuts.push({ by_name: db.me.name, posted_at: iso(now), job: null, number: "", width_mm: w, length_mm: l, qty: p.qty });
    } else if (it.dims === "w") {
      const w = numOf(ln.qty);
      const W = b.width_mm ?? 0;
      if (!(w > 0) || w >= W) throw new Bad(`${b.code}: eni ${W} mm — ${w} mm kesib bo'lmaydi`);
      const p = newBatch(db, { code: nextCode(db), item_id: b.item_id, firm: b.firm, wh: b.wh, kind: "piece", width_mm: w, qty: 1, parent_code: b.code, made: { kind: "cut", by_name: db.me.name, posted_at: iso(now), job: null } }, now);
      pieces.push(p.id);
      b.width_mm = W - w;
      rests.push(b.id);
      used += 1;
      b.cuts.push({ by_name: db.me.name, posted_at: iso(now), job: null, number: "", width_mm: w, length_mm: null, qty: 1 });
    } else {
      const q = numOf(ln.qty);
      if (!(q > 0) || q > b.qty + EPS) throw new Bad(`${b.code}: ${b.qty} ${it.unit} bor — ${q} kesib bo'lmaydi`);
      const p = newBatch(db, { code: nextCode(db), item_id: b.item_id, firm: b.firm, wh: b.wh, kind: "piece", length_mm: it.dims === "l" ? q * 1000 : null, qty: r4(q), parent_code: b.code,
        made: { kind: "cut", by_name: db.me.name, posted_at: iso(now), job: null } }, now);
      pieces.push(p.id);
      b.qty = r4(b.qty - q);
      if (it.dims === "l") b.length_mm = Math.round(b.qty * 1000);
      if (b.qty > EPS) rests.push(b.id);
      used += q;
      b.cuts.push({ by_name: db.me.name, posted_at: iso(now), job: null, number: "", width_mm: null, length_mm: null, qty: q });
    }
    scrap += sc;
    ln.data = { ...ln.data, pieces, rests, scrap: r4(sc) };
  }
  d.data = { ...d.data, scrap: r4(scrap), used: r4(used) };
  for (const b of db.batches) for (const c of b.cuts) if (!c.number) c.number = d.number ?? "";
}

function postInventory(db: Db, d: DbDoc, now: number) {
  const wh = d.wh;
  const result: { item_id: number; batch_id: number | null; book: number; counted: number; diff: number; moved_from: number | null }[] = [];
  const touched = new Set<number>();
  for (const ln of d.lines) {
    const counted = numOf(ln.qty);
    if (ln.batch_id) {
      const b = db.batches.find((x) => x.id === ln.batch_id);
      if (!b) throw new Bad("Birlik topilmadi");
      const here = !b.pending && b.wh === wh;
      const moved = !b.pending && b.wh !== wh && b.qty > EPS ? b.wh : null;
      const book = here ? b.qty : 0;
      b.qty = r4(counted);
      b.wh = wh;
      b.pending = false;
      touched.add(b.id);
      result.push({ item_id: b.item_id, batch_id: b.id, book, counted, diff: r4(counted - book), moved_from: moved });
    } else {
      const firmId = Number(ln.data.firm_id ?? 0);
      const firm = db.firms.find((f) => f.id === firmId)?.code ?? d.firm;
      const lots = live(db).filter((b) => b.kind === "lot" && b.item_id === ln.item_id && (b.char_id ?? null) === (ln.char_id ?? null) && b.firm === firm && b.wh === wh);
      const book = r4(lots.reduce((a, b) => a + b.qty, 0));
      lots.forEach((b) => {
        b.qty = 0;
        touched.add(b.id);
      });
      if (counted > EPS) touched.add(addLot(db, ln.item_id, ln.char_id, firm, wh, null, counted, now).id);
      result.push({ item_id: ln.item_id, batch_id: null, book, counted, diff: r4(counted - book), moved_from: null });
    }
    itemOf(db, ln.item_id).last_count = iso(now);
  }
  const scope = d.data.scope;
  const scopeItems = scope === "items" ? new Set((d.data.items as number[]) ?? []) : null;
  if (scope === "full" || scopeItems) {
    for (const b of live(db).filter((x) => x.wh === wh && !touched.has(x.id) && (!scopeItems || scopeItems.has(x.item_id)))) {
      result.push({ item_id: b.item_id, batch_id: b.code ? b.id : null, book: b.qty, counted: 0, diff: -b.qty, moved_from: null });
      b.qty = 0;
    }
    if (scopeItems) for (const i of scopeItems) itemOf(db, i).last_count = iso(now);
  }
  const res = tolerance(db, result);
  d.data = { ...d.data, result: res, positions: res.length, diff: res.filter((r) => Math.abs(r.diff) > EPS).length, ok: res.filter((r) => r.ok).length };
}

/** hisobdan chiqarish — qoldiq 0; ko'chirish — avval «Yo'lda» (backend post_move), qabul qiluvchi qabul qiladi */
function postMove(db: Db, d: DbDoc, now: number, off: boolean) {
  const road = off ? null : db.warehouses.find((w) => w.kind === "transit");
  if (!off && !road) throw new Bad("«Yo'lda» ombori yo'q");
  const units: number[] = [];
  const lots: { item_id: number; char_id: number | null; qty: number }[] = [];
  for (const ln of d.lines) {
    const q = numOf(ln.qty);
    if (ln.batch_id) {
      const b = db.batches.find((x) => x.id === ln.batch_id);
      if (!b || b.qty <= EPS || b.wh !== d.wh) throw new Bad(`Birlik ${b?.code ?? ""} ${whName(db, d.wh)} da emas`);
      if (off) b.qty = 0;
      else {
        b.wh = road!.id;
        b.loc_id = null;
        units.push(b.id);
      }
    } else {
      takeLots(db, ln.item_id, ln.char_id, d.firm, d.wh, q);
      if (!off) {
        addLot(db, ln.item_id, ln.char_id, d.firm, road!.id, null, q, now, d.number ?? undefined);
        lots.push({ item_id: ln.item_id, char_id: ln.char_id ?? null, qty: r4(q) });
      }
    }
  }
  if (!off) d.data = { ...d.data, transit: true, units, lots, received: [], lots_done: !lots.length };
}

// ---- hisobdan chiqarish: sabab majburiy; summasi 500 000 so'mdan oshsa — rahbar tasdig'i (backend _writeoff_check)
const WRITEOFF_LIMIT = 500_000;
function writeoffCheck(db: Db, d: DbDoc, body: B): Res | null {
  const reason = String(d.data.reason ?? body.reason ?? "").trim();
  if (!reason) return fail(400, "Hisobdan chiqarish sababini ko'rsating");
  let value = 0;
  for (const ln of d.lines) {
    const b = ln.batch_id ? db.batches.find((x) => x.id === ln.batch_id) : null;
    value += (b ? b.qty : numOf(ln.qty)) * (itemOf(db, ln.item_id).cost ?? 0);
  }
  value = r4(value);
  if (value > WRITEOFF_LIMIT) {
    if (!body.approve) return fail(409, `Summa ${Math.round(value).toLocaleString("ru-RU")} so'm — ${WRITEOFF_LIMIT.toLocaleString("ru-RU")} dan katta: rahbar tasdig'i kerak`);
    if (!supervisor(db)) return fail(409, "Katta summani faqat rahbar (egasi, admin) tasdiqlay oladi");
    d.data = { ...d.data, approval: { by: db.me.name, value } };
  }
  d.data = { ...d.data, reason, value };
  return null;
}

// ---- yo'ldagi ko'chirish — qabul qiluvchi ombor (backend transit_out / transfer_receive)
function transitOut(db: Db, d: DbDoc): Transit {
  const rec = new Set((d.data.received as number[]) ?? []);
  return {
    id: d.id,
    number: d.number,
    date: d.date,
    from: whName(db, d.wh),
    to_id: d.wh_to,
    to: d.wh_to ? whName(db, d.wh_to) : "",
    firm: d.firm,
    units: ((d.data.units as number[]) ?? []).map((id) => {
      const b = db.batches.find((x) => x.id === id)!;
      return { batch_id: id, code: b.code, name: fullName(itemOf(db, b.item_id), b.char_id), qty: b.qty, width_mm: b.width_mm, length_mm: b.length_mm, received: rec.has(id) };
    }),
    lots: ((d.data.lots as { item_id: number; char_id: number | null; qty: number }[]) ?? []).map((x) => ({ ...x, name: fullName(itemOf(db, x.item_id), x.char_id) })),
    lots_done: !!d.data.lots_done,
    done: !!d.data.done,
  };
}

function transferReceive(db: Db, id: number, body: B, now: number): Res {
  const d = db.docs.find((x) => x.id === id && x.kind === "transfer" && x.status === "posted");
  if (!d || !d.data.transit) return fail(404, "Yo'ldagi ko'chirish topilmadi");
  if (d.data.done) return fail(400, "Bu ko'chirish allaqachon qabul qilingan");
  const road = db.warehouses.find((w) => w.kind === "transit")!;
  const rec = new Set((d.data.received as number[]) ?? []);
  const want = ((d.data.units as number[]) ?? []).filter((x) => !rec.has(x));
  const ids = new Set(((body.batch_ids as number[]) ?? []).map(Number));
  const take = body.all ? want : want.filter((x) => ids.has(x));
  if (!body.all && !take.length && !body.lots) return fail(400, "Bu birlik shu ko'chirishda yo'q yoki allaqachon qabul qilingan");
  for (const bid of take) {
    const b = db.batches.find((x) => x.id === bid && x.wh === road.id);
    if (!b) continue;
    b.wh = d.wh_to!;
    b.loc_id = null;
    b.src = d.number;
    rec.add(bid);
  }
  let lotsDone = !!d.data.lots_done;
  if (!lotsDone && (body.all || body.lots)) {
    for (const x of (d.data.lots as { item_id: number; char_id: number | null; qty: number }[]) ?? []) {
      let need = x.qty;
      for (const lot of db.batches.filter((b) => b.wh === road.id && b.kind === "lot" && !b.code && b.item_id === x.item_id && (b.char_id ?? null) === (x.char_id ?? null) && b.firm === d.firm && b.qty > 0).sort((a, b) => a.qty - b.qty)) {
        const use = Math.min(lot.qty, need);
        lot.qty = r4(lot.qty - use);
        need = r4(need - use);
        if (need <= EPS) break;
      }
      addLot(db, x.item_id, x.char_id, d.firm, d.wh_to!, null, r4(x.qty - Math.max(need, 0)), now, d.number ?? undefined);
    }
    lotsDone = true;
  }
  const done = ((d.data.units as number[]) ?? []).every((x) => rec.has(x)) && lotsDone;
  d.data = { ...d.data, received: [...rec].sort((a, b) => a - b), lots_done: lotsDone, done, ...(done ? { arrived_at: iso(now) } : {}) };
  return ok(transitOut(db, d));
}

// ---- to'ldirish me'yorlari va taklif (backend levels / level_set / replenish)
function haveIn(db: Db, wh: number, item: number) {
  return r4(live(db).filter((b) => b.wh === wh && b.item_id === item).reduce((a, b) => a + b.qty, 0));
}
function levelsOut(db: Db, wh: number): Level[] {
  return (db.levels ?? []).filter((x) => x.wh === wh).map((x) => {
    const it = itemOf(db, x.item_id);
    return { id: x.id, item_id: x.item_id, name: it.name, unit: it.unit, min_qty: x.min_qty, max_qty: x.max_qty, have: haveIn(db, wh, x.item_id) };
  });
}
function replenishOut(db: Db, wh: number, fromId: number | null): Replenish {
  const src = fromId ? db.warehouses.find((w) => w.id === fromId) : db.warehouses.find((w) => w.kind === "store" && w.id !== wh && w.active !== false);
  const rows = levelsOut(db, wh)
    .filter((x) => x.have < x.min_qty)
    .map((x) => {
      const need = r4(x.max_qty - x.have);
      const available = src ? haveIn(db, src.id, x.item_id) : 0;
      return { ...x, need, available, suggest: r4(Math.min(need, available)) };
    });
  return { from_id: src?.id ?? null, from: src?.name ?? null, rows };
}

// ---- kutilgan kirim (ASN) va dock-to-stock (backend incoming_create / dock_to_stock bilan bir xil)
function incomingCreate(db: Db, body: B): Res {
  const road = db.warehouses.find((w) => w.kind === "transit");
  if (!road) throw new Bad("«Yo'lda» ombori yo'q");
  const raw = (body.items as { item_id?: unknown; char_id?: unknown; qty?: unknown }[]) ?? [];
  if (!Array.isArray(raw) || !raw.length) throw new Bad("Kamida bitta tovar qo'shing");
  const items = raw.map((x) => {
    const it = itemOf(db, Number(x.item_id));
    const qty = numOf(x.qty);
    if (!(qty > 0)) throw new Bad(`${it.name}: miqdor 0 dan katta bo'lsin`);
    return { item_id: it.id, char_id: x.char_id ? Number(x.char_id) : null, qty: r4(qty) };
  });
  const max = db.incoming.reduce((a, x) => (x.number.startsWith("KR-26-") ? Math.max(a, Number(x.number.slice(6)) || 0) : a), 0);
  const inc: DbIncoming = { id: nid(db), number: `KR-26-${String(max + 1).padStart(4, "0")}`, supplier: String(body.supplier ?? "").trim().slice(0, 255), firm: firmOk(db, body.firm), wh: road.id, expected: body.expected ? String(body.expected) : "", items };
  db.incoming.push(inc);
  return ok(incomingOut(db, inc));
}

function incomingOut(db: Db, x: DbIncoming): Incoming {
  return {
    id: x.id,
    number: x.number,
    supplier: x.supplier || null,
    firm: x.firm,
    warehouse_id: x.wh,
    expected: x.expected || null,
    items: x.items.map((i) => {
      const it = itemOf(db, i.item_id);
      return { item_id: i.item_id, char_id: i.char_id, name: it.name, char: charName(it, i.char_id), unit: it.unit, qty: i.qty };
    }),
  };
}

function iraOut(db: Db, wh: number, days: number, now: number): IraKpi {
  const since = now - Math.max(1, Math.min(days, 730)) * DAY;
  const docs = db.docs.filter((d) => d.kind === "inventory" && d.status === "posted" && d.wh === wh && Date.parse(d.date) >= since);
  const rows = docs.flatMap((d) => tolerance(db, (d.data.result as InvRow[]) ?? []));
  const by: Record<string, [number, number]> = {};
  for (const r of rows) {
    const x = (by[r.cls] ??= [0, 0]);
    x[0]++;
    x[1] += r.ok ? 1 : 0;
  }
  const pct = (a: number, b: number) => (a ? Math.round((1000 * b) / a) / 10 : null);
  const okN = rows.filter((r) => r.ok).length;
  return { days: Math.round((now - since) / DAY), counts: docs.length, positions: rows.length, accurate: okN, ira: pct(rows.length, okN), by_cls: Object.fromEntries(Object.entries(by).sort().map(([k, [a, b]]) => [k, { positions: a, ira: pct(a, b) }])) };
}

// ---- ko'rsatkichlar paneli (backend kpi_summary)
const HIGH_FLOOR = 4;
const ACT_DAYS = 14;
const pct1 = (a: number, b: number) => (b ? Math.round((a * 1000) / b) / 10 : null);
function kpiSummary(db: Db, wh: number, days0: number, now: number): Kpi {
  const days = Math.max(1, Math.min(days0, 365));
  const since = now - days * DAY;
  const docs = db.docs.filter((d) => d.status === "posted" && Date.parse(d.date) >= since && d.wh === wh);
  const of = (k: string) => docs.filter((d) => d.kind === k);
  const sales = of("sale");
  const saleLines = sales.reduce((a, d) => a + d.lines.length, 0);
  const retLines = of("return").flatMap((d) => d.lines);
  const cons = of("consume");
  const used = cons.reduce((a, d) => a + Number(d.data.used ?? 0), 0);
  const scrap = cons.reduce((a, d) => a + Number(d.data.scrap ?? 0), 0);
  const offs = of("writeoff");
  const picks = db.picks.filter((x) => x.wh === wh);
  const cells = db.cells.filter((c) => c.wh === wh);
  const busy = new Set(live(db).filter((b) => b.wh === wh && b.loc_id).map((b) => b.loc_id));
  const blocks = new Map<number | null, { code: string; name: string; cells: number; used: number }>();
  for (const c of cells) {
    const bl = db.blocks.find((x) => x.id === c.block_id);
    const x = blocks.get(c.block_id) ?? { code: bl?.code ?? "—", name: bl?.name ?? "Xonasiz", cells: 0, used: 0 };
    x.cells++;
    if (busy.has(c.id)) x.used++;
    blocks.set(c.block_id, x);
  }
  const usedN = cells.filter((c) => busy.has(c.id)).length;
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  const act = new Map<string, { in: number; out: number; move: number }>();
  for (let i = ACT_DAYS - 1; i >= 0; i--) act.set(day(now - i * DAY), { in: 0, out: 0, move: 0 });
  const mine = db.moves.filter((m) => m.wh_from === wh || m.wh_to === wh);
  for (const m of mine) {
    const x = act.get(m.at.slice(0, 10));
    if (x) x[m.delta > 0 ? "in" : m.delta < 0 ? "out" : "move"]++;
  }
  const hits = new Map<string, number>();
  for (const m of mine.filter((x) => Date.parse(x.at) >= since)) for (const c of new Set([m.loc_from, m.loc_to].filter((x): x is string => !!x))) hits.set(c, (hits.get(c) ?? 0) + 1);
  const slot = live(db)
    .filter((b) => b.wh === wh && b.loc_id && itemOf(db, b.item_id).cls === "A" && (db.cells.find((c) => c.id === b.loc_id)?.floor ?? 0) >= HIGH_FLOOR)
    .map((b) => ({ unit_id: b.id, code: b.code, name: fullName(itemOf(db, b.item_id), b.char_id), loc: cellCode(db, b.loc_id), hint: "A-sinf (tez aylanadi) — pastki B/C qavatga ko'chiring" }))
    .sort((a, b) => (a.loc ?? "").localeCompare(b.loc ?? ""))
    .slice(0, 10);
  return {
    days,
    store: whName(db, wh),
    dock: dockKpi(db, wh, days, now),
    ira: iraOut(db, wh, Math.max(days, 90), now),
    outbound: {
      orders: sales.length,
      lines: saleLines,
      open: picks.length,
      shorts: picks.flatMap((x) => x.lines.flatMap((l) => l.short ?? [])).filter((x) => Date.parse(x.at) >= since).length,
      returns: of("return").length,
      return_lines: retLines.length,
      return_pct: pct1(retLines.length, saleLines),
      defect: retLines.filter((l) => l.data.grade === "defect").length,
    },
    production: { consumes: cons.length, used: r4(used), scrap: r4(scrap), scrap_pct: pct1(scrap, used), products: of("produce").length },
    writeoff: { docs: offs.length, value: Math.round(offs.reduce((a, d) => a + Number(d.data.value ?? 0), 0)) },
    space: {
      cells: cells.length,
      active: cells.filter((c) => (c.status ?? "active") === "active").length,
      used: usedN,
      pct: pct1(usedN, cells.length),
      blocked: cells.filter((c) => c.status === "blocked").length,
      quarantine: cells.filter((c) => c.status === "quarantine").length,
      by_block: [...blocks.values()].map((b) => ({ ...b, pct: pct1(b.used, b.cells) })).sort((a, b) => a.code.localeCompare(b.code)),
    },
    activity: [...act.entries()].map(([date, v]) => ({ date, ...v })),
    hot: [...hits.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([code, moves]) => ({ code, moves })),
    slotting: slot,
  };
}

function dockKpi(db: Db, wh: number, days: number, now: number): DockKpi {
  const since = now - Math.max(1, Math.min(days, 365)) * DAY;
  const us = db.batches.filter((b) => b.wh === wh && b.src && Date.parse(b.created) >= since);
  const hours: number[] = [];
  for (const b of us) {
    const m = db.moves.filter((x) => x.unit_id === b.id && x.loc_to).sort((a, c) => a.id - c.id)[0];
    if (m) hours.push((Date.parse(m.at) - Date.parse(b.created)) / 36e5);
  }
  const waiting = live(db).filter((b) => b.wh === wh && !b.loc_id && b.src);
  const sorted = [...hours].sort((a, b) => a - b);
  const mid = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    days: Math.max(1, Math.min(days, 365)),
    placed: hours.length,
    avg_h: hours.length ? r2(hours.reduce((a, b) => a + b, 0) / hours.length) : null,
    median_h: mid === null ? null : r2(mid),
    within_2h: hours.length ? Math.round((100 * hours.filter((h) => h <= 2).length) / hours.length) : null,
    waiting: waiting.length,
    oldest_h: waiting.length ? Math.round(Math.max(...waiting.map((b) => (now - Date.parse(b.created)) / 36e5)) * 10) / 10 : null,
  };
}

function postAcceptance(db: Db, d: DbDoc, now: number) {
  const inc = db.incoming.find((x) => x.id === Number(d.data.base_id));
  if (!inc) throw new Bad("Kirim topilmadi yoki allaqachon qabul qilingan");
  const to = d.wh_to!;
  for (const ln of d.lines) {
    const it = itemOf(db, ln.item_id);
    const q = numOf(ln.qty);
    if (!(q > 0)) continue;
    if (it.dims) newBatch(db, { code: nextCode(db), item_id: it.id, char_id: ln.char_id, firm: inc.firm, wh: to, kind: "roll", qty: q, length_mm: it.dims === "l" ? q * 1000 : null, src: d.number }, now);
    else addLot(db, it.id, ln.char_id, inc.firm, to, null, q, now, d.number);
  }
  const got = (i: { item_id: number; char_id: number | null }) =>
    d.lines.filter((l) => l.item_id === i.item_id && (l.char_id ?? null) === (i.char_id ?? null)).reduce((a, l) => a + numOf(l.qty), 0);
  const result: AccDiff[] = inc.items.map((i) => ({ item_id: i.item_id, name: itemOf(db, i.item_id).name, expected: i.qty, counted: got(i), diff: r4(got(i) - i.qty) }));
  // rejadan tashqari kelgan tovar — farqda «+» (backend post_acceptance bilan bir xil)
  const planned = new Set(inc.items.map((i) => `${i.item_id}:${i.char_id ?? ""}`));
  const extra = new Map<string, { item_id: number; qty: number }>();
  for (const l of d.lines) {
    const k = `${l.item_id}:${l.char_id ?? ""}`;
    if (planned.has(k) || !(numOf(l.qty) > 0)) continue;
    extra.set(k, { item_id: l.item_id, qty: (extra.get(k)?.qty ?? 0) + numOf(l.qty) });
  }
  for (const x of extra.values()) result.push({ item_id: x.item_id, name: itemOf(db, x.item_id).name, expected: 0, counted: r4(x.qty), diff: r4(x.qty), extra: true });
  if (d.data.final) db.incoming = db.incoming.filter((x) => x !== inc);
  else {
    inc.items = inc.items.map((i) => ({ ...i, qty: r4(i.qty - got(i)) })).filter((i) => i.qty > EPS);
    if (!inc.items.length) db.incoming = db.incoming.filter((x) => x !== inc);
  }
  d.data = { ...d.data, result: d.data.final ? result : result.filter((r) => r.diff > EPS), firm: inc.firm };
}

// ---------------------------------------------------------------- kesish rejasi
function cutPlan(db: Db, body: B): CutPlan {
  const it = itemOf(db, Number(body.item_id));
  if (!it.dims) throw new Bad("Bu tovar o'lchamli emas — kesish rejasi rulon, bo'lak va rukav uchun");
  const wh = whOk(db, body.warehouse_id);
  const needs = (Array.isArray(body.needs) ? body.needs : []) as { w?: number; l?: number; q?: number; n?: number }[];
  const want: { w: number; l: number; q: number }[] = [];
  for (const n of needs) for (let k = 0; k < Math.min(50, Number(n.n) || 1); k++) want.push({ w: Number(n.w) || 0, l: Number(n.l) || 0, q: it.dims === "wl" ? 0 : Number(n.q) || 0 });
  if (!want.length) throw new Bad("O'lchamlarni kiriting");
  const wl = it.dims === "wl";
  const area = (x: { w: number; l: number; q: number }) => (wl ? x.w * x.l : x.q);
  want.sort((a, b) => area(b) - area(a));
  // avval qoldiq: bo'laklar rulonlardan oldin, kichigi birinchi
  const pool = live(db)
    .filter((b) => b.item_id === it.id && b.wh === wh && b.code)
    .sort((a, b) => Number(a.kind === "roll") - Number(b.kind === "roll") || a.qty - b.qty)
    .map((b) => ({ b, rem: wl ? (b.length_mm ?? 0) : it.dims === "w" ? (b.width_mm ?? 0) : b.qty, plan: null as CutPlanUnit | null }));
  const missing: CutPlan["missing"] = [];
  for (const x of want) {
    const u = pool.find((p) => (wl ? (p.b.width_mm ?? 0) >= x.w && p.rem >= x.l : p.rem >= x.q - EPS));
    if (!u) {
      missing.push(wl ? { width_mm: x.w, length_mm: x.l, qty: r4((x.w * x.l) / 1e6) } : { qty: x.q });
      continue;
    }
    u.plan ??= { batch_id: u.b.id, code: u.b.code!, kind: u.b.kind, width_mm: u.b.width_mm, length_mm: u.b.length_mm, qty: u.b.qty, loc: cellCode(db, u.b.loc_id), firm: u.b.firm, warehouse_id: u.b.wh, cuts: [], rests: [] };
    if (wl) {
      const W = u.b.width_mm ?? 0;
      u.plan.cuts.push({ width_mm: x.w, length_mm: x.l, qty: r4((x.w * x.l) / 1e6) });
      if (W - x.w > 0) u.plan.rests.push({ width_mm: W - x.w, length_mm: x.l, qty: r4(((W - x.w) * x.l) / 1e6), scrap: W - x.w < 100 });
      u.rem -= x.l;
    } else {
      u.plan.cuts.push({ qty: x.q });
      u.rem = r4(u.rem - x.q);
    }
  }
  const units = pool.filter((p) => p.plan).map((p) => {
    const pl = p.plan!;
    if (wl && p.rem > 0) pl.rests.push({ width_mm: pl.width_mm ?? 0, length_mm: p.rem, qty: r4(((pl.width_mm ?? 0) * p.rem) / 1e6), scrap: p.rem < 100 });
    if (!wl && p.rem > EPS) pl.rests.push({ qty: p.rem, scrap: it.dims === "l" ? p.rem < 0.1 : p.rem < 20 });
    return pl;
  });
  const cutQty = units.reduce((a, u) => a + u.cuts.reduce((s, c) => s + c.qty, 0), 0);
  return {
    unit: it.unit,
    need_qty: r4(cutQty + missing.reduce((a, m) => a + m.qty, 0)),
    scrap_qty: r4(units.reduce((a, u) => a + u.rests.filter((r) => r.scrap).reduce((s, r) => s + r.qty, 0), 0)),
    opened: units.filter((u) => u.kind === "roll").length,
    pieces: units.reduce((a, u) => a + u.cuts.length, 0),
    units,
    missing,
  };
}

// ---------------------------------------------------------------- marshrutlar
export function handle(db: Db, method: string, path: string, body: B | undefined, now: number): Res {
  try {
    db.racks ??= []; // brauzerda saqlangan eski demo bazada stellajlar yo'q
    db.moves ??= [];
    const before = method === "GET" ? null : snap(db);
    const res = route(db, method, path, body ?? {}, now);
    if (before && res.status < 400) journal(db, before, method, path, now);
    return res;
  } catch (e) {
    if (e instanceof Bad) return fail(400, e.message);
    throw e;
  }
}

// ---- harakatlar jurnali (backend ledger.py bilan bir xil): so'rovdan oldin/keyin birliklar holati → o'chmaydigan yozuv
type BState = { qty: number; wh: number; loc_id: number | null; b: DbBatch };
const eff = (s: { qty: number; pending: boolean }) => (s.pending ? 0 : s.qty);
const snap = (db: Db) => new Map(db.batches.map((b): [number, BState] => [b.id, { qty: eff(b), wh: b.wh, loc_id: b.loc_id, b: { ...b } }]));

/** so'rov yo'li → amal nomi (backend: view nomi yoki hujjat turi) va hujjat */
function opOf(db: Db, method: string, path: string): { op: string; doc: DbDoc | null } {
  const p = new URL(path, "http://demo").pathname.replace(A, "");
  let g: RegExpMatchArray | null;
  if (method === "DELETE" && /^\/units\/\d+$/.test(p)) return { op: "unit_drop", doc: null };
  if ((g = p.match(/^\/docs\/(\d+)\/post$/))) {
    const d = db.docs.find((x) => x.id === Number(g![1])) ?? null;
    return { op: d?.kind ?? "system", doc: d };
  }
  if ((g = p.match(/^\/docs\/(\d+)\/receive$/))) return { op: "transfer_receive", doc: db.docs.find((x) => x.id === Number(g![1])) ?? null };
  if (/^\/place\/\d+\/undo$/.test(p)) return { op: "place_undo", doc: null };
  if (/^\/picks\/\d+\/ship$/.test(p)) return { op: "sale", doc: db.docs.filter((d) => d.kind === "sale").at(-1) ?? null };
  if (p === "/returns") return { op: "return", doc: db.docs.filter((d) => d.kind === "return").at(-1) ?? null };
  const named: Record<string, string> = { "/units/loc": "units_loc", "/units": "units", "/place": "place" };
  return { op: named[p] ?? "system", doc: null };
}

function journal(db: Db, before: Map<number, BState>, method: string, path: string, now: number): void {
  const { op, doc } = opOf(db, method, path);
  const code = (id: number | null) => (id ? (db.cells.find((c) => c.id === id)?.code ?? null) : null);
  let id = Math.max(0, ...db.moves.map((m) => m.id));
  const write = (b: DbBatch, s0: { qty: number; wh: number | null; loc_id: number | null }, s1: { qty: number; wh: number | null; loc_id: number | null }, alive: boolean) => {
    if (Math.abs(s1.qty - s0.qty) < EPS && s0.wh === s1.wh && s0.loc_id === s1.loc_id) return;
    db.moves.push({
      id: ++id,
      at: iso(now),
      op,
      unit_id: alive ? b.id : null,
      unit_code: b.code,
      item_id: b.item_id,
      char_id: b.char_id,
      firm: b.firm,
      delta: r4(s1.qty - s0.qty),
      qty_after: r4(s1.qty),
      wh_from: s0.wh,
      wh_to: s1.wh,
      loc_from: code(s0.loc_id),
      loc_to: code(s1.loc_id),
      doc_id: doc?.id ?? null,
      doc_number: doc?.number ?? null,
      reason: String((doc?.data as { reason?: unknown } | undefined)?.reason ?? ""),
      author_name: db.me.name,
    });
  };
  for (const b of db.batches) {
    const s0 = before.get(b.id);
    write(b, s0 ?? { qty: 0, wh: null, loc_id: null }, { qty: eff(b), wh: b.wh, loc_id: b.loc_id }, true);
  }
  for (const [bid, s0] of before) if (!db.batches.some((b) => b.id === bid)) write(s0.b, s0, { qty: 0, wh: s0.wh, loc_id: null }, false);
}

const OPS: Record<string, string> = {
  opening: "Boshlang'ich holat",
  initial: "Boshlang'ich qoldiq",
  place: "Joylashtirish",
  place_undo: "Joylashtirishni bekor qilish",
  units_loc: "Joyni o'zgartirish",
  units: "Sanashda topildi",
  unit_drop: "Kutilayotgan birlik o'chirildi",
  acceptance: "Qabul",
  inventory: "Inventarizatsiya",
  cut: "Kesish",
  transfer: "Ko'chirish (yo'lga chiqdi)",
  transfer_receive: "Ko'chirish — qabul qilindi",
  writeoff: "Hisobdan chiqarish",
  sale: "Jo'natish",
  pick_ship: "Yig'ish — jo'natish",
  return: "Mijozdan qaytarish",
  system: "Tizim",
};

function movesOut(db: Db, q: URLSearchParams): Move[] {
  const n = (k: string) => (q.get(k) ? Number(q.get(k)) : null);
  const [unit, item, loc, doc, wh, before] = [n("unit_id"), n("item_id"), n("loc_id"), n("doc_id"), n("warehouse_id"), n("before_id")];
  const lc = loc ? (db.cells.find((c) => c.id === loc)?.code ?? "") : null;
  const op = q.get("op");
  const limit = Math.max(1, Math.min(n("limit") ?? 50, 200));
  return db.moves
    .filter((m) => (!unit || m.unit_id === unit) && (!item || m.item_id === item) && (!lc || m.loc_from === lc || m.loc_to === lc) && (!doc || m.doc_id === doc) && (!wh || m.wh_from === wh || m.wh_to === wh) && (!op || m.op === op) && (!before || m.id < before))
    .sort((a, b) => b.id - a.id)
    .slice(0, limit)
    .map((m) => ({ ...m, op_title: OPS[m.op] ?? m.op, wh_from: m.wh_from ? whName(db, m.wh_from) : null, wh_to: m.wh_to ? whName(db, m.wh_to) : null }));
}

function route(db: Db, method: string, path: string, body: B, now: number): Res {
  const u = new URL(path, "http://demo");
  const p = u.pathname.startsWith(A) ? u.pathname.slice(A.length) : u.pathname;
  const q = u.searchParams;
  const m = (re: RegExp) => p.match(re);
  let g: RegExpMatchArray | null;

  if (method === "GET") {
    if (p === "/me") return ok(me(db));
    if (p === "/stock/dashboard") return ok(dashboard(db, now));
    if (p === "/stock/cycle") return ok(cycle(db, whOk(db, q.get("warehouse_id")), now));
    if (p === "/stock/table") return ok(stockTable(db, q));
    if (p === "/stock") return ok(itemStock(db, Number(q.get("item_id")), q.get("char_id") ? Number(q.get("char_id")) : null));
    if (p === "/scan") return ok(scan(db, q.get("code") ?? ""));
    if (p === "/items") {
      const s = (q.get("q") ?? "").trim().toLowerCase();
      if (s.length < 2) return ok([]);
      const hits: ItemHit[] = db.items
        .filter((it) => [it.name, it.sku].some((x) => x?.toLowerCase().includes(s)))
        .map((it) => ({ item_id: it.id, char_id: null, name: it.name, sku: it.sku, unit: it.unit, dims: it.dims }));
      return ok(hits);
    }
    if (p === "/cells") return ok(cells(db));
    if ((g = m(/^\/cells\/(\d+)\/units$/))) {
      const id = Number(g[1]);
      const out: CellUnit[] = live(db)
        .filter((b) => b.loc_id === id)
        .map((b) => {
          const it = itemOf(db, b.item_id);
          return { name: fullName(it, b.char_id), code: b.code, kind: b.kind, width_mm: b.width_mm, length_mm: b.length_mm, firm: b.firm, qty: b.qty, unit: it.unit };
        });
      return ok(out);
    }
    if (p === "/docs") {
      const out: DocBrief[] = db.docs
        .filter((d) => (!q.get("kind") || d.kind === q.get("kind")) && (!q.get("status") || d.status === q.get("status")))
        .sort((a, b) => b.updated.localeCompare(a.updated))
        .slice(0, Number(q.get("limit") ?? 50))
        .map((d) => ({ id: d.id, number: d.number, warehouse_id: d.wh, author: d.author, date: d.date, updated: d.updated }));
      return ok(out);
    }
    if ((g = m(/^\/docs\/(\d+)$/))) {
      const d = db.docs.find((x) => x.id === Number(g![1]));
      return d ? ok(docOut(db, d)) : fail(404, "Hujjat topilmadi");
    }
    if (p === "/picks") {
      const out: PickBrief[] = db.picks.map((x) => ({
        id: x.id,
        number: x.number,
        date: x.date,
        customer: x.customer,
        firm: x.firm,
        channel: x.channel,
        warehouse: whName(db, x.wh),
        lines: x.lines.length,
        names: x.lines.slice(0, 3).map((l) => fullName(itemOf(db, l.item_id), l.char_id)),
        short: x.lines.reduce((a, l) => a + (l.short?.length ?? 0), 0),
      }));
      return ok(out);
    }
    if ((g = m(/^\/picks\/(\d+)$/))) return ok(pickOut(db, Number(g[1])));
    if (p === "/sales") return ok(salesOut(db, q.get("q") ?? "", now));
    if ((g = m(/^\/units\/(\d+)\/trace$/))) {
      const b = db.batches.find((x) => x.id === Number(g![1]));
      if (!b) return fail(404, "Birlik topilmadi");
      const made = (b.made ?? {}) as { job?: string | null; from?: Trace["from"] };
      // demo'da sex yo'q — sarf (consume) hujjatlari bo'lmaydi; zanjir faqat birlikdagi yozuvdan
      const t: Trace = { job: made.job ?? null, from: made.from ?? [], used: [] };
      return ok(t);
    }
    if (p === "/place/recent") {
      const loc = q.get("loc_id") ? Number(q.get("loc_id")) : null;
      const out: PlaceRec[] = db.places
        .filter((x) => (loc ? x.loc_id === loc : x.author === ME_ID && sameDay(x.date, now)))
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((x) => {
          const it = itemOf(db, x.item_id);
          return { id: x.id, name: it.name, loc: cellCode(db, x.loc_id) ?? "", number: x.number, firm: x.firm, date: x.date, qty: x.qty, unit: it.unit, author: x.author };
        });
      return ok(out);
    }
    if (p === "/moves") return ok(movesOut(db, q));
    if (p === "/transfers/incoming") {
      const wh = whOk(db, q.get("store_id"));
      return ok(db.docs.filter((d) => d.kind === "transfer" && d.status === "posted" && d.wh_to === wh && d.data.transit && !d.data.done).sort((a, b) => a.date.localeCompare(b.date)).map((d) => transitOut(db, d)));
    }
    if (p === "/wh/levels") return ok(levelsOut(db, whOk(db, q.get("store_id"))));
    if (p === "/replenish") return ok(replenishOut(db, whOk(db, q.get("store_id")), q.get("from_id") ? Number(q.get("from_id")) : null));
    if (p === "/kpi/ira") return ok(iraOut(db, whOk(db, q.get("store_id")), Number(q.get("days") ?? 90) || 90, now));
    if (p === "/kpi/summary") return ok(kpiSummary(db, whOk(db, q.get("store_id")), Number(q.get("days") ?? 30) || 30, now));
    if (p === "/kpi/dock") return ok(dockKpi(db, whOk(db, q.get("store_id")), Number(q.get("days") ?? 30) || 30, now));
    if (p === "/putaway") return ok(putaway(db, q));
    if (p === "/wh/groups") return ok([...new Set(db.items.map((x) => x.grp).filter((g): g is string => !!g))].sort());
    if (p === "/wh/tree") return ok(whTree(db, whOk(db, q.get("store_id"))));
    if (p === "/wh/structure") return ok(structure(db, whOk(db, q.get("store_id"))));
    if (p === "/wh/unplaced") {
      const wh = whOk(db, q.get("store_id"));
      const out: Unplaced[] = live(db)
        .filter((b) => b.wh === wh && !b.loc_id && b.src)
        .map((b) => {
          const it = itemOf(db, b.item_id);
          return { batch_id: b.id, name: fullName(it, b.char_id), code: b.code, width_mm: b.width_mm, length_mm: b.length_mm, doc: b.src ?? "", firm: b.firm, qty: b.qty, unit: it.unit, item_id: b.item_id, since: b.created };
        })
        .sort((a, b) => (a.since ?? "").localeCompare(b.since ?? ""));
      return ok(out);
    }
    if (p === "/cat/items") {
      const s = (q.get("q") ?? "").trim().toLowerCase();
      const ls = live(db);
      const out: CatHit[] = db.items
        .filter((it) => !s || [it.name, it.sku, it.grp].some((x) => x?.toLowerCase().includes(s)))
        .map((it) => ({ id: it.id, name: it.name, grp: it.grp, kind: it.kind, unit: it.unit, qty: r4(ls.filter((b) => b.item_id === it.id).reduce((a, b) => a + b.qty, 0)) }));
      return ok(out);
    }
    if ((g = m(/^\/cat\/items\/(\d+)$/))) {
      const it = itemOf(db, Number(g[1]));
      const out: CatItem = { id: it.id, name: it.name, grp: it.grp, kind: it.kind, unit: it.unit, measured: !!it.dims, attrs: { dims: it.dims }, chars: it.chars.map((c) => ({ id: c.id, name: c.name })) };
      return ok(out);
    }
    if (p === "/purchase/incoming") {
      const out: Incoming[] = db.incoming.map((x) => ({
        id: x.id,
        number: x.number,
        supplier: x.supplier,
        firm: x.firm,
        warehouse_id: x.wh,
        expected: x.expected,
        items: x.items.map((i) => {
          const it = itemOf(db, i.item_id);
          return { item_id: i.item_id, char_id: i.char_id, name: it.name, char: charName(it, i.char_id), unit: it.unit, qty: i.qty };
        }),
      }));
      return ok(out);
    }
    return fail(404, "Topilmadi");
  }

  if (method === "DELETE") {
    if ((g = m(/^\/wh\/racks\/(\d+)$/))) return dropRack(db, Number(g[1]));
    if ((g = m(/^\/wh\/levels\/(\d+)$/))) {
      const n = (db.levels ?? []).length;
      db.levels = (db.levels ?? []).filter((x) => x.id !== Number(g![1]));
      return db.levels.length < n ? ok({ ok: true }) : fail(404, "Me'yor topilmadi");
    }
    if ((g = m(/^\/purchase\/incoming\/(\d+)$/))) {
      const inc = db.incoming.find((x) => x.id === Number(g![1]));
      if (!inc) return fail(404, "Kirim topilmadi yoki yakunlangan");
      if (db.docs.some((d) => d.kind === "acceptance" && d.status === "posted" && Number(d.data.base_id) === inc.id)) return fail(409, "Qisman qabul qilingan — bekor qilib bo'lmaydi, qabulni yakunlang");
      db.incoming = db.incoming.filter((x) => x !== inc);
      return ok({ ok: true });
    }
    if ((g = m(/^\/wh\/buildings\/(\d+)$/))) return dropBuilding(db, Number(g[1]));
    if ((g = m(/^\/wh\/blocks\/(\d+)$/))) return dropBlock(db, Number(g[1]));
    if ((g = m(/^\/cells\/(\d+)$/))) return dropCell(db, Number(g[1]));
    if ((g = m(/^\/wh\/stores\/(\d+)$/))) {
      if (!db.me.roles.some((r) => r === "owner" || r === "admin")) return fail(403, "Omborni faqat egasi yoki admin o'chira oladi");
      return dropStore(db, Number(g[1]));
    }
    if ((g = m(/^\/units\/(\d+)$/))) {
      const b = db.batches.find((x) => x.id === Number(g![1]));
      if (!b) return fail(404, "Birlik topilmadi");
      if (!b.pending) return fail(400, "Hisobdagi birlikni o'chirib bo'lmaydi — hisobdan chiqarish hujjati kerak");
      db.batches = db.batches.filter((x) => x !== b);
      return ok({ ok: true });
    }
    return fail(404, "Topilmadi");
  }

  // ---------------- POST
  if (p === "/units/loc") {
    const ids = (body.batch_ids as number[]) ?? [];
    const loc = body.loc_id === null || body.loc_id === undefined ? null : Number(body.loc_id);
    if (loc && !db.cells.some((c) => c.id === loc)) return fail(400, "Joy topilmadi");
    locOk(db, loc, { adding: 0 });
    for (const id of ids) {
      const b = db.batches.find((x) => x.id === id);
      if (!b) return fail(404, "Birlik topilmadi");
      if (loc && b.loc_id !== loc) locOk(db, loc, { width: b.width_mm, exclude: ids });
      b.loc_id = loc;
    }
    return ok({ ok: true });
  }
  if (p === "/units") {
    const it = itemOf(db, Number(body.item_id));
    if (!it.dims) return fail(400, "Donali tovarga birlik stikeri chiqmaydi");
    if (body.loc_id) locOk(db, Number(body.loc_id), { width: body.width_mm == null ? null : numOf(body.width_mm) });
    const w = body.width_mm == null ? null : numOf(body.width_mm);
    const l = body.length_mm == null ? null : numOf(body.length_mm);
    const qq = body.qty == null ? null : numOf(body.qty);
    const qty = qtyOf(it, w, l, qq);
    if (!(qty > 0)) return fail(400, "O'lchamni kiriting");
    const b = newBatch(db, { code: nextCode(db), item_id: it.id, firm: firmOk(db, body.firm), wh: whOk(db, body.warehouse_id), loc_id: body.loc_id ? Number(body.loc_id) : null,
      kind: it.dims === "wl" && (l ?? 0) < 20000 ? "piece" : it.dims === "w" ? "piece" : "roll", width_mm: w, length_mm: it.dims === "l" ? qty * 1000 : l, qty, pending: true }, now);
    return ok({ batch_id: b.id, code: b.code, qty: b.qty, width_mm: b.width_mm, length_mm: b.length_mm, existing: false });
  }
  if (p === "/labels/print") {
    const n = ((body.batch_ids as unknown[]) ?? (body.cell_ids as unknown[]) ?? [1]).length;
    return ok({ queued: Array.from({ length: n }, (_, i) => i + 1) });
  }
  if (p === "/labels/pdf") return ok({ ok: true });
  if ((g = m(/^\/wh\/stores\/(\d+)$/))) return editStore(db, Number(g[1]), body);
  if (p === "/purchase/incoming") return incomingCreate(db, body);
  if (p === "/wh/levels") {
    const wh = whOk(db, body.store_id);
    const it = itemOf(db, Number(body.item_id));
    const mn = numOf(body.min_qty);
    const mx = numOf(body.max_qty);
    if (!(mn > 0) || mx < mn) throw new Bad("Min > 0 va Max ≥ Min bo'lsin");
    db.levels ??= [];
    let lv = db.levels.find((x) => x.wh === wh && x.item_id === it.id);
    if (lv) Object.assign(lv, { min_qty: mn, max_qty: mx });
    else db.levels.push((lv = { id: nid(db), wh, item_id: it.id, min_qty: mn, max_qty: mx }));
    return ok(levelsOut(db, wh).find((x) => x.id === lv!.id));
  }
  if (p === "/wh/racks") return addRack(db, body);
  if (p === "/wh/wizard") return wizard(db, body);
  if ((g = m(/^\/wh\/racks\/(\d+)$/))) return editRack(db, Number(g[1]), body);
  if ((g = m(/^\/wh\/buildings\/(\d+)$/))) return editBuilding(db, Number(g[1]), body);
  if ((g = m(/^\/wh\/blocks\/(\d+)$/))) return editBlock(db, Number(g[1]), body);
  if ((g = m(/^\/cells\/(\d+)$/))) return editCell(db, Number(g[1]), body);
  if (p === "/wh/buildings") return ok(addBuilding(db, body));
  if (p === "/wh/blocks") return ok(addBlock(db, body));
  if (p === "/cells") {
    const wh = whOk(db, body.parent_id);
    const codes = ((body.codes as string[]) ?? []).map((c) => String(c).trim().toUpperCase()).filter(Boolean);
    const blocks = db.blocks.filter((b) => b.wh === wh);
    const only = body.block_id == null || body.block_id === "" ? null : blocks.find((b) => b.id === Number(body.block_id));
    if (only === undefined) throw new Bad("Xona noto'g'ri — ro'yxatdan tanlang");
    const bad = only && codes.find((c) => !c.startsWith(`${only.code}-`));
    if (only && bad) throw new Bad(`${bad} — ${only.code} xonaga tegishli emas (kod ${only.code}- bilan boshlanadi)`);
    // joy kodi butun bazada yagona — boshqa omborda band bo'lsa, hech narsa yaratilmaydi
    const taken = codes.map((code) => db.cells.find((c) => c.code === code)).find((c) => c && c.wh !== wh);
    if (taken) throw new Bad(`${taken.code} — «${whName(db, taken.wh)}» omborida bor: boshqa xona harfi tanlang`);
    const out: { id: number; code: string }[] = [];
    for (const code of codes) {
      if (db.cells.some((c) => c.code === code)) continue;
      const c = { id: nid(db), code, wh, block_id: only ? only.id : (blocks.find((b) => b.code === code.split("-")[0])?.id ?? null), rack_id: null };
      db.cells.push(c);
      out.push({ id: c.id, code });
    }
    return ok(out);
  }
  if (p === "/docs") {
    const kind = String(body.kind ?? "");
    if (!PFX[kind]) return fail(400, "Hujjat turi noto'g'ri");
    const h = (body.header ?? {}) as B;
    const d: DbDoc = {
      id: nid(db),
      number: null,
      kind,
      status: "draft",
      firm: firmOk(db, body.firm),
      wh: whOk(db, h.warehouse_id),
      wh_to: h.warehouse_to ? whOk(db, h.warehouse_to) : null,
      author: ME_ID,
      date: iso(now),
      updated: iso(now),
      version: 1,
      data: { ...((h.data as B) ?? {}), ...(h.base_id ? { base_id: h.base_id } : {}) },
      lines: ((body.lines as Doc["lines"]) ?? []).map((l) => ({ item_id: Number(l.item_id), char_id: l.char_id ?? null, batch_id: l.batch_id ?? null, qty: String(l.qty), data: l.data ?? {} })),
    };
    if (kind === "transfer" && (!d.wh_to || d.wh_to === d.wh)) return fail(400, "Qayerga — boshqa omborni tanlang");
    db.docs.push(d);
    return ok(docOut(db, d));
  }
  if ((g = m(/^\/docs\/(\d+)\/receive$/))) return transferReceive(db, Number(g[1]), body, now);
  if ((g = m(/^\/docs\/(\d+)\/(save|post|review)$/))) {
    const d = db.docs.find((x) => x.id === Number(g![1]));
    if (!d) return fail(404, "Hujjat topilmadi");
    if (d.status !== "draft") return fail(400, "Hujjat allaqachon o'tkazilgan");
    if (g[2] === "review") return d.kind === "inventory" ? ok(inventoryReview(db, d, now)) : fail(404, "Qoralama sanash topilmadi");
    if (Number(body.version) !== d.version) return fail(409, "Hujjatni boshqa joyda o'zgartirishgan — sahifani yangilang");
    if (g[2] === "save") {
      const h = (body.header ?? {}) as B;
      if (h.warehouse_id) d.wh = whOk(db, h.warehouse_id);
      if (h.data) d.data = { ...(h.data as B) };
      if (body.lines) d.lines = (body.lines as Doc["lines"]).map((l) => ({ item_id: Number(l.item_id), char_id: l.char_id ?? null, batch_id: l.batch_id ?? null, qty: String(l.qty), data: l.data ?? {} }));
      d.version++;
      d.updated = iso(now);
      return ok(docOut(db, d));
    }
    if (d.kind === "writeoff") {
      const bad = writeoffCheck(db, d, body);
      if (bad) return bad;
    }
    if (d.kind === "inventory") {
      // toleransdan katta farq — rahbar tasdig'i + sabab (tasodifiy nollashdan himoya)
      const rv = inventoryReview(db, d, now);
      if (rv.need) {
        if (!body.approve) return fail(409, `${rv.need} ta pozitsiyada farq toleransdan katta — qayta sanang yoki rahbar tasdiqlasin`);
        if (!supervisor(db)) return fail(409, "Katta farqni faqat rahbar (egasi, admin) tasdiqlay oladi");
        const reason = String(body.reason ?? "");
        if (!(reason in REASONS)) return fail(400, "Farq sababini tanlang");
        d.data = { ...d.data, reason: REASONS[reason], approval: { by: db.me.name, reason, need: rv.need } };
      }
    }
    // o'tkazish: xato bo'lsa holat o'zgarmasin — nusxada bajarib, keyin almashtiramiz
    const snap = JSON.stringify(db);
    try {
      d.number = nextNumber(db, d.kind);
      if (d.kind === "cut") postCut(db, d, now);
      else if (d.kind === "inventory") postInventory(db, d, now);
      else if (d.kind === "transfer" || d.kind === "writeoff") postMove(db, d, now, d.kind === "writeoff");
      else if (d.kind === "acceptance") postAcceptance(db, d, now);
      d.status = "posted";
      d.version++;
      d.date = iso(now);
      d.updated = iso(now);
      sweep(db);
      return ok(docOut(db, d));
    } catch (e) {
      Object.assign(db, JSON.parse(snap));
      throw e;
    }
  }
  if ((g = m(/^\/picks\/(\d+)\/short$/))) return ok(pickShort(db, Number(g[1]), body, now));
  if (p === "/returns") {
    const snap = JSON.stringify(db);
    try {
      return ok(returnPost(db, body, now));
    } catch (e) {
      Object.assign(db, JSON.parse(snap));
      throw e;
    }
  }
  if ((g = m(/^\/picks\/(\d+)\/ship$/))) {
    const pk = db.picks.find((x) => x.id === Number(g![1]));
    if (!pk) return fail(404, "Buyurtma topilmadi yoki allaqachon jo'natilgan");
    const picks = (body.picks as { line_no: number; batch_id: number | null; qty: string }[]) ?? [];
    if (!picks.length) return fail(400, "Yig'ilgan tovar yo'q");
    const snap = JSON.stringify(db);
    try {
      let total = 0;
      const d: DbDoc = { id: nid(db), number: nextNumber(db, "sale"), kind: "sale", status: "posted", firm: pk.firm, wh: pk.wh, wh_to: null, author: ME_ID, date: iso(now), updated: iso(now), version: 2, data: { base: pk.number, customer: pk.customer, channel: pk.channel }, lines: [] };
      db.docs.push(d);
      for (const x of picks) {
        const ln = pk.lines.find((l) => l.line_no === x.line_no);
        if (!ln) throw new Bad("Buyurtma qatori topilmadi");
        const it = itemOf(db, ln.item_id);
        const qn = numOf(x.qty);
        if (!(qn > 0) || qn > ln.left + EPS) throw new Bad("Miqdor buyurtmadan ko'p");
        let loc = "";
        if (x.batch_id) {
          const b = db.batches.find((y) => y.id === x.batch_id);
          if (b && (b.item_id !== ln.item_id || (!it.dims && (b.char_id ?? null) !== (ln.char_id ?? null)))) throw new Bad(`Birlik ${b.code ?? ""} bu qatordagi tovar emas — boshqa tovar skanerlangan`);
          if (!b || b.wh !== pk.wh || b.pending || b.qty + EPS < qn) throw new Bad(`Birlik ${b?.code ?? ""} omborda yetarli emas`);
          if (quarantined(db, b)) throw new Bad(`Birlik ${b.code ?? ""} karantinda (${cellCode(db, b.loc_id)}) — jo'natib bo'lmaydi`);
          loc = cellCode(db, b.loc_id) ?? "";
          b.qty = r4(b.qty - qn);
        } else takeLots(db, ln.item_id, ln.char_id, null, pk.wh, qn);
        ln.left = r4(ln.left - qn);
        total += qn * it.cost * 1.3;
        d.lines.push({ item_id: ln.item_id, char_id: ln.char_id, batch_id: x.batch_id || null, qty: String(r4(qn)), data: { loc, scan: String((x as { scan?: string }).scan ?? "") } });
      }
      pk.lines = pk.lines.filter((l) => l.left > EPS);
      if (!pk.lines.length) db.picks = db.picks.filter((x) => x !== pk);
      sweep(db);
      return ok({ number: d.number, total: Math.round(total) });
    } catch (e) {
      Object.assign(db, JSON.parse(snap));
      throw e;
    }
  }
  if (p === "/stock/cutplan") return ok(cutPlan(db, body));
  if (p === "/place") {
    const loc = db.cells.find((c) => c.id === Number(body.loc_id));
    if (!loc) return fail(400, "Joy (javon) topilmadi");
    const it = itemOf(db, Number(body.item_id));
    const usIn = (body.units as { w?: number }[] | null) ?? [];
    locOk(db, loc.id, { adding: it.dims ? usIn.length : Number(!live(db).some((b) => b.loc_id === loc.id && b.item_id === it.id && !b.code)), width: Math.max(0, ...usIn.map((x) => Number(x.w ?? 0))) || null });
    const firm = firmOk(db, body.firm);
    const number = nextNumber(db, "initial");
    const ids: number[] = [];
    let total = 0;
    if (it.dims) {
      const us = (body.units as { w?: number; l?: number; q?: number }[]) ?? [];
      if (!us.length) return fail(400, "O'lchamni kiriting");
      for (const x of us) {
        const qty = qtyOf(it, x.w ?? null, x.l ?? null, x.q ?? null);
        if (!(qty > 0)) return fail(400, "O'lcham noto'g'ri");
        const b = newBatch(db, { code: nextCode(db), item_id: it.id, firm, wh: loc.wh, loc_id: loc.id, kind: it.dims === "wl" && (x.l ?? 0) < 20000 ? "piece" : it.dims === "w" ? "piece" : "roll",
          width_mm: x.w ?? null, length_mm: it.dims === "l" ? qty * 1000 : (x.l ?? null), qty }, now);
        ids.push(b.id);
        total += qty;
      }
    } else {
      const qty = numOf(body.qty);
      if (!(qty > 0)) return fail(400, "Miqdorni kiriting");
      ids.push(addLot(db, it.id, body.char_id ? Number(body.char_id) : null, firm, loc.wh, loc.id, qty, now).id);
      total = qty;
    }
    const pl = { id: nid(db), number, loc_id: loc.id, item_id: it.id, qty: r4(total), firm, date: iso(now), author: ME_ID, batch_ids: ids };
    db.places.push(pl);
    db.docs.push({ id: nid(db), number, kind: "initial", status: "posted", firm, wh: loc.wh, wh_to: null, author: ME_ID, date: iso(now), updated: iso(now), version: 2, data: {}, lines: [] });
    return ok({ number, item: it.name, loc: loc.code, qty: pl.qty, unit: it.unit, units: it.dims ? ids : [], label: { url: `${A}/labels/place/${pl.id}.pdf` } });
  }
  if ((g = m(/^\/place\/(\d+)\/undo$/))) {
    const pl = db.places.find((x) => x.id === Number(g![1]));
    if (!pl) return fail(404, "Joylashtirish topilmadi");
    if (pl.author !== ME_ID) return fail(403, "Faqat o'zingiz joylaganini bekor qila olasiz");
    for (const id of pl.batch_ids) {
      const b = db.batches.find((x) => x.id === id);
      if (b) b.qty = b.kind === "lot" ? r4(Math.max(0, b.qty - pl.qty)) : 0;
    }
    db.places = db.places.filter((x) => x !== pl);
    sweep(db);
    return ok({ ok: true });
  }
  return fail(404, "Topilmadi");
}

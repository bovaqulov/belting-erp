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
} from "@/erp/warehouse/lib";

import { ME_ID, type Db, type DbBatch, type DbDoc, type DbItem } from "./seed.lib";

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
const PFX: Record<string, string> = { inventory: "INV", cut: "KS", transfer: "KO", writeoff: "HC", acceptance: "QB", sale: "JN", initial: "BQ" };
const CLS_DAYS: Record<Cls, number> = { A: 30, B: 60, C: 120 };

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
  for (const b of lots.sort((x, y) => x.qty - y.qty)) {
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
  return { ...db.me, warehouses: db.warehouses, firms: db.firms, kinds: KINDS.map(([code, uz]) => ({ code, title: { uz }, can: ["create", "post"] })) };
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
    .map(({ due: _due, ...r }) => r);
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

function cells(db: Db): Cell[] {
  const ls = live(db);
  return db.cells
    .filter((c) => !transit(db).has(c.wh))
    .map((c) => ({ id: c.id, code: c.code, parent_id: c.wh, warehouse: whName(db, c.wh), units: ls.filter((b) => b.loc_id === c.id).length }));
}

function pickOut(db: Db, id: number): PickOrder {
  const p = db.picks.find((x) => x.id === id);
  if (!p) throw new Bad("Buyurtma topilmadi yoki allaqachon jo'natilgan");
  const ls = live(db).filter((b) => b.wh === p.wh);
  return {
    id: p.id,
    number: p.number,
    customer: p.customer,
    firm: p.firm,
    warehouse_id: p.wh,
    lines: p.lines.map((l) => {
      const it = itemOf(db, l.item_id);
      return {
        line_no: l.line_no,
        item_id: l.item_id,
        char_id: l.char_id,
        name: fullName(it, l.char_id),
        unit: it.unit,
        dims: it.dims,
        left: l.left,
        units: ls
          .filter((b) => b.item_id === l.item_id && (it.dims || (b.char_id ?? null) === (l.char_id ?? null)))
          .sort((a, b) => a.qty - b.qty)
          .map((b) => ({ batch_id: b.code ? b.id : null, code: b.code, loc: cellCode(db, b.loc_id), qty: b.qty, width_mm: b.width_mm, length_mm: b.length_mm, firm: b.firm })),
      };
    }),
  };
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
  d.data = { ...d.data, result, positions: result.length, diff: result.filter((r) => Math.abs(r.diff) > EPS).length };
}

function postMove(db: Db, d: DbDoc, now: number, off: boolean) {
  for (const ln of d.lines) {
    const q = numOf(ln.qty);
    if (ln.batch_id) {
      const b = db.batches.find((x) => x.id === ln.batch_id);
      if (!b || b.qty <= EPS || b.wh !== d.wh) throw new Bad(`Birlik ${b?.code ?? ""} ${whName(db, d.wh)} da emas`);
      if (off) b.qty = 0;
      else {
        b.wh = d.wh_to!;
        b.loc_id = null;
      }
    } else {
      takeLots(db, ln.item_id, ln.char_id, d.firm, d.wh, q);
      if (!off) addLot(db, ln.item_id, ln.char_id, d.firm, d.wh_to!, null, q, now);
    }
  }
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
  const result = inc.items.map((i) => ({ item_id: i.item_id, expected: i.qty, counted: got(i), diff: r4(got(i) - i.qty) }));
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
    return route(db, method, path, body ?? {}, now);
  } catch (e) {
    if (e instanceof Bad) return fail(400, e.message);
    throw e;
  }
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
      }));
      return ok(out);
    }
    if ((g = m(/^\/picks\/(\d+)$/))) return ok(pickOut(db, Number(g[1])));
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
    if (p === "/wh/tree") return ok(whTree(db, whOk(db, q.get("store_id"))));
    if (p === "/wh/unplaced") {
      const wh = whOk(db, q.get("store_id"));
      const out: Unplaced[] = live(db)
        .filter((b) => b.wh === wh && !b.loc_id && b.src)
        .map((b) => {
          const it = itemOf(db, b.item_id);
          return { batch_id: b.id, name: fullName(it, b.char_id), code: b.code, width_mm: b.width_mm, length_mm: b.length_mm, doc: b.src ?? "", firm: b.firm, qty: b.qty, unit: it.unit };
        });
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
    for (const id of ids) {
      const b = db.batches.find((x) => x.id === id);
      if (!b) return fail(404, "Birlik topilmadi");
      b.loc_id = loc;
    }
    return ok({ ok: true });
  }
  if (p === "/units") {
    const it = itemOf(db, Number(body.item_id));
    if (!it.dims) return fail(400, "Donali tovarga birlik stikeri chiqmaydi");
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
  if (p === "/cells") {
    const wh = whOk(db, body.parent_id);
    const codes = ((body.codes as string[]) ?? []).map((c) => String(c).trim().toUpperCase()).filter(Boolean);
    const out: { id: number; code: string }[] = [];
    for (const code of codes) {
      if (db.cells.some((c) => c.code === code)) continue;
      const c = { id: nid(db), code, wh, block_id: null };
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
  if ((g = m(/^\/docs\/(\d+)\/(save|post)$/))) {
    const d = db.docs.find((x) => x.id === Number(g![1]));
    if (!d) return fail(404, "Hujjat topilmadi");
    if (d.status !== "draft") return fail(400, "Hujjat allaqachon o'tkazilgan");
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
  if ((g = m(/^\/picks\/(\d+)\/ship$/))) {
    const pk = db.picks.find((x) => x.id === Number(g![1]));
    if (!pk) return fail(404, "Buyurtma topilmadi yoki allaqachon jo'natilgan");
    const picks = (body.picks as { line_no: number; batch_id: number | null; qty: string }[]) ?? [];
    if (!picks.length) return fail(400, "Yig'ilgan tovar yo'q");
    const snap = JSON.stringify(db);
    try {
      let total = 0;
      for (const x of picks) {
        const ln = pk.lines.find((l) => l.line_no === x.line_no);
        if (!ln) throw new Bad("Buyurtma qatori topilmadi");
        const qn = numOf(x.qty);
        if (!(qn > 0) || qn > ln.left + EPS) throw new Bad("Miqdor buyurtmadan ko'p");
        if (x.batch_id) {
          const b = db.batches.find((y) => y.id === x.batch_id);
          if (!b || b.wh !== pk.wh || b.qty + EPS < qn) throw new Bad(`Birlik ${b?.code ?? ""} omborda yetarli emas`);
          b.qty = r4(b.qty - qn);
        } else takeLots(db, ln.item_id, ln.char_id, null, pk.wh, qn);
        ln.left = r4(ln.left - qn);
        total += qn * itemOf(db, ln.item_id).cost * 1.3;
      }
      pk.lines = pk.lines.filter((l) => l.left > EPS);
      if (!pk.lines.length) db.picks = db.picks.filter((x) => x !== pk);
      const d: DbDoc = { id: nid(db), number: nextNumber(db, "sale"), kind: "sale", status: "posted", firm: pk.firm, wh: pk.wh, wh_to: null, author: ME_ID, date: iso(now), updated: iso(now), version: 2, data: { base: pk.number }, lines: [] };
      db.docs.push(d);
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

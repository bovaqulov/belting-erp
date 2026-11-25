import { describe, expect, it } from "vitest";

import type { Kpi, PickBrief, ReturnRes, Sale, AccDiff, Cell, CutPlan, DockKpi, Level, Replenish, Transit, Move, PutawayTip, Unplaced, Cycle, Dashboard, Doc, Incoming, PickOrder, Placed, ScanRes, ScanUnit, StockTable, WhBlock, WhBuilding, WhRack, WhStructure, WhTree } from "@/erp/warehouse/lib";

import { seed, type Db } from "./seed.lib";
import { handle, pathKey } from "./server.lib";

const NOW = Date.parse("2026-11-14T09:00:00Z");
const A = "/app/api/erp";
const fresh = () => seed(NOW);
const get = <T,>(db: Db, path: string) => {
  const r = handle(db, "GET", `${A}${path}`, undefined, NOW);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body as T;
};
const post = <T,>(db: Db, path: string, body: Record<string, unknown> = {}) => {
  const r = handle(db, "POST", `${A}${path}`, body, NOW);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body as T;
};
/** reason — sanashda toleransdan katta farq bo'lsa: rahbar tasdig'i + sabab (demo foydalanuvchi — admin) */
const postDoc = (db: Db, body: Record<string, unknown>, reason?: string) => {
  const d = post<Doc>(db, "/docs", body);
  return post<Doc & { data: { result?: { diff: number }[] } }>(db, `/docs/${d.id}/post`, { version: d.version, ...(reason ? { approve: true, ...(reason === "approve" ? {} : { reason }) } : {}) });
};
const unit = (db: Db, code: string) => get<ScanUnit>(db, `/scan?code=${code}`);

describe("demo ombor backend", () => {
  it("seed doimiy", () => {
    expect(JSON.stringify(seed(NOW))).toBe(JSON.stringify(seed(NOW)));
  });

  it("skaner: birlik, joy, shtrixkod, kenglik shtrixkodi, ikki bazali 1C kodi, noma'lum", () => {
    const db = fresh();
    expect(unit(db, "p00000101").type).toBe("unit");
    expect(get<ScanRes>(db, "/scan?code=AO1-A-01-01-A").type).toBe("cell");
    const it = get<ScanRes>(db, "/scan?code=4780100000042");
    expect(it.type === "item" && it.name).toContain("1040-8M");
    const ch = get<ScanRes>(db, "/scan?code=4780100000080");
    expect(ch.type === "item" && ch.char_id).toBe(81);
    const c = get<ScanRes>(db, "/scan?code=00123");
    expect(c.type === "choice" && c.options.map((o) => o.base)).toEqual(["BLT", "RMN"]);
    expect(get<ScanRes>(db, "/scan?code=zzz").type).toBe("unknown");
  });

  it("panel: kam qolgan, joysiz, hisobda yo'q birlik", () => {
    const db = fresh();
    const d = get<Dashboard>(db, "/stock/dashboard");
    expect(d.low.map((x) => x.name)).toContain("Ремень SPB 1650 Lw");
    expect(d.stock.no_loc).toBeGreaterThan(0);
    expect(d.pending_units).toBe(1);
    expect(d.picks).toBe(3);
    expect(d.accuracy).not.toBeNull();
  });

  it("qoldiq jadvali: filtrlar", () => {
    const db = fresh();
    const all = get<StockTable>(db, "/stock/table");
    const measured = get<StockTable>(db, "/stock/table?kind=measured");
    const low = get<StockTable>(db, "/stock/table?low=true");
    expect(measured.rows.every((r) => r.dims)).toBe(true);
    expect(measured.rows.length).toBeLessThan(all.rows.length);
    expect(low.rows.every((r) => r.min_qty > 0 && r.qty < r.min_qty)).toBe(true);
    expect(get<StockTable>(db, "/stock/table?q=spb").rows).toHaveLength(1);
  });

  it("kesish (eni × uzunligi): rulon qisqaradi, bo'lak va yon qoldiq yangi stiker oladi", () => {
    const db = fresh();
    const u = unit(db, "P00000101"); // 800×40000
    const p = postDoc(db, { kind: "cut", firm: "BLT", header: { warehouse_id: 1 }, lines: [{ item_id: u.item_id, batch_id: u.id, qty: "0", data: { width_mm: 600, length_mm: 2000 } }] });
    expect(p.number).toMatch(/^KS-26-/);
    const res = p.lines[0].data as { pieces: number[]; rests: number[] };
    expect(res.pieces).toHaveLength(1);
    expect(res.rests).toHaveLength(2); // yon qoldiq 200×2000 + rulonning o'zi
    const after = unit(db, "P00000101");
    expect(after.length_mm).toBe(38000);
    expect(Number(after.stock[0].qty)).toBeCloseTo(30.4);
    expect(Number(p.lines[0].qty)).toBeCloseTo(1.2);
    // sig'maydigan o'lcham — 400, holat o'zgarmaydi
    const d = post<Doc>(db, "/docs", { kind: "cut", firm: "BLT", header: { warehouse_id: 1 }, lines: [{ item_id: u.item_id, batch_id: u.id, qty: "0", data: { width_mm: 900, length_mm: 100 } }] });
    expect(handle(db, "POST", `${A}/docs/${d.id}/post`, { version: d.version }, NOW).status).toBe(400);
    expect(unit(db, "P00000101").length_mm).toBe(38000);
  });

  it("sanash: qisman — faqat sanalgan; to'liq — sanalmagani hisobdan chiqadi", () => {
    const db = fresh();
    const u = unit(db, "P00000104");
    const p = postDoc(db, { kind: "inventory", firm: "BLT", header: { warehouse_id: 1 }, lines: [{ item_id: u.item_id, batch_id: u.id, qty: "14" }] }, "count_error");
    expect(p.data.result).toEqual([expect.objectContaining({ book: 15, counted: 14, diff: -1 })]);
    expect(Number(unit(db, "P00000101").stock[0].qty)).toBe(32);

    const db2 = fresh();
    const p2 = postDoc(db2, { kind: "inventory", firm: "BLT", header: { warehouse_id: 1, data: { scope: "full" } }, lines: [{ item_id: 4, char_id: null, batch_id: null, qty: "14", data: { firm_id: 2 } }] }, "loss");
    expect(p2.data.result!.filter((r) => r.diff !== 0).length).toBeGreaterThan(3);
    expect(unit(db2, "P00000101").stock).toHaveLength(0);
    expect(get<StockTable>(db2, "/stock/table?warehouse_id=1").rows.map((r) => r.item_id)).toEqual([4]);
  });

  it("sanashda yaratilgan birlik: hisobda emas, o'chirish mumkin; yakunlanganda hisobga kiradi", () => {
    const db = fresh();
    const u = post<{ batch_id: number; code: string; qty: number }>(db, "/units", { item_id: 1, firm: "BLT", width_mm: 600, length_mm: 1000, warehouse_id: 1 });
    expect(u.qty).toBeCloseTo(0.6);
    expect(unit(db, u.code).pending).toBe(true);
    expect(handle(db, "DELETE", `${A}/units/${u.batch_id}`, undefined, NOW).status).toBe(200);
    expect(get<ScanRes>(db, `/scan?code=${u.code}`).type).toBe("unknown");
    // hisobdagi birlikni o'chirib bo'lmaydi
    expect(handle(db, "DELETE", `${A}/units/${unit(db, "P00000101").id}`, undefined, NOW).status).toBe(400);
  });

  it("ABC sikl: muddati o'tganlar, sinf bo'yicha", () => {
    const c = get<Cycle>(fresh(), "/stock/cycle?warehouse_id=1");
    expect(c.due_total).toBe(c.due.length);
    expect(c.due[0].cls).toBe("A");
    expect([c.summary.A.days, c.summary.B.days, c.summary.C.days]).toEqual([7, 30, 90]);
  });

  it("yig'ish: birlik + donali → jo'natish, qoldiq kamayadi, buyurtma yopiladi", () => {
    const db = fresh();
    const o = get<PickOrder>(db, "/picks/1");
    const l1 = o.lines.find((l) => l.line_no === 1)!;
    // o'lchamli: kerakdan katta bo'lganlarning eng kichigi birinchi (kesishda chiqindi kam)
    const fit = l1.units.filter((u) => u.qty >= l1.left);
    expect(l1.units[0].qty).toBe(Math.min(...fit.map((u) => u.qty)));
    expect(["kam chiqindi", "aniq mos"]).toContain(l1.units[0].tip);
    expect(o.lines.map((l) => l.stop)).toEqual(o.lines.map((_, i) => i + 1));
    const piece = unit(db, "P00000102"); // EP 400 bo'lak, 10 m²
    const bad = handle(db, "POST", `${A}/picks/1/ship`, { picks: [{ line_no: 1, batch_id: piece.id, qty: "10" }] }, NOW);
    expect(bad.status).toBe(400); // buyurtmada 4,8
    const s = post<{ number: string; total: number }>(db, "/picks/1/ship", {
      picks: [
        { line_no: 1, batch_id: piece.id, qty: "4.8" },
        { line_no: 2, batch_id: null, qty: "2" },
      ],
    });
    expect(s.number).toMatch(/^JN-26-/);
    expect(handle(db, "GET", `${A}/picks/1`, undefined, NOW).status).toBe(400);
    expect(Number(unit(db, "P00000102").stock[0].qty)).toBeCloseTo(5.2);
  });

  it("qabul: qisman — qolgani yo'lda, birliklar joylash navbatida", () => {
    const db = fresh();
    const inc = get<Incoming[]>(db, "/purchase/incoming")[0];
    postDoc(db, { kind: "acceptance", firm: inc.firm, header: { warehouse_id: inc.warehouse_id, warehouse_to: 1, base_id: inc.id, data: { final: false } }, lines: [{ item_id: 4, char_id: null, batch_id: null, qty: "20" }] });
    const left = get<Incoming[]>(db, "/purchase/incoming").find((x) => x.id === inc.id)!;
    expect(left.items.map((i) => i.item_id)).toEqual([5]);
    expect(get<unknown[]>(db, "/wh/unplaced?store_id=1")).toHaveLength(1);
  });

  it("ko'chirish — avval yo'lda, qabul qiluvchi qabul qiladi; hisobdan chiqarish — sabab va katta summada tasdiq (backend test_transfer_and_writeoff, test_writeoff_approval_and_replenish bilan bir xil)", () => {
    const db = fresh();
    const u = unit(db, "P00000104");
    const d = postDoc(db, { kind: "transfer", firm: "BLT", header: { warehouse_id: 1, warehouse_to: 2 }, lines: [{ item_id: u.item_id, batch_id: u.id, qty: "15" }] }) as Doc & { data: { transit: boolean } };
    expect(d.data.transit).toBe(true);
    expect(unit(db, "P00000104").stock[0].warehouse_id).toBe(4); // yo'lda
    const inc = get<Transit[]>(db, "/transfers/incoming?store_id=2");
    expect(inc.map((x) => x.number)).toEqual([d.number]);
    expect(handle(db, "POST", `${A}/docs/${d.id}/receive`, { batch_ids: [999] }, NOW).status).toBe(400);
    const r = post<Transit>(db, `/docs/${d.id}/receive`, { batch_ids: [u.id] });
    expect(r.done && r.units[0].received).toBe(true);
    expect(unit(db, "P00000104").stock[0].warehouse_id).toBe(2);
    expect(get<Unplaced[]>(db, "/wh/unplaced?store_id=2").some((x) => x.code === "P00000104")).toBe(true);
    expect(get<Transit[]>(db, "/transfers/incoming?store_id=2")).toEqual([]);

    const nr = post<Doc>(db, "/docs", { kind: "writeoff", firm: "RMN", header: { warehouse_id: 1 }, lines: [{ item_id: 5, batch_id: null, qty: "1" }] });
    expect(handle(db, "POST", `${A}/docs/${nr.id}/post`, { version: nr.version }, NOW).status).toBe(400); // sabab yo'q
    const big = post<Doc>(db, "/docs", { kind: "writeoff", firm: "BLT", header: { warehouse_id: 1, data: { reason: "Brak" } }, lines: [{ item_id: 1, batch_id: unit(db, "P00000101").id, qty: "32" }] });
    expect(handle(db, "POST", `${A}/docs/${big.id}/post`, { version: big.version }, NOW).status).toBe(409);
    expect(post<Doc & { data: { approval: { value: number } } }>(db, `/docs/${big.id}/post`, { version: big.version, approve: true }).data.approval.value > 500_000).toBe(true);

    const lv = post<Level>(db, "/wh/levels", { store_id: 2, item_id: 5, min_qty: 5, max_qty: 12 });
    expect([lv.min_qty, lv.max_qty, lv.have]).toEqual([5, 12, 0]);
    const rp = get<Replenish>(db, "/replenish?store_id=2");
    const row = rp.rows.find((x) => x.item_id === 5)!;
    expect([rp.from_id, row.need, row.available, row.suggest]).toEqual([1, 12, 8, 8]);
    expect(handle(db, "DELETE", `${A}/wh/levels/${lv.id}`, undefined, NOW).body).toEqual({ ok: true });
  });

  it("kesish rejasi: avval qoldiq, sig'maganlar alohida", () => {
    const db = fresh();
    const p = post<CutPlan>(db, "/stock/cutplan", { item_id: 1, warehouse_id: 1, needs: [{ w: 600, l: 1000, n: 2 }, { w: 1200, l: 500, n: 1 }] });
    expect(p.missing).toHaveLength(1);
    expect(p.pieces).toBe(2);
    expect(p.units[0].kind).toBe("piece"); // bo'lak rulondan oldin
    expect(handle(db, "POST", `${A}/stock/cutplan`, { item_id: 4, warehouse_id: 1, needs: [{ q: 1 }] }, NOW).status).toBe(400);
  });

  it("joylashtirish va bekor qilish; javonlar daraxti", () => {
    const db = fresh();
    const t = get<WhTree>(db, "/wh/tree?store_id=1");
    expect(t.blocks[0].racks[0].cells[0].code).toBe("AO1-A-01-01-A");
    const cell = t.blocks[1].racks[0].cells[0];
    const r = post<Placed>(db, "/place", { loc_id: cell.id, item_id: 6, firm: "RMN", qty: "4" });
    expect(r.loc).toBe(cell.code);
    const rec = get<{ id: number }[]>(db, "/place/recent");
    expect(rec).toHaveLength(1);
    post(db, `/place/${rec[0].id}/undo`);
    expect(get<unknown[]>(db, "/place/recent")).toHaveLength(0);
  });

  it("tuzilma: AO → AO1 → AO1-A; xona harfi bino ichida yagona (backend test_structure_buildings_blocks_cells bilan bir xil)", () => {
    const db = fresh();
    const st = get<WhStructure>(db, "/wh/structure?store_id=1");
    expect(st.store.code).toBe("AO");
    expect(st.buildings.map((x) => [x.name, x.code])).toEqual([["1-bino", "AO1"]]);
    expect(Object.fromEntries(st.blocks.map((x) => [x.code, x.full]))).toEqual({ A: "AO1-A", B: "AO1-B" });
    const bld = post<WhBuilding>(db, "/wh/buildings", { store_id: 1, name: "Sovuq ombor" });
    expect([bld.number, bld.code]).toEqual([2, "AO2"]);
    expect(handle(db, "POST", `${A}/wh/buildings`, { store_id: 1, name: "SOVUQ OMBOR" }, NOW).status).toBe(400);
    expect(handle(db, "POST", `${A}/wh/buildings`, { store_id: 1, number: 1 }, NOW).status).toBe(400);
    const blk = post<WhBlock>(db, "/wh/blocks", { store_id: 1, building_id: bld.id, code: "a", name: "Muzlatgich" });
    expect([blk.code, blk.full]).toEqual(["A", "AO2-A"]);
    expect(handle(db, "POST", `${A}/wh/blocks`, { store_id: 1, building_id: bld.id, code: "A" }, NOW).status).toBe(400);
    expect(handle(db, "POST", `${A}/wh/blocks`, { store_id: 1, building_id: bld.id, code: "1" }, NOW).status).toBe(400);
    expect(post<{ code: string }[]>(db, "/cells", { parent_id: 1, block_id: blk.id, codes: ["A-05-1"] }).map((x) => x.code)).toEqual(["A-05-1"]);
    expect(handle(db, "POST", `${A}/cells`, { parent_id: 1, block_id: blk.id, codes: ["B-09-1"] }, NOW).status).toBe(400);
  });

  it("qoralama: versiya to'qnashuvi — 409", () => {
    const db = fresh();
    const d = post<Doc>(db, "/docs", { kind: "inventory", firm: "BLT", header: { warehouse_id: 1 }, lines: [] });
    post(db, `/docs/${d.id}/save`, { version: d.version, lines: [] });
    expect(handle(db, "POST", `${A}/docs/${d.id}/save`, { version: d.version, lines: [] }, NOW).status).toBe(409);
  });

  it("omborni tahrirlash va o'chirish (backend test_store_edit_and_drop bilan bir xil)", () => {
    const db = fresh();
    const r = post<{ name: string; kind: string }>(db, "/wh/stores/3", { name: "Sex 1", kind: "production" });
    expect([r.name, r.kind]).toEqual(["Sex 1", "production"]);
    expect(handle(db, "POST", `${A}/wh/stores/3`, { name: "asosiy ombor" }, NOW).status).toBe(400);
    expect(handle(db, "POST", `${A}/wh/stores/3`, { name: "X", kind: "transit" }, NOW).status).toBe(400);
    expect(handle(db, "DELETE", `${A}/wh/stores/1`, undefined, NOW).status).toBe(409); // qoldiq bor

    db.warehouses.push({ id: 90, name: "Bo'sh", kind: "store", code: "BS" });
    post(db, "/wh/buildings", { store_id: 90, name: "1-bino" });
    expect(handle(db, "DELETE", `${A}/wh/stores/90`, undefined, NOW).body).toEqual({ ok: true, archived: false });
    expect(db.warehouses.some((w) => w.id === 90) || db.buildings.some((b) => b.wh === 90)).toBe(false);

    db.warehouses.push({ id: 91, name: "Eski", kind: "shop", code: "ES" });
    db.batches.push({ ...db.batches[0], id: 9991, wh: 91, qty: 0, loc_id: null });
    expect(handle(db, "DELETE", `${A}/wh/stores/91`, undefined, NOW).body).toEqual({ ok: true, archived: true });
    expect(get<{ warehouses: { id: number }[] }>(db, "/me").warehouses.map((w) => w.id)).not.toContain(91);
    expect(post<{ name: string }>(db, "/wh/stores/3", { name: "Eski" }).name).toBe("Eski"); // nom bo'shadi
  });

  it("bino/xona/joy: tahrirlash (kod qayta quriladi), holat, o'chirish (backend test_structure_edit_and_drop bilan bir xil)", () => {
    const db = fresh();
    const st = get<WhStructure>(db, "/wh/structure?store_id=1");
    const b1 = st.buildings[0];
    const blkA = st.blocks.find((x) => x.code === "A")!;
    const codes = () => new Set(get<Cell[]>(db, "/cells").map((x) => x.code));
    const s = (method: string, path: string, body?: Record<string, unknown>) => handle(db, method, `${A}${path}`, body, NOW).status;

    const r = post<WhBuilding & { recoded: number }>(db, `/wh/buildings/${b1.id}`, { name: "Bosh bino", number: 3 });
    expect([r.code, r.recoded]).toEqual(["AO3", 12]);
    expect(codes().has("AO3-A-01-01-A")).toBe(true);
    const k = post<WhBlock & { recoded: number }>(db, `/wh/blocks/${blkA.id}`, { name: "Lentalar", code: "K" });
    expect([k.full, k.recoded]).toEqual(["AO3-K", 6]);
    expect(s("POST", `/wh/blocks/${blkA.id}`, { code: "B" })).toBe(400);
    expect(post<{ code: string }>(db, "/wh/stores/1", { name: "Asosiy ombor", code: "as" }).code).toBe("AS");
    expect(codes().has("AS3-K-01-01-A")).toBe(true);
    expect(s("POST", "/wh/stores/1", { name: "Asosiy ombor", code: "DC" })).toBe(400);

    const cells = get<Cell[]>(db, "/cells");
    const busy = cells.find((x) => x.block_id === blkA.id && x.units)!;
    const empty = cells.find((x) => x.block_id === blkA.id && !x.units)!;
    expect(s("POST", `/cells/${empty.id}`, { code: "Z-1" })).toBe(400);
    expect(s("POST", `/cells/${empty.id}`, { status: "nope" })).toBe(400);
    expect(post<Cell>(db, `/cells/${empty.id}`, { status: "blocked" }).status).toBe("blocked");
    expect(s("POST", "/units/loc", { batch_ids: [unit(db, "P00000101").id], loc_id: empty.id })).toBe(400);
    post(db, `/cells/${empty.id}`, { status: "active" });
    expect(s("DELETE", `/cells/${busy.id}`)).toBe(409);
    expect(handle(db, "DELETE", `${A}/cells/${empty.id}`, undefined, NOW).body).toEqual({ ok: true });
    expect(s("DELETE", `/wh/blocks/${blkA.id}`)).toBe(409);
    expect(s("DELETE", `/wh/buildings/${b1.id}`)).toBe(409);

    const bld = post<WhBuilding>(db, "/wh/buildings", { store_id: 1, name: "Yangi" });
    const w = post<{ racks: WhRack[]; cells: number }>(db, "/wh/wizard", { store_id: 1, building_id: bld.id, block_code: "Q", racks: 2, rows: 2, floors: 3 });
    expect([w.racks.map((x) => x.code), w.cells]).toEqual([[`${bld.code}-Q-01`, `${bld.code}-Q-02`], 12]);
    expect(handle(db, "DELETE", `${A}/wh/buildings/${bld.id}`, undefined, NOW).body).toEqual({ ok: true, cells: 12 });
    expect(s("DELETE", "/cells/999999")).toBe(404);
  });

  it("har omborning o'z kodi — joy kodlari to'qnashmaydi (backend test_codes_unique_across_warehouses bilan bir xil)", () => {
    const db = fresh();
    const bld = post<WhBuilding>(db, "/wh/buildings", { store_id: 3, name: "Sex binosi" });
    expect(bld.code).toBe("KS1");
    const blk = post<WhBlock>(db, "/wh/blocks", { store_id: 3, building_id: bld.id, code: "A" });
    expect(post<WhRack>(db, "/wh/racks", { store_id: 3, block_id: blk.id, rows: 1, floors: 1 }).code).toBe("KS1-A-01");
    const r = handle(db, "POST", `${A}/cells`, { parent_id: 3, codes: ["C-01-1"] }, NOW);
    expect(r.status).toBe(400);
    expect((r.body as { detail: string }).detail).toContain("Asosiy ombor");
  });

  it("stellajlar: qator × qavat → AO1-A-02-01-A… (backend test_racks bilan bir xil)", () => {
    const db = fresh();
    const st = get<WhStructure>(db, "/wh/structure?store_id=1");
    const blkA = st.blocks.find((x) => x.code === "A")!;
    expect(st.racks.filter((x) => x.block_id === blkA.id).map((x) => [x.code, x.rows, x.floors])).toEqual([["AO1-A-01", 3, 2]]);
    const r = post<WhRack & { cells: number }>(db, "/wh/racks", { store_id: 1, block_id: blkA.id, rows: 4, floors: 7, name: "Devor" });
    expect([r.code, r.cells]).toEqual(["AO1-A-02", 28]);
    const cs = get<Cell[]>(db, "/cells").filter((x) => x.rack_id === r.id);
    expect(cs).toHaveLength(28);
    const codes = new Set(cs.map((x) => x.code));
    expect(codes.has("AO1-A-02-01-A") && codes.has("AO1-A-02-04-G")).toBe(true);
    expect(cs.every((x) => x.row && x.floor && x.status === "active")).toBe(true);
    expect(handle(db, "POST", `${A}/wh/racks`, { store_id: 1, block_id: blkA.id, rows: 1, floors: 25 }, NOW).status).toBe(400);
    const e = post<WhRack & { added: number; removed: number }>(db, `/wh/racks/${r.id}`, { rows: 3, floors: 8 });
    expect([e.rows, e.floors, e.added, e.removed]).toEqual([3, 8, 3, 7]);
    const rack1 = st.racks.find((x) => x.code === "AO1-A-01")!;
    expect(handle(db, "POST", `${A}/wh/racks/${rack1.id}`, { rows: 1, floors: 1 }, NOW).status).toBe(409);
    expect(handle(db, "DELETE", `${A}/wh/racks/${rack1.id}`, undefined, NOW).status).toBe(409);
    expect(handle(db, "DELETE", `${A}/wh/racks/${r.id}`, undefined, NOW).body).toEqual({ ok: true, cells: 24 });
  });

  it("harakatlar jurnali: joy o'zgarishi (0), hisobdan chiqarish (−) va Σ delta = qoldiq (backend test_ledger_moves_idempotency bilan bir xil)", () => {
    const db = fresh();
    const u = unit(db, "P00000101");
    const cells = get<Cell[]>(db, "/cells").filter((x) => x.parent_id === 1 && x.code !== u.loc);
    post(db, "/units/loc", { batch_ids: [u.id], loc_id: cells[0].id });
    const m = get<Move[]>(db, `/moves?unit_id=${u.id}&limit=1`)[0];
    expect([m.op, m.op_title, m.delta, m.loc_from, m.loc_to]).toEqual(["units_loc", "Joyni o'zgartirish", 0, u.loc, cells[0].code]);
    postDoc(db, { kind: "writeoff", firm: "BLT", header: { warehouse_id: 1, data: { reason: "Brak" } }, lines: [{ item_id: u.item_id, batch_id: u.id, qty: "32" }] }, "approve");
    const w = get<Move[]>(db, `/moves?unit_id=${u.id}&limit=1`)[0];
    expect([w.op, w.delta, w.qty_after, w.reason]).toEqual(["writeoff", -32, 0, "Brak"]);
    expect(w.doc_number).toBeTruthy();
    // jurnal butunligi: har birlik uchun Σ delta = joriy qoldiq (kutilayotgan — 0)
    for (const b of db.batches) {
      const s = db.moves.filter((x) => x.unit_id === b.id).reduce((a, x) => a + x.delta, 0);
      expect(Math.abs(s - (b.pending ? 0 : b.qty)) < 1e-6, `${b.code ?? b.id}: Σ=${s}, qty=${b.qty}`).toBe(true);
    }
  });

  it("xona vazifasi/guruhlari, stellaj sig'imi va eni, joylashtirish tavsiyasi (backend test_zones_capacity_putaway bilan bir xil)", () => {
    const db = fresh();
    const st = get<WhStructure>(db, "/wh/structure?store_id=1");
    const blk = Object.fromEntries(st.blocks.map((x) => [x.code, x]));
    const rackA = st.racks.find((x) => x.code === "AO1-A-01")!;
    expect([blk.A.purpose, blk.A.groups, rackA.cell_kind, rackA.capacity]).toEqual(["storage", [], "shelf", null]);
    expect(get<string[]>(db, "/wh/groups")).toContain("Konveyer lentalar");
    expect(post<WhBlock>(db, `/wh/blocks/${blk.A.id}`, { groups: ["Konveyer lentalar"], purpose: "storage" }).groups).toEqual(["Konveyer lentalar"]);
    expect(handle(db, "POST", `${A}/wh/blocks/${blk.A.id}`, { purpose: "nope" }, NOW).status).toBe(400);

    let tips = get<PutawayTip[]>(db, "/putaway?store_id=1&item_id=1");
    expect(tips[0].reason.startsWith("shu tovar")).toBe(true);
    expect(tips[0].code.startsWith("AO1-A-01-01")).toBe(true);

    const r = post<WhRack>(db, `/wh/racks/${rackA.id}`, { rows: 3, floors: 2, cell_kind: "roll", capacity: 1 });
    expect([r.cell_kind, r.capacity, r.rows]).toEqual(["roll", 1, 3]);
    tips = get<PutawayTip[]>(db, "/putaway?store_id=1&item_id=1");
    expect(tips.length > 0 && tips.every((x) => x.units === 0)).toBe(true);
    expect(tips[0].reason).toBe("«Konveyer lentalar» xonasi, bo'sh");
    const u = unit(db, "P00000104");
    const full = get<Cell[]>(db, "/cells").find((x) => x.code === "AO1-A-01-01-A")!;
    let res = handle(db, "POST", `${A}/units/loc`, { batch_ids: [u.id], loc_id: full.id }, NOW);
    expect(res.status).toBe(400);
    expect((res.body as { detail: string }).detail).toContain("to'la");

    post(db, `/wh/racks/${rackA.id}`, { rows: 3, floors: 2, capacity: null, max_width_mm: 400 });
    res = handle(db, "POST", `${A}/units/loc`, { batch_ids: [u.id], loc_id: full.id }, NOW);
    expect((res.body as { detail: string }).detail).toContain("sig'maydi");
    tips = get<PutawayTip[]>(db, "/putaway?store_id=1&item_id=1&width_mm=800");
    expect(tips.length > 0 && !tips.some((x) => x.code.startsWith("AO1-A"))).toBe(true);
    post(db, `/wh/blocks/${blk.B.id}`, { purpose: "quarantine" });
    tips = get<PutawayTip[]>(db, "/putaway?store_id=1&item_id=1&width_mm=800");
    expect(tips.some((x) => x.code.startsWith("AO1-B"))).toBe(false);
  });

  it("kutilgan kirim → qabul (rejadan tashqari bilan) → navbat → joylash → dock-to-stock (backend test_receiving_asn_extra_dock bilan bir xil)", () => {
    const db = fresh();
    expect(handle(db, "POST", `${A}/purchase/incoming`, { firm: "RMN", items: [] }, NOW).status).toBe(400);
    const inc = post<Incoming>(db, "/purchase/incoming", { supplier: "Bando", firm: "RMN", expected: "2026-11-20", items: [{ item_id: 4, qty: "10" }] });
    expect(inc.number.startsWith("KR-")).toBe(true);
    expect(get<Incoming[]>(db, "/purchase/incoming").some((x) => x.id === inc.id)).toBe(true);
    const r = postDoc(db, { kind: "acceptance", firm: "RMN", header: { warehouse_id: inc.warehouse_id, warehouse_to: 1, base_id: inc.id, data: { final: true } }, lines: [{ item_id: 4, char_id: null, batch_id: null, qty: "8" }, { item_id: 5, char_id: null, batch_id: null, qty: "2" }] });
    const res = Object.fromEntries(((r.data.result ?? []) as unknown as AccDiff[]).map((x) => [x.item_id, x]));
    expect([res[4].diff, res[5].diff, res[5].extra]).toEqual([-2, 2, true]);
    const q = get<Unplaced[]>(db, "/wh/unplaced?store_id=1").filter((x) => x.doc === r.number);
    expect(q.length === 2 && q.every((x) => x.since && x.item_id)).toBe(true);
    const k0 = get<DockKpi>(db, "/kpi/dock?store_id=1");
    expect(k0.waiting >= 2 && k0.oldest_h !== null).toBe(true);
    const tip = get<PutawayTip[]>(db, "/putaway?store_id=1&item_id=4")[0];
    post(db, "/units/loc", { batch_ids: [q[0].batch_id], loc_id: tip.id });
    const k1 = get<DockKpi>(db, "/kpi/dock?store_id=1");
    expect([k1.placed >= 1, k1.within_2h, k1.waiting]).toEqual([true, 100, k0.waiting - 1]);
    const inc2 = post<Incoming>(db, "/purchase/incoming", { firm: "BLT", items: [{ item_id: 4, qty: 1 }] });
    expect(handle(db, "DELETE", `${A}/purchase/incoming/${inc2.id}`, undefined, NOW).body).toEqual({ ok: true });
    expect(handle(db, "DELETE", `${A}/purchase/incoming/${inc2.id}`, undefined, NOW).status).toBe(404);
  });

  it("sanash: ko'rish (o'zgartirmaydi) → katta farq tasdiqsiz o'tmaydi → rahbar + sabab; IRA (backend test_count_tolerance_review_ira bilan bir xil)", () => {
    const db = fresh();
    const u = unit(db, "P00000101");
    const d = post<Doc>(db, "/docs", { kind: "inventory", firm: "BLT", header: { warehouse_id: 1 }, lines: [{ item_id: u.item_id, batch_id: u.id, qty: "0" }] });
    const rv = post<{ lines: { book: number; counted: number; ok: boolean; cls: string; value: number }[]; need: number; can_approve: boolean; reasons: { code: string }[] }>(db, `/docs/${d.id}/review`);
    expect([rv.lines[0].book, rv.lines[0].counted, rv.lines[0].ok, rv.lines[0].cls, rv.need, rv.can_approve]).toEqual([32, 0, false, "A", 1, true]);
    expect(rv.reasons.some((r) => r.code === "loss")).toBe(true);
    expect(Number(unit(db, "P00000101").stock[0].qty)).toBe(32);
    expect(handle(db, "POST", `${A}/docs/${d.id}/post`, { version: d.version }, NOW).status).toBe(409);
    expect(handle(db, "POST", `${A}/docs/${d.id}/post`, { version: d.version, approve: true }, NOW).status).toBe(400);
    db.me.roles = ["employee"];
    expect(handle(db, "POST", `${A}/docs/${d.id}/post`, { version: d.version, approve: true, reason: "loss" }, NOW).status).toBe(409);
    db.me.roles = ["admin"];
    const r = post<Doc & { data: { approval: { reason: string } } }>(db, `/docs/${d.id}/post`, { version: d.version, approve: true, reason: "loss" });
    expect(r.data.approval.reason).toBe("loss");
    const k = get<{ positions: number; ira: number | null; by_cls: Record<string, unknown> }>(db, "/kpi/ira?store_id=1");
    expect(k.positions >= 1 && k.ira !== null && "A" in k.by_cls).toBe(true);
  });

  it("yig'ish: ilon izi yo'li, boshqa tovar 400, karantin, topilmadi → sanash navbati", () => {
    const db = fresh();
    const cs = db.cells.filter((c) => c.rack_id && c.row && c.floor);
    const cmp = (a: number, b: number) => {
      const x = pathKey(db, a);
      const y = pathKey(db, b);
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
      return 0;
    };
    const ks = cs.map((c) => c.id).sort(cmp);
    const c0 = cs.find((c) => c.id === ks[0])!;
    const r1 = ks.map((id) => cs.find((c) => c.id === id)!).filter((c) => c.rack_id === c0.rack_id).map((c) => c.row!);
    expect(r1).toEqual([...r1].sort((a, b) => a - b));
    expect(pathKey(db, null)[0]).toBe(1);

    const o = get<PickOrder>(db, "/picks/1");
    expect(o.route).toEqual(o.lines.flatMap((l) => (l.at ? [l.at] : [])));
    const l1 = o.lines.find((l) => l.line_no === 1)!;
    const piece = unit(db, "P00000102");
    const other = db.batches.find((b) => b.code && b.qty > 0 && b.item_id !== piece.item_id)!;
    const r = handle(db, "POST", `${A}/picks/1/ship`, { picks: [{ line_no: 1, batch_id: other.id, qty: "1" }] }, NOW);
    expect(r.status).toBe(400);
    expect((r.body as { detail: string }).detail).toContain("tovar emas");
    expect(db.docs.some((d) => d.kind === "sale")).toBe(false);

    const u = db.batches.find((b) => b.code === l1.units[0].code)!;
    const cell = db.cells.find((c) => c.id === u.loc_id)!;
    cell.status = "quarantine";
    expect(get<PickOrder>(db, "/picks/1").lines.flatMap((l) => l.units.map((x) => x.code))).not.toContain(u.code);
    const q = handle(db, "POST", `${A}/picks/1/ship`, { picks: [{ line_no: 1, batch_id: u.id, qty: "1" }] }, NOW);
    expect((q.body as { detail: string }).detail).toContain("karantin");
    cell.status = "active";

    expect(handle(db, "POST", `${A}/picks/1/short`, { line_no: 2, reason: "xyz" }, NOW).status).toBe(400);
    const s = post<PickOrder>(db, "/picks/1/short", { line_no: 2, reason: "missing" });
    expect(s.lines.find((l) => l.line_no === 2)!.short).toBe(1);
    expect(db.items.find((i) => i.id === 4)!.last_count).toBeNull();
    expect(get<PickBrief[]>(db, "/picks").find((x) => x.id === 1)!.short).toBe(1);
  });

  it("qaytarish: jo'natish bo'yicha, yaroqli — navbatga (yangi QR, ota kodi), brak — karantinga", () => {
    const db = fresh();
    const piece = unit(db, "P00000102");
    const s = post<{ number: string }>(db, "/picks/1/ship", { picks: [{ line_no: 1, batch_id: piece.id, qty: "4.8" }, { line_no: 2, batch_id: null, qty: "2" }] });
    const sale = db.docs.find((d) => d.number === s.number)!;
    expect(sale.lines[0].data.loc).toBeTruthy();
    expect(get<Sale[]>(db, `/sales?q=${s.number}`).map((x) => x.id)).toEqual([sale.id]);
    expect(get<Sale[]>(db, "/sales?q=olmaliq").map((x) => x.id)).toContain(sale.id);
    const byCode = get<Sale[]>(db, "/sales?q=P00000102");
    expect(byCode.map((x) => x.id)).toEqual([sale.id]);
    const lot = byCode[0].lines.find((l) => !l.batch_id)!;

    expect(handle(db, "POST", `${A}/returns`, { sale_id: sale.id, lines: [{ line: 0, qty: "1" }] }, NOW).status).toBe(400);
    const much = handle(db, "POST", `${A}/returns`, { sale_id: sale.id, reason: "x", lines: [{ line: lot.line, qty: "3" }] }, NOW);
    expect((much.body as { detail: string }).detail).toContain("mumkin: 2");

    const qc = db.cells.filter((c) => c.wh === sale.wh).sort((a, b) => a.code.localeCompare(b.code)).at(-1)!;
    qc.status = "quarantine";
    const r = post<ReturnRes>(db, "/returns", { sale_id: sale.id, reason: "Mijoz adashgan", lines: [{ line: 0, qty: "4.8", grade: "ok" }, { line: lot.line, qty: "1", grade: "defect" }] });
    expect(r.number).toMatch(/^QT-26-/);
    expect([r.ok, r.defect, r.quarantine]).toEqual([1, 1, qc.code]);
    expect(Number(unit(db, "P00000102").stock[0].qty)).toBeCloseTo(5.2);
    const kid = db.batches.find((b) => b.parent_code === "P00000102" && b.src === r.number)!;
    expect(kid.qty).toBeCloseTo(4.8);
    expect(kid.loc_id).toBeNull();
    expect(db.batches.some((b) => b.loc_id === qc.id && b.qty > 0)).toBe(true);
    expect(get<Sale[]>(db, `/sales?q=${s.number}`)[0].lines.map((l) => l.returned)).toEqual([4.8, 1]);
    expect(handle(db, "POST", `${A}/returns`, { sale_id: sale.id, reason: "x", lines: [{ line: 0, qty: "0.1" }] }, NOW).status).toBe(400);
  });

  it("zanjir: birlikdagi made.from qaytadi, sex bo'lmasa — used bo'sh; yo'q birlik — 404", () => {
    const db = fresh();
    const b = db.batches.find((x) => x.code)!;
    b.made = { kind: "produce", job: "BR-1", from: [{ code: "P1", item_id: 1, name: "EP", qty: 1, unit: "m2", doc: "SR-26-0001" }] } as unknown as typeof b.made;
    const t = get<{ job: string; from: { code: string }[]; used: unknown[] }>(db, `/units/${b.id}/trace`);
    expect([t.job, t.from[0].code, t.used.length]).toEqual(["BR-1", "P1", 0]);
    expect(handle(db, "GET", `${A}/units/999999/trace`, undefined, NOW).status).toBe(404);
  });

  it("ko'rsatkichlar: chiqim, qaytarish, bandlik, 14 kunlik faollik, faol joylar, joylashuv maslahati", () => {
    const db = fresh();
    const piece = unit(db, "P00000102");
    post(db, "/picks/1/ship", { picks: [{ line_no: 1, batch_id: piece.id, qty: "4.8" }] });
    const sale = db.docs.find((d) => d.kind === "sale")!;
    post(db, "/returns", { sale_id: sale.id, reason: "x", lines: [{ line: 0, qty: "1", grade: "defect" }] });
    const blk = db.cells.find((c) => c.code === "AO1-A-01-01-A")!.block_id!;
    post(db, "/wh/racks", { store_id: 1, block_id: blk, rows: 1, floors: 5 });
    const hi = db.cells.filter((c) => c.wh === 1 && (c.floor ?? 0) >= 4).sort((a, b) => a.code.localeCompare(b.code))[0];
    const u = db.batches.find((b) => b.code === "P00000101")!;
    post(db, "/units/loc", { batch_ids: [u.id], loc_id: hi.id });
    const k = get<Kpi>(db, "/kpi/summary?store_id=1&days=30");
    expect([k.outbound.orders, k.outbound.lines, k.outbound.returns, k.outbound.return_pct, k.outbound.defect]).toEqual([1, 1, 1, 100, 1]);
    expect(k.space.cells).toBe(k.space.by_block.reduce((a, b) => a + b.cells, 0));
    expect(k.activity).toHaveLength(14);
    expect(k.hot[0].moves).toBeGreaterThanOrEqual(k.hot.at(-1)!.moves);
    expect(k.slotting.some((x) => x.code === "P00000101" && x.loc === hi.code)).toBe(true);
  });
});

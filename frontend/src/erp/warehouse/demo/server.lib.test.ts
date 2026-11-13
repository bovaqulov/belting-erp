import { describe, expect, it } from "vitest";

import type { CutPlan, Cycle, Dashboard, Doc, Incoming, PickOrder, Placed, ScanRes, ScanUnit, StockTable, WhTree } from "@/erp/warehouse/lib";

import { seed, type Db } from "./seed.lib";
import { handle } from "./server.lib";

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
const postDoc = (db: Db, body: Record<string, unknown>) => {
  const d = post<Doc>(db, "/docs", body);
  return post<Doc & { data: { result?: { diff: number }[] } }>(db, `/docs/${d.id}/post`, { version: d.version });
};
const unit = (db: Db, code: string) => get<ScanUnit>(db, `/scan?code=${code}`);

describe("demo ombor backend", () => {
  it("seed doimiy", () => {
    expect(JSON.stringify(seed(NOW))).toBe(JSON.stringify(seed(NOW)));
  });

  it("skaner: birlik, joy, shtrixkod, kenglik shtrixkodi, ikki bazali 1C kodi, noma'lum", () => {
    const db = fresh();
    expect(unit(db, "p00000101").type).toBe("unit");
    expect(get<ScanRes>(db, "/scan?code=A-01-1").type).toBe("cell");
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
    const p = postDoc(db, { kind: "inventory", firm: "BLT", header: { warehouse_id: 1 }, lines: [{ item_id: u.item_id, batch_id: u.id, qty: "14" }] });
    expect(p.data.result).toEqual([expect.objectContaining({ book: 15, counted: 14, diff: -1 })]);
    expect(Number(unit(db, "P00000101").stock[0].qty)).toBe(32);

    const db2 = fresh();
    const p2 = postDoc(db2, { kind: "inventory", firm: "BLT", header: { warehouse_id: 1, data: { scope: "full" } }, lines: [{ item_id: 4, char_id: null, batch_id: null, qty: "14", data: { firm_id: 2 } }] });
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
    expect(c.summary.A.days).toBe(30);
  });

  it("yig'ish: birlik + donali → jo'natish, qoldiq kamayadi, buyurtma yopiladi", () => {
    const db = fresh();
    const o = get<PickOrder>(db, "/picks/1");
    expect(o.lines[0].units[0].code).toBeTruthy();
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

  it("ko'chirish va hisobdan chiqarish", () => {
    const db = fresh();
    const u = unit(db, "P00000104");
    postDoc(db, { kind: "transfer", firm: "BLT", header: { warehouse_id: 1, warehouse_to: 2 }, lines: [{ item_id: u.item_id, batch_id: u.id, qty: "15" }] });
    expect(unit(db, "P00000104").stock[0].warehouse_id).toBe(2);
    const r = handle(db, "POST", `${A}/docs`, { kind: "writeoff", firm: "RMN", header: { warehouse_id: 1 }, lines: [{ item_id: 5, batch_id: null, qty: "100" }] }, NOW);
    const d = r.body as Doc;
    expect(handle(db, "POST", `${A}/docs/${d.id}/post`, { version: d.version }, NOW).status).toBe(400); // 8 bor
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
    expect(t.blocks[0].racks[0].cells[0].code).toBe("A-01-1");
    const cell = t.blocks[1].racks[0].cells[0];
    const r = post<Placed>(db, "/place", { loc_id: cell.id, item_id: 6, firm: "RMN", qty: "4" });
    expect(r.loc).toBe(cell.code);
    const rec = get<{ id: number }[]>(db, "/place/recent");
    expect(rec).toHaveLength(1);
    post(db, `/place/${rec[0].id}/undo`);
    expect(get<unknown[]>(db, "/place/recent")).toHaveLength(0);
  });

  it("qoralama: versiya to'qnashuvi — 409", () => {
    const db = fresh();
    const d = post<Doc>(db, "/docs", { kind: "inventory", firm: "BLT", header: { warehouse_id: 1 }, lines: [] });
    post(db, `/docs/${d.id}/save`, { version: d.version, lines: [] });
    expect(handle(db, "POST", `${A}/docs/${d.id}/save`, { version: d.version, lines: [] }, NOW).status).toBe(409);
  });
});

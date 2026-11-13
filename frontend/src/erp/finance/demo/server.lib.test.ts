import { describe, expect, it } from "vitest";

import type { Group, Item, ItemRow } from "@/erp/finance/lib";

import { seed, type Db } from "./seed.lib";
import { handle } from "./server.lib";

const P = "/app/api/erp/cat";
const NOW = Date.parse("2026-11-14T09:00:00Z");
const get = <T,>(db: Db, path: string) => {
  const r = handle(db, "GET", path, undefined, NOW);
  expect(r.status).toBe(200);
  return r.body as T;
};
const post = (db: Db, path: string, body: Record<string, unknown> = {}) => handle(db, "POST", path, body, NOW);
const detail = (r: { body: unknown }) => (r.body as { detail: string }).detail;

describe("demo katalog backend", () => {
  it("kategoriyalar: tovar soni, ota birinchi", () => {
    const gs = get<Group[]>(seed(NOW), `${P}/groups`);
    expect(gs[0].parent_id).toBeNull();
    expect(gs.find((g) => g.name === "Rukavlar")!.items).toBe(5);
  });

  it("qidiruv: belgi bo'shliq bilan ham topiladi; kategoriya — ichkilari bilan", () => {
    const db = seed(NOW);
    post(db, `${P}/items`, { group_id: 3, profile: "SPZ", length: 900, brand: "pix" });
    expect(get<ItemRow[]>(db, `${P}/items?q=spz 900`).map((r) => r.name)).toEqual(["SPZ-900 PIX"]);
    const tishli = get<ItemRow[]>(db, `${P}/items?group_id=2`);
    expect(tishli.length).toBe(4);
    expect(get<ItemRow[]>(db, `${P}/items?kind=service`).every((r) => r.kind === "service")).toBe(true);
  });

  it("yangi tovar: nom belgidan, birlik kategoriyadan, kengliklar variant", () => {
    const db = seed(NOW);
    const r = post(db, `${P}/items`, { group_id: 13, profile: "8M", length: 1200, brand: "megadyne", widths: ["20", "30,5", "20"] });
    expect(r.status).toBe(200);
    const it = r.body as Item;
    expect([it.name, it.belt_mark, it.kind, it.unit]).toEqual(["1200-8M MEGADYNE", "1200-8M", "product", "dona"]);
    expect(it.chars.map((c) => c.width_mm)).toEqual([20, 30.5]);
    // rukav kategoriyasi: o'lchov eni mm
    const s = post(db, `${P}/items`, { group_id: 1, profile: "8M", length: 1200, brand: "megadyne" }).body as Item;
    expect([s.name, s.unit, s.measured]).toEqual(["Рукав 1200-8M MEGADYNE", "mm", true]);
  });

  it("qoidalar: kategoriyasiz, nomsiz, takror, birlik qulfi, noto'g'ri kenglik", () => {
    const db = seed(NOW);
    expect(detail(post(db, `${P}/items`, { name: "X" }))).toBe("Kategoriyani tanlang");
    expect(detail(post(db, `${P}/items`, { group_id: 11 }))).toMatch(/nomi kerak/);
    expect(detail(post(db, `${P}/items`, { group_id: 13, name: "1040-8m cnfulo" }))).toMatch(/katalogda bor/);
    const spb = db.items.find((i) => i.belt_mark === "SPB-1650 Lp")!;
    expect(detail(post(db, `${P}/items`, { id: spb.id, group_id: 5, profile: "SPB", length: 1650, lstd: "lp", brand: "PIX" }))).toMatch(/birligi o'zgarmaydi/);
    expect(detail(post(db, `${P}/items/${spb.id}/widths`, { widths: ["-5"] }))).toMatch(/Kenglik noto'g'ri/);
  });

  it("rukavdan tayyor mahsulot: yangi yoki mavjudiga kenglik qo'shiladi", () => {
    const db = seed(NOW);
    const t5 = db.items.find((i) => i.name === "Рукав 630-T5 CNFULO")!;
    const p = post(db, `${P}/items/${t5.id}/products`, { group_id: 13, widths: [10, 16] }).body as Item;
    expect([p.name, p.kind, p.attrs.material_id, p.chars.length]).toEqual(["630-T5 CNFULO", "product", t5.id, 2]);
    const again = post(db, `${P}/items/${t5.id}/products`, { group_id: 13, widths: [25] }).body as Item;
    expect([again.id, again.chars.length]).toEqual([p.id, 3]);
    expect(get<Item>(db, `${P}/items/${t5.id}`).products.map((x) => x.id)).toEqual([p.id]);
    const spb = db.items.find((i) => i.belt_mark === "SPB-1650 Lp")!;
    expect(post(db, `${P}/items/${spb.id}/products`, { group_id: 13 }).status).toBe(400);
  });

  it("kategoriya: 2 daraja, takror nom, band kategoriya o'chmaydi, tavsiya — faqat yo'qlari", () => {
    const db = seed(NOW);
    expect(detail(post(db, `${P}/groups`, { parent_id: 13, name: "Ichki" }))).toMatch(/2 daraja/);
    expect(detail(post(db, `${P}/groups`, { name: "rukavlar" }))).toMatch(/kategoriyasi bor/);
    expect(detail(post(db, `${P}/groups/1/drop`))).toMatch(/tovar yoki ichki/);
    const g = post(db, `${P}/groups`, { name: "Bo'sh", attrs: { kind: "goods", dims: "", belt: false } }).body as Group;
    expect(g.attrs).toEqual({ kind: "goods" });
    expect(post(db, `${P}/groups/${g.id}/drop`).status).toBe(200);
    expect((post(db, `${P}/groups/seed`).body as unknown[]).length).toBe(0);
  });

  it("stiker PDF demo'da — tushunarli xato", () => {
    expect(post(seed(NOW), "/app/api/erp/labels/link", { item_id: 1 }).status).toBe(501);
  });
});

describe("demo narx", () => {
  it("saqlash: mm + qadam + qo'lda; bo'sh qo'lda — o'chadi; manfiy — xato", () => {
    const db = seed(NOW);
    const id = db.items.find((i) => i.name === "450-5M CNFULO")!.id;
    const it = post(db, `${P}/items/${id}/price`, { mode: "mm", price: "6 000", step_mm: "5", overrides: { "15": "95000", "25": "" } }).body as Item;
    expect(it.price).toEqual({ mode: "mm", price: 6000, step_mm: 5, overrides: { "15": 95000 } });
    expect(get<ItemRow[]>(db, `${P}/items?q=450-5M`)[0].price!.price).toBe(6000);
    expect(post(db, `${P}/items/${id}/price`, { mode: "piece", price: "-1" }).status).toBe(400);
  });
});

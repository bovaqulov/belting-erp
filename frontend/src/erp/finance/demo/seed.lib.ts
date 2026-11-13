// Demo boshlang'ich ma'lumotlari: tavsiya etilgan kategoriyalar (Jarvis TEMPLATE) va remen katalogidan namunaviy tovarlar —
// rukav (xom ashyo, eni mm) → undan kesiladigan tayyor mahsulot (kengliklar — variant), klinli/poliklinli (tovar),
// lenta materiallari (m²), profillar (m), xizmatlar. Nomlar 1C uslubida (kirill), belgilar — autoName() dan.
import { seedContracts, type ContractsDb } from "./contracts.lib";
import { seedPayroll, type PayrollDb } from "./payroll.lib";
import { autoName, beltMark, family, UNIT_OF, type Char, type Price, type Dims, type Group, type GroupAttrs, type ItemAttrs, type Kind, type StockRow } from "@/erp/finance/lib";

export const DB_VERSION = 3;

export type DbItem = {
  id: number;
  name: string;
  name_ru: string | null;
  kind: Kind;
  unit: string;
  measured: boolean;
  brand: string | null;
  belt_mark: string | null;
  sku: string | null;
  min_qty: number | null;
  ikpu: string | null;
  group_id: number;
  attrs: ItemAttrs & { search?: string };
  price: Price | null;
  active: boolean;
};
export type DbGroup = Omit<Group, "items"> & { active: boolean };
export type DbStock = StockRow & { item_id: number };
export type DbChar = Char & { item_id: number };

export type Db = ContractsDb &
  PayrollDb & {
    v: number;
    seq: number;
    me: { tg_id: number; name: string; roles: string[] };
    groups: DbGroup[];
    items: DbItem[];
    chars: DbChar[];
    stock: DbStock[];
  };

/** Tavsiya etilgan kategoriyalar (egasi o'zgartiradi): nom, ruscha, odatiy qiymatlar */
export const TEMPLATE: [string, string, GroupAttrs][] = [
  ["Rukavlar", "Рукава", { kind: "material", dims: "w", unit: "mm", belt: true }],
  ["Tishli remenlar", "Зубчатые ремни", { kind: "product", unit: "dona", belt: true }],
  ["Klinli remenlar", "Клиновые ремни", { kind: "goods", unit: "dona", belt: true }],
  ["Poliklinli remenlar", "Поликлиновые ремни", { kind: "goods", unit: "dona", belt: true }],
  ["Konveyer lenta materiallari", "Материалы для конвейерных лент", { kind: "material", dims: "wl", unit: "m2" }],
  ["Yassi remen materiallari", "Материалы для плоских ремней", { kind: "material", dims: "wl", unit: "m2" }],
  ["Profillar", "Профили", { kind: "material", dims: "l", unit: "m" }],
  ["Dumaloq remenlar", "Круглые ремни", { kind: "material", dims: "l", unit: "m" }],
  ["Mexanik ulagichlar", "Механические соединения", { kind: "goods", unit: "dona" }],
  ["Modulli lentalar", "Модульные ленты", { kind: "goods", unit: "dona" }],
  ["Boshqa tovarlar", "Прочие товары", { kind: "goods", unit: "dona" }],
  ["Xizmatlar", "Услуги", { kind: "service", unit: "xizmat" }],
];

type Spec = { price?: Price; g: number; kind?: Kind; name?: string; profile?: string; length?: number; lstd?: string; ribs?: number; brand?: string; series?: string; sku?: string; min?: number; widths?: number[]; material?: number };

export function seed(now: number = Date.now()): Db {
  const groups: DbGroup[] = TEMPLATE.map(([name, name_ru, attrs], i) => ({ id: i + 1, parent_id: null, name, name_ru, attrs, sort: i * 10, active: true }));
  // ichki kategoriyalar: tishli remenlar — metrik va dyuymli
  groups.push({ id: 13, parent_id: 2, name: "Metrik (HTD, T)", name_ru: null, attrs: {}, sort: 0, active: true });
  groups.push({ id: 14, parent_id: 2, name: "Dyuymli (XL, L, H)", name_ru: null, attrs: {}, sort: 10, active: true });

  const db: Db = {
    v: DB_VERSION,
    seq: 1000,
    me: { tg_id: 1001, name: "Rustam Aliyev", roles: ["admin"] },
    groups,
    items: [],
    chars: [],
    stock: [],
    ...seedContracts(now),
    ...seedPayroll(now),
  };
  const add = (s: Spec): number => {
    const g = groups.find((x) => x.id === s.g)!;
    const p = groups.find((x) => x.id === g.parent_id);
    const ga = { ...(p?.attrs ?? {}), ...g.attrs };
    const kind = s.kind ?? ga.kind ?? "goods";
    const dims: Dims | null = ga.dims ?? null;
    const name = s.name ?? autoName({ ...s, dims });
    const fam = s.profile ? family(s.profile) : null;
    const id = ++db.seq;
    db.items.push({
      id,
      name,
      name_ru: name,
      kind,
      unit: dims ? UNIT_OF[dims] : kind === "service" ? "xizmat" : "dona",
      measured: !!dims,
      brand: s.brand ?? null,
      belt_mark: s.profile && s.length ? beltMark(s.profile, s.length, s.lstd ?? "", s.ribs ?? null) : null,
      sku: s.sku ?? null,
      min_qty: s.min ?? null,
      ikpu: null,
      group_id: s.g,
      attrs: {
        dims,
        family: fam,
        profile: s.profile ?? null,
        length: s.length ?? null,
        lstd: s.lstd ?? null,
        ribs: s.ribs ?? null,
        series: s.series ?? null,
        ...(s.material ? { material_id: s.material } : {}),
      },
      price: s.price ?? null,
      active: true,
    });
    for (const w of s.widths ?? []) db.chars.push({ id: ++db.seq, item_id: id, name: `${w} mm`, width_mm: w, length_mm: null });
    return id;
  };
  const st = (item_id: number, loc: string, qty: number, o: Partial<StockRow> = {}) =>
    db.stock.push({ item_id, warehouse: "Asosiy ombor", firm: "BR", loc, code: `P${String(db.seq * 7 + db.stock.length).padStart(8, "0")}`, width_mm: null, length_mm: null, qty, char: null, ...o });

  // rukavlar → tayyor mahsulot
  const r8 = add({ price: { mode: "mm", price: 11_000, step_mm: null, overrides: {} }, g: 1, profile: "8M", length: 1040, brand: "CNFULO" });
  st(r8, "A-01-1", 420, { width_mm: 420 });
  st(r8, "A-01-2", 185, { width_mm: 185 });
  const r14 = add({ g: 1, profile: "14M", length: 1400, brand: "MEGADYNE", series: "SILVER3" });
  st(r14, "A-02-1", 300, { width_mm: 300 });
  const r5 = add({ g: 1, profile: "5M", length: 450, brand: "CNFULO" });
  st(r5, "A-01-3", 250, { width_mm: 250 });
  const rxl = add({ g: 1, profile: "XL", length: 210, brand: "MEGADYNE" });
  st(rxl, "A-03-1", 400, { width_mm: 400 });
  add({ g: 1, profile: "T5", length: 630, brand: "CNFULO" });

  const p8 = add({ price: { mode: "mm", price: 14_000, step_mm: 5, overrides: { "40": 520_000 } }, g: 13, kind: "product", name: "1040-8M CNFULO", profile: "8M", length: 1040, brand: "CNFULO", widths: [20, 30, 40], material: r8 });
  st(p8, "B-02-4", 12, { char: "30 mm" });
  st(p8, "B-02-4", 6, { char: "20 mm" });
  add({ g: 13, kind: "product", name: "1400-14M MEGADYNE SILVER3", profile: "14M", length: 1400, brand: "MEGADYNE", series: "SILVER3", widths: [40, 55], material: r14 });
  const p5 = add({ price: { mode: "mm", price: 6_000, step_mm: 5, overrides: {} }, g: 13, kind: "product", name: "450-5M CNFULO", profile: "5M", length: 450, brand: "CNFULO", widths: [10, 15, 25], material: r5 });
  st(p5, "B-01-2", 24, { char: "15 mm" });
  add({ g: 14, kind: "product", name: "210XL MEGADYNE", profile: "XL", length: 210, brand: "MEGADYNE", widths: [10], material: rxl });

  // klinli, poliklinli (tayyor sotib olinadi)
  const spb = add({ price: { mode: "piece", price: 185_000, step_mm: null, overrides: {} }, g: 3, profile: "SPB", length: 1650, lstd: "lp", brand: "PIX", sku: "PIX-SPB1650", min: 10 });
  st(spb, "C-01-1", 64);
  const b = add({ g: 3, profile: "B", length: 1450, lstd: "li", brand: "PIX" });
  st(b, "C-01-2", 38);
  const spa = add({ g: 3, profile: "SPA", length: 1250, lstd: "lp", brand: "OPTIBELT", min: 20 });
  st(spa, "C-01-3", 8);
  const pk = add({ g: 4, profile: "PK", ribs: 8, length: 1795, brand: "GATES" });
  st(pk, "C-02-1", 30);
  add({ g: 4, profile: "PJ", ribs: 6, length: 1016, brand: "PIX" });

  // materiallar va boshqalar
  const ep = add({ g: 5, name: "Лента конвейерная EP-400/3 4+2" });
  st(ep, "D-01", 260, { width_mm: 800, length_mm: 325000 });
  st(ep, "D-02", 140, { width_mm: 1000, length_mm: 140000 });
  add({ g: 6, name: "Лента плоская полиамидная 2.0 мм" });
  const pr = add({ g: 7, name: "Профиль клиновой 13x8 PU" });
  st(pr, "E-01", 120, { length_mm: 120000 });
  add({ g: 8, name: "Ремень круглый 8 мм PU" });
  const fx = add({ g: 9, name: "Соединитель Flexco R5", sku: "FLX-R5", min: 50 });
  st(fx, "E-03", 220);
  add({ g: 10, name: "Лента модульная S900 Flat Top" });
  const gl = add({ g: 11, name: "Клей для лент SC 2000" });
  st(gl, "E-05", 14);
  add({ g: 12, name: "Вулканизация конвейерной ленты" });
  add({ g: 12, name: "Резка ремня по ширине" });
  return db;
}

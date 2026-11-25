// Brauzer ichidagi soxta Accounting backend. Mahsulotlar — Jarvis /app/api/erp/cat/* kontrakti (erp/catalog/manage.py qoidalari bilan bir xil:
// 2 darajali kategoriya, nom takrori, birlik qulfi, kenglik variantlari, rukavdan tayyor mahsulot);
// shartnomalar — contracts.lib, maoshlar — payroll.lib. handle() sof (vaqt `now` bilan).
import { autoName, beltMark, family, KIND, UNIT_OF, type Dims, type GroupAttrs, type Item, type ItemRow, type Kind } from "@/erp/finance/lib";

import { handleContracts } from "./contracts.lib";
import { Invalid, statusOf } from "./errors.lib";
import { handlePayroll } from "./payroll.lib";
import { TEMPLATE, type Db, type DbItem } from "./seed.lib";

export type Res = { status: number; body: unknown };
type B = Record<string, unknown>;

const P = "/app/api/erp/cat";
const ok = (body: unknown): Res => ({ status: 200, body });
const fail = (status: number, detail: string): Res => ({ status, body: { detail } });
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v)).trim();
const numOrNull = (v: unknown): number | null => {
  const s = str(v).replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Obyekt nusxasi — ichki maydonsiz (active, item_id) */
function omit<T extends object, K extends keyof T>(o: T, k: K): Omit<T, K> {
  const c = { ...o };
  delete c[k];
  return c;
}

// ------------------------------------------------------------------ kategoriyalar
function groups(db: Db) {
  return db.groups
    .filter((g) => g.active)
    .sort((a, b) => (a.parent_id === null ? 0 : 1) - (b.parent_id === null ? 0 : 1) || a.sort - b.sort || a.name.localeCompare(b.name))
    .map((x) => omit(x, "active"))
    .map((g) => ({ ...g, items: db.items.filter((i) => i.active && i.group_id === g.id).length }));
}

function saveGroup(db: Db, d: B) {
  const name = str(d.name);
  if (!name) throw new Invalid("Kategoriya nomi kerak");
  const raw = (d.attrs ?? {}) as B;
  const attrs: GroupAttrs = {};
  if (raw.kind) {
    if (!(String(raw.kind) in KIND)) throw new Invalid("Tovar turi noto'g'ri");
    attrs.kind = raw.kind as Kind;
  }
  if (raw.dims) {
    if (!(String(raw.dims) in UNIT_OF)) throw new Invalid("O'lcham turi noto'g'ri");
    attrs.dims = raw.dims as Dims;
  }
  if (raw.unit) attrs.unit = String(raw.unit);
  if (raw.family) attrs.family = String(raw.family);
  if (raw.belt) attrs.belt = true;
  const parent = Number(d.parent_id) || null;
  if (parent) {
    const p = db.groups.find((g) => g.id === parent && g.active);
    if (!p) throw new Invalid("Ota kategoriya topilmadi");
    if (p.parent_id) throw new Invalid("Ichki kategoriya ichida yana kategoriya ochilmaydi (2 daraja)");
  }
  const id = Number(d.id) || 0;
  if (db.groups.some((g) => g.active && g.name.toLowerCase() === name.toLowerCase() && g.parent_id === parent && g.id !== id)) throw new Invalid(`«${name}» kategoriyasi bor`);
  const vals = { parent_id: parent, name, name_ru: str(d.name_ru) || null, attrs, sort: Number(d.sort) || 0 };
  if (id) {
    const g = db.groups.find((x) => x.id === id && x.active);
    if (!g) throw new Invalid("Kategoriya topilmadi");
    Object.assign(g, vals);
    return g;
  }
  const g = { id: ++db.seq, ...vals, active: true };
  db.groups.push(g);
  return g;
}

// ------------------------------------------------------------------ tovarlar
function row(db: Db, i: DbItem): ItemRow {
  const g = db.groups.find((x) => x.id === i.group_id);
  const pg = g?.parent_id ? db.groups.find((x) => x.id === g.parent_id) : undefined;
  const st = db.stock.filter((s) => s.item_id === i.id);
  return {
    id: i.id,
    name: i.name,
    kind: i.kind,
    unit: i.unit,
    measured: i.measured,
    dims: i.attrs.dims ?? null,
    brand: i.brand,
    belt_mark: i.belt_mark,
    sku: i.sku,
    group_id: i.group_id,
    grp: g?.name ?? null,
    parent_grp: pg?.name ?? null,
    material_id: i.attrs.material_id ?? null,
    family: i.family ?? null,
    designation: i.belt_mark,
    chars: db.chars.filter((c) => c.item_id === i.id).length,
    qty: st.reduce((a, s) => a + s.qty, 0),
    units: st.filter((s) => s.qty > 0).length,
    price: i.price,
  };
}

function items(db: Db, q: URLSearchParams): ItemRow[] {
  const gid = Number(q.get("group_id")) || null;
  const kind = q.get("kind") || null;
  const fam = q.get("family") || null;
  const brand = (q.get("brand") ?? "").toUpperCase();
  const s = (q.get("q") ?? "").trim().toLowerCase();
  return db.items
    .filter((i) => i.active)
    .filter((i) => !gid || i.group_id === gid || db.groups.find((g) => g.id === i.group_id)?.parent_id === gid)
    .filter((i) => !kind || i.kind === kind)
    .filter((i) => !fam || i.family === fam)
    .filter((i) => !brand || (i.brand ?? "").toUpperCase() === brand)
    .filter((i) => !s || [i.name, i.belt_mark, i.sku, i.attrs.search].some((x) => (x ?? "").toLowerCase().includes(s)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 200)
    .map((i) => row(db, i));
}

function item(db: Db, id: number): Item {
  const it = db.items.find((x) => x.id === id);
  if (!it) throw new Invalid("Tovar topilmadi");
  const mid = it.attrs.material_id;
  const m = mid ? db.items.find((x) => x.id === mid) : undefined;
  return {
    ...omit(it, "active"),
    attrs: { ...it.attrs },
    grp: db.groups.find((g) => g.id === it.group_id)?.name ?? null,
    chars: db.chars
      .filter((c) => c.item_id === id)
      .sort((a, b) => (a.width_mm ?? 1e9) - (b.width_mm ?? 1e9) || a.name.localeCompare(b.name))
      .map((c) => omit(c, "item_id")),
    material: m ? { id: m.id, name: m.name } : null,
    products: db.items.filter((x) => x.active && x.attrs.material_id === id).map((x) => ({ id: x.id, name: x.name })),
    stock: db.stock.filter((s) => s.item_id === id && s.qty > 0).map((s) => omit(s, "item_id")),
    price: it.price,
    family: it.family ?? null,
    spec: it.spec ?? {},
    spec_view: [],
    computed: [],
    designation: it.belt_mark,
    analogs: [],
    legacy: [],
  };
}

function addChar(db: Db, itemId: number, width: unknown) {
  const w = numOrNull(width);
  if (w === null || w <= 0 || w > 5000) throw new Invalid(`Kenglik noto'g'ri: ${str(width)}`);
  if (db.chars.some((c) => c.item_id === itemId && c.width_mm === w)) return;
  db.chars.push({ id: ++db.seq, item_id: itemId, name: `${w} mm`, width_mm: w, length_mm: null });
}

const searchText = (name: string, mark: string | null) => [(mark ?? "").replace(/-/g, " "), name].filter(Boolean).join(" | ");

function saveItem(db: Db, d: B): Item {
  const g = db.groups.find((x) => x.id === Number(d.group_id) && x.active);
  if (!g) throw new Invalid("Kategoriyani tanlang");
  const p = g.parent_id ? db.groups.find((x) => x.id === g.parent_id) : undefined;
  const ga = { ...(p?.attrs ?? {}), ...g.attrs };
  const kind = (str(d.kind) || ga.kind || "goods") as Kind;
  if (!(kind in KIND)) throw new Invalid("Tovar turi noto'g'ri");
  const dims = ((d.dims === undefined ? ga.dims : d.dims) || null) as Dims | null;
  if (dims && !(dims in UNIT_OF)) throw new Invalid("O'lcham turi noto'g'ri");
  const unit = dims ? UNIT_OF[dims] : kind === "service" ? "xizmat" : str(d.unit) || "dona";
  // yangi forma: oila + spec (demo — tishli/klinli/poliklinli belgisi; to'liq standart hisob — haqiqiy backend)
  const sp = (d.spec ?? {}) as B;
  const famKey = str(d.family) || ga.family || null;
  const profile = (str(d.profile) || str(sp.profile) || str(sp.section)).toUpperCase().replace(/\s/g, "");
  const length = numOrNull(d.length ?? sp.length);
  const fam = profile ? family(profile) : null;
  const lstd = (str(d.lstd) || str(sp.lref)).toLowerCase();
  const ribs = numOrNull(d.ribs ?? sp.ribs);
  const brand = str(d.brand).toUpperCase() || null;
  const series = str(d.series) || null;
  const name = str(d.name).replace(/\s+/g, " ") || autoName({ profile, length, lstd, ribs, brand: brand ?? "", series: series ?? "", dims });
  if (!name) throw new Invalid("Tovar nomi kerak (yoki profil va uzunlik)");
  const id = Number(d.id) || 0;
  const dup = db.items.find((x) => x.active && x.name.toLowerCase() === name.toLowerCase() && x.id !== id);
  if (dup) throw new Invalid(`«${name}» katalogda bor (#${dup.id})`);
  const mark = profile && length ? beltMark(profile, length, lstd, ribs) : null;
  const attrs = {
    dims,
    family: fam,
    profile: profile || null,
    length,
    lstd: lstd || null,
    ribs,
    series,
    note: str(d.note) || null,
    ...(d.material_id ? { material_id: Number(d.material_id) } : {}),
  };
  const vals = {
    kind,
    name,
    name_ru: str(d.name_ru) || name,
    group_id: g.id,
    unit,
    measured: !!dims,
    brand,
    belt_mark: mark,
    sku: str(d.sku) || null,
    min_qty: numOrNull(d.min_qty),
    ikpu: str(d.ikpu) || null,
    family: famKey,
    spec: d.spec ? (sp as Record<string, string | number | boolean>) : profile ? { profile, ...(length ? { length } : {}) } : {},
  };
  let itemId = id;
  if (id) {
    const old = db.items.find((x) => x.id === id && x.active);
    if (!old) throw new Invalid("Tovar topilmadi");
    if (old.unit !== unit && db.stock.some((s) => s.item_id === id)) throw new Invalid("Omborda harakati bor tovarning o'lchov birligi o'zgarmaydi");
    Object.assign(old, vals, { attrs: { ...old.attrs, ...Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== null)), search: searchText(name, mark) } });
  } else {
    itemId = ++db.seq;
    db.items.push({ id: itemId, ...vals, attrs: { ...attrs, search: searchText(name, mark) }, price: null, active: true });
  }
  // kenglik (variant) faqat donalab hisoblanadigan tovarda
  for (const w of (d.widths as unknown[]) ?? []) addChar(db, itemId, w);
  return item(db, itemId);
}

/** Narx: dona yoki mm bo'yicha; qadam (mm); kenglik bo'yicha qo'lda narx. Narx/qadam ≥ 0; bo'sh override — o'chiriladi */
function savePrice(db: Db, id: number, d: B): Item {
  const it = db.items.find((x) => x.id === id && x.active);
  if (!it) throw new Invalid("Tovar topilmadi");
  const mode = str(d.mode) === "mm" ? "mm" : "piece";
  const price = numOrNull(d.price);
  const step = numOrNull(d.step_mm);
  if ((price !== null && price < 0) || (step !== null && step < 0)) throw new Invalid("Narx va qadam manfiy bo'lmaydi");
  const overrides: Record<string, number> = {};
  for (const [w, v] of Object.entries((d.overrides ?? {}) as B)) {
    const n = numOrNull(v);
    if (n === null) continue;
    if (n < 0) throw new Invalid(`${w} mm narxi manfiy bo'lmaydi`);
    overrides[String(Number(w))] = n;
  }
  it.price = { mode, price, step_mm: mode === "mm" && step ? step : null, overrides };
  return item(db, id);
}

function makeProducts(db: Db, materialId: number, d: B): Item {
  const m = db.items.find((x) => x.id === materialId && x.active);
  if (!m || m.attrs.dims !== "w") throw new Invalid("Tayyor mahsulot faqat rukavdan (eni mm bo'yicha xom ashyo) yaratiladi");
  const have = db.items.find((x) => x.active && x.kind === "product" && x.attrs.material_id === materialId);
  if (have) {
    for (const w of (d.widths as unknown[]) ?? []) addChar(db, have.id, w);
    return item(db, have.id);
  }
  return saveItem(db, {
    group_id: d.group_id,
    kind: "product",
    dims: null,
    unit: "dona",
    profile: m.attrs.profile,
    length: m.attrs.length,
    brand: m.brand,
    series: m.attrs.series,
    material_id: materialId,
    widths: d.widths ?? [],
    name: m.name.replace(/^Рукав\s+/, ""),
  });
}

export function handle(db: Db, method: "GET" | "POST", path: string, body: B | undefined, now: number): Res {
  const u = new URL(path, "http://x");
  const p = u.pathname.replace(/\/$/, "");
  const b = body ?? {};
  if (p === "/app/api/erp/me") return ok(db.me);
  if (p === "/app/api/erp/labels/link") return fail(501, "Stiker PDF demo rejimda mavjud emas — haqiqiy backend ulanganda chiqadi");
  const get = method === "GET";
  const r = p.slice(P.length).split("/").filter(Boolean);
  try {
    const other = handleContracts(db, get, p, u.searchParams, b, now) ?? handlePayroll(db, db.me.roles.includes("admin"), get, p, b, now);
    if (other !== null) return ok(other);
    if (!p.startsWith(P)) return fail(404, "Topilmadi");
    if (r[0] === "groups") {
      if (get && r.length === 1) return ok(groups(db));
      if (!get && r.length === 1) return ok(saveGroup(db, b));
      if (!get && r[1] === "seed") {
        const out = [];
        for (const [i, [name, name_ru, attrs]] of TEMPLATE.entries()) {
          try {
            out.push(saveGroup(db, { name, name_ru, attrs, sort: i * 10 }));
          } catch (e) {
            if (!(e instanceof Invalid)) throw e;
          }
        }
        return ok(out);
      }
      if (!get && r[2] === "drop") {
        const id = Number(r[1]);
        if (db.items.some((i) => i.active && i.group_id === id) || db.groups.some((g) => g.active && g.parent_id === id))
          throw new Invalid("Kategoriyada tovar yoki ichki kategoriya bor — avval ularni ko'chiring");
        const g = db.groups.find((x) => x.id === id);
        if (g) g.active = false;
        return ok({ ok: true });
      }
    }
    if (r[0] === "items") {
      if (get && r.length === 1) return ok(items(db, u.searchParams));
      if (get && r.length === 2) return ok(item(db, Number(r[1])));
      if (!get && r.length === 1) return ok(saveItem(db, b));
      if (!get && r[2] === "widths") {
        const id = Number(r[1]);
        item(db, id);
        for (const w of (b.widths as unknown[]) ?? []) addChar(db, id, w);
        return ok(item(db, id));
      }
      if (!get && r[2] === "products") return ok(makeProducts(db, Number(r[1]), b));
      if (!get && r[2] === "price") return ok(savePrice(db, Number(r[1]), b));
    }
    if (r[0] === "archive") return ok([]);
    if (r[0] === "brands") return ok([...new Set(db.items.filter((i) => i.active && i.brand).map((i) => i.brand as string))].sort());
    if (r[0] === "duplicates") return ok([]);
    // narx siyosati (AppSheet) — faqat haqiqiy backendda; demo: odatiy sozlamalar, sinxronsiz
    if (r[0] === "pricing" && r[1] === "unmatched") return ok([]);
    if (r[0] === "pricing" && r[1] === "sync") return fail(501, "AppSheet sinxroni demo rejimda mavjud emas");
    if (r[0] === "pricing")
      return ok({
        vat_pct: 12,
        default_width: 10,
        max_disc_lead: 50,
        max_disc_head: 0,
        max_disc_seller: 0,
        synced: null,
        sync_note: null,
        stale: true,
        configured: false,
        sources: 0,
        sources_linked: 0,
        items_linked: 0,
        can_edit: false,
      });
    if (r[0] === "items" && r[2] === "quote") return ok(null);
    // jonli belgi — faqat haqiqiy backendda (specs.py); demo — bo'sh ko'rinish
    if (r[0] === "preview") return ok({ errors: {} });
  } catch (e) {
    if (e instanceof Invalid) return fail(statusOf(e), e.message);
    throw e;
  }
  return fail(404, "Topilmadi");
}

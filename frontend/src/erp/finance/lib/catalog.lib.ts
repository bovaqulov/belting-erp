// Tovarlar katalogi: turlar va sof mantiq (Jarvis erp/catalog/manage.py bilan bir xil natija). Remen belgisi va avtomatik
// nom — formadagi oldindan ko'rish ham, demo backend ham shu funksiyalardan (bir manba).
// Texnik oilalar (xalqaro standartlar: ISO 5296/13050/17396, 4184, 9982, 14890, 21183) — backend reestridan eksport
// qilingan specs.json (`manage.py catalog_specs --export-json`); belgi, nom va hisob — backend `cat/preview`.
import SPECS from "./specs.json";

export type Kind = "material" | "product" | "goods" | "service";
export type Dims = "w" | "wl" | "l";
export type Family = "timing" | "v" | "rib";

export const KIND: Record<Kind, string> = { material: "Xom ashyo", product: "Tayyor mahsulot", goods: "Tovar", service: "Xizmat" };
export const KCOL: Record<Kind, string> = { material: "orange", product: "green", goods: "blue", service: "gray" };
export const DIMS: [Dims | "", string][] = [
  ["", "Dona"],
  ["w", "Eni, mm (rukav)"],
  ["wl", "Eni × uzunligi (m²)"],
  ["l", "Uzunlik (m)"],
];
export const UNIT_OF: Record<Dims, string> = { w: "mm", wl: "m2", l: "m" };
const UNITN: Record<string, string> = { m2: "m²", mm: "mm", m: "m", dona: "dona", xizmat: "xizmat" };
export const un = (u: string | null | undefined): string => (u ? (UNITN[u] ?? u) : "");
export const dimsLabel = (d: Dims | null | undefined): string => DIMS.find(([k]) => k === (d ?? ""))?.[1] ?? "";

/** Dyuymli tishli profillar: belgi "<uzunlik><profil>" (210XL), qolganlari "<uzunlik>-<profil>" (1040-8M) */
export const INCH = new Set(["MXL", "XL", "L", "H", "XH", "XXH", "DL", "DH"]);

export type GroupAttrs = { family?: string; kind?: Kind; dims?: Dims; unit?: string; belt?: boolean };

// ------------------------------------------------------------------ texnik oilalar (specs.json)
export type FieldType = "choice" | "code" | "num" | "int" | "text" | "bool";
export type SpecField = { key: string; label: string; type: FieldType; options?: [string, string][]; unit?: string; req?: boolean; ph?: string; hint?: string; min?: number; max?: number };
export type FamilyDef = { key: string; title: string; std: string; group: string; kind: Kind; dims: Dims | null; fields: SpecField[] };
export type SpecVal = string | number | boolean;
export type Spec = Record<string, SpecVal>;
export type SpecLine = { key?: string; label: string; value: string };
export type Analog = { id: number; name: string; brand: string | null; unit?: string; qty?: number | null; same_brand?: boolean };
/** Forma jonli ko'rinishi (POST /cat/preview) */
export type Preview = {
  errors: Record<string, string>;
  designation?: string | null;
  name?: string | null;
  name_ru?: string | null;
  computed?: SpecLine[];
  hs_hint?: string | null;
  dup?: { id: number; name: string } | null;
  analogs?: Analog[];
};
export type DupGroup = { why: string; items: { id: number; name: string; brand: string | null; sku: string | null; unit: string; qty: number | null }[] };

export const FAMILIES = SPECS.families as unknown as FamilyDef[];
/** Tishli profillar (forma tavsiyasi): [kod, tizim] */
export const TIMING_PROFILES = SPECS.timing_profiles as [string, string][];
export const famOf = (k: string | null | undefined): FamilyDef | undefined => FAMILIES.find((f) => f.key === k);
export const famTitle = (k: string | null | undefined): string => famOf(k)?.title ?? "";

/** Forma qiymatlaridan spec: bo'sh maydon yuborilmaydi (server ham tozalaydi) */
export function specOut(fam: FamilyDef | undefined, v: Record<string, SpecVal>): Spec {
  const out: Spec = {};
  for (const f of fam?.fields ?? []) {
    const x = v[f.key];
    if (f.type === "bool") {
      if (x === true) out[f.key] = true;
    } else if (x !== undefined && x !== null && String(x).trim() !== "") out[f.key] = String(x).trim();
  }
  return out;
}
export type Group = { id: number; parent_id: number | null; name: string; name_ru: string | null; attrs: GroupAttrs; sort: number; items: number };

export type ItemRow = {
  id: number;
  name: string;
  kind: Kind;
  unit: string;
  measured: boolean;
  dims: Dims | null;
  brand: string | null;
  belt_mark: string | null;
  sku: string | null;
  group_id: number;
  grp: string | null;
  parent_grp: string | null;
  material_id: number | null;
  family?: string | null;
  designation?: string | null;
  /** amaldagi narx (QQSsiz): AppSheet yoki qo'lda; price_by — fixed | width (eni bo'yicha) | ribs (qovurg'a) */
  price_now?: number | null;
  price_from?: "appsheet" | "manual" | null;
  price_by?: "fixed" | "width" | "ribs" | "" | null;
  chars: number;
  qty: number;
  units: number;
  price: Price | null;
};
export type ItemAttrs = { dims?: Dims | null; family?: Family | null; profile?: string | null; length?: number | null; lstd?: string | null; ribs?: number | null; series?: string | null; note?: string | null; material_id?: number; old_names?: string[] };
export type Char = { id: number; name: string; width_mm: number | null; length_mm: number | null };
export type StockRow = { warehouse: string; firm: string; loc: string | null; code: string | null; width_mm: number | null; length_mm: number | null; qty: number; char: string | null };
export type Item = {
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
  grp: string | null;
  attrs: ItemAttrs;
  chars: Char[];
  material: { id: number; name: string } | null;
  products: { id: number; name: string }[];
  stock: StockRow[];
  price: Price | null;
  // texnik qism (backend specs.py); demo rejimda qisman
  family?: string | null;
  family_title?: string | null;
  std?: string | null;
  spec?: Spec;
  spec_view?: SpecLine[];
  computed?: SpecLine[];
  designation?: string | null;
  hs_code?: string | null;
  hs_hint?: string | null;
  barcode?: string | null;
  legacy?: string[];
  base?: string | null;
  analogs?: Analog[];
  pricing?: ItemPricing;
};

// ------------------------------------------------------------------ narx siyosati (AppSheet)
export type PriceRow = { label: string; width: number | null; price: number; price_vat: number };
export type ItemPricing = {
  source: "appsheet" | "manual" | "none";
  vat_pct: number;
  rows: PriceRow[];
  linked: null | {
    mark: string;
    name: string;
    origin: string | null;
    mode: "fixed" | "width" | "ribs";
    synced: string;
    price: number | null;
    price_vat: number | null;
    lens: Record<string, number> | null;
    note: string | null;
    /** faqat rahbariyat */
    cost?: { net: number | null; margin: number; cost_unit: number | null; unit: string | null; rate: number; fixed: number };
  };
};
export type Policy = {
  vat_pct: number;
  default_width: number;
  max_disc_lead: number;
  max_disc_head: number;
  max_disc_seller: number;
  synced: string | null;
  sync_note: string | null;
  stale: boolean;
  configured: boolean;
  sources: number;
  sources_linked: number;
  items_linked: number;
  can_edit: boolean;
  usd_rate?: number;
  fixed_add?: number;
  round_to?: number;
  learn?: boolean;
};
export type Unmatched = { id: number; mark: string; name: string | null; kind: string | null; family: string | null; brand: string | null; price: number | null };
export const PRICE_BY: Record<string, string> = { width: "eni bo'yicha", ribs: "qovurg'a bo'yicha" };

/** Profil → oila: poliklinli (PJ, PK…), klinli (SPA, B, 3V…), qolgani tishli */
export function family(profile: string): Family {
  const p = profile.toUpperCase();
  if (/^P[JKLMH]$/.test(p)) return "rib";
  if (/^((SP|XP)[ZABC]|[ZABCDE]|AX|BX|CX|AA|BB|CC|3VX?|5VX?|8V)$/.test(p)) return "v";
  return "timing";
}

/** Uzunlik matni: 1040.0 → "1040", 1250.5 → "1250.5" */
const ln = (v: number | string): string => String(Number(String(v).replace(",", ".")));

/** Remen belgisi: tishli "1040-8M" / "210XL", klinli "B-1450 Lp", poliklinli "8PK-1795" */
export function beltMark(profile: string, length: number | string | null | undefined, lstd = "", ribs: number | string | null = null, fam: Family = family(profile)): string {
  const p = profile.trim().toUpperCase();
  if (!p || length === null || length === undefined || length === "" || !Number(String(length).replace(",", "."))) return "";
  const l = ln(length);
  if (fam === "rib") return `${ribs ? Math.trunc(Number(ribs)) : ""}${p}-${l}`;
  if (fam === "v") return `${p}-${l}` + (lstd ? ` ${lstd[0].toUpperCase()}${lstd.slice(1).toLowerCase()}` : "");
  return INCH.has(p) ? `${l}${p}` : `${l}-${p}`;
}

export type NameInfo = { profile?: string; length?: number | string | null; lstd?: string; ribs?: number | string | null; brand?: string; series?: string; dims?: Dims | "" | null };

/** Belgidan nom: «1040-8M MEGADYNE», «Рукав 1040-8M CNFULO», «B-1450 Lp PIX». Belgi bo'lmasa — "" */
export function autoName(d: NameInfo): string {
  const mark = beltMark((d.profile ?? "").replace(/\s/g, ""), d.length, d.lstd ?? "", d.ribs ?? null);
  if (!mark) return "";
  const tail = [(d.brand ?? "").trim().toUpperCase(), (d.series ?? "").trim()].filter(Boolean).join(" ");
  return `${d.dims === "w" ? "Рукав " : ""}${mark}${tail ? ` ${tail}` : ""}`;
}

/** "10, 15;20 25" → [10, 15, 20, 25]; noto'g'ri qiymatlar tashlanmaydi — xato server tomonda aytiladi */
export const splitWidths = (s: string): string[] => s.split(/[,; ]+/).map((x) => x.trim()).filter(Boolean);

/** Kategoriya to'liq nomi: "Remenlar › Tishli" */
export function groupName(groups: Group[], id: number | null | undefined): string {
  const g = groups.find((x) => x.id === id);
  if (!g) return "—";
  const p = groups.find((x) => x.id === g.parent_id);
  return p ? `${p.name} › ${g.name}` : g.name;
}

/** Kategoriyaning amaldagi odatiy qiymatlari: ota kategoriyaniki + o'ziniki (o'ziniki ustun) */
export function groupAttrs(groups: Group[], id: number | string | null | undefined): GroupAttrs {
  const g = groups.find((x) => x.id === Number(id));
  if (!g) return {};
  const p = groups.find((x) => x.id === g.parent_id);
  return { ...(p?.attrs ?? {}), ...g.attrs };
}

/** Kategoriya tavsifi: "Tayyor mahsulot · dona · remen belgisi" */
export function groupDesc(a: GroupAttrs): string {
  return [a.family ? famTitle(a.family) : "", a.kind ? KIND[a.kind] : "", a.dims ? dimsLabel(a.dims) : a.kind && a.kind !== "service" ? "dona" : "", a.belt ? "remen belgisi" : ""].filter(Boolean).join(" · ");
}

/** Tanlov ro'yxati: ota kategoriyalar va ularning ichkilari ("› ") tartib bilan */
export function groupOptions(groups: Group[]): { value: number; label: string }[] {
  return groups
    .filter((g) => !g.parent_id)
    .flatMap((g) => [{ value: g.id, label: g.name }, ...groups.filter((c) => c.parent_id === g.id).map((c) => ({ value: c.id, label: `   › ${c.name}` }))]);
}

// ------------------------------------------------------------------ narx (dona / mm bo'yicha)
/** Tovar narxi: dona — bitta narx; mm — 1 mm kenglik narxi × kenglik. Qadam (mm) — kenglik qadamga yuqoriga yaxlitlanadi
 *  (qadam 5: 6–10 mm bir xil narx). overrides — kenglik bo'yicha qo'lda qo'yilgan narx (hisobdan ustun). */
export type PriceMode = "piece" | "mm";
/** source: appsheet — narx AppSheet'dan (bog'langan bo'lsa odatiy), manual — qo'lda narx ustun */
export type Price = { mode: PriceMode; price: number | null; step_mm: number | null; overrides: Record<string, number>; source?: "appsheet" | "manual" | null };
export const PRICE_MODE: Record<PriceMode, string> = { piece: "Dona narxi", mm: "1 mm narxi" };
export const emptyPrice = (): Price => ({ mode: "piece", price: null, step_mm: null, overrides: {} });

/** Kenglikni qadamga yuqoriga yaxlitlash: (7, 5) → 10; qadamsiz — o'zi */
export function roundStep(w: number, step: number | null): number {
  if (!step || step <= 0) return w;
  return Math.ceil(w / step - 1e-9) * step;
}

/** Kenglik (yoki kengliksiz tovar) narxi; belgilanmagan — null */
export function priceFor(p: Price | null | undefined, width: number | null): number | null {
  if (!p) return null;
  if (width !== null && p.overrides[String(width)] !== undefined) return p.overrides[String(width)];
  if (p.price === null) return null;
  if (p.mode === "piece" || width === null) return p.price;
  return Math.round(p.price * roundStep(width, p.step_mm));
}

/** Narx birligi: dona rejimida — tovar birligi (dona, m², m), mm rejimida — 1 mm eni */
export const priceUnit = (p: Price | null | undefined, unit: string | null | undefined): string => (p?.mode === "mm" ? "1 mm eni" : un(unit) || "dona");

/** Narx qisqacha: "412 000 so'm/dona", "95 000 so'm/m²", "14 000 so'm/mm · qadam 5 mm" */
export function priceLabel(p: Price | null | undefined, fmt: (n: number) => string, unit: string | null = "dona"): string {
  if (!p || p.price === null) return Object.keys(p?.overrides ?? {}).length ? "kenglik bo'yicha" : "belgilanmagan";
  return p.mode === "mm" ? `${fmt(p.price)} so'm/mm${p.step_mm ? ` · qadam ${p.step_mm} mm` : ""}` : `${fmt(p.price)} so'm/${un(unit) || "dona"}`;
}

// GeoMap ma'lumot turlari (backend geomap/api.py `_pack` bilan bir xil).

export type Quality = "exact" | "street" | "district" | "region" | "manual" | "none";

export interface Rec {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  q: Quality;
  region: string | null;
  district: string | null;
  owner: string | null;
  ownerName: string | null;
  status: string;
  sales: number;
  salesCount: number;
  lastSale: string | null;
  debt: number;
  overdue: number;
  deals: number;
  territory: number | null;
  address: string | null;
  type: string | null;
  industry: string | null;
  tag: string | null;
  orgAddress?: string | null; // orginfo.uz reyestridagi yuridik manzil
}

export interface RecDetail extends Rec {
  inn: string | null;
  crmUrl: string | null; // CRM mijoz kartochkasi (/app/erp/crm/?customer=<id>)
  orgUrl: string | null;
  checkins: { id: number; note: string; ts: string; tg_id: number; name: string | null }[];
}

export interface Me {
  tgId: number;
  name: string | null;
  role: string;
  full: boolean;
  ownerId: string | null; // xaritadagi `owner` bilan solishtiriladi (mas'ul — CRM xodimi, tg_id)
}

export interface Meta {
  regions: { id: string; name: string }[];
  districts: { id: string; name: string; region: string }[];
  colors: string[];
}

export interface Territory {
  id: number;
  name: string;
  kind: "draw" | "radius" | "auto" | "import";
  color: string;
  geometry: GeoJSON.Geometry;
  owner: string | null;
  grp: string | null;
  meta: Record<string, unknown>;
  n: number;
  sales: number;
}

export interface Owner {
  id: string;
  name: string;
  records: number;
}

// ---------------- filtr (AND/OR guruhlar, bir daraja ichma-ich) ----------------
export type Op =
  | "contains" | "not_contains" | "eq" | "neq" | "empty" | "not_empty"
  | "in" | "not_in"
  | "gt" | "gte" | "lt" | "lte" | "between"
  | "before" | "after" | "last_days" | "older_days";

export interface Cond {
  kind: "cond";
  field: FieldKey;
  op: Op;
  value?: string | number | string[] | [number, number];
}

export interface Group {
  kind: "group";
  match: "all" | "any";
  rules: Rule[];
}

export type Rule = Cond | Group;

export interface Filter {
  match: "all" | "any";
  rules: Rule[];
  search: string;
}

export type FieldKey =
  | "name" | "address" | "status" | "region" | "district" | "owner" | "q" | "sales" | "salesCount" | "debt"
  | "overdue" | "deals" | "lastSale" | "type" | "industry" | "tag" | "territory";

export type FieldType = "text" | "enum" | "number" | "date";

// ---------------- uslub va qatlamlar ----------------
export type ColorBy = "status" | "region" | "owner" | "q" | "territory" | "tag" | "type" | "sales" | "debt" | "none";
export type Metric = "count" | "sales" | "debt" | "deals";
export type Agg = "sum" | "avg";

export interface Style {
  colorBy: ColorBy;
  sizeBy: "none" | "sales" | "debt" | "deals";
  cluster: boolean;
  labels: boolean;
  basemap: "liberty" | "positron" | "dark" | "satellite";
}

export interface Layers {
  points: boolean;
  heatmap: { on: boolean; metric: Metric };
  hex: { on: boolean; res: number; metric: Metric; agg: Agg };
  choropleth: { on: boolean; level: "region" | "district"; metric: Metric; agg: Agg };
  center: { on: boolean; metric: Metric };
  territories: boolean;
  boundaries: boolean;
  tiles: { on: boolean; url: string; opacity: number };
}

export interface ViewState {
  filter: Filter;
  style: Style;
  layers: Layers;
  camera?: { center: [number, number]; zoom: number };
}

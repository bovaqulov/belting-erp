// Lenta chizmasi — backend javoblari va holat (eski lenta.html: S, CAT, EN, INIT, LAST, PRICE).
// Holat (S) — backend `model.py _initial()` kalitlari (camelCase). Noma'lum kalitlar ham o'tadi (index signature):
// eski kod S ni `{...INIT, ...draft.state}` bilan yig'ardi — qoralamadagi ortiqcha kalitlar ham yuboriladi.

export type Lang = "uz" | "ru";

export interface LentaState {
  beltName: string;
  width: number;
  length: number;
  bendAngle: number;
  curveHoleCount: number;
  curveHoleEdge: number;
  curveHoleDia: number;
  curveHoleRows: number;
  lockOn: boolean;
  lockName: string;
  lockQty: number;
  lockToolOn: boolean;
  lockToolName: string;
  lockToolQty: number;
  joinMethod: string;
  installPrice: number;
  weldType: string;
  guideOn: boolean;
  guideName: string;
  guideBottomOn: boolean;
  guideBottomQty: number;
  guideTopOn: boolean;
  guideTopQty: number;
  crossOn: boolean;
  crossName: string;
  crossLenAuto: boolean;
  crossPos: number[];
  crossParts: number;
  gofroOn: boolean;
  gofroName: string;
  gofroHeight: number;
  gofroQty: number;
  gofroInsetL: number;
  gofroInsetR: number;
  perfOn: boolean;
  perfDia: number;
  perfQty: number;
  perfEdge: number;
  perfGrid: boolean;
  projectName: string;
  customerPhone: string;
  [k: string]: unknown;
}

export interface CatItem {
  name: string;
  note?: string;
  thickness?: number | string;
  maker?: string;
  height?: number;
  [k: string]: unknown;
}

export interface Catalog {
  belts: CatItem[];
  locks: CatItem[];
  tools?: CatItem[];
  guideProfiles: CatItem[];
  crossProfiles: CatItem[];
  gofroProfiles: CatItem[];
  [k: string]: unknown;
}

export interface Enums {
  lockNames: string[];
  toolNames: string[];
  crossFoot: Record<string, number | string>;
  gofroMinHeight: number;
  [k: string]: unknown;
}

export interface CatalogResp {
  catalog: Catalog;
  enums: Enums;
  initial: LentaState;
}

export interface Issue {
  level: "error" | "warning" | string;
  message: string;
  ru?: string;
  field?: string;
  tab?: string;
}

export interface Sheet {
  key: string;
  title: string;
  svg: string;
}

/** POST /app/api/lenta/render → LAST */
export interface RenderResp {
  issues: Issue[];
  blocked: boolean;
  sheets: Sheet[];
  hints: { perfQty?: number; [k: string]: unknown };
  message?: string;
}

export interface PriceLine {
  title: string;
  desc: string;
  amount: number;
}

/** POST /app/api/lenta/price */
export interface PriceResp {
  blocked?: boolean;
  lines: PriceLine[];
  totals: { subtotal: number; vatAmount: number; final: number };
}

export interface Meta {
  customer: string;
  application: string;
  contact: string;
}

export interface MeResp {
  user: { tg_id: number; name: string; lang?: string; [k: string]: unknown };
  company: string;
  can_admin: boolean;
  can_view: boolean;
  can_lenta: boolean;
}

export interface ProjectRow {
  id: number | string;
  name?: string;
  updated?: string;
  owner?: string;
  tg_id?: number;
}

export interface ProjectsResp {
  projects: ProjectRow[];
  can_all?: boolean;
}

export interface ProjectResp {
  id: number | string;
  own: boolean;
  name?: string;
  state: Partial<LentaState>;
  customer?: string;
  application?: string;
  contact?: string;
}

export interface ParseResp {
  state: Partial<LentaState>;
  notes?: string[];
  unknown?: string[];
}

// localStorage — eski lenta.html bilan AYNAN bir xil kalitlar va JSON shakllari (foydalanuvchi qoralamalari saqlanib qolsin):
//   "lenta.draft.v1" → { state: S, projectId: number|string|null, text: string }
//   "lenta.lang"     → "uz" | "ru"            (JSON satr: "\"ru\"")
//   "lenta.open3"    → { params?: boolean, ... } (mobil: "Tushunilgan parametrlar" ochiqmi)
//   "lenta.meta"     → { customer, application, contact }
import { normBent } from "./logic";
import type { Lang, LentaState, Meta } from "./types";

export const DRAFT = "lenta.draft.v1";
export const LANG_KEY = "lenta.lang";
export const OPEN_KEY = "lenta.open3";
export const META_KEY = "lenta.meta";

export interface Draft {
  state?: Partial<LentaState>;
  projectId?: number | string | null;
  text?: string;
}

/** eski LS: JSON.parse / JSON.stringify, xato — null / jim */
export const LS = {
  get<T = unknown>(k: string): T | null {
    try {
      return JSON.parse(localStorage.getItem(k) as string) as T;
    } catch {
      return null;
    }
  },
  set(k: string, v: unknown): void {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* to'lgan / taqiqlangan */
    }
  },
};

/** eski saveDraft() tanasi (kalitlar tartibi bilan) */
export const draftValue = (state: LentaState | null, projectId: number | string | null, text: string): Draft => ({ state: state as LentaState, projectId, text });

/** eski boot: S = normBent({...INIT, ...(d.state || {})}); projectId = d.projectId || null */
export function restore(init: LentaState, d: Draft | null): { state: LentaState; projectId: number | string | null } {
  const dd = d || {};
  return { state: normBent({ ...init, ...(dd.state || {}) }), projectId: dd.projectId || null };
}

export const loadLang = (): Lang => (LS.get<Lang>(LANG_KEY) || "uz") as Lang;
export const defaultMeta = (): Meta => ({ customer: "", application: "", contact: "" });
export const loadMeta = (): Meta => LS.get<Meta>(META_KEY) || defaultMeta();

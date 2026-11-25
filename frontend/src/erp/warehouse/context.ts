// Ombor konteksti: foydalanuvchi (omborlar, firmalar, huquqlar), oynalar (tanlov, matn, o'lcham), bo'limga o'tish.
import { createContext, useContext } from "react";

import type { Opt } from "@/erp/kit/modal";
import type { Cell, Dims, Me, View, Warehouse } from "@/erp/warehouse/lib";

export type Size = { w?: number; l?: number; q?: number };
export type SizePre = { w?: number | ""; l?: number | ""; q?: number | ""; hint?: string; done?: string };

export type Wh = {
  me: Me;
  wide: boolean;
  demo: boolean;
  choose: <V>(title: string, opts: Opt<V>[]) => Promise<V | null>;
  ask: (title: string, o?: { label?: string; placeholder?: string; multiline?: boolean; ok?: string; value?: string }) => Promise<string | null>;
  /** O'lcham so'rash: wl — eni × uzunligi (mm), w — eni (mm), l — uzunlik. Bekor — null. */
  askSize: (title: string, dims: Exclude<Dims, null>, unit: string, pre?: SizePre) => Promise<Size | null>;
  /** Joy tanlash (omborning javonlari): Cell — tanlandi, null — "Joysiz", undefined — bekor */
  pickCell: (parent?: number) => Promise<Cell | null | undefined>;
  go: (v: View) => void;
  /** Foydalanuvchi ma'lumotini (omborlar ro'yxati) qayta yuklash — ombor tahrirlangan/o'chirilgandan keyin */
  reloadMe: () => Promise<void>;
  whName: (id: number | null | undefined) => string;
  /** Saqlash omborlari (yo'ldagi — transit — emas); joriy ombor — birinchi (bo'limlar standart tanlovi) */
  stores: Warehouse[];
  /** kirishda tanlangan ombor */
  store: Warehouse | undefined;
  /** boshqa omborni tanlash (kirish ekrani) */
  switchStore: () => void;
  can: (kind: string, act: string) => boolean;
  firmId: (code: string | null | undefined) => number | undefined;
};

export const WhCtx = createContext<Wh | null>(null);

export function useWh(): Wh {
  const c = useContext(WhCtx);
  if (!c) throw new Error("WhCtx yo'q");
  return c;
}

/** Saqlash omborlari (yo'ldagi — transit — emas) */
export const storesOf = (me: Me): Warehouse[] => me.warehouses.filter((w) => w.kind === "store" || w.kind === "shop" || w.kind === "production");

const KEY = "erp.wh.store";
/** oxirgi tanlangan ombor (shu qurilmada) */
export function savedStore(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}
export function saveStore(id: number | null): void {
  try {
    if (id) localStorage.setItem(KEY, String(id));
    else localStorage.removeItem(KEY);
  } catch {
    /* saqlab bo'lmadi — keyingi safar yana so'raladi */
  }
}

export function makeHelpers(me: Me, cur: number | null): Pick<Wh, "whName" | "stores" | "store" | "can" | "firmId"> {
  const all = storesOf(me);
  const store = all.find((w) => w.id === cur);
  return {
    whName: (id) => me.warehouses.find((w) => w.id === id)?.name ?? "—",
    stores: store ? [store, ...all.filter((w) => w !== store)] : all,
    store,
    can: (kind, act) => me.kinds.some((k) => k.code === kind && k.can.includes(act)),
    firmId: (code) => me.firms.find((f) => f.code === code)?.id,
  };
}

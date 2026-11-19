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
  /** Saqlash omborlari (yo'ldagi — transit — emas) */
  stores: Warehouse[];
  can: (kind: string, act: string) => boolean;
  firmId: (code: string | null | undefined) => number | undefined;
};

export const WhCtx = createContext<Wh | null>(null);

export function useWh(): Wh {
  const c = useContext(WhCtx);
  if (!c) throw new Error("WhCtx yo'q");
  return c;
}

export function makeHelpers(me: Me): Pick<Wh, "whName" | "stores" | "can" | "firmId"> {
  return {
    whName: (id) => me.warehouses.find((w) => w.id === id)?.name ?? "—",
    stores: me.warehouses.filter((w) => w.kind === "store" || w.kind === "shop" || w.kind === "production"),
    can: (kind, act) => me.kinds.some((k) => k.code === kind && k.can.includes(act)),
    firmId: (code) => me.firms.find((f) => f.code === code)?.id,
  };
}

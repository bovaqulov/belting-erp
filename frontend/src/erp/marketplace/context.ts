// Marketplace konteksti: foydalanuvchi, ruxsat, oynalar (tanlov, matn so'rovi), menyu raqamlarini yangilash.
import { createContext, useContext } from "react";

import type { Opt } from "@/erp/kit/modal";
import type { Me } from "@/erp/marketplace/lib";

export type Mk = {
  me: Me;
  admin: boolean;
  wide: boolean;
  choose: <V>(title: string, opts: Opt<V>[]) => Promise<V | null>;
  ask: (title: string, o?: { label?: string; placeholder?: string; multiline?: boolean; ok?: string; value?: string }) => Promise<string | null>;
  /** Buyurtma holati o'zgardi — menyudagi "yangi | yig'ilmoqda" raqamlari yangilansin */
  touched: () => void;
};

export const MkCtx = createContext<Mk | null>(null);

export function useMk(): Mk {
  const c = useContext(MkCtx);
  if (!c) throw new Error("MkCtx yo'q");
  return c;
}

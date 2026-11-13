// Accounting konteksti: foydalanuvchi (admin — maoshlar), kategoriyalar (tovar formasi va filtrlar), oynalar, navigatsiya.
import { createContext, useContext } from "react";

import type { Opt } from "@/erp/kit/modal";
import type { Group, Me, View } from "@/erp/finance/lib";

export type Acc = {
  me: Me;
  admin: boolean;
  wide: boolean;
  groups: Group[];
  reloadGroups: () => Promise<void>;
  ask: (title: string, o?: { label?: string; placeholder?: string; multiline?: boolean; ok?: string; value?: string }) => Promise<string | null>;
  choose: <V>(title: string, opts: Opt<V>[]) => Promise<V | null>;
  go: (v: View) => void;
};

export const AccCtx = createContext<Acc | null>(null);

export function useAcc(): Acc {
  const c = useContext(AccCtx);
  if (!c) throw new Error("AccCtx yo'q");
  return c;
}

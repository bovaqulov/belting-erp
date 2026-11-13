"use client";
// CRM umumiy konteksti: foydalanuvchi, meta (voronkalar, bosqichlar, xodimlar), tanlov oynalari, bosqich o'zgartirish.
import { createContext, useContext } from "react";

import { toast } from "@/erp/kit/env";
import type { Opt } from "@/erp/kit/modal";

import { post } from "@/erp/crm/api";
import type { Me, Meta, Stage } from "@/erp/crm/lib";

export type Crm = {
  me: Me;
  meta: Meta;
  stg: Record<string, Stage>;
  pipes: Record<string, string>;
  users: Record<number, string>;
  choose: <V>(title: string, opts: Opt<V>[]) => Promise<V | null>;
  ask: (title: string, o?: { label?: string; placeholder?: string; multiline?: boolean; ok?: string }) => Promise<string | null>;
  openDeal: (id: number) => void;
  /** joriy bo'limni (kanban/ro'yxat/lidlar) qayta yuklash */
  refresh: () => void;
};

export const CrmCtx = createContext<Crm | null>(null);

export function useCrm(): Crm {
  const c = useContext(CrmCtx);
  if (!c) throw new Error("CrmCtx yo'q");
  return c;
}

/** Bosqichga o'tkazish; "muvaffaqiyatsiz" bosqichda — rad etish sababi so'raladi. true — o'tdi. */
export async function moveTo(crm: Crm, id: number, stage: string): Promise<boolean> {
  const st = crm.stg[stage];
  if (!st) return false;
  let reason: string | null = null;
  if (st.kind === "lost") {
    reason = await crm.choose(
      `Rad etish sababi · ${st.name}`,
      crm.meta.lost_reasons.map((r) => ({ value: r, label: r })),
    );
    if (!reason) return false;
  }
  try {
    await post(`/app/api/erp/crm/deals/${id}/stage`, { stage, reason });
    toast(`→ ${st.name}`);
    return true;
  } catch (e) {
    toast((e as Error).message, "bad");
    return false;
  }
}

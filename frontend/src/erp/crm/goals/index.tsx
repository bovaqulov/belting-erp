"use client";
// Oylik reja: ROP har sotuvchiga summa belgilaydi; fakt — ERP jo'natishlari. Bajarilish sur'at bilan solishtiriladi.
import { useState } from "react";

import { toast } from "@/erp/kit/env";
import { dnum } from "@/erp/kit/fmt";
import { Loaded, useLoad } from "@/erp/kit/ui";
import { api, post } from "@/erp/crm/api";
import type { Goals as G } from "@/erp/crm/lib";

import { GoalsView } from "./ui";

export function Goals({ tick }: { tick: number }) {
  const [gm, setGm] = useState(() => new Date().toISOString().slice(0, 7));
  const st = useLoad(() => api<G>(`/app/api/erp/crm/goals?month=${gm}`), [gm, tick]);
  const save = async (tg: number, v: string) => {
    try {
      await post("/app/api/erp/crm/goals", { owner_tg: tg, month: gm + "-01", amount: dnum(v) || "0" });
      toast("Reja saqlandi");
      void st.reload();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  return (
    <div className="pane">
      <Loaded st={st}>{(g) => <GoalsView g={g} gm={gm} onGm={setGm} onSave={(tg, v) => void save(tg, v)} />}</Loaded>
    </div>
  );
}

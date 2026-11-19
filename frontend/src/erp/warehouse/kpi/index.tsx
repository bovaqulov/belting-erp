"use client";
// Ko'rsatkichlar paneli: ombor va davr (7 / 30 / 90 kun) tanlanadi, hammasi bitta so'rovda (kpi/summary).
import { useState } from "react";

import { Loaded, Seg, useLoad } from "@/erp/kit/ui";
import { api } from "@/erp/warehouse/api";
import { useWh } from "@/erp/warehouse/context";
import type { Kpi as KpiData } from "@/erp/warehouse/lib";

import { KpiView } from "./ui";

type Days = "7" | "30" | "90";
let lastDays: Days = "30";

export function Kpi() {
  const { stores, whName, choose, wide } = useWh();
  const [store, setStore] = useState(stores[0]?.id);
  const [days, setDays] = useState<Days>(lastDays);
  const st = useLoad(() => api<KpiData>(`/app/api/erp/kpi/summary?store_id=${store}&days=${days}`), [store, days]);
  return (
    <>
      <Seg<Days>
        items={[
          ["7", "7 kun"],
          ["30", "30 kun"],
          ["90", "90 kun"],
        ]}
        cur={days}
        onPick={(d) => {
          lastDays = d;
          setDays(d);
        }}
      />
      <Loaded st={st}>
        {(k) => (
          <KpiView
            wide={wide}
            k={k}
            store={whName(store)}
            onStore={async () => {
              const w = await choose("Ombor", stores.map((x) => ({ value: x.id, label: x.name })));
              if (w) setStore(w);
            }}
          />
        )}
      </Loaded>
    </>
  );
}

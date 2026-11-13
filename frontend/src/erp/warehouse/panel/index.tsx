"use client";
// Panel — bugungi holat: plitkalar (qoldiq, yig'ish navbati, sanash aniqligi, joysiz, uzoq yotgan, chiqindi), kam qolgan,
// bugungi hujjatlar, oxirgi sanashlar. Kompyuterda qo'shimcha: yig'ish navbati jadvali va bugungi ABC sanash rejasi.
import { dt } from "@/erp/kit/fmt";
import { Loaded, useLoad } from "@/erp/kit/ui";
import { api } from "@/erp/warehouse/api";
import { useWh } from "@/erp/warehouse/context";
import type { Cycle, Dashboard, PickBrief } from "@/erp/warehouse/lib";

import { PanelView } from "./ui";

export function Panel({ onPick }: { onPick: (id: number | null) => void }) {
  const { wide, stores, can, me, go, whName } = useWh();
  const wh = stores[0]?.id;
  const st = useLoad(async () => {
    const d = await api<Dashboard>("/app/api/erp/stock/dashboard");
    if (!wide) return { d, picks: [] as PickBrief[], cyc: null };
    const [picks, cyc] = await Promise.all([
      d.picks !== null && can("sale", "create") ? api<PickBrief[]>("/app/api/erp/picks").catch(() => []) : Promise.resolve([] as PickBrief[]),
      wh ? api<Cycle>(`/app/api/erp/stock/cycle?warehouse_id=${wh}`).catch(() => null) : Promise.resolve(null),
    ]);
    return { d, picks, cyc };
  }, [wide]);
  const kinds = Object.fromEntries(me.kinds.map((k) => [k.code, k.title?.uz || k.code]));
  return (
    <Loaded st={st}>
      {({ d, picks, cyc }) => (
        <PanelView
          d={d}
          wide={wide}
          picks={picks}
          cyc={cyc}
          whName={wh ? whName(wh) : ""}
          kinds={kinds}
          stamp={dt(new Date().toISOString())}
          onPicks={() => onPick(null)}
          onPick={(id) => onPick(id)}
          onCount={() => go("inv")}
        />
      )}
    </Loaded>
  );
}

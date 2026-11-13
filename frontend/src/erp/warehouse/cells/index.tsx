"use client";
// Joylar: ombor javonlari (ZONA-QATOR-QAVAT, masalan A-03-2), har birida nechta birlik; oraliq bo'yicha yaratish,
// yorliqlar PDF. Joy bosilsa — undagi birliklar (kompyuterda o'ngda, telefonda ro'yxat o'rnida).
import { useState } from "react";

import { confirm, toast } from "@/erp/kit/env";
import { useLoad } from "@/erp/kit/ui";
import { api, labelsPdf, post } from "@/erp/warehouse/api";
import { useWh } from "@/erp/warehouse/context";
import type { Cell } from "@/erp/warehouse/lib";
import { CellCard } from "@/erp/warehouse/lookup";

import { CellsView } from "./ui";

export function Cells() {
  const { wide, stores, whName, choose } = useWh();
  const [wh, setWh] = useState(stores[0]?.id);
  const [sel, setSel] = useState<Cell | null>(null);
  const [creating, setCreating] = useState(false);
  const st = useLoad(() => api<Cell[]>("/app/api/erp/cells"), []);
  const cs = (st.data ?? []).filter((c) => c.parent_id === wh);
  return (
    <CellsView
      wide={wide}
      st={st}
      cells={cs}
      wh={whName(wh)}
      sel={sel}
      creating={creating}
      detail={sel ? <CellCard key={sel.id} c={sel} /> : null}
      onWh={async () => {
        const w = await choose("Ombor", stores.map((x) => ({ value: x.id, label: x.name })));
        if (w) {
          setWh(w);
          setSel(null);
        }
      }}
      onSel={setSel}
      onCreate={() => setCreating(true)}
      onCancel={() => setCreating(false)}
      onSubmit={async (codes) => {
        try {
          const r = await post<{ id: number; code: string }[]>("/app/api/erp/cells", { parent_id: wh, codes });
          setCreating(false);
          toast(`Yaratildi: ${r.length}${r.length < codes.length ? ` (${codes.length - r.length} tasi bor edi)` : ""}`);
          await st.reload();
          if (r.length && (await confirm(`${r.length} ta joy yorlig'ini PDF qilib chop etaymi?`))) void labelsPdf({ cell_ids: r.map((x) => x.id) });
        } catch (e) {
          toast((e as Error).message, "bad");
        }
      }}
      onPdfAll={() => void labelsPdf({ cell_ids: cs.map((c) => c.id) })}
    />
  );
}

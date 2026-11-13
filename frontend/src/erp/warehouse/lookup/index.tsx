"use client";
// Ma'lumot kartochkalari (skaner natijasi, qoldiq jadvali tafsiloti, joy ro'yxati): birlik — qoldiq, joy, kim kesgan,
// undan kesilganlar, amallar (stiker, joy, kesish); tovar — qoldiq/rezerv, birliklar; joy — undagi birliklar, yorliq PDF.
import { useState } from "react";

import { toast } from "@/erp/kit/env";
import { Loaded, useLoad } from "@/erp/kit/ui";
import { api, labelsPdf, post, queueLabels } from "@/erp/warehouse/api";
import { useWh } from "@/erp/warehouse/context";
import { useCutUnit, type Cut } from "@/erp/warehouse/cut";
import type { CellUnit, ItemStock, ScanUnit } from "@/erp/warehouse/lib";

import { CellView, CutDoneView, ItemView, UnitView } from "./ui";

export type ItemRef = { item_id: number; char_id?: number | null; name: string; unit: string; dims?: unknown; char?: string | null; legacy?: string | null };
export type CellRef = { id: number; code: string; parent_id: number };

export function UnitCard({ u: first }: { u: ScanUnit }) {
  const { can, pickCell } = useWh();
  const cutUnit = useCutUnit();
  const [u, setU] = useState(first);
  const [cut, setCut] = useState<Cut | null>(null);
  const total = u.stock.reduce((a, s) => a + Number(s.qty), 0);
  if (cut) return <CutDoneView c={cut} unit={u.unit} onPdf={() => void labelsPdf({ batch_ids: cut.ids })} />;
  return (
    <UnitView
      u={u}
      total={total}
      canCut={can("cut", "post") && total > 0 && !!u.dims}
      onPrint={() => void queueLabels({ batch_ids: [u.id] })}
      onPdf={() => void labelsPdf({ batch_ids: [u.id] })}
      onLoc={async () => {
        const c = await pickCell();
        if (c === undefined) return;
        try {
          await post("/app/api/erp/units/loc", { batch_ids: [u.id], loc_id: c?.id ?? null });
          setU({ ...u, loc: c?.code ?? null, loc_id: c?.id ?? null });
          toast(c ? `Joy: ${c.code}` : "Joy olib tashlandi");
        } catch (e) {
          toast((e as Error).message, "bad");
        }
      }}
      onCut={async () => {
        try {
          const p = await cutUnit(u);
          if (p) setCut(p);
        } catch (e) {
          toast((e as Error).message, "bad");
        }
      }}
    />
  );
}

export function ItemCard({ it }: { it: ItemRef }) {
  const st = useLoad(() => api<ItemStock>(`/app/api/erp/stock?item_id=${it.item_id}${it.char_id ? `&char_id=${it.char_id}` : ""}`), [it.item_id, it.char_id]);
  return (
    <Loaded st={st}>
      {(s) => (
        <ItemView
          it={it}
          s={s}
          onUnitPrint={(id) => void queueLabels({ batch_ids: [id] })}
          onPrint={() => void queueLabels({ item_id: it.item_id, char_id: it.char_id ?? null })}
          onPdf={() => void labelsPdf({ item_id: it.item_id, char_id: it.char_id ?? null })}
        />
      )}
    </Loaded>
  );
}

export function CellCard({ c }: { c: CellRef }) {
  const { whName } = useWh();
  const st = useLoad(() => api<CellUnit[]>(`/app/api/erp/cells/${c.id}/units`), [c.id]);
  return <Loaded st={st}>{(us) => <CellView c={c} wh={whName(c.parent_id)} us={us} onPdf={() => void labelsPdf({ cell_ids: [c.id] })} />}</Loaded>;
}

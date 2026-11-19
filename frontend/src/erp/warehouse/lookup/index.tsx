"use client";
// Ma'lumot kartochkalari (skaner natijasi, qoldiq jadvali tafsiloti, joy ro'yxati): birlik — qoldiq, joy, kim kesgan,
// undan kesilganlar, amallar (stiker, joy, kesish); tovar — qoldiq/rezerv, birliklar; joy — undagi birliklar, yorliq PDF.
import { useState } from "react";

import { toast } from "@/erp/kit/env";
import { Loaded, Sh, useLoad } from "@/erp/kit/ui";
import { api, labelsPdf, post, queueLabels } from "@/erp/warehouse/api";
import { useWh } from "@/erp/warehouse/context";
import { useCutUnit, type Cut } from "@/erp/warehouse/cut";
import type { CellUnit, ItemStock, Move, ScanUnit, Trace } from "@/erp/warehouse/lib";

import { CellView, CutDoneView, ItemView, MovesView, TraceView, UnitView } from "./ui";

/** Harakatlar tarixi (jurnal): q — filtr (unit_id=… / item_id=… / loc_id=…) */
export function Moves({ q, unit, showUnit }: { q: string; unit?: string; showUnit?: boolean }) {
  const st = useLoad(() => api<Move[]>(`/app/api/erp/moves?${q}&limit=30`), [q]);
  return (
    <>
      <Sh t="Harakatlar tarixi" />
      <Loaded st={st}>{(ms) => <MovesView ms={ms} unit={unit} showUnit={showUnit} />}</Loaded>
    </>
  );
}

/** Birlik zanjiri (genealogiya): bo'sh bo'lsa — hech narsa ko'rsatilmaydi */
function TraceBox({ id }: { id: number }) {
  const st = useLoad(() => api<Trace>(`/app/api/erp/units/${id}/trace`), [id]);
  return st.data ? <TraceView t={st.data} /> : null;
}

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
    <>
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
      <TraceBox id={u.id} />
      <Moves key={`${u.loc_id ?? "-"}`} q={`unit_id=${u.id}`} unit={u.unit} />
    </>
  );
}

export function ItemCard({ it }: { it: ItemRef }) {
  const st = useLoad(() => api<ItemStock>(`/app/api/erp/stock?item_id=${it.item_id}${it.char_id ? `&char_id=${it.char_id}` : ""}`), [it.item_id, it.char_id]);
  return (
    <>
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
      <Moves q={`item_id=${it.item_id}`} unit={it.unit} showUnit />
    </>
  );
}

export function CellCard({ c }: { c: CellRef }) {
  const { whName } = useWh();
  const st = useLoad(() => api<CellUnit[]>(`/app/api/erp/cells/${c.id}/units`), [c.id]);
  return (
    <>
      <Loaded st={st}>{(us) => <CellView c={c} wh={whName(c.parent_id)} us={us} onPdf={() => void labelsPdf({ cell_ids: [c.id] })} />}</Loaded>
      <Moves q={`loc_id=${c.id}`} showUnit />
    </>
  );
}

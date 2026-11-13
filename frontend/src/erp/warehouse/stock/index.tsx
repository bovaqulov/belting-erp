"use client";
// Qoldiq: tovarlar jadvali (ombor, tur, "kam qolgan" filtri, qidiruv), jami, CSV. Tovar tanlansa — o'ngda (telefonda —
// ro'yxat o'rnida) tovar kartochkasi: birliklar, stikerlar.
import { useEffect, useState } from "react";

import { toast } from "@/erp/kit/env";
import { iso } from "@/erp/kit/fmt";
import { useLoad } from "@/erp/kit/ui";
import { openBlob } from "@/shared/api/client";
import { api } from "@/erp/warehouse/api";
import { useWh } from "@/erp/warehouse/context";
import { stockCsv, type StockRow, type StockTable } from "@/erp/warehouse/lib";
import { ItemCard } from "@/erp/warehouse/lookup";

import { StockView, type Filt } from "./ui";

export function Stock() {
  const { wide, stores } = useWh();
  const [f, setF] = useState<Filt>({ q: "", wh: "", kind: "", low: false });
  const [q, setQ] = useState(""); // qidiruv — 300 ms kechikish bilan f.q ga
  const [sel, setSel] = useState<StockRow | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setF((x) => (x.q === q.trim() ? x : { ...x, q: q.trim() })), 300);
    return () => clearTimeout(t);
  }, [q]);
  const st = useLoad(() => {
    const qs = new URLSearchParams({ ...(f.wh && { warehouse_id: f.wh }), ...(f.q && { q: f.q }), ...(f.kind && { kind: f.kind }), ...(f.low && { low: "true" }) });
    return api<StockTable>(`/app/api/erp/stock/table?${qs}`);
  }, [f.q, f.wh, f.kind, f.low]);
  return (
    <StockView
      wide={wide}
      st={st}
      f={f}
      q={q}
      stores={stores}
      sel={sel?.item_id ?? null}
      detail={sel ? <ItemCard key={sel.item_id} it={{ item_id: sel.item_id, name: sel.name, unit: sel.unit, dims: sel.dims }} /> : null}
      onQ={setQ}
      onF={(p) => setF((x) => ({ ...x, ...p }))}
      onSel={setSel}
      onCsv={() => {
        const d = st.data;
        if (!d?.rows.length) return toast("Jadval bo'sh", "bad");
        openBlob(new Blob([stockCsv(d.rows, d.see_cost)], { type: "text/csv" }), `qoldiq-${iso()}.csv`);
      }}
    />
  );
}

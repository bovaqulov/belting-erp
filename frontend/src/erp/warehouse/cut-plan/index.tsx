"use client";
// Kesish rejasi: buyurtma o'lchamlari → qaysi birlikdan qanday kesish ("avval qoldiq", eng kam chiqindi). Tovar —
// skaner (tovar, rulon QR) yoki nom bilan; o'lchamlar — "500x1200x2, 800x3000". Rejadagi birlikni bir bosishda kesish.
import { useState } from "react";

import { beep, confirm, toast } from "@/erp/kit/env";
import { api, labelsPdf, post } from "@/erp/warehouse/api";
import { useWh } from "@/erp/warehouse/context";
import { parseNeeds, type CutPlan as Plan, type CutRes, type Dims, type Doc, type ItemHit, type ScanRes } from "@/erp/warehouse/lib";
import { ScanBar, useScanner } from "@/erp/warehouse/scan-bar";

import { CutPlanView, type PlanItem } from "./ui";

export function CutPlan() {
  const { wide, stores, whName, choose, can } = useWh();
  const [it, setIt] = useState<PlanItem | null>(null);
  const [wh, setWh] = useState(stores[0]?.id);
  const [txt, setTxt] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [done, setDone] = useState<Record<number, { number: string; ids: number[] }>>({});

  const sc = useScanner(async (code) => {
    let r: ScanRes | (ItemHit & { type: "item" }) = await api<ScanRes>(`/app/api/erp/scan?code=${encodeURIComponent(code)}`);
    if (r.type === "unknown" && code.length >= 2 && !/^\d+$/.test(code)) {
      const rs = await api<ItemHit[]>(`/app/api/erp/items?q=${encodeURIComponent(code)}`);
      if (!rs.length) {
        beep(false);
        return sc.say(false, "Topilmadi", code);
      }
      const i = rs.length === 1 ? 0 : await choose("Tovar", rs.map((x, k) => ({ value: k, label: x.name, sub: x.sku ?? undefined })));
      if (i === null) return;
      r = { ...rs[i], type: "item" };
    }
    if (r.type === "choice") {
      const opts = r.options;
      const i = await choose("Bu 1C kodi ikki bazada", opts.map((o, k) => ({ value: k, label: o.name, sub: o.base })));
      if (i === null) return;
      r = { ...opts[i], sku: null, type: "item" };
    }
    if (r.type !== "item" && r.type !== "unit") {
      beep(false);
      return sc.say(false, "Tovar yoki rulon kodini skanerlang", code);
    }
    if (!r.dims) {
      beep(false);
      return sc.say(false, "Bu tovar o'lchamli emas — kesish rejasi rulon, bo'lak va rukav uchun", r.name);
    }
    setIt({ item_id: r.item_id, name: r.name, unit: r.unit, dims: r.dims as Exclude<Dims, null> });
    setPlan(null);
    setDone({});
    beep(true);
    sc.say(true, r.name);
    setTimeout(() => document.getElementById("cp-needs")?.focus(), 50);
  });

  const calc = async () => {
    if (!it) return;
    const needs = parseNeeds(txt, it.dims);
    if (!needs?.length) return toast(it.dims === "wl" ? "Masalan: 500x1200x2" : "Masalan: 300x3", "bad");
    try {
      const p = await post<Plan>("/app/api/erp/stock/cutplan", { item_id: it.item_id, warehouse_id: wh, needs });
      beep(!p.missing.length);
      setPlan(p);
      setDone({});
    } catch (e) {
      beep(false);
      sc.say(false, (e as Error).message);
    }
  };

  return (
    <CutPlanView
      wide={wide}
      bar={<ScanBar sc={sc} ph="Tovar, rulon QR yoki nomi" />}
      it={it}
      wh={whName(wh)}
      txt={txt}
      plan={plan}
      done={done}
      canCut={can("cut", "post")}
      onWh={async () => {
        const w = await choose("Ombor", stores.map((x) => ({ value: x.id, label: x.name })));
        if (w) {
          setWh(w);
          setPlan(null);
        }
      }}
      onTxt={setTxt}
      onCalc={() => void calc()}
      onPdf={() => void labelsPdf({ batch_ids: Object.values(done).flatMap((d) => d.ids) })}
      onCut={async (i) => {
        const u = plan?.units[i];
        if (!u || !it) return;
        if (!(await confirm(`${u.code} dan ${u.cuts.length} bo'lak kesilsinmi?`))) return;
        try {
          const lines = u.cuts.map((c) =>
            it.dims === "wl"
              ? { batch_id: u.batch_id, item_id: it.item_id, qty: "0", data: { width_mm: Number(c.width_mm), length_mm: Number(c.length_mm) } }
              : { batch_id: u.batch_id, item_id: it.item_id, qty: String(c.qty) },
          );
          const d = await post<Doc>("/app/api/erp/docs", { kind: "cut", firm: u.firm, header: { warehouse_id: u.warehouse_id }, lines });
          const p = await post<Doc>(`/app/api/erp/docs/${d.id}/post`, { version: d.version });
          const res = p.lines.map((l) => l.data as unknown as CutRes);
          const ids = [...new Set(res.flatMap((x) => [...x.pieces, ...(x.rests ?? [])]))];
          setDone((x) => ({ ...x, [i]: { number: p.number ?? "", ids } }));
          beep(true);
          toast(`${p.number}: ${res.reduce((a, x) => a + x.pieces.length, 0)} bo'lak, stikerlar navbatda`);
        } catch (e) {
          beep(false);
          toast((e as Error).message, "bad");
        }
      }}
    />
  );
}

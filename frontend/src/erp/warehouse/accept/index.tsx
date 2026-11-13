"use client";
// Qabul (yo'ldagi kirim → omborga): kirim tanlanadi, tovar shtrixkodi — har skanerda +1, birlik QR — butun birlik;
// miqdorni qatorni bosib tuzatish mumkin. Qisman qabul — qolgani yo'lda kutadi (kamomad yozilmaydi); to'liq — farq
// dalolatnomasi. Qabul qilingan birliklar Joylashtirish bo'limidagi "joylash navbati"ga tushadi. Holat modul darajasida.
import { useReducer, useState } from "react";

import { beep, confirm, hap, toast } from "@/erp/kit/env";
import { dnum, num } from "@/erp/kit/fmt";
import { Loaded, MainButton, useLoad } from "@/erp/kit/ui";
import { api, post } from "@/erp/warehouse/api";
import { useWh } from "@/erp/warehouse/context";
import type { AccDiff, Doc, Incoming, Posted, ScanRes } from "@/erp/warehouse/lib";
import { ScanBar, useScanner } from "@/erp/warehouse/scan-bar";

import { AccCountView, AccDoneView, AccListView, type AccResult } from "./ui";

const ACC: { rec: Incoming | null; counted: Map<string, number>; partial: boolean; to: number | undefined } = { rec: null, counted: new Map(), partial: false, to: undefined };
const key = (x: { item_id: number; char_id?: number | null }) => `${x.item_id}:${x.char_id || ""}`;

export function Accept() {
  const { stores } = useWh();
  const [, render] = useReducer((x: number) => x + 1, 0);
  const [done, setDone] = useState<AccResult | null>(null);
  if (done)
    return (
      <AccDoneView
        r={done}
        onBack={() => {
          setDone(null);
        }}
      />
    );
  if (ACC.rec)
    return (
      <Count
        rec={ACC.rec}
        onBack={() => {
          ACC.rec = null;
          render();
        }}
        onDone={(r) => {
          ACC.rec = null;
          setDone(r);
        }}
      />
    );
  return (
    <List
      onOpen={(r) => {
        Object.assign(ACC, { rec: r, counted: new Map(), partial: false, to: ACC.to ?? stores[0]?.id });
        render();
      }}
    />
  );
}

function List({ onOpen }: { onOpen: (r: Incoming) => void }) {
  const st = useLoad(() => api<Incoming[]>("/app/api/erp/purchase/incoming"), []);
  return <Loaded st={st}>{(rs) => <AccListView rs={rs} onOpen={onOpen} />}</Loaded>;
}

function Count({ rec: r, onBack, onDone }: { rec: Incoming; onBack: () => void; onDone: (x: AccResult) => void }) {
  const { wide, stores, whName, choose, ask } = useWh();
  const [, render] = useReducer((x: number) => x + 1, 0);
  const sc = useScanner(async (code) => {
    const s = await api<ScanRes>(`/app/api/erp/scan?code=${encodeURIComponent(code)}`);
    const it = (s.type === "unit" || s.type === "item") && r.items.find((x) => x.item_id === s.item_id && (x.char_id || null) === (s.char_id || null));
    if (!it || (s.type !== "unit" && s.type !== "item")) {
      beep(false);
      return sc.say(false, "Bu tovar shu kirimda yo'q", "name" in s ? s.name : code);
    }
    const inc = s.type === "unit" ? Number(s.stock[0]?.qty || 1) : 1;
    ACC.counted.set(key(it), (ACC.counted.get(key(it)) ?? 0) + inc);
    beep(true);
    render();
    sc.say(true, it.name, `keldi ${num(ACC.counted.get(key(it)), 3)} / ${num(it.qty, 3)}`);
  });
  const finish = async () => {
    const short = r.items.some((x) => (ACC.counted.get(key(x)) ?? 0) < Number(x.qty));
    if (short && !ACC.partial && !(await confirm("Kamomad bor — farq dalolatnomasi va ta'minotchiga da'vo yoziladi. Davom etaymi?"))) return;
    if (!ACC.to) return toast("Omborni tanlang", "bad");
    try {
      const lines = [...ACC.counted.entries()]
        .filter(([, q]) => q > 0)
        .map(([k, q]) => {
          const [i, c] = k.split(":");
          return { item_id: Number(i), char_id: c ? Number(c) : null, batch_id: null, qty: String(q) };
        });
      const d = await post<Doc>("/app/api/erp/docs", { kind: "acceptance", firm: r.firm, header: { warehouse_id: r.warehouse_id, warehouse_to: ACC.to, base_id: r.id, data: { final: !ACC.partial } }, lines });
      const p = await post<Posted>(`/app/api/erp/docs/${d.id}/post`, { version: d.version });
      const diff = ((p.data.result ?? []) as AccDiff[]).filter((x) => Number(x.diff) !== 0);
      beep(!diff.length);
      onDone({ number: p.number ?? "", diff: diff.map((x) => ({ ...x, name: r.items.find((i) => i.item_id === x.item_id)?.name ?? `#${x.item_id}` })) });
    } catch (e) {
      beep(false);
      sc.say(false, (e as Error).message);
    }
  };
  return (
    <>
      <AccCountView
        wide={wide}
        r={r}
        bar={<ScanBar sc={sc} ph="Tovar kodini skanerlang" />}
        to={whName(ACC.to)}
        partial={ACC.partial}
        counted={(x) => ACC.counted.get(key(x)) ?? 0}
        onTo={async () => {
          const w = await choose("Qayerga", stores.map((x) => ({ value: x.id, label: x.name })));
          if (w) {
            ACC.to = w;
            render();
          }
        }}
        onPartial={(v) => {
          ACC.partial = v;
          hap.tap();
          render();
        }}
        onBack={onBack}
        onLine={async (x) => {
          const v = await ask("Kelgan miqdor", { label: x.name, value: String(ACC.counted.get(key(x)) ?? 0) });
          if (v === null) return;
          ACC.counted.set(key(x), Number(dnum(v)) || 0);
          render();
        }}
      />
      <MainButton text="Qabulni yakunlash" onClick={finish} />
    </>
  );
}

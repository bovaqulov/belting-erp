"use client";
// /app/erp/logistics — Logistika: jo'natmalarni qo'lda yuritish (EMU, Yandex Go, Bito, Fargo). Tashuvchi API'lari
// (narx, avtomatik kuzatuv) — kalitlar berilgach. API: /app/api/erp/logistics/* (docs/api/logistics.md).
import { useDeferredValue, useState } from "react";

import { api, post, toast } from "@/erp/kit/env";
import { Loaded, MainButton, Shell, useLoad } from "@/erp/kit/ui";

import { check, EMPTY, errText, filterQs, toForm, STATUS, type Filter, type Form, type Shipment, type ShipmentList, type StatusKey } from "./logistics.lib";
import { FormSheet, ListView, ShipmentSheet, Top } from "./ui";

const U = "/app/api/erp/logistics/shipments";

export default function LogisticsApp() {
  return (
    <Shell title="Logistika" bare>
      <Main />
    </Shell>
  );
}

function Main() {
  const [filter, setFilter] = useState<Filter>("active");
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q.trim());
  const st = useLoad(() => api<ShipmentList>(`${U}?${[filterQs(filter), dq && `q=${encodeURIComponent(dq)}`].filter(Boolean).join("&")}`), [filter, dq]);
  const [cur, setCur] = useState<Shipment | null>(null);
  const [form, setForm] = useState<{ id: number | null; f: Form } | null>(null);

  const open = async (x: Shipment) => {
    try {
      setCur(await api<Shipment>(`${U}/${x.id}`));
    } catch (e) {
      toast(errText(e), "bad");
    }
  };
  const setStatus = async (s: StatusKey) => {
    if (!cur) return;
    try {
      setCur(await post<Shipment>(`${U}/${cur.id}/status`, { status: s }));
      toast(STATUS[s].title);
      void st.reload();
    } catch (e) {
      toast(errText(e), "bad");
    }
  };
  const save = async (): Promise<boolean> => {
    if (!form) return false;
    const bad = check(form.f);
    if (bad) {
      toast(bad, "bad");
      return false;
    }
    try {
      const r = await post<Shipment>(form.id ? `${U}/${form.id}` : U, form.f);
      toast(form.id ? "Saqlandi" : `${r.number} yaratildi`);
      if (form.id) setCur(r);
      void st.reload();
      return true;
    } catch (e) {
      toast(errText(e), "bad");
      return false;
    }
  };

  return (
    <div className="mx-auto max-w-[720px] pb-[calc(96px+var(--safe-b))]">
      <Top />
      <Loaded st={st}>{(d) => <ListView d={d} filter={filter} q={q} onFilter={setFilter} onQ={setQ} onOpen={(x) => void open(x)} />}</Loaded>
      {cur ? (
        <ShipmentSheet
          key={cur.id}
          x={cur}
          onClose={() => setCur(null)}
          onEdit={() => setForm({ id: cur.id, f: toForm(cur) })}
          onStatus={(s) => void setStatus(s)}
        />
      ) : null}
      {form ? (
        <FormSheet
          title={form.id ? "Jo'natmani tahrirlash" : "Yangi jo'natma"}
          f={form.f}
          set={(p) => setForm((o) => (o ? { ...o, f: { ...o.f, ...p } } : o))}
          onSave={save}
          onClose={() => setForm(null)}
        />
      ) : null}
      {!cur && !form ? <MainButton text="Yangi jo'natma" onClick={() => setForm({ id: null, f: EMPTY })} /> : null}
    </div>
  );
}

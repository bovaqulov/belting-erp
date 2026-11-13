"use client";
// Yangi bitim: mijozni qidirib tanlash (250ms kechikish; topilmasa — tasdiqdan so'ng yangi mijoz yaratiladi), nom, summa,
// mas'ul, manba, ehtiyoj.
import { useEffect, useRef, useState } from "react";

import { confirm, toast } from "@/erp/kit/env";
import { dnum } from "@/erp/kit/fmt";
import { api, post } from "@/erp/crm/api";
import { useCrm } from "@/erp/crm/context";
import type { Customer } from "@/erp/crm/lib";

import { NewDealView, type DealForm } from "./ui";

export function NewDeal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const crm = useCrm();
  const [cq, setCq] = useState("");
  const [cp, setCp] = useState<Customer | null>(null);
  const [hits, setHits] = useState<{ q: string; rs: Customer[] } | null>(null);
  const [v, setV] = useState<DealForm>({ title: "", amount: "", owner: String(crm.me.tg_id), source: "manual", need: "" });
  const titleRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  useEffect(() => {
    const q = cq.trim();
    if (cp || q.length < 2) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const rs = await api<Customer[]>(`/app/api/erp/crm/customers?q=${encodeURIComponent(q)}`).catch(() => [] as Customer[]);
      if (id === seq.current) setHits({ q, rs: Array.isArray(rs) ? rs : [] });
    }, 250);
    return () => clearTimeout(t);
  }, [cq, cp]);
  const shown = !cp && cq.trim().length >= 2 && hits?.q === cq.trim() ? hits.rs : null;
  const set = (k: keyof DealForm) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  return (
    <NewDealView
      cq={cq}
      cp={cp}
      shown={shown}
      v={v}
      titleRef={titleRef}
      userList={crm.meta.users}
      users={crm.users}
      set={set}
      onCq={(x) => {
        setCq(x);
        setCp(null);
      }}
      onPick={(c) => {
        setCp(c);
        setCq(c.name);
        titleRef.current?.focus();
      }}
      onClose={onClose}
      onOk={async () => {
        let c = cp;
        if (!c) {
          const name = cq.trim();
          if (!name) {
            toast("Mijozni tanlang yoki yangi nom yozing", "bad");
            return false;
          }
          if (!(await confirm(`«${name}» yangi mijoz sifatida qo'shilsinmi?`))) return false;
          c = await post<Customer>("/app/api/erp/crm/customers", { name, phones: [], owner_tg: Number(v.owner) });
        }
        const d = await post<{ id: number }>("/app/api/erp/crm/deals", {
          counterparty_id: c.id,
          title: v.title.trim() || c.name,
          amount: dnum(v.amount) || 0,
          need: v.need.trim() || null,
          owner_tg: Number(v.owner),
          source: v.source,
        });
        toast("Bitim yaratildi");
        onCreated(d.id);
      }}
    />
  );
}

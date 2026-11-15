"use client";
// Yangi bitim: mijozni qidirib tanlash (250ms kechikish; topilmasa — tasdiqdan so'ng yangi mijoz yaratiladi), nom, summa,
// mas'ul, manba, ehtiyoj. Telegram: o'z chatlaridan tanlash mumkin (yoki chat oynasidan "Bitim ochish") — biriktirilgan
// mijozi bo'lsa o'sha, bo'lmasa chat nomi bilan yangi mijoz; chat yaratilgan bitim mijoziga biriktiriladi (tg_chat_id).
import { useEffect, useRef, useState } from "react";

import { confirm, toast } from "@/erp/kit/env";
import { dnum } from "@/erp/kit/fmt";
import { api, post } from "@/erp/crm/api";
import { useCrm } from "@/erp/crm/context";
import { qs, type Customer } from "@/erp/crm/lib";
import { TG, type TgChat, type TgChats } from "@/erp/crm/telegram/tg.lib";

import { NewDealView, type DealForm } from "./ui";

const asCustomer = (c: TgChat): Customer | null => (c.customer ? { id: c.customer.id, name: c.customer.name } : null);

export function NewDeal({
  tg = null,
  customer = null,
  onClose,
  onCreated,
}: {
  tg?: TgChat | null;
  /** mijoz kartochkasidan — shu mijoz tanlangan holda */
  customer?: Customer | null;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const crm = useCrm();
  const [chat, setChat] = useState<TgChat | null>(tg);
  const [cq, setCq] = useState(customer?.name ?? (tg ? (tg.customer?.name ?? tg.title) : ""));
  const [cp, setCp] = useState<Customer | null>(customer ?? (tg ? asCustomer(tg) : null));
  // o'z Telegram chatlari (mijoz maydoni taklifi uchun; bir marta)
  const [chats, setChats] = useState<TgChat[]>([]);
  useEffect(() => {
    api<TgChats>(`${TG}/chats?${qs({})}`)
      .then((r) => setChats(Array.isArray(r.chats) ? r.chats : []))
      .catch(() => {});
  }, []);
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
  const ql = cq.trim().toLowerCase().replace(/^@/, "");
  const tgHits = chat || cp ? [] : chats.filter((c) => !ql || c.title.toLowerCase().includes(ql) || (c.username ?? "").toLowerCase().includes(ql)).slice(0, 6);
  const set = (k: keyof DealForm) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  return (
    <NewDealView
      cq={cq}
      cp={cp}
      shown={shown}
      v={v}
      titleRef={titleRef}
      userList={crm.me.is_head ? crm.meta.users : crm.meta.users.filter((u) => u.tg_id === crm.me.tg_id)}
      users={crm.users}
      set={set}
      tgChat={chat}
      tgHits={tgHits}
      onPickTg={(c) => {
        setChat(c);
        setCp(asCustomer(c));
        setCq(c.customer?.name ?? c.title);
        titleRef.current?.focus();
      }}
      onClearTg={() => setChat(null)}
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
          if (!chat && !(await confirm(`«${name}» yangi mijoz sifatida qo'shilsinmi?`))) return false;
          c = await post<Customer>("/app/api/erp/crm/customers", { name, phones: [], owner_tg: Number(v.owner) });
        }
        const d = await post<{ id: number }>("/app/api/erp/crm/deals", {
          counterparty_id: c.id,
          title: v.title.trim() || c.name,
          amount: dnum(v.amount) || 0,
          need: v.need.trim() || null,
          owner_tg: Number(v.owner),
          source: chat && v.source === "manual" ? "telegram" : v.source,
          tg_chat_id: chat?.id,
        });
        toast("Bitim yaratildi");
        onCreated(d.id);
      }}
    />
  );
}

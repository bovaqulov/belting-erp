"use client";
// Yangi bitim: mijoz — faqat ro'yxatdan tanlash (qidiruv 250ms kechikish bilan); ro'yxatda yo'q bo'lsa — yonidagi «+ Yangi»
// bilan shu oynada yaratiladi (nom, telefon, STIR, manzil) va darhol tanlanadi. Tovarlar — ko'p tanlov; bo'lsa summa
// ulardan (chegirma → ustama → + logistika), aks holda qo'lda. Joylashuv — standart mijoz manzili. Mas'ul — yaratgan xodim,
// manba — qo'lda / chat kanali. Chatdan ochilsa: chat mijozi bo'lsa — o'sha, bo'lmasa yangi mijoz formasi chat nomi bilan
// ochiladi; chat yaratilgan bitim mijoziga biriktiriladi (tg_chat_id).
import { useEffect, useRef, useState } from "react";

import { toast } from "@/erp/kit/env";
import { dnum, num } from "@/erp/kit/fmt";
import { api, post } from "@/erp/crm/api";
import { useCrm } from "@/erp/crm/context";
import { itemKey } from "@/erp/crm/deal/items/search";
import { qs, type Customer, type DealItem } from "@/erp/crm/lib";
import { TG, type TgChat, type TgChats } from "@/erp/crm/telegram/tg.lib";

import { emptyCust, NewDealView, type DealForm, type NdRow, type NewCust } from "./ui";

const asCustomer = (c: TgChat): Customer | null => (c.customer ? { id: c.customer.id, name: c.customer.name } : null);
const SOURCE = { tg: "telegram", wa: "whatsapp", ig: "instagram" } as const;

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
  const tgCust = tg ? asCustomer(tg) : null;
  const [cq, setCq] = useState(customer?.name ?? tgCust?.name ?? "");
  const [cp, setCp] = useState<Customer | null>(customer ?? tgCust);
  // chatdan, mijoz biriktirilmagan — yangi mijoz formasi chat nomi bilan ochiq
  const [nc, setNc] = useState<NewCust | null>(tg && !tgCust ? emptyCust(tg.title, "person") : null);
  const [ncBusy, setNcBusy] = useState(false);
  // o'z chatlari (mijoz maydoni taklifi uchun; bir marta)
  const [chats, setChats] = useState<TgChat[]>([]);
  useEffect(() => {
    api<TgChats>(`${TG}/chats?${qs({})}`)
      .then((r) => setChats(Array.isArray(r.chats) ? r.chats : []))
      .catch(() => {});
  }, []);
  const [hits, setHits] = useState<{ q: string; rs: Customer[] } | null>(null);
  const [v, setV] = useState<DealForm>({ amount: "", discount: "", markup: "", logistics: "", location: customer?.address ?? "" });
  const [rows, setRows] = useState<NdRow[]>([]);
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
  // chat takliflari — faqat yozilganda (bo'sh maydonda ro'yxat formani cho'zmasin)
  const tgHits = chat || cp || !ql ? [] : chats.filter((c) => c.title.toLowerCase().includes(ql) || (c.username ?? "").toLowerCase().includes(ql)).slice(0, 4);
  const set = (k: keyof DealForm) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  const pick = (c: Customer) => {
    setCp(c);
    setCq(c.name);
    // joylashuv — mijoz manzili (qo'lda yozilmagan bo'lsa)
    setV((s) => ({ ...s, location: s.location.trim() ? s.location : (c.address ?? "") }));
    setTimeout(() => document.getElementById("nd-i")?.focus(), 0); // keyingi qadam — tovar
  };

  return (
    <NewDealView
      cq={cq}
      cp={cp}
      shown={shown}
      v={v}
      users={crm.users}
      set={set}
      onPrice={(f, x) => setV((s) => ({ ...s, [f]: x }))}
      rows={rows}
      onAddRow={(r: DealItem) => setRows((xs) => [...xs, { ...r, qty: num(r.qty, 3) || "1", price: num(r.price, 0) }])}
      onRemoveKey={(k) => setRows((xs) => xs.filter((r) => itemKey(r) !== k))}
      onEditRow={(i, f, x) => setRows((xs) => xs.map((r, j) => (j === i ? { ...r, [f]: x } : r)))}
      onRemoveRow={(i) => setRows((xs) => xs.filter((_, j) => j !== i))}
      nc={nc}
      ncBusy={ncBusy}
      onNc={(k, x) => setNc((s) => (s ? { ...s, [k]: x } : s))}
      onNcOpen={() => setNc(emptyCust(cq.trim()))}
      onNcClose={() => setNc(null)}
      onNcSave={async () => {
        if (!nc?.name.trim()) return;
        setNcBusy(true);
        try {
          const emp = nc.kind === "employee";
          const c = await post<Customer>("/app/api/erp/crm/customers", {
            kind: nc.kind,
            name: nc.name.trim(),
            phones: nc.phone.trim() ? [nc.phone] : [],
            inn: emp ? "" : nc.inn.trim(),
            address: nc.address.trim(),
            position: emp ? nc.position.trim() : "",
            company: emp ? nc.company.trim() : "",
            company_inn: emp ? nc.company_inn.trim() : "",
            owner_tg: crm.me.tg_id,
          });
          toast(`Mijoz qo'shildi: ${c.name}`);
          setNc(null);
          pick(c);
        } catch (e) {
          toast((e as Error).message, "bad");
        } finally {
          setNcBusy(false);
        }
      }}
      tgChat={chat}
      tgHits={tgHits}
      onPickTg={(c) => {
        setChat(c);
        const own = asCustomer(c);
        if (own) pick(own);
        else setNc(emptyCust(c.title, "person"));
      }}
      onClearTg={() => setChat(null)}
      onCq={(x) => {
        setCq(x);
        setCp(null);
      }}
      onPick={pick}
      onClearCp={() => {
        setCp(null);
        setCq("");
      }}
      onClose={onClose}
      onOk={async () => {
        if (!cp) {
          toast(nc ? "Avval «Mijozni qo'shish» ni bosing" : "Mijozni ro'yxatdan tanlang yoki «+ Yangi» bilan qo'shing", "bad");
          return false;
        }
        const d = await post<{ id: number }>("/app/api/erp/crm/deals", {
          counterparty_id: cp.id,
          amount: dnum(v.amount) || 0,
          items: rows.map((r) => ({
            item_id: r.item_id,
            char_id: r.char_id,
            name: r.name,
            unit: r.unit,
            qty: dnum(r.qty),
            price: dnum(r.price),
            discount: 0,
          })),
          discount: dnum(v.discount) || 0,
          markup: dnum(v.markup) || 0,
          logistics: dnum(v.logistics) || 0,
          location: v.location.trim(),
          source: chat ? SOURCE[chat.channel ?? "tg"] : "manual",
          tg_chat_id: chat?.id,
        });
        toast("Bitim yaratildi");
        onCreated(d.id);
      }}
    />
  );
}

"use client";
// Mijozlar: jadval (qidiruv 300ms kechikish, saralash — eslab qolinadi) va kartochka paneli (?customer=): maydonni
// saqlash, kontakt shaxslar (o'zgarganda — butun ro'yxat), bitimlar, «Yangi bitim» (shu mijoz bilan).
import { useEffect, useRef, useState } from "react";

import { toast } from "@/erp/kit/env";
import { useLoad } from "@/erp/kit/ui";
import { api, post } from "@/erp/crm/api";
import { useCrm } from "@/erp/crm/context";
import { custKind, ls, qs, type Contact, type CustKind, type CustomerCard, type CustomersResp } from "@/erp/crm/lib";
import { DrawerFrame, DrawerLoading } from "@/erp/crm/deal";

import { CustomerCardView, CustomersView } from "./ui";

const C = "/app/api/erp/crm/customers";

export function Customers({ tick }: { tick: number }) {
  const crm = useCrm();
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [sort, setSort] = useState(() => ls<string>("csort") || "next");
  useEffect(() => {
    const t = setTimeout(() => setQd(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const st = useLoad(() => api<CustomersResp>(`${C}/table?${qs({ q: qd, sort })}`), [qd, sort, tick]);
  return (
    <CustomersView
      st={st}
      q={q}
      sort={sort}
      users={crm.users}
      onQ={setQ}
      onSort={(v) => {
        setSort(v);
        ls("csort", v);
      }}
      onOpen={crm.openCustomer}
    />
  );
}

export function CustomerPanel({ id, tick, onClose }: { id: number; tick: number; onClose: () => void }) {
  const crm = useCrm();
  const st = useLoad(() => api<CustomerCard>(`${C}/${id}`), [id, tick]);
  const [on, setOn] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const r = requestAnimationFrame(() => setOn(true));
    const prev = document.activeElement as HTMLElement | null;
    return () => {
      cancelAnimationFrame(r);
      prev?.focus?.();
    };
  }, []);
  // kontaktlar — mahalliy tahrir (har harfda saqlamaslik uchun), yuklanganda serverdagisi
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  // turni o'zgartirish: yangi tur majburiy maydon talab qilsa (xodim — firma, savdogar — telefon) — avval maydon
  // to'ldiriladi, tur u bilan birga saqlanadi
  const [pk, setPk] = useState<CustKind | null>(null);
  const [seen, setSeen] = useState(st.at);
  if (st.at !== seen) {
    setSeen(st.at);
    setContacts(null);
    setPk(null);
  }
  const c = st.data;

  const save = async (field: string, value: unknown) => {
    const withKind = pk && (field === "company" || field === "phones") ? { kind: pk } : {};
    try {
      await post(`${C}/${id}`, { ...withKind, [field]: value });
      toast("Saqlandi");
      void st.reload();
      crm.refresh();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  return (
    <DrawerFrame on={on} title={c?.name ?? "Mijoz"} panelRef={panel} onClose={onClose}>
      {!c ? (
        <DrawerLoading err={st.err} onRetry={() => void st.reload()} onClose={onClose} />
      ) : (
        <CustomerCardView
          c={c}
          users={crm.meta.users}
          isHead={!!crm.me.is_head}
          stg={crm.stg}
          pipelines={crm.meta.pipelines}
          contacts={contacts ?? c.contacts}
          onSave={(f, v) => void save(f, v)}
          pendingKind={pk}
          onAskPosition={() => crm.ask("Lavozim", { label: "Lavozim nomi", placeholder: "Masalan: Bosh texnolog", ok: "Saqlash" })}
          onKind={(k) => {
            const need = custKind(k);
            if ((need.employee && !c.company) || (need.phoneRequired && !c.phones?.length)) setPk(k);
            else {
              setPk(null);
              void save("kind", k);
            }
          }}
          onContacts={(list, persist) => {
            setContacts(list);
            if (persist && JSON.stringify(list) !== JSON.stringify(c.contacts)) void save("contacts", list);
          }}
          onOpenDeal={crm.openDeal}
          onNewDeal={() => crm.newDeal({ customer: { id: c.id, name: c.name } })}
          onClose={onClose}
        />
      )}
    </DrawerFrame>
  );
}

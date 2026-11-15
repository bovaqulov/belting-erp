"use client";
// Mijozlar: jadval (qidiruv 300ms kechikish, saralash — eslab qolinadi) va kartochka paneli (?customer=): maydonni
// saqlash, kontakt shaxslar (o'zgarganda — butun ro'yxat), bitimlar, «Yangi bitim» (shu mijoz bilan).
import { useEffect, useRef, useState } from "react";

import { toast } from "@/erp/kit/env";
import { useLoad } from "@/erp/kit/ui";
import { api, post } from "@/erp/crm/api";
import { useCrm } from "@/erp/crm/context";
import { ls, qs, type Contact, type CustomerCard, type CustomersResp } from "@/erp/crm/lib";
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
  const [seen, setSeen] = useState(st.at);
  if (st.at !== seen) {
    setSeen(st.at);
    setContacts(null);
  }
  const c = st.data;

  const save = async (field: string, value: unknown) => {
    try {
      await post(`${C}/${id}`, { [field]: value });
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

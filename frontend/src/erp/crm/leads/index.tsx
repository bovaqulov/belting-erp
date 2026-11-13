"use client";
// Lidlar: ROP qo'lda taqsimlaydi; sotuvchi — bitimga aylantiradi yoki "yaroqsiz" deb yopadi. Javob kutish vaqti ko'rinadi.
// Qidiruv 350ms kechikish bilan; ochiq lidlar ro'yxatidan taqsimlanmaganlar soni bo'lim belgisiga beriladi.
import { useEffect, useRef, useState } from "react";

import { toast } from "@/erp/kit/env";
import { useLoad } from "@/erp/kit/ui";
import { api, post } from "@/erp/crm/api";
import { useCrm } from "@/erp/crm/context";
import { JUNK_REASONS, qs, type Lead } from "@/erp/crm/lib";

import { LeadsView, NewLeadView, type LeadForm } from "./ui";

export function Leads({ tick, onUnassigned }: { tick: number; onUnassigned: (n: number) => void }) {
  const crm = useCrm();
  const [stf, setStf] = useState("new,work");
  const [owner, setOwner] = useState("");
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [add, setAdd] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setQd(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);
  const st = useLoad(() => api<Lead[]>(`/app/api/erp/crm/leads?${qs({ status: stf, owner, q: qd })}`), [stf, owner, qd, tick]);
  const un = useRef(onUnassigned);
  useEffect(() => {
    un.current = onUnassigned;
  });
  useEffect(() => {
    if (st.data && stf === "new,work" && !owner && !qd) un.current(st.data.filter((l) => !l.owner_tg).length);
  }, [st.data, stf, owner, qd]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      void st.reload();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  return (
    <LeadsView
      st={st}
      q={q}
      stf={stf}
      owner={owner}
      sellers={crm.meta.users}
      users={crm.users}
      isHead={!!crm.me.is_head}
      onQ={setQ}
      onStf={setStf}
      onOwner={setOwner}
      onAdd={() => setAdd(true)}
      onAssign={(l, tg) =>
        void act(async () => {
          await post(`/app/api/erp/crm/leads/${l.id}/assign`, { owner_tg: tg });
          toast(`→ ${crm.users[tg] || ""}`);
        })
      }
      onOpenDeal={crm.openDeal}
      onConvert={(l) =>
        void act(async () => {
          const d = await post<{ id: number }>(`/app/api/erp/crm/leads/${l.id}/convert`, {});
          toast("Bitim ochildi");
          crm.openDeal(d.id);
        })
      }
      onJunk={async (l) => {
        const reason = await crm.choose("Nega yaroqsiz?", JUNK_REASONS.map((x) => ({ value: x, label: x })));
        if (reason) void act(() => post(`/app/api/erp/crm/leads/${l.id}/junk`, { reason }));
      }}
    >
      {add ? <NewLead onClose={() => setAdd(false)} onDone={() => void st.reload()} /> : null}
    </LeadsView>
  );
}

function NewLead({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { me } = useCrm();
  const [v, setV] = useState<LeadForm>({ name: "", phone: "", company: "", source: "call", note: "" });
  const set = (k: keyof LeadForm) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <NewLeadView
      v={v}
      set={set}
      onClose={onClose}
      onOk={async () => {
        const r = await post<{ duplicate?: boolean }>("/app/api/erp/crm/leads", {
          name: v.name.trim() || null,
          phone: v.phone.trim() || null,
          company: v.company.trim() || null,
          source: v.source,
          note: v.note.trim() || null,
          owner_tg: me.is_head ? null : me.tg_id,
        });
        toast(r.duplicate ? "Bu telefon bilan ochiq lid bor — izoh qo'shildi" : "Lid qo'shildi");
        onDone();
      }}
    />
  );
}

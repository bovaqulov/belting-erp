"use client";
// Lidlar: ROP qo'lda taqsimlaydi; sotuvchi — bitimga aylantiradi yoki "yaroqsiz" deb yopadi. Javob kutish vaqti ko'rinadi.
// Qidiruv 350ms kechikish bilan; ochiq lidlar ro'yxatidan taqsimlanmaganlar soni bo'lim belgisiga beriladi.
import { useEffect, useRef, useState } from "react";

import { toast } from "@/erp/kit/env";
import { useLoad } from "@/erp/kit/ui";
import { api, post } from "@/erp/crm/api";
import { useCrm } from "@/erp/crm/context";
import { JUNK_REASONS, qs, type Lead } from "@/erp/crm/lib";

import { TgButton, TgPanel } from "@/erp/crm/telegram";

import { LeadsView, NewLeadView, OPEN, RoutingView, type LeadForm, type Rule } from "./ui";

export function Leads({ tick, onUnassigned }: { tick: number; onUnassigned: (n: number) => void }) {
  const crm = useCrm();
  const [stf, setStf] = useState(OPEN);
  // Telegram paneli (xl+ da doim; kichik ekranda — tugma / lid «Chat»)
  const [tgOpen, setTgOpen] = useState(false);
  const [tgUnread, setTgUnread] = useState(0);
  const [focus, setFocus] = useState<{ chat: number; n: number } | null>(null);
  const [owner, setOwner] = useState("");
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [add, setAdd] = useState(false);
  const [routing, setRouting] = useState(false);
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
    if (st.data && stf === OPEN && !owner && !qd) un.current(st.data.filter((l) => !l.owner_tg).length);
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
    <div className="flex min-h-0 flex-1 [&>div:first-child]:min-w-0">
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
      onMove={(l, status) => void act(() => post(`/app/api/erp/crm/leads/${l.id}/status`, { status }))}
      onEdit={(l, field, value) => void act(() => post(`/app/api/erp/crm/leads/${l.id}/edit`, { [field]: value }))}
      onNoAnswer={(l) =>
        void act(async () => {
          const r = await post<{ status: string; next_call_at: string | null }>(`/app/api/erp/crm/leads/${l.id}/noanswer`, {});
          toast(r.status === "junk" ? "3 marta javob bermadi — lid yopildi" : "Qayta qo'ng'iroq rejalashtirildi");
        })
      }
      onChat={(chat) => {
        setFocus((f) => ({ chat, n: (f?.n ?? 0) + 1 }));
        setTgOpen(true);
      }}
      tgButton={<TgButton unread={tgUnread} onClick={() => setTgOpen(true)} />}
      onRouting={() => setRouting(true)}
    >
      {add ? <NewLead onClose={() => setAdd(false)} onDone={() => void st.reload()} /> : null}
      {routing ? <Routing onClose={() => setRouting(false)} /> : null}
    </LeadsView>
    <TgPanel open={tgOpen} tick={tick} focus={focus} onClose={() => setTgOpen(false)} onUnread={setTgUnread} />
    </div>
  );
}

function NewLead({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { me } = useCrm();
  const crm = useCrm();
  const [v, setV] = useState<LeadForm>({ name: "", phone: "", company: "", inn: "", region: "", product: "", size: "", qty: "", source: "call", note: "" });
  const set = (k: keyof LeadForm) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <NewLeadView
      v={v}
      set={set}
      onClose={onClose}
      onOk={async () => {
        const r = await post<{ duplicate?: boolean; routed?: string; deal_id?: number; existing?: boolean }>("/app/api/erp/crm/leads", {
          ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim() || null])),
          source: v.source,
          owner_tg: me.is_head ? null : me.tg_id,
        });
        if (r.routed === "deal" && r.deal_id) {
          // doimiy mijoz — lid emas, o'z menejeriga bitim
          toast(r.existing ? "Doimiy mijoz — ochiq bitimiga izoh qo'shildi" : "Doimiy mijoz — bitim ochildi");
          crm.openDeal(r.deal_id);
        } else toast(r.duplicate ? "Bu telefon / STIR bilan ochiq lid bor — izoh qo'shildi" : "Lid qo'shildi");
        onDone();
      }}
    />
  );
}

function Routing({ onClose }: { onClose: () => void }) {
  const crm = useCrm();
  const [rules, setRules] = useState<Rule[] | null>(null);
  // bir marta yuklanadi (onClose har renderda yangi — tahrirlar o'chib ketmasin)
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    api<{ rules: Rule[] }>("/app/api/erp/crm/routing")
      .then((r) => setRules(r.rules))
      .catch((e: Error) => {
        toast(e.message, "bad");
        close.current();
      });
  }, []);
  if (!rules) return null;
  return (
    <RoutingView
      rules={rules}
      sellers={crm.meta.users}
      onChange={setRules}
      onClose={onClose}
      onOk={async () => {
        await post("/app/api/erp/crm/routing", { rules: rules.filter((r) => r.keywords.trim() || r.seller_tg) });
        toast("Qoidalar saqlandi");
      }}
    />
  );
}

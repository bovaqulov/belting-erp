"use client";
// CRM (erp_crm.html dan ko'chirilgan): bitimlar (kanban / ro'yxat, Smart View, ommaviy amallar), bitim paneli
// (bosqichlar, tovarlar → taklif/buyurtma, tarix, vazifalar), lidlar (ROP taqsimlaydi), oylik reja.
// Ildiz: ishga tushish (rejim: haqiqiy/demo, foydalanuvchi, meta), bo'limlar (?tab=), bitim paneli (?deal=), Esc.
// API: /app/api/erp/me, /app/api/erp/crm/* (Jarvis kontrakti) — api/ orqali; backend bo'lmasa demo/.
import { useCallback, useEffect, useMemo, useState } from "react";

import { confirm } from "@/erp/kit/env";
import { useDialogs } from "@/erp/kit/modal";
import { Shell, useLoad } from "@/erp/kit/ui";
import { api, crmMode, demoReset } from "@/erp/crm/api";
import { CrmCtx, type Crm } from "@/erp/crm/context";
import { Deal } from "@/erp/crm/deal";
import { Deals } from "@/erp/crm/deals";
import { Goals } from "@/erp/crm/goals";
import { Leads } from "@/erp/crm/leads";
import { qs, type Me, type Meta, type Sec } from "@/erp/crm/lib";
import { NewDeal } from "@/erp/crm/new-deal";

import { BootView, CrmLayout } from "./ui";

import { MAIN } from "@/erp/crm/tw";

export default function CrmApp() {
  return (
    <Shell title="CRM" bare>
      <Boot />
    </Shell>
  );
}

function Boot() {
  const st = useLoad(async () => {
    const mode = await crmMode();
    const [me, meta] = await Promise.all([api<Me>("/app/api/erp/me"), api<Meta>("/app/api/erp/crm/meta")]);
    const m: Meta = {
      pipelines: meta.pipelines ?? [],
      stages: meta.stages ?? [],
      users: [...(meta.users ?? [])],
      lost_reasons: meta.lost_reasons ?? [],
    };
    if (!m.users.some((u) => u.tg_id === me.tg_id)) m.users.unshift({ tg_id: me.tg_id, name: me.name || "Men" });
    return { me, meta: m, demo: mode === "demo" };
  }, []);
  if (st.data) return <CrmMain me={st.data.me} meta={st.data.meta} demo={st.data.demo} />;
  return <BootView err={st.err} net={st.net} onRetry={() => void st.reload()} />;
}

const url = (p: Record<string, string | number | null>) => {
  const s = qs(p);
  history.replaceState(null, "", s ? `?${s}` : location.pathname);
};

function CrmMain({ me, meta, demo }: { me: Me; meta: Meta; demo: boolean }) {
  const lookups = useMemo(
    () => ({
      stg: Object.fromEntries(meta.stages.map((s) => [s.code, s])),
      pipes: Object.fromEntries(meta.pipelines.map((p) => [p.code, p.name])),
      users: Object.fromEntries(meta.users.map((u) => [u.tg_id, u.name])) as Record<number, string>,
    }),
    [meta],
  );
  const [sec, setSec] = useState<Sec>(() => {
    const t = new URLSearchParams(location.search).get("tab") ?? "";
    return t === "leads" || t === "goals" ? t : "deals";
  });
  const [dealId, setDealId] = useState<number | null>(() => Number(new URLSearchParams(location.search).get("deal")) || null);
  const [newOpen, setNewOpen] = useState(false);
  const [created, setCreated] = useState(0);
  const [unassigned, setUnassigned] = useState(0);
  const [tick, setTick] = useState(0);
  const dialogs = useDialogs();

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const openDeal = useCallback(
    (id: number) => {
      setDealId(id);
      url({ tab: sec === "deals" ? null : sec, deal: id });
    },
    [sec],
  );
  const closeDeal = useCallback(() => {
    setDealId(null);
    url({ tab: sec === "deals" ? null : sec, deal: null });
  }, [sec]);

  const crm: Crm = useMemo(
    () => ({ me, meta, ...lookups, choose: dialogs.choose, ask: dialogs.ask, openDeal, refresh }),
    [me, meta, lookups, dialogs.choose, dialogs.ask, openDeal, refresh],
  );

  // ROP: taqsimlanmagan lidlar soni (bo'lim belgisi)
  useEffect(() => {
    if (!me.is_head) return;
    api<unknown[]>("/app/api/erp/crm/leads?owner=none")
      .then((x) => setUnassigned(Array.isArray(x) ? x.length : 0))
      .catch(() => {});
  }, [me.is_head]);

  // Esc — bitim panelini yopish (oyna ochiq bo'lmasa)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dealId && !document.querySelector(".mdl")) closeDeal();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [dealId, closeDeal]);

  const goSec = (s: Sec) => {
    setSec(s);
    url({ tab: s === "deals" ? null : s, deal: dealId });
  };

  return (
    <CrmCtx.Provider value={crm}>
      <CrmLayout
        demo={demo}
        sec={sec}
        unassigned={unassigned}
        onSec={goSec}
        onNewDeal={() => setNewOpen(true)}
        onDemoReset={async () => {
          if (!(await confirm("Demo ma'lumotlari boshlang'ich holatga qaytarilsinmi? Siz kiritgan o'zgarishlar o'chadi."))) return;
          demoReset();
          location.replace(location.pathname);
        }}
      >
        {sec === "leads" ? (
          <main className={MAIN}>
            <Leads tick={tick} onUnassigned={setUnassigned} />
          </main>
        ) : sec === "goals" ? (
          <main className={MAIN}>
            <Goals tick={tick} />
          </main>
        ) : (
          <Deals tick={tick} paused={!!dealId || newOpen} created={created} />
        )}
        {dealId ? <Deal key={dealId} id={dealId} onClose={closeDeal} /> : null}
        {newOpen ? (
          <NewDeal
            onClose={() => setNewOpen(false)}
            onCreated={(id) => {
              setCreated((c) => c + 1);
              refresh();
              openDeal(id);
            }}
          />
        ) : null}
        {dialogs.node}
      </CrmLayout>
    </CrmCtx.Provider>
  );
}

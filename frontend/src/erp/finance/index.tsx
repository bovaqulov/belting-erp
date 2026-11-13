"use client";
// Accounting (/app/erp/moliya) — 3 ta alohida qism: Mahsulotlar (katalog: tovarlar, kategoriyalar), Shartnomalar,
// Maoshlar (oylik hisob, xodimlar). Ochilganda — 3 kartochka (hub). Ildiz: ishga tushish (rejim, foydalanuvchi,
// kategoriyalar), ko'rinish (?a=&sec=). API: /app/api/erp/{cat,contracts,counterparties,firms,payroll}/* — api/ orqali;
// backend bo'lmasa demo/.
import { useCallback, useEffect, useMemo, useState } from "react";

import { confirm } from "@/erp/kit/env";
import { DemoStrip } from "@/erp/kit/layout";
import { useDialogs } from "@/erp/kit/modal";
import { Shell, useLoad } from "@/erp/kit/ui";
import { useWide } from "@/erp/kit/wide";
import { accMode, api, demoReset } from "@/erp/finance/api";
import { AccCtx, type Acc } from "@/erp/finance/context";
import { Contracts } from "@/erp/finance/contracts";
import { Groups } from "@/erp/finance/groups";
import { Hub } from "@/erp/finance/hub";
import {
  parseView,
  viewQs,
  viewTitle,
  type Group,
  type Me,
  type View,
} from "@/erp/finance/lib";
import { Month, Staff } from "@/erp/finance/payroll";
import { Products } from "@/erp/finance/products";

import { AccLayout, BootView } from "./ui";

import "./finance.css";

export default function AccountingApp() {
  return (
    <Shell title="Accounting" bare>
      <Boot />
    </Shell>
  );
}

function Boot() {
  const st = useLoad(async () => {
    const mode = await accMode();
    const [me, groups] = await Promise.all([
      api<Me>("/app/api/erp/me"),
      api<Group[]>("/app/api/erp/cat/groups"),
    ]);
    return { me, groups, demo: mode === "demo" };
  }, []);
  if (st.data)
    return <Main me={st.data.me} first={st.data.groups} demo={st.data.demo} />;
  return (
    <BootView err={st.err} net={st.net} onRetry={() => void st.reload()} />
  );
}

function Main({ me, first, demo }: { me: Me; first: Group[]; demo: boolean }) {
  const wide = useWide();
  const dialogs = useDialogs();
  const [view, setView] = useState<View>(() => parseView(location.search));
  const [groups, setGroups] = useState(first);
  const admin = (me.roles ?? []).some((r) => r === "admin" || r === "owner");

  const go = useCallback((v: View) => {
    setView(v);
    history.replaceState(null, "", viewQs(v) || location.pathname);
    window.scrollTo(0, 0);
  }, []);
  const reloadGroups = useCallback(
    async () => setGroups(await api<Group[]>("/app/api/erp/cat/groups")),
    [],
  );

  useEffect(() => {
    document.title = view.hub
      ? "Accounting"
      : `${viewTitle(view)} — Accounting`;
  }, [view]);

  const acc: Acc = useMemo(
    () => ({
      me,
      admin,
      wide,
      groups,
      reloadGroups,
      ask: dialogs.ask,
      choose: dialogs.choose,
      go,
    }),
    [me, admin, wide, groups, reloadGroups, dialogs.ask, dialogs.choose, go],
  );

  const reset = async () => {
    if (
      !(await confirm(
        "Demo ma'lumotlari boshlang'ich holatga qaytarilsinmi? Siz kiritgan o'zgarishlar o'chadi.",
      ))
    )
      return;
    demoReset();
    location.replace(location.pathname);
  };

  if (view.hub)
    return (
      <AccCtx.Provider value={acc}>
        <Hub
          demo={
            demo ? (
              <DemoStrip
                text="namunaviy ma'lumot, faqat shu brauzerda"
                onReset={() => void reset()}
              />
            ) : null
          }
        />
        {dialogs.node}
      </AccCtx.Provider>
    );

  const body =
    view.sec === "items" ? (
      <Products />
    ) : view.sec === "groups" ? (
      <Groups />
    ) : view.sec === "contracts" ? (
      <Contracts />
    ) : view.sec === "month" ? (
      <Month />
    ) : (
      <Staff />
    );

  return (
    <AccCtx.Provider value={acc}>
      <AccLayout
        view={view}
        wide={wide}
        demo={demo}
        onGo={go}
        onDemoReset={() => void reset()}
      >
        {body}
      </AccLayout>
      {dialogs.node}
    </AccCtx.Provider>
  );
}

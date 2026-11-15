"use client";
// Marketplace (erp_mp.html dan ko'chirilmoqda): WB, Ozon, Uzum, remen.uz — har kanal o'z bo'limi (buyurtmalar, tovarlar,
// narx, qoldiq, sharhlar). Ildiz: ishga tushish (rejim: haqiqiy/demo, foydalanuvchi), ko'rinish (?ch=&sec=), menyu raqamlari.
// API: /app/api/erp/mk/* (Jarvis kontrakti) — api/ orqali; backend bo'lmasa demo/.
import { useCallback, useEffect, useMemo, useState } from "react";

import { confirm } from "@/erp/kit/env";
import { useDialogs } from "@/erp/kit/modal";
import { Shell, useLoad } from "@/erp/kit/ui";
import { api, demoReset, mkMode, P } from "@/erp/marketplace/api";
import { MkCtx, type Mk } from "@/erp/marketplace/context";
import { parseView, viewQs, viewTitle, type Counts, type Me, type View } from "@/erp/marketplace/lib";
import { Orders } from "@/erp/marketplace/orders";
import { Overview } from "@/erp/marketplace/overview";
import { Soon } from "@/erp/marketplace/soon";
import { useWide } from "@/erp/kit/wide";

import { BootView, MkLayout } from "./ui";
import { usePoll } from "@/erp/marketplace/orders/sync";


export default function MarketplaceApp() {
  return (
    <Shell title="Marketplace" bare>
      <Boot />
    </Shell>
  );
}

function Boot() {
  const st = useLoad(async () => {
    const mode = await mkMode();
    const me = await api<Me>("/app/api/erp/me");
    return { me, demo: mode === "demo" };
  }, []);
  if (st.data) return <Main me={st.data.me} demo={st.data.demo} />;
  return <BootView err={st.err} net={st.net} onRetry={() => void st.reload()} />;
}

function Main({ me, demo }: { me: Me; demo: boolean }) {
  const wide = useWide();
  const dialogs = useDialogs();
  const [view, setView] = useState<View>(() => parseView(location.search));
  const [counts, setCounts] = useState<Counts | null>(null);
  const [tick, setTick] = useState(0);

  const touched = useCallback(() => setTick((t) => t + 1), []);
  usePoll(touched); // menyu raqamlari ham fonda yangilansin
  useEffect(() => {
    api<Counts>(`${P}/orders-counts`)
      .then(setCounts)
      .catch(() => {}); // menyu raqamlarisiz ham ishlaydi
  }, [tick]);

  const go = useCallback((v: View) => {
    setView(v);
    history.replaceState(null, "", viewQs(v) || location.pathname);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    document.title = view.home ? "Marketplace" : `${viewTitle(view)} — Marketplace`;
  }, [view]);

  const mk: Mk = useMemo(
    () => ({ me, admin: (me.roles ?? []).includes("admin"), wide, choose: dialogs.choose, ask: dialogs.ask, touched }),
    [me, wide, dialogs.choose, dialogs.ask, touched],
  );

  return (
    <MkCtx.Provider value={mk}>
      <MkLayout
        view={view}
        wide={wide}
        counts={counts}
        demo={demo}
        onGo={go}
        onDemoReset={async () => {
          if (!(await confirm("Demo ma'lumotlari boshlang'ich holatga qaytarilsinmi? Siz kiritgan o'zgarishlar o'chadi."))) return;
          demoReset();
          location.replace(location.pathname);
        }}
      >
        {view.home ? (
          <Overview onGo={go} />
        ) : view.sec === "orders" && view.ch !== "site" ? (
          <Orders key={view.ch} ch={view.ch} />
        ) : (
          <Soon key={`${view.ch}:${view.sec}`} view={view} />
        )}
      </MkLayout>
      {dialogs.node}
    </MkCtx.Provider>
  );
}

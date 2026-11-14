"use client";
// Ombor (/app/erp/ombor, erp_ombor.html dan): joylashtirish, sanash, qabul, ko'chirish, hisobdan chiqarish, joylar. Kompyuterda — chap menyu va ikki ustun, telefonda / Telegram'da — tablar,
// katta skaner xabari, pastki asosiy tugma. Ildiz: ishga tushish (rejim: haqiqiy/demo, foydalanuvchi), ko'rinish (?sec=).
// API: /app/api/erp/* (Jarvis kontrakti, docs/api/warehouse.md) — api/ orqali; backend bo'lmasa demo/.
import { useCallback, useEffect, useMemo, useState } from "react";

import { confirm, toast } from "@/erp/kit/env";
import { useDialogs } from "@/erp/kit/modal";
import { Shell, useLoad } from "@/erp/kit/ui";
import { useWide } from "@/erp/kit/wide";
import { Accept } from "@/erp/warehouse/accept";
import { api, demoReset, whMode } from "@/erp/warehouse/api";
import { Bag } from "@/erp/warehouse/bag";
import { Cells } from "@/erp/warehouse/cells";
import { makeHelpers, WhCtx, type Wh } from "@/erp/warehouse/context";
import { Count } from "@/erp/warehouse/count";
import { DEMO_CODES } from "@/erp/warehouse/demo";
import { deskView, HOME, parseView, viewQs, viewTitle, type Cell, type Me, type Sec, type View } from "@/erp/warehouse/lib";
import { More } from "@/erp/warehouse/more";
import { Place } from "@/erp/warehouse/place";
import { useSizeAsk } from "@/erp/warehouse/size-ask";

import { BootView, WhLayout } from "./ui";


export default function WarehouseApp() {
  return (
    <Shell title="Ombor" bare>
      <Boot />
    </Shell>
  );
}

function Boot() {
  const st = useLoad(async () => {
    const mode = await whMode();
    const me = await api<Me>("/app/api/erp/me");
    return { me, demo: mode === "demo" };
  }, []);
  if (st.data) return <Main me={st.data.me} demo={st.data.demo} />;
  return <BootView err={st.err} net={st.net} onRetry={() => void st.reload()} />;
}

function Main({ me, demo }: { me: Me; demo: boolean }) {
  const wide = useWide();
  const dialogs = useDialogs();
  const size = useSizeAsk();
  const [view, setView] = useState<View>(() => parseView(location.search));
  const helpers = useMemo(() => makeHelpers(me), [me]);
  const shown: View = wide ? deskView(view) : view;

  const go = useCallback((v: View) => {
    setView(v);
    history.replaceState(null, "", viewQs(v) || location.pathname);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    document.title = shown === HOME ? "Ombor" : `${viewTitle(shown)} — Ombor`;
  }, [shown]);

  const { choose } = dialogs;
  const pickCell = useCallback(
    async (parent?: number): Promise<Cell | null | undefined> => {
      const all = await api<Cell[]>("/app/api/erp/cells").catch(() => [] as Cell[]);
      const cs = all.filter((c) => !parent || c.parent_id === parent);
      if (!cs.length) {
        toast("Joylar yaratilmagan — Joylar bo'limida yarating", "bad");
        return undefined;
      }
      const v = await choose<number>("Joy", [{ value: 0, label: "Joysiz" }, ...cs.map((c) => ({ value: c.id, label: c.code, sub: `${c.warehouse} · ${c.units} birlik` }))]);
      if (v === null) return undefined;
      return v === 0 ? null : (cs.find((c) => c.id === v) ?? undefined);
    },
    [choose],
  );

  const wh: Wh = useMemo(
    () => ({ me, wide, demo, choose: dialogs.choose, ask: dialogs.ask, askSize: size.askSize, pickCell, go, ...helpers }),
    [me, wide, demo, dialogs.choose, dialogs.ask, size.askSize, pickCell, go, helpers],
  );

  const section = (v: View) => {
    switch (v) {
      case "place":
        return <Place />;
      case "inv":
        return <Count />;
      case "acc":
        return <Accept />;
      case "move":
        return <Bag mode="move" />;
      case "off":
        return <Bag mode="off" />;
      case "cells":
        return <Cells />;
      default:
        return <More onGo={(s: Sec) => go(s)} />;
    }
  };

  return (
    <WhCtx.Provider value={wh}>
      <WhLayout
        view={shown}
        wide={wide}
        demo={demo}
        demoText={wide ? `namunaviy ma'lumot, faqat shu brauzerda. Sinov kodlari: ${DEMO_CODES}` : "namunaviy ma'lumot"}
        onGo={go}
        onDemoReset={async () => {
          if (!(await confirm("Demo ma'lumotlari boshlang'ich holatga qaytarilsinmi? Siz kiritgan o'zgarishlar o'chadi."))) return;
          demoReset();
          location.replace(location.pathname);
        }}
      >
        <div key={shown}>{section(shown)}</div>
      </WhLayout>
      {dialogs.node}
      {size.node}
    </WhCtx.Provider>
  );
}

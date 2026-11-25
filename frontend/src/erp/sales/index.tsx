"use client";
// /app/erp/savdo — Savdo hujjatlari (1C «Управление компанией» uslubida): tezkor amallar, hujjatlar jurnali, hujjat
// formasi (buyurtma, hisob, yuk xati, schyot-faktura, to'lov; «asosida yaratish»), mijozlar qarzi. Holat URL'da
// (?v=docs&g=orders&doc=12). API: /app/api/erp/sales/* (docs/api/sales.md). Yangi hujjat — birinchi saqlashda raqam oladi.
import { useCallback, useEffect, useState } from "react";

import { api } from "@/erp/kit/env";
import { AppLayout, AppTop, type NavGroup } from "@/erp/kit/layout";
import { Loaded, Seg, Shell, useLoad } from "@/erp/kit/ui";
import { useWide } from "@/erp/kit/wide";

import { Debts } from "./debts";
import { DocView } from "./doc";
import { Home } from "./home";
import { Journal } from "./journal";
import { HOME, parseView, viewQs, type Kind, type Refs, type View } from "./lib";

type Tab = View["v"];
const TABS: [Tab, string, string][] = [
  ["home", "Tezkor amallar", "layout-grid"],
  ["docs", "Hujjatlar", "file-text"],
  ["debts", "Mijozlar qarzi", "wallet"],
];

export default function SalesApp() {
  return (
    <Shell title="Savdo" bare>
      <Boot />
    </Shell>
  );
}

function Boot() {
  const st = useLoad(() => api<Refs>("/app/api/erp/sales/refs"), []);
  return <Loaded st={st}>{(refs) => <Main refs={refs} />}</Loaded>;
}

function Main({ refs }: { refs: Refs }) {
  const wide = useWide();
  const [view, setView] = useState<View>(() => parseView(location.search));
  const [fresh, setFresh] = useState<{ kind: Kind } | null>(null);
  const go = useCallback((v: View) => {
    setFresh(null);
    setView(v);
    history.replaceState(null, "", viewQs(v) || location.pathname);
    window.scrollTo(0, 0);
  }, []);
  const create = useCallback((kind: Kind) => {
    setFresh({ kind });
    setView((v) => ({ ...v, doc: null }));
    window.scrollTo(0, 0);
  }, []);
  const openDoc = useCallback((id: number) => go({ ...view, v: view.v === "home" ? "docs" : view.v, doc: id }), [go, view]);
  const close = useCallback(() => go({ ...view, doc: null }), [go, view]);

  useEffect(() => {
    document.title = fresh || view.doc ? "Hujjat — Savdo" : `${TABS.find(([k]) => k === view.v)?.[1] ?? "Savdo"} — Savdo`;
  }, [view, fresh]);

  const nav: NavGroup[] = [
    {
      items: TABS.map(([k, label, icon]) => ({
        key: k,
        label,
        icon,
        on: view.v === k && !view.doc && !fresh,
        onClick: () => go({ ...HOME, v: k }),
      })),
    },
  ];
  const top = (
    <>
      <AppTop up="/app/erp" upLabel="ERP" title="Savdo" logo />
      {!view.doc && !fresh ? <Seg<Tab> items={TABS.map(([k, l]) => [k, l])} cur={view.v} onPick={(k) => go({ ...HOME, v: k })} /> : null}
    </>
  );
  const title = fresh ? "Yangi hujjat" : view.doc ? "Hujjat" : (TABS.find(([k]) => k === view.v)?.[1] ?? "Savdo");
  return (
    <AppLayout brand="Savdo" up="/app/erp" upLabel="ERP" wide={wide} nav={nav} title={title} top={top}>
      {fresh || view.doc ? (
        <DocView
          key={fresh ? `new-${fresh.kind}` : view.doc}
          id={view.doc}
          kind={fresh?.kind ?? null}
          refs={refs}
          wide={wide}
          onOpen={(id) => {
            setFresh(null);
            openDoc(id);
          }}
          onClose={close}
        />
      ) : view.v === "home" ? (
        <Home onCreate={create} onGo={(g) => go({ ...HOME, v: "docs", groups: g })} onDebts={() => go({ ...HOME, v: "debts" })} />
      ) : view.v === "docs" ? (
        <Journal view={view} wide={wide} onView={go} onOpen={openDoc} onCreate={create} />
      ) : (
        <Debts wide={wide} onCustomer={(c) => go({ ...HOME, v: "docs", customer: c })} />
      )}
    </AppLayout>
  );
}

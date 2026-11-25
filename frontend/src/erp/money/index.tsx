"use client";
// /app/erp/pul — Pul (1C «Деньги»): bank va kassa (qoldiqlar), hujjatlar (kirim / chiqim / o'tkazish), pul oqimi,
// sozlamalar (hisoblar, moddalar). Holat URL'da (?t=docs&acc=3&doc=7). API: /app/api/erp/money/* (docs/api/money.md).
import { useCallback, useEffect, useState } from "react";

import { api } from "@/erp/kit/env";
import { AppLayout, AppTop, type NavGroup } from "@/erp/kit/layout";
import { Loaded, Seg, Shell, useLoad } from "@/erp/kit/ui";
import { useWide } from "@/erp/kit/wide";

import { Accounts } from "./accounts";
import { DocView } from "./doc";
import { Flow } from "./flow";
import { Journal } from "./journal";
import { parseView, TABS, viewQs, type Kind, type Refs, type Tab, type View } from "./lib";
import { Settings } from "./settings";

export default function MoneyApp() {
  return (
    <Shell title="Pul" bare>
      <Boot />
    </Shell>
  );
}

function Boot() {
  const st = useLoad(() => api<Refs>("/app/api/erp/money/refs"), []);
  return <Loaded st={st}>{(refs) => <Main refs={refs} />}</Loaded>;
}

function Main({ refs }: { refs: Refs }) {
  const wide = useWide();
  const [view, setView] = useState<View>(() => parseView(location.search));
  const [fresh, setFresh] = useState<Kind | null>(null);
  const go = useCallback((v: View) => {
    setFresh(null);
    setView(v);
    history.replaceState(null, "", viewQs(v) || location.pathname);
    window.scrollTo(0, 0);
  }, []);
  const title = fresh || view.doc ? "Hujjat" : (TABS.find(([k]) => k === view.tab)?.[1] ?? "Pul");
  useEffect(() => {
    document.title = `${title} — Pul`;
  }, [title]);
  const nav: NavGroup[] = [{ items: TABS.map(([k, label, icon]) => ({ key: k, label, icon, on: view.tab === k && !view.doc && !fresh, onClick: () => go({ tab: k, doc: null, account: null }) })) }];
  const top = (
    <>
      <AppTop up="/app/erp" upLabel="ERP" title="Pul" logo />
      {!view.doc && !fresh ? <Seg<Tab> items={TABS.map(([k, l]) => [k, l])} cur={view.tab} onPick={(k) => go({ tab: k, doc: null, account: null })} /> : null}
    </>
  );
  return (
    <AppLayout brand="Pul" up="/app/erp" upLabel="ERP" wide={wide} nav={nav} title={title} top={top}>
      {fresh || view.doc ? (
        <DocView
          key={fresh ? `new-${fresh}` : view.doc}
          id={view.doc}
          kind={fresh}
          refs={refs}
          wide={wide}
          onOpen={(id) => go({ ...view, tab: "docs", doc: id })}
          onClose={() => go({ ...view, doc: null })}
        />
      ) : view.tab === "accounts" ? (
        <Accounts refs={refs} onAccount={(id) => go({ tab: "docs", doc: null, account: id })} onSettings={() => go({ tab: "settings", doc: null, account: null })} />
      ) : view.tab === "docs" ? (
        <Journal
          wide={wide}
          account={view.account}
          onClearAccount={() => go({ ...view, account: null })}
          onOpen={(id) => go({ ...view, doc: id })}
          onCreate={(k) => {
            setFresh(k);
            window.scrollTo(0, 0);
          }}
        />
      ) : view.tab === "flow" ? (
        <Flow wide={wide} />
      ) : (
        <Settings refs={refs} />
      )}
    </AppLayout>
  );
}

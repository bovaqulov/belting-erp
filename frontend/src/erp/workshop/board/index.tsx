"use client";
// Sex taxtasi: yuklash, har 20 soniyada yangilanish (tanlov yoki oyna ochiq bo'lsa — yo'q), soat (15 s), bir nechta
// zakazni tanlash (bitta ustundan), birga qabul / yig'ish / tayyor.
import { useEffect, useRef, useState } from "react";

import { api, beep, hap, post, toast } from "@/erp/kit/env";
import { hhmm } from "@/erp/kit/fmt";
import { Loaded, useLoad, type Nav } from "@/erp/kit/ui";
import { readyMany } from "@/erp/workshop/api";
import type { Board as B, Job, Phase, View } from "@/erp/workshop/lib";

import { BoardScreen } from "./ui";

export function Board({ nav, setTitle }: { nav: Nav<View>; setTitle: (t: string) => void }) {
  const st = useLoad(() => api<B>("/app/api/erp/shop/board"), []);
  const [tab, setTab] = useState<Phase>("new");
  const [selm, setSelm] = useState(false);
  const [selp, setSelp] = useState<Phase | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [clock, setClock] = useState(hhmm());
  const busy = useRef(false);
  useEffect(() => {
    busy.current = sel.size > 0;
  }, [sel]);
  useEffect(() => setTitle("Sex"), [setTitle]);

  // taxta har 20 soniyada yangilanadi (tanlov yoki oyna ochiq bo'lsa — yo'q); soat har 15 soniyada
  const reload = st.reload;
  useEffect(() => {
    const a = setInterval(() => setClock(hhmm()), 15000);
    const b = setInterval(() => {
      if (
        !busy.current &&
        !document.querySelector(".sheet") &&
        !document.hidden
      )
        void reload();
    }, 20000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [reload]);

  const off = () => {
    setSelm(false);
    setSelp(null);
    setSel(new Set());
  };
  const pick = (j: Job) => {
    if (j.phase === "ready") return;
    hap.tap();
    const n = new Set(selp && selp !== j.phase ? [] : sel); // boshqa ustundan tanlansa — tanlov yangidan
    if (n.has(j.id)) n.delete(j.id);
    else n.add(j.id);
    setSel(n);
    setSelp(n.size ? j.phase : null);
  };
  const selAll = (p: Phase, jobs: Job[]) => {
    setSelp(p);
    setSel(new Set(jobs.map((j) => j.id)));
  };
  const open = (j: Job) =>
    selm && j.phase !== "ready" ? pick(j) : nav.go({ k: "job", id: j.id });

  return (
    <Loaded st={st}>
      {(b) => (
        <BoardScreen
          b={b}
          err={st.err}
          at={st.at}
          clock={clock}
          selm={selm}
          sel={sel}
          selp={selp}
          tab={tab}
          onTab={setTab}
          onSelm={() => setSelm(true)}
          onOff={off}
          onSelAll={selAll}
          onOpen={open}
          onAccept={async (ids) => {
            try {
              const r = await post<{ done: number[]; skipped: number[] }>("/app/api/erp/shop/group/accept", { ids });
              beep(true);
              toast(`${r.done.length} ta qabul qilindi${r.skipped.length ? ` · ${r.skipped.length} tasi boshqa ishchida` : ""}`);
              off();
              if (r.done.length) {
                setTab("collecting");
                nav.go({ k: "grp", ids: r.done });
              } else void reload();
            } catch (e) {
              beep(false);
              toast((e as Error).message, "bad");
            }
          }}
          onCollect={(ids) => {
            off();
            nav.go({ k: "grp", ids });
          }}
          onReady={async (ids) => {
            if (await readyMany(ids)) {
              off();
              void reload();
            }
          }}
        />
      )}
    </Loaded>
  );
}

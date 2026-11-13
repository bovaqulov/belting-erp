"use client";
// Bitimlar bo'limi: voronka, kanban/ro'yxat (eslab qolinadi), qidiruv (300ms kechikish, "/" — fokus), filtrlar,
// Smart View, 300+ kun tegilmagan banneri; ostida kanban yoki ro'yxat.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLoad } from "@/erp/kit/ui";
import { api } from "@/erp/crm/api";
import { useCrm } from "@/erp/crm/context";
import { applyQuery, DEF, flt, ls, qs, snapshot, SYSV, type Query, type View } from "@/erp/crm/lib";
import { ViewBar } from "@/erp/crm/views";

import { Board } from "./board";
import { DealList } from "./list";
import { DealsToolbar, IdleBanner } from "./ui";

export function Deals({
  tick,
  paused,
  created,
}: {
  tick: number;
  /** bitim paneli yoki yangi bitim oynasi ochiq — kanban fon yangilanishi to'xtaydi */
  paused: boolean;
  /** yangi bitim ochilganda oshadi: kanbanda boshqa voronka tanlangan bo'lsa — asosiyga qaytiladi */
  created: number;
}) {
  const crm = useCrm();
  const { me, meta } = crm;
  const [view, setView] = useState<"board" | "list">(() => (ls<string>("view") === "list" ? "list" : "board"));
  const [pipe, setPipe] = useState(() => {
    const p = ls<string>("pipe") || "main";
    return crm.pipes[p] ? p : "main";
  });
  const [f, setFState] = useState<Query>(() => ({ ...DEF, owner: ls<string>("owner") || "" }));
  const [q, setQ] = useState("");
  const [vid, setVid] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [sum, setSum] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const qRef = useRef<HTMLInputElement>(null);

  // yangi bitim — asosiy voronkada; kanbanda boshqasi tanlangan bo'lsa ko'rinmay qolmasin
  // (oldingi qiymat bilan render paytida solishtiriladi — effektsiz, React tavsiyasi)
  const [seen, setSeen] = useState(created);
  if (created !== seen) {
    setSeen(created);
    if (view === "board" && pipe !== "main") setPipe("main");
  }

  // qidiruv — 300ms kechikish bilan filtrga
  useEffect(() => {
    const t = setTimeout(() => {
      const v = q.trim();
      setFState((s) => (s.q === v ? s : { ...s, q: v }));
      if (v) setVid(null);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // "/" — qidiruvga fokus (matn maydonida emas)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? "";
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        e.preventDefault();
        qRef.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);

  const views = useLoad(() => api<View[]>("/app/api/erp/crm/views").catch(() => [] as View[]), []);
  const tags = useLoad(() => api<string[]>("/app/api/erp/crm/tags").catch(() => [] as string[]), []);
  // 300+ kun tegilmagan ochiq bitimlar (egasi qarori, 2026-11-12)
  const showBanner = !f.idle;
  const banner = useLoad(
    () =>
      showBanner
        ? api<{ total: number }>(`/app/api/erp/crm/deals?${qs({ idle: 300, limit: 1, owner: me.is_head ? "" : me.tg_id })}`).catch(() => ({ total: 0 }))
        : Promise.resolve({ total: 0 }),
    [showBanner, tick],
  );

  const setF = useCallback((p: Partial<Query>) => {
    setFState((s) => ({ ...s, ...p }));
    setVid(null);
  }, []);
  const applyView = (v: View) => {
    const r = applyQuery({ view, pipe }, v.query || {});
    setFState(r.f);
    setQ(r.f.q);
    setView(r.view);
    setPipe(r.pipe);
    setVid(String(v.id));
    ls("view", r.view);
  };
  const fp = useMemo(() => flt(f, me.tg_id), [f, me.tg_id]);
  const onLoaded = useCallback((c: Record<string, number>, s: string) => {
    setCounts(c);
    setSum(s);
  }, []);

  return (
    <>
      <DealsToolbar
        meta={meta}
        pipe={pipe}
        view={view}
        counts={counts}
        q={q}
        qRef={qRef}
        f={f}
        tags={tags.data ?? []}
        sum={sum}
        filtersOpen={filtersOpen}
        nFilters={[f.owner, f.source, f.overdue, f.tag].filter(Boolean).length}
        viewBar={<ViewBar views={views.data ?? []} vid={vid} onApply={applyView} onReload={() => void views.reload()} snapshot={() => snapshot(f, view, pipe)} />}
        onPipe={(code) => {
          setPipe(code);
          if (code) ls("pipe", code);
          setF({ stage: "" });
        }}
        onQ={setQ}
        onFilters={() => setFiltersOpen((o) => !o)}
        onOwner={(v) => {
          setF({ owner: v });
          ls("owner", v);
        }}
        setF={setF}
        onView={(v) => {
          setView(v);
          ls("view", v);
          if (v === "board" && !pipe) setPipe("main");
        }}
        onRefresh={crm.refresh}
      />
      {showBanner && banner.data?.total ? <IdleBanner total={banner.data.total} onReview={() => applyView(SYSV.find((v) => v.id === "s-old")!)} /> : null}
      <main className="cmain">
        {view === "board" ? (
          <Board pipe={pipe || "main"} fp={fp} tick={tick} paused={paused} onLoaded={onLoaded} />
        ) : (
          <DealList pipe={pipe} fp={fp} f={f} setF={setF} tick={tick} tags={tags.data ?? []} onLoaded={onLoaded} onTags={() => void tags.reload()} />
        )}
      </main>
    </>
  );
}

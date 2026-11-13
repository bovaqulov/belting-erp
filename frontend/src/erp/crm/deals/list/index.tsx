"use client";
// Bitimlar ro'yxati: yuklash va sahifalash, saralash, ustunlarni tanlash (eslab qolinadi), CSV eksport,
// belgilab ommaviy amallar (bosqich, mas'ul, vazifa, teg, yopilish sanasi). Telefonda jadval kartochkaga aylanadi.
import { useEffect, useRef, useState } from "react";

import { toast } from "@/erp/kit/env";
import { d8, iso, short } from "@/erp/kit/fmt";
import { isNetErr } from "@/erp/kit/ui";
import { api, post } from "@/erp/crm/api";
import { useCrm } from "@/erp/crm/context";
import { ls, qs, SRC, toCsv, tomorrow10, type Deal, type DealsResp, type Query } from "@/erp/crm/lib";

import { BulkFormView, COLDEF, ColsModal, DealListView, type BulkAction } from "./ui";

type Rows = { key: string; rows: Deal[]; total: number; err: string; net?: boolean };

export function DealList({
  pipe,
  fp,
  f,
  setF,
  tick,
  tags,
  onLoaded,
  onTags,
}: {
  pipe: string;
  fp: Record<string, unknown>;
  f: Query;
  setF: (p: Partial<Query>) => void;
  tick: number;
  tags: string[];
  onLoaded: (counts: Record<string, number>, sum: string) => void;
  onTags: () => void;
}) {
  const crm = useCrm();
  const base = { pipeline: pipe, stage: f.stage, kind: f.kind, sort: f.sort, ...fp };
  const key = JSON.stringify(base) + "|" + tick;
  const [st, setSt] = useState<Rows>({ key: "", rows: [], total: 0, err: "" });
  const [more, setMore] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [hide, setHide] = useState<Set<string>>(() => new Set(ls<string[]>("cols_hidden") ?? ["prob", "close", "created"]));
  const [colsOpen, setColsOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState<BulkAction | null>(null);
  const loaded = useRef(onLoaded);
  useEffect(() => {
    loaded.current = onLoaded;
  });

  const baseRef = useRef(base);
  useEffect(() => {
    baseRef.current = base;
  });
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const r = await api<DealsResp>(`/app/api/erp/crm/deals?${qs({ ...baseRef.current, offset: 0, limit: 50 })}`);
        if (off) return;
        setSt({ key, rows: r.rows, total: r.total, err: "" });
        setSel(new Set());
        loaded.current(r.counts, `${r.total} bitim · ${short(r.amount)} so'm`);
      } catch (e) {
        if (!off) setSt({ key, rows: [], total: 0, err: (e as Error).message, net: isNetErr(e) });
      }
    })();
    return () => {
      off = true;
    };
  }, [key]);

  const loadMore = async () => {
    setMore(true);
    try {
      const r = await api<DealsResp>(`/app/api/erp/crm/deals?${qs({ ...base, offset: st.rows.length, limit: 50 })}`);
      setSt((s) => ({ ...s, rows: [...s.rows, ...r.rows], total: r.total }));
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setMore(false);
    }
  };

  const exportCsv = async () => {
    try {
      const all: Deal[] = [];
      for (let off = 0; ; ) {
        const r = await api<DealsResp>(`/app/api/erp/crm/deals?${qs({ ...base, offset: off, limit: 200 })}`);
        all.push(...r.rows);
        off += r.rows.length;
        if (!r.rows.length || off >= r.total) break;
      }
      const csv = toCsv([
        ["ID", "Bitim", "Mijoz", "Voronka", "Bosqich", "Summa", "Mas'ul", "Manba", "Ochilgan", "Yangilangan", "Rad sababi"],
        ...all.map((d) => {
          const s = crm.stg[d.stage];
          return [
            d.id,
            d.title,
            d.customer,
            s ? crm.pipes[s.pipeline] : "",
            s?.name,
            d.amount,
            d.owner_tg != null ? crm.users[d.owner_tg] : "",
            SRC[d.source || ""] || d.source,
            d8(d.created),
            d8(d.updated),
            d.lost_reason,
          ];
        }),
      ]);
      const u = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = u;
      a.download = `bitimlar_${iso()}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 60_000);
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  const runBulk = async (body: Record<string, unknown>) => {
    try {
      const r = await post<{ ok: number; errors: { error: string }[] }>("/app/api/erp/crm/deals/bulk", { ids: [...sel], ...body });
      const errs = r.errors ?? [];
      toast(`${r.ok} ta bitim yangilandi${errs.length ? ` · ${errs.length} ta xato: ${errs[0].error}` : ""}`, errs.length ? "bad" : "ok");
      setSel(new Set());
      onTags();
      crm.refresh();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  const bulk = async (action: string) => {
    const n = sel.size;
    if (action === "stage") {
      const stg = crm.meta.stages.filter((x) => !pipe || x.pipeline === pipe);
      const v = await crm.choose(
        `${n} ta bitim — qaysi bosqichga?`,
        stg.map((x) => ({ value: x.code, label: (pipe ? "" : crm.pipes[x.pipeline] + " · ") + x.name, color: x.color })),
      );
      if (!v) return;
      let reason: string | null = null;
      if (crm.stg[v]?.kind === "lost") {
        reason = await crm.choose("Rad etish sababi", crm.meta.lost_reasons.map((r) => ({ value: r, label: r })));
        if (!reason) return;
      }
      return runBulk({ action, value: v, reason });
    }
    if (action === "owner") {
      const v = await crm.choose(`${n} ta bitim — kimga?`, crm.meta.users.map((u) => ({ value: u.tg_id, label: u.name })));
      if (!v) return;
      return runBulk({ action, value: v });
    }
    setBulkForm(action as BulkAction);
  };

  const stages = crm.meta.stages.filter((s) => (!pipe || s.pipeline === pipe) && (f.kind === "all" || s.kind === f.kind));
  const cols = COLDEF.filter((c) => !hide.has(c[0]));
  const ready = st.key === key;
  const allOn = st.rows.length > 0 && st.rows.every((d) => sel.has(d.id));
  const toggle = (id: number, on: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  return (
    <DealListView
      f={f}
      pipe={pipe}
      lk={crm}
      stages={stages}
      rows={st.rows}
      total={st.total}
      ready={ready}
      err={st.err && st.key === key ? st.err : ""}
      net={!!st.net}
      cols={cols}
      sel={sel}
      allOn={allOn}
      more={more}
      isHead={!!crm.me.is_head}
      onKind={(k) => setF({ kind: k, stage: "" })}
      onStage={(code) => setF({ stage: code })}
      onSort={(k) => setF({ sort: k })}
      onCols={() => setColsOpen(true)}
      onExport={() => void exportCsv()}
      onRetry={crm.refresh}
      onSelAll={(on) => setSel(on ? new Set(st.rows.map((d) => d.id)) : new Set())}
      onToggle={toggle}
      onOpen={crm.openDeal}
      onMore={() => void loadMore()}
      onBulk={(a) => void bulk(a)}
      onClearSel={() => setSel(new Set())}
    >
      {colsOpen ? <ColsModal hide={hide} onClose={() => setColsOpen(false)} onApply={(h) => (setHide(h), ls("cols_hidden", [...h]))} /> : null}
      {bulkForm ? <BulkForm action={bulkForm} n={sel.size} tags={tags} onClose={() => setBulkForm(null)} onRun={(b) => runBulk({ action: bulkForm, ...b })} /> : null}
    </DealListView>
  );
}

function BulkForm({
  action,
  n,
  tags,
  onClose,
  onRun,
}: {
  action: BulkAction;
  n: number;
  tags: string[];
  onClose: () => void;
  onRun: (b: Record<string, unknown>) => Promise<void>;
}) {
  const [v, setV] = useState(() => (action === "close_date" ? iso(new Date(Date.now() + 7 * 864e5)) : ""));
  const [due, setDue] = useState(tomorrow10);
  return (
    <BulkFormView
      action={action}
      n={n}
      tags={tags}
      v={v}
      due={due}
      onV={setV}
      onDue={setDue}
      onClose={onClose}
      onOk={async () => {
        if (!v.trim()) {
          toast(action === "task" ? "Vazifani yozing" : action === "close_date" ? "Sanani tanlang" : "Tegni yozing", "bad");
          return false;
        }
        await onRun(action === "task" ? { value: v.trim(), due: new Date(due).toISOString() } : { value: v.trim() });
      }}
    />
  );
}

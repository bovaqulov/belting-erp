// Hujjatlar jurnali (1C «Документы по продажам»): tur belgilari (buyurtma va hisoblar, yuk xatlari, schyot-fakturalar,
// to'lovlar), qidiruv (raqam, mijoz, STIR), davr, mijoz filtri, «Yaratish» menyusi; kompyuterda jadval, telefonda ro'yxat.
import { useEffect, useState } from "react";

import { api } from "@/erp/kit/env";
import { Tbl } from "@/erp/kit/table";
import { Empty, Icon, List, Loaded, Row, useLoad } from "@/erp/kit/ui";

import { GROUPS, KIND, STATUS, sum, when, type DocRow, type Group, type Kind, type View } from "./lib";

type Period = "all" | "today" | "7" | "30";
const PERIODS: [Period, string][] = [
  ["all", "Butun davr"],
  ["today", "Bugun"],
  ["7", "7 kun"],
  ["30", "30 kun"],
];
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const CHIP = "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-sep bg-sec px-3 text-[13.5px] select-none coarse:min-h-11 has-[:checked]:border-link has-[:checked]:text-link";
const MENU = "absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-xl border border-sep bg-page py-1 shadow-2";

export function StatusTag({ r }: { r: DocRow }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`st ${STATUS[r.status].st}`}>{STATUS[r.status].t}</span>
      {r.ship_name ? <span className={`st ${r.ship_state === "shipped" ? "done" : "work"}`}>{r.ship_name}</span> : null}
    </span>
  );
}

export function CreateMenu({ onCreate, kinds = ["order", "invoice", "shipment", "receipt"] }: { onCreate: (k: Kind) => void; kinds?: Kind[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex-none">
      <button type="button" className="b pri h-10 coarse:h-11" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon n="plus" /> Yaratish <Icon n="chevron-down" />
      </button>
      {open ? (
        <div className={MENU} role="menu">
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              role="menuitem"
              className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2.5 text-left hover:bg-fill"
              onClick={() => {
                setOpen(false);
                onCreate(k);
              }}
            >
              <Icon n={KIND[k].icon} /> {KIND[k].t}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Journal({ view, wide, onView, onOpen, onCreate }: { view: View; wide: boolean; onView: (v: View) => void; onOpen: (id: number) => void; onCreate: (k: Kind) => void }) {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const st = useLoad(() => {
    const p = new URLSearchParams();
    if (view.groups.length) p.set("groups", view.groups.join(","));
    if (dq) p.set("q", dq);
    if (view.customer) p.set("customer_id", String(view.customer));
    if (period !== "all") {
      const d = new Date();
      if (period !== "today") d.setDate(d.getDate() - Number(period) + 1);
      p.set("from", iso(d));
    }
    return api<{ rows: DocRow[]; more: boolean }>(`/app/api/erp/sales/docs?${p}`);
  }, [view.groups.join(","), dq, view.customer, period]);
  const toggle = (g: Group) => onView({ ...view, doc: null, groups: view.groups.includes(g) ? view.groups.filter((x) => x !== g) : [...view.groups, g] });

  return (
    <>
      <div className="mx-4 mt-2 flex flex-wrap gap-2" role="group" aria-label="Hujjat turlari">
        {GROUPS.map(([g, label]) => (
          <label key={g} className={CHIP}>
            <input type="checkbox" className="ck" checked={view.groups.includes(g)} onChange={() => toggle(g)} />
            {label}
          </label>
        ))}
      </div>
      <div className="mx-4 mt-2.5 flex flex-wrap items-center gap-2">
        <label className="search !m-0 !h-10 min-w-0 flex-[1_1_240px] coarse:!h-11">
          <Icon n="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Raqam, mijoz yoki STIR" aria-label="Hujjat qidirish" enterKeyHint="search" />
        </label>
        <select className="sel !h-10 flex-[0_1_150px] coarse:!h-11" value={period} onChange={(e) => setPeriod(e.target.value as Period)} aria-label="Davr">
          {PERIODS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <CreateMenu onCreate={onCreate} />
      </div>
      {view.customer ? (
        <div className="mx-4 mt-2">
          <button type="button" className="mini" onClick={() => onView({ ...view, customer: null })}>
            Mijoz filtri <Icon n="x" />
          </button>
        </div>
      ) : null}
      <Loaded st={st}>
        {({ rows, more }) =>
          !rows.length ? (
            <Empty icon="file-text" title={dq || view.groups.length || view.customer || period !== "all" ? "Topilmadi" : "Hali hujjat yo'q"}>
              {dq || view.groups.length ? "Filtr yoki qidiruvni o'zgartiring." : "«Yaratish» bilan birinchi buyurtmani oching."}
            </Empty>
          ) : (
            <>
              <div className="sf !pt-2.5 pb-1.5 tabular-nums">
                {rows.length}
                {more ? "+" : ""} ta hujjat
              </div>
              {wide ? (
                <Tbl
                  label="Savdo hujjatlari"
                  rows={rows}
                  rowKey={(r) => String(r.id)}
                  onRow={(r) => onOpen(r.id)}
                  cols={[
                    { h: "Sana", f: (r) => <span className="num whitespace-nowrap">{when(r.date)}</span>, w: "140px" },
                    { h: "Raqam", f: (r) => <span className="code whitespace-nowrap">{r.number}</span> },
                    { h: "Mijoz", f: (r) => r.customer ?? <span className="text-hint">—</span> },
                    { h: "Summa", f: (r) => <span className="num">{sum(r.total)}</span>, n: true },
                    {
                      h: "Turi",
                      f: (r) => (
                        <>
                          {KIND[r.kind].t}
                          {r.base ? <div className="t2">asos: {r.base.number}</div> : null}
                        </>
                      ),
                    },
                    { h: "Holat", f: (r) => <StatusTag r={r} /> },
                  ]}
                />
              ) : (
                <List>
                  {rows.map((r) => (
                    <Row
                      key={r.id}
                      icon={KIND[r.kind].icon}
                      color={r.status === "posted" ? KIND[r.kind].color : "gray"}
                      t={r.customer ?? "Mijozsiz"}
                      s={`${KIND[r.kind].t} ${r.number} · ${when(r.date)}${r.status === "draft" ? " · qoralama" : ""}`}
                      val={<span className="num">{sum(r.total)}</span>}
                      chev
                      onClick={() => onOpen(r.id)}
                    />
                  ))}
                </List>
              )}
            </>
          )
        }
      </Loaded>
    </>
  );
}

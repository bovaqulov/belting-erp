// Bitimlar bo'limi (faqat ko'rinish): voronka tablari, qidiruv, filtrlar, jami, kanban/ro'yxat tugmalari; 300+ kun banneri.
import type { ReactNode, RefObject } from "react";

import { Icon } from "@/erp/kit/ui";
import { SRC, type Meta, type Query } from "@/erp/crm/lib";

export function DealsToolbar({
  meta,
  pipe,
  view,
  counts,
  q,
  qRef,
  f,
  tags,
  sum,
  filtersOpen,
  nFilters,
  viewBar,
  onPipe,
  onQ,
  onFilters,
  onOwner,
  setF,
  onView,
  onRefresh,
}: {
  meta: Meta;
  pipe: string;
  view: "board" | "list";
  counts: Record<string, number> | null;
  q: string;
  qRef: RefObject<HTMLInputElement | null>;
  f: Query;
  tags: string[];
  sum: string;
  filtersOpen: boolean;
  nFilters: number;
  /** saqlangan ko'rinishlar paneli */
  viewBar: ReactNode;
  onPipe: (code: string) => void;
  onQ: (v: string) => void;
  onFilters: () => void;
  onOwner: (v: string) => void;
  setF: (p: Partial<Query>) => void;
  onView: (v: "board" | "list") => void;
  onRefresh: () => void;
}) {
  return (
    <div className="hdr2">
      <div className="ptabs" role="group" aria-label="Voronkalar">
        {meta.pipelines.map((p) => (
          <button
            key={p.code}
            type="button"
            className={`ptab ${p.code === pipe ? "on" : ""}`}
            aria-pressed={p.code === pipe}
            onClick={() => onPipe(p.code)}
          >
            {p.name}
            <b className="num">{counts ? (counts[p.code] ?? 0) : "…"}</b>
          </button>
        ))}
        {view === "list" ? (
          <button type="button" className={`ptab ${pipe === "" ? "on" : ""}`} aria-pressed={pipe === ""} onClick={() => onPipe("")}>
            Hammasi
          </button>
        ) : null}
      </div>
      <div className="tb">
        <div className="srch">
          <Icon n="search" />
          <input
            ref={qRef}
            className="inp"
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder="Bitim, mijoz, STIR, telefon yoki #raqam"
            aria-label="Bitim qidirish"
            type="search"
          />
        </div>
        <button
          type="button"
          className={`b ftog ${filtersOpen ? "on" : ""}`}
          aria-expanded={filtersOpen}
          onClick={onFilters}
        >
          <Icon n="list" /> Filtrlar{nFilters ? ` · ${nFilters}` : ""}
        </button>
        <div className={`flt ${filtersOpen ? "open" : ""}`}>
          <select
            className="sel"
            aria-label="Mas'ul"
            value={f.owner}
            onChange={(e) => onOwner(e.target.value)}
          >
            <option value="">Barcha mas&apos;ullar</option>
            <option value="me">Mening bitimlarim</option>
            {meta.users.map((u) => (
              <option key={u.tg_id} value={u.tg_id}>
                {u.name}
              </option>
            ))}
          </select>
          <select className="sel" aria-label="Manba" value={f.source} onChange={(e) => setF({ source: e.target.value })}>
            <option value="">Barcha manbalar</option>
            {Object.entries(SRC).map(([k, v]) => (
              <option key={k || "-"} value={k || "-"}>
                {k ? v : "Manbasiz"}
              </option>
            ))}
          </select>
          <button type="button" className={`b ${f.overdue ? "on" : ""}`} aria-pressed={f.overdue} onClick={() => setF({ overdue: !f.overdue })}>
            <Icon n="alert" /> Muddati o&apos;tgan
          </button>
          <select className="sel" aria-label="Teg" value={f.tag} onChange={(e) => setF({ tag: e.target.value })}>
            <option value="">Barcha teglar</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <span className="sum">{sum}</span>
        <span className="sp" />
        <div className="grp" role="group" aria-label="Ko'rinish">
          <button
            type="button"
            className={`b ${view === "board" ? "on" : ""}`}
            aria-pressed={view === "board"}
            onClick={() => onView("board")}
          >
            <Icon n="layers" /> Kanban
          </button>
          <button
            type="button"
            className={`b ${view === "list" ? "on" : ""}`}
            aria-pressed={view === "list"}
            onClick={() => onView("list")}
          >
            <Icon n="list" /> Ro&apos;yxat
          </button>
        </div>
        <button type="button" className="b ic" title="Yangilash" aria-label="Yangilash" onClick={onRefresh}>
          <Icon n="refresh" />
        </button>
      </div>
      {viewBar}
    </div>
  );
}

/** 300+ kun tegilmagan ochiq bitimlar ogohlantirishi */
export const IdleBanner = ({ total, onReview }: { total: number; onReview: () => void }) => (
  <div className="banner" role="status">
    <Icon n="alert" />
    <div>
      <b>{total} ta ochiq bitim 300 kundan ortiq tegilmagan.</b> Har birini ko&apos;rib chiqing: davom etsa — keyingi vazifa qo&apos;ying,
      bo&apos;lmasa — sababi bilan yoping.
    </div>
    <span className="sp" />
    <button type="button" className="b pri" onClick={onReview}>
      Ko&apos;rib chiqish
    </button>
  </div>
);

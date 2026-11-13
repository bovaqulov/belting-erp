// Graf (faqat ko'rinish): statistika, qidiruv / ko'lam / to'liq ekran, vis-network konteyneri (ref — konteyner boshqaradi),
// "Ko'proq", jamoa chiplari, hisobot / qayta qurish, markaziy tushunchalar, kutilmagan bog'lanishlar, savollar.
import type { ReactNode, RefObject } from "react";

import s from "@/shared/ui/panel/panel.module.css";
import { Icon, SectionHeader } from "@/shared/ui/panel/ui";

import { bigCommunities, commColor, confPct, countText, type GraphSummary } from "./graph.lib";

const MONO = { display: "block", whiteSpace: "pre-wrap", font: "13px/1.45 ui-monospace,Menlo,monospace" } as const;

export function TextSheet({ title, sub, text }: { title: string; sub: string; text: string }) {
  return (
    <>
      <div className={s.who}>
        <h2>{title}</h2>
        <div className={s.s}>{sub}</div>
      </div>
      <div className={`${s.list} ${s.plain}`}>
        <div className={s.field} style={MONO}>
          {text}
        </div>
      </div>
    </>
  );
}

/** xato yoki yuklanmoqda (tepada — ko'rinish almashtirgich) */
export const GraphStatus = ({ seg, err }: { seg?: ReactNode; err?: string | null }) => (
  <>
    {seg}
    {err != null ? <div className={s.err}>{err}</div> : <div className={s.empty}>Yuklanmoqda…</div>}
  </>
);

export function GraphView({
  seg,
  g,
  scope,
  scopeProp,
  dn,
  ns,
  count,
  moreBusy,
  rebuilding,
  active,
  full,
  netRef,
  legRef,
  onSearch,
  onScope,
  onFull,
  onMore,
  onChip,
  onReport,
  onRebuild,
  onExplain,
}: {
  seg?: ReactNode;
  g: GraphSummary;
  scope: string;
  /** ko'lam tashqaridan berilgan (xotira / bo'lim) — tanlov ko'rsatilmaydi */
  scopeProp?: string;
  dn: (k: string) => string;
  /** tarmoq holati: chizildi / xato */
  ns: { ready: boolean; err: string | null } | null;
  count: { have: number; total: number } | null;
  moreBusy: boolean;
  rebuilding: boolean;
  active: number | null;
  full: boolean;
  netRef: RefObject<HTMLDivElement | null>;
  legRef: RefObject<HTMLDivElement | null>;
  onSearch: (v: string) => void;
  onScope: (v: string) => void;
  onFull: () => void;
  onMore: () => void;
  onChip: (id: number) => void;
  onReport: () => void;
  onRebuild: () => void;
  onExplain: (name: string) => void;
}) {
  const comms = bigCommunities(g);
  return (
    <>
      {seg}
      <div className={s.gstats}>
        <div>
          <b>{g.nodes || 0}</b>
          <span>tugun</span>
        </div>
        <div>
          <b>{g.edges || 0}</b>
          <span>bog&apos;lanish</span>
        </div>
        <div>
          <b>{comms.length}</b>
          <span>jamoa</span>
        </div>
        <div title="EXTRACTED / INFERRED / AMBIGUOUS">
          <b>{confPct(g.confidence)}%</b>
          <span>aniq</span>
        </div>
      </div>
      <div className={`${s.gcard} ${full ? s.full : ""}`}>
        <div className={s.gtop}>
          <div className={s.gsearch}>
            <Icon name="search" />
            <input
              placeholder="Qidirish: SPB, Bitrix, Megadyne…"
              autoComplete="off"
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>
          {!scopeProp && (
            <select className={s.gsel} value={scope} onChange={(e) => onScope(e.target.value)}>
              {(g.scopes || ["all"]).map((x) => (
                <option key={x} value={x}>
                  {dn(x)}
                </option>
              ))}
            </select>
          )}
          <button className={s.gbtn} title="To'liq ekran" onClick={onFull}>
            <Icon name="layout-dashboard" />
          </button>
        </div>
        {/* vis-network o'z konteynerini to'liq boshqaradi — unda React bolalari bo'lmasligi shart (aks holda
            React "removeChild" xatosi bilan yiqiladi). Yuklanish yozuvi — yonida, ustma-ust. */}
        <div className={s.gnet} style={{ position: "relative" }}>
          <div ref={netRef} style={{ position: "absolute", inset: 0 }} />
          {!ns?.ready && (
            <div className={s.gload} style={{ position: "absolute", inset: 0 }}>
              {ns?.err || "Graf chizilmoqda…"}
            </div>
          )}
        </div>
        <div className={s.gmore}>
          <span>{count ? countText(count.have, count.total) : ""}</span>
          <button
            className={s.lnk}
            onClick={onMore}
            disabled={moreBusy}
            style={count && count.have >= count.total ? { display: "none" } : undefined}
          >
            <Icon name="plus" /> Ko&apos;proq ko&apos;rsatish
          </button>
        </div>
        <div className={s.glegend} ref={legRef}>
          {comms.map((c) => (
            <button key={c.id} className={`${s.gchip} ${active === c.id ? s.on : ""}`} onClick={() => onChip(c.id)}>
              <i style={{ background: commColor(c.id) }} />
              {c.label}
              <em>{c.size}</em>
            </button>
          ))}
        </div>
      </div>
      <div className={s.actions}>
        <button className={`${s.btn} ${s.sec}`} onClick={onReport}>
          <Icon name="file-text" /> Hisobot
        </button>
        <button className={`${s.btn} ${s.sec}`} onClick={onRebuild} disabled={rebuilding}>
          <Icon name="refresh-cw" /> Qayta qurish
        </button>
      </div>
      <SectionHeader>Markaziy tushunchalar</SectionHeader>
      <div className={s.chips}>
        {(g.god_nodes || []).map((x, i) => (
          <span key={i} className={s.chip} onClick={() => onExplain(x.label)}>
            {x.label} · {x.degree ?? ""}
          </span>
        ))}
      </div>
      {(g.surprises || []).length > 0 && (
        <>
          <SectionHeader>Kutilmagan bog&apos;lanishlar</SectionHeader>
          <div className={s.list}>
            {(g.surprises || []).slice(0, 6).map((x, i) => (
              <div key={i} className={s.item}>
                <div className={s.main}>
                  <div className={s.t}>
                    {x.source} → {x.target}
                  </div>
                  <div className={s.s}>
                    {x.relation || ""} · {x.confidence || ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {(g.questions || []).length > 0 && (
        <>
          <SectionHeader>Graf taklif qilgan savollar</SectionHeader>
          <div className={s.list}>
            {(g.questions || []).slice(0, 5).map((q, i) => (
              <div key={i} className={s.item}>
                <div className={s.main}>
                  <div className={s.t} style={{ whiteSpace: "normal" }}>
                    {q.question || ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

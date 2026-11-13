// Xotira (faqat ko'rinish): ro'yxat/graf tugmalari, firma / bo'lim / xodim guruhlari, arxiv; qator amallari.
import { Fragment } from "react";

import s from "@/shared/ui/panel/panel.module.css";
import { fmtTime, Icon, Sq } from "@/shared/ui/panel/ui";

import type { groupMemory, MemoryItem } from "./memory.lib";

export type Act = "approve" | "archive" | "delete";

export function MemSegView({ graph, onView }: { graph: boolean; onView: (v: "list" | "graph") => void }) {
  return (
    <div className={s.toolbar}>
      <div className={s.seg} style={{ flex: 1 }}>
        <button className={!graph ? s.on : ""} onClick={() => onView("list")}>
          <Icon name="list" /> Ro&apos;yxat
        </button>
        <button className={graph ? s.on : ""} onClick={() => onView("graph")}>
          <Icon name="network" /> Graf
        </button>
      </div>
    </div>
  );
}

function Row({
  m,
  icon,
  color,
  busy,
  onAct,
}: {
  m: MemoryItem;
  icon: string;
  color: string;
  busy: boolean;
  onAct: (m: MemoryItem, a: Act) => void;
}) {
  return (
    <div className={s.item} style={{ alignItems: "flex-start" }}>
      <Sq icon={icon} color={color} />
      <div className={s.main}>
        <div style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{m.fact}</div>
        <div className={s.s}>
          #{m.id} · {fmtTime(m.created)}
          {m.status === "pending" ? " · tasdiq kutmoqda" : ""}
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {m.status === "pending" && (
            <button className={s.lnk} disabled={busy} onClick={() => onAct(m, "approve")}>
              Tasdiqlash
            </button>
          )}
          {m.status === "active" && (
            <button className={s.lnk} disabled={busy} onClick={() => onAct(m, "archive")}>
              Arxivlash
            </button>
          )}
          <button className={`${s.lnk} ${s.danger}`} disabled={busy} onClick={() => onAct(m, "delete")}>
            O&apos;chirish
          </button>
        </div>
      </div>
    </div>
  );
}

/** Ro'yxat: xato / yuklanmoqda / guruhlar (seg — ko'rinish tugmalari, tepada) */
export function MemoryListView({
  seg,
  err,
  grouped,
  busy,
  onAct,
}: {
  seg: React.ReactNode;
  err: string | null;
  /** null — yuklanmoqda */
  grouped: ReturnType<typeof groupMemory> | null;
  busy: boolean;
  onAct: (m: MemoryItem, a: Act) => void;
}) {
  if (err !== null)
    return (
      <>
        {seg}
        <div className={s.err}>{err}</div>
      </>
    );
  if (!grouped)
    return (
      <>
        {seg}
        <div className={s.empty}>Yuklanmoqda…</div>
      </>
    );
  const { live, groups, archived } = grouped;
  return (
    <>
      {seg}
      {!live.length && <div className={s.empty}>Xotira bo&apos;sh</div>}
      {groups.map((g) => (
        <Fragment key={g.kind + ":" + String(g.items[0].scope_id)}>
          <div className={s.sh} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name={g.icon} /> {g.title} · {g.items.length}
          </div>
          <div className={s.list}>
            {g.items.map((m) => (
              <Row key={String(m.id)} m={m} icon={g.icon} color={g.color} busy={busy} onAct={onAct} />
            ))}
          </div>
        </Fragment>
      ))}
      {archived.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className={s.sh} style={{ cursor: "pointer" }}>
            Arxiv · {archived.length}
          </summary>
          <div className={s.list}>
            {archived.map((m) => (
              <Row key={String(m.id)} m={m} icon="archive" color="#8e8e93" busy={busy} onAct={onAct} />
            ))}
          </div>
        </details>
      )}
      <div className={s.sf}>Har xodimning xotirasi alohida. Hisobot formati kabi odatlar — Xodimlar → xodim → Afzalliklar.</div>
    </>
  );
}

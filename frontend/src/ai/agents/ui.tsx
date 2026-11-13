// Agentlar (faqat ko'rinish): daraxt (OrgChart) yoki ro'yxat, "Yangi agent" tugmasi, izoh.
import type { CSSProperties } from "react";

import s from "@/shared/ui/panel/panel.module.css";
import { Icon, SectionHeader, Sq, tapProps } from "@/shared/ui/panel/ui";
import OrgChart from "@/ai/org";
import { flatten, type DeptTree } from "@/ai/org/dept-tree";

import a from "./agents.module.css";
import { KIND_NAMES, type Agent } from "./model";

export function AgentsView({
  company,
  count,
  tree,
  isList,
  manage,
  line,
  extra,
  onView,
  onNew,
  onOpen,
}: {
  company: string;
  count: number;
  tree: DeptTree<Agent>[];
  isList: boolean;
  manage: boolean;
  /** kartochka 2-qatori — turiga qarab */
  line: (ag: Agent) => string;
  /** vositalar · jadval · kanal soni */
  extra: (ag: Agent) => string;
  onView: (v: "tree" | "list") => void;
  onNew: () => void;
  onOpen: (ag: Agent) => void;
}) {
  const chart = (
    <OrgChart
      root={
        <div className={`${s.ob} ${s.root}`}>
          <Sq icon="bot" color="rgba(255,255,255,.2)" />
          <div className={s.t}>Jarvis · {company}</div>
          <div className={s.s}>{count} agent</div>
        </div>
      }
      tree={tree}
      renderDept={(ag) => (
        <div
          className={`${s.ob} ${ag.kind === "dept" ? s.dept : ""} ${s.person}`}
          style={{ "--dc": ag.color } as CSSProperties}
          {...tapProps(() => onOpen(ag))}
        >
          <Sq icon={ag.icon} color={ag.color} />
          <div className={s.t}>{ag.name}</div>
          <div className={s.s}>{line(ag)}</div>
          <div className={a.kindTag}>{ag.kind === "dept" ? extra(ag) : `${KIND_NAMES[ag.kind]} · ${extra(ag)}`}</div>
        </div>
      )}
    />
  );

  const list = (
    <>
      <SectionHeader>Agentlar</SectionHeader>
      <div className={s.list}>
        {flatten(tree).map(({ d: ag, depth }) => (
          <div key={ag.key} className={`${s.item} ${s.tap}`} style={{ paddingLeft: 16 + depth * 26 }} {...tapProps(() => onOpen(ag))}>
            <Sq icon={ag.icon} color={ag.color} />
            <div className={s.main}>
              <div className={s.t}>{ag.name}</div>
              <div className={s.s}>
                {ag.kind === "dept" ? line(ag) : `${KIND_NAMES[ag.kind]} · ${line(ag)}`}
                {ag.channels.length ? ` · ${ag.channels.length} kanal` : ""}
              </div>
            </div>
            <span className={s.chev}>
              <Icon name="chevron-right" />
            </span>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <>
      <div className={s.toolbar}>
        <div className={s.seg} style={{ flex: 1 }}>
          <button className={!isList ? s.on : ""} onClick={() => onView("tree")}>
            <Icon name="network" /> Daraxt
          </button>
          <button className={isList ? s.on : ""} onClick={() => onView("list")}>
            <Icon name="list" /> Ro&apos;yxat
          </button>
        </div>
        {manage && (
          <button className={s.fab} title="Yangi agent" aria-label="Yangi agent" onClick={onNew}>
            <Icon name="plus" />
          </button>
        )}
      </div>
      {isList ? list : chart}
      <div className={s.sf}>
        Agentni bosib — huquqlari, jadvali, topshiriqlari va sub-agentlari. Bo&apos;lim agentlari Xodimlar daraxtida bo&apos;lim bo&apos;lib
        ko&apos;rinadi; agentlarni IT bo&apos;limi va Rahbariyat boshqaradi.
      </div>
    </>
  );
}

/** xato yoki yuklanmoqda */
export const AgentsStatus = ({ err }: { err?: string | null }) =>
  err != null ? <div className={s.err}>{err}</div> : <div className={s.empty}>Yuklanmoqda…</div>;

"use client";
// Jarvis → Agentlar: firmaning agentlari BITTA daraxtda — bo'lim agentlari (Xodimlar daraxtining bo'limlari), xodim agentlari,
// mustaqil agentlar va ularning sub-agentlari. Daraxt / ro'yxat; agent oynasi — AgentSheet. Eski vOverview (admin.html 353–384).
import { useEffect, useState } from "react";

import AgentEditor from "@/ai/agents/editor";
import AgentSheet from "@/ai/agents/sheet";
import { buildDeptTree } from "@/ai/org/dept-tree";
import { useAdmin, type Overview as OverviewData } from "@/ai/shell/AdminContext";

import { canManage, type Agent } from "./model";
import { staffName, useStaff } from "./staff";
import { AgentsStatus, AgentsView } from "./ui";

export default function Agents() {
  const { me, agents, depts, reloadOverview, openSheet, prefs, setPref } = useAdmin();
  const staff = useStaff();
  const [o, setO] = useState<OverviewData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    reloadOverview()
      .then((x) => alive && setO(x))
      .catch((e: Error) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [reloadOverview]);

  if (err !== null || !o) return <AgentsStatus err={err} />;

  const manage = canManage(me, depts);
  const isList = prefs.agentsView === "list";
  const statOf = (k: string) => o.stats_week.find((x) => x.dept === k);
  const tree = buildDeptTree(agents);
  /** kartochka 2-qatori — turiga qarab */
  const line = (ag: Agent) => {
    if (ag.kind === "dept") {
      const st = statOf(ag.key);
      return `${ag.members} xodim · ${st ? st.requests : 0} so'rov`;
    }
    if (ag.kind === "staff") return staffName(staff, ag.owner_tg);
    return ag.owner_tg ? `Mas'ul: ${staffName(staff, ag.owner_tg)}` : "Mas'ulsiz";
  };
  const extra = (ag: Agent) =>
    [`${ag.tools.length} vosita`, ag.schedules.length ? `${ag.schedules.length} jadval` : "", ag.channels.length ? `${ag.channels.length} kanal` : ""]
      .filter(Boolean)
      .join(" · ");

  return (
    <AgentsView
      company={me?.company || "Firma"}
      count={agents.length}
      tree={tree}
      isList={isList}
      manage={manage}
      line={line}
      extra={extra}
      onView={(v) => setPref("agentsView", v)}
      onNew={() => openSheet(<AgentEditor />)}
      onOpen={(ag) => openSheet(<AgentSheet agent={ag} st={statOf(ag.key)} />)}
    />
  );
}

"use client";
// Agent oynasi: kimligi, sub-agentlar, jadval, topshiriqlar, huquqlar (vositalar, doira, kim foydalanadi, kanallar), persona.
// Tahrir/o'chirish/jadval — canManage (owner/admin, IT, Rahbariyat); topshiriq berish — ular va agent foydalanuvchilari.
import { api } from "@/shared/api/client";
import { useBusy } from "@/shared/ui/panel/ui";
import { deleteWarning, saveError } from "@/ai/agents/agents.lib";
import AgentEditor from "@/ai/agents/editor";
import { canManage, SCOPE_AREAS, type Agent } from "@/ai/agents/model";
import ScheduleSheet from "@/ai/agents/schedule";
import { staffName, useStaff } from "@/ai/agents/staff";
import TaskSheet from "@/ai/agents/task";
import { childCount, parentMap } from "@/ai/org/dept-tree";
import { useAdmin, type DeptStat } from "@/ai/shell/AdminContext";

import { AgentSheetView } from "./ui";

export default function AgentSheet({ agent: ag, st }: { agent: Agent; st?: DeptStat }) {
  const { me, agents, depts, overview, openSheet, closeSheet, confirm, toast, reloadOverview, render } = useAdmin();
  const staff = useStaff();
  const [busy, run] = useBusy();
  const manage = canManage(me, depts);
  const meId = me?.user.tg_id;
  const user = manage || (meId != null && (ag.audience.users.includes(meId) || ag.owner_tg === meId));
  const pm = parentMap(agents);
  const up = pm.get(ag.key);
  const upName = up ? agents.find((x) => x.key === up)?.name : null;
  const subs = agents.filter((x) => pm.get(x.key) === ag.key);
  const scoped = SCOPE_AREAS.filter((ar) => ag.scopes[ar.key] && ag.scopes[ar.key] !== "inherit");
  const now = new Date();
  const statOf = (k: string) => overview?.stats_week.find((x) => x.dept === k);

  const remove = () =>
    run(async () => {
      if (!(await confirm(deleteWarning(ag.name, ag.members, ag.chats.length, childCount(agents, ag.key))))) return;
      try {
        await api(`/app/api/agents/${encodeURIComponent(ag.key)}`, { method: "DELETE" });
        toast("Agent o'chirildi");
        closeSheet();
        await reloadOverview().catch(() => {});
        render();
      } catch (e) {
        toast(saveError(e), "err");
      }
    });

  return (
    <AgentSheetView
      ag={ag}
      st={st}
      manage={manage}
      user={user}
      upName={upName}
      subs={subs}
      scoped={scoped}
      now={now}
      busy={busy}
      who={(id) => staffName(staff, id)}
      deptName={(k) => depts.find((d) => d.key === k)?.name || k}
      onSub={(x) => openSheet(<AgentSheet agent={x} st={statOf(x.key)} />)}
      onAddSub={() => openSheet(<AgentEditor parent={ag.key} />)}
      onSchedule={(item) => openSheet(<ScheduleSheet agent={ag} item={item} />)}
      onTask={(item) => openSheet(<TaskSheet agent={ag} item={item} />)}
      onRemove={() => void remove()}
      onEdit={() => openSheet(<AgentEditor agent={ag} />)}
    />
  );
}

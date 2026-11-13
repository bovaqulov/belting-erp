"use client";
// Agentga topshiriq: bir martalik ish (masalan "Navoiy GMK bo'yicha qarzdorlik aktini tayyorla"), muddat, holat, natija.
// API: POST /app/api/agents/{key}/tasks, PATCH|DELETE …/tasks/{id}.
import { useState } from "react";

import { api } from "@/shared/api/client";
import { saveError } from "@/ai/agents/agents.lib";
import { rid, type Agent, type AgentTask } from "@/ai/agents/model";
import { useAdmin } from "@/ai/shell/AdminContext";

import { validateTask } from "./task.lib";
import { TaskSheetView } from "./ui";

export default function TaskSheet({ agent, item }: { agent: Agent; item?: AgentTask }) {
  const { toast, confirm, closeSheet, reloadOverview, render } = useAdmin();
  const isNew = !item;
  const [f, setF] = useState<AgentTask>(item ?? { id: rid("tk"), title: "", instruction: "", due: "", status: "new" });
  const [errs, setErrs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<AgentTask>) => {
    setF((c) => ({ ...c, ...p }));
    setErrs([]);
  };
  const base = `/app/api/agents/${encodeURIComponent(agent.key)}/tasks`;

  async function done(msg: string) {
    toast(msg);
    closeSheet();
    await reloadOverview().catch(() => {});
    render();
  }
  async function save() {
    const v = validateTask(f);
    if (v.length) return setErrs(v);
    setSaving(true);
    try {
      const body = { title: f.title.trim(), instruction: f.instruction.trim(), due: f.due, status: f.status };
      if (isNew) await api(base, { method: "POST", body });
      else await api(`${base}/${encodeURIComponent(f.id)}`, { method: "PATCH", body });
      await done(isNew ? "Topshiriq berildi" : "Saqlandi");
    } catch (e) {
      setErrs([saveError(e)]);
      setSaving(false);
    }
  }
  async function remove() {
    if (!(await confirm(`«${f.title}» topshirig'i o'chirilsinmi?`))) return;
    try {
      await api(`${base}/${encodeURIComponent(f.id)}`, { method: "DELETE" });
      await done("Topshiriq o'chirildi");
    } catch (e) {
      toast(saveError(e), "err");
    }
  }

  return (
    <TaskSheetView
      agent={agent}
      f={f}
      isNew={isNew}
      errs={errs}
      saving={saving}
      set={set}
      onRemove={() => void remove()}
      onCancel={closeSheet}
      onSave={() => void save()}
    />
  );
}

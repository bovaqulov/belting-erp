"use client";
// Agent jadvali: davriy yoki bir martalik ish (masalan har kuni 09:00 — kechagi savdo hisobotini rahbariyatga yubor).
// API: POST /app/api/agents/{key}/schedules, PATCH|DELETE …/schedules/{id}.
import { useState } from "react";

import { api } from "@/shared/api/client";
import { saveError } from "@/ai/agents/agents.lib";
import { rid, type Agent, type Schedule } from "@/ai/agents/model";
import { blankSchedule, validateSchedule } from "@/ai/agents/schedule.lib";
import { useAdmin } from "@/ai/shell/AdminContext";

import { ScheduleSheetView } from "./ui";

export default function ScheduleSheet({ agent, item }: { agent: Agent; item?: Schedule }) {
  const { toast, confirm, closeSheet, reloadOverview, render } = useAdmin();
  const isNew = !item;
  const [f, setF] = useState<Schedule>(item ?? blankSchedule(rid("sc")));
  const [errs, setErrs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<Schedule>) => {
    setF((c) => ({ ...c, ...p }));
    setErrs([]);
  };
  const base = `/app/api/agents/${encodeURIComponent(agent.key)}/schedules`;

  async function done(msg: string) {
    toast(msg);
    closeSheet();
    await reloadOverview().catch(() => {});
    render();
  }
  async function save() {
    const v = validateSchedule(f);
    if (v.length) return setErrs(v);
    setSaving(true);
    try {
      const body = { ...f, title: f.title.trim(), instruction: f.instruction.trim() };
      if (isNew) await api(base, { method: "POST", body });
      else await api(`${base}/${encodeURIComponent(f.id)}`, { method: "PATCH", body });
      await done(isNew ? "Jadval qo'shildi" : "Saqlandi");
    } catch (e) {
      setErrs([saveError(e)]);
      setSaving(false);
    }
  }
  async function remove() {
    if (!(await confirm(`«${f.title}» jadvali o'chirilsinmi?`))) return;
    try {
      await api(`${base}/${encodeURIComponent(f.id)}`, { method: "DELETE" });
      await done("Jadval o'chirildi");
    } catch (e) {
      toast(saveError(e), "err");
    }
  }

  return (
    <ScheduleSheetView
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

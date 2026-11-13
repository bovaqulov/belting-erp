"use client";
// Agentni yaratish / tahrirlash: Asosiy (tur, nom, yuqori agent, biriktirilgan xodim, model, ko'rinish), Huquqlar
// (AccessFields), Persona. Saqlash: POST /app/api/agents yoki PATCH /app/api/agents/{key} (agents.lib.ts).
import { useMemo, useState } from "react";

import { api } from "@/shared/api/client";
import { blankForm, createBody, formOf, MODELS, patchBody, saveError, slugKey, validate, type AgentForm } from "@/ai/agents/agents.lib";
import { allowedParent, type Agent, type AgentKind } from "@/ai/agents/model";
import { useStaff } from "@/ai/agents/staff";
import { buildDeptTree, flatten, parentMap, subtreeKeys } from "@/ai/org/dept-tree";
import { useAdmin } from "@/ai/shell/AdminContext";

import AccessFields from "./access";
import { AgentEditorView, type Part } from "./ui";

export default function AgentEditor({ agent, parent, kind }: { agent?: Agent; parent?: string | null; kind?: AgentKind }) {
  const { agents, depts, toast, closeSheet, reloadOverview, render } = useAdmin();
  const staff = useStaff();
  const isNew = !agent;
  const orig = useMemo(
    () => (agent ? formOf(agent, parentMap(agents).get(agent.key) ?? null) : blankForm(parent ?? null, kind ?? "free")),
    [agent, agents, parent, kind],
  );
  const [f, setF] = useState<AgentForm>(orig);
  const [part, setPart] = useState<Part>("main");
  const [keyTouched, setKeyTouched] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const set = (p: Partial<AgentForm>) => {
    setF((cur) => ({ ...cur, ...p }));
    setErrs([]);
  };
  const setName = (name: string) => set(isNew && !keyTouched ? { name, key: slugKey(name) } : { name });
  const models = MODELS.some((m) => m.id === f.model) ? MODELS : [{ id: f.model, name: f.model }, ...MODELS];
  // yuqori agent: o'zi va avlodlari emas; bo'lim agentining yuqorisi — faqat bo'lim agenti
  const parents = useMemo(() => {
    const ban = agent ? subtreeKeys(agents, agent.key) : new Set<string>();
    return flatten(buildDeptTree(agents)).filter((x) => !ban.has(x.d.key) && allowedParent(f.kind, x.d));
  }, [agents, agent, f.kind]);

  const setKind = (k: AgentKind) => {
    const p = agents.find((x) => x.key === f.parent);
    set({ kind: k, ...(p && !allowedParent(k, p) ? { parent: null } : {}) });
  };

  async function save() {
    const v = validate(f, agents.map((x) => x.key), isNew);
    if (v.length) {
      setErrs(v);
      return;
    }
    const body = isNew ? createBody(f) : patchBody(orig, f);
    if (!isNew && !Object.keys(body).length) return closeSheet();
    setSaving(true);
    try {
      if (isNew) await api("/app/api/agents", { method: "POST", body });
      else await api(`/app/api/agents/${encodeURIComponent(f.key)}`, { method: "PATCH", body });
      toast(isNew ? "Agent yaratildi" : "Saqlandi");
      closeSheet();
      await reloadOverview().catch(() => {});
      render();
    } catch (e) {
      setErrs([saveError(e)]);
      setSaving(false);
    }
  }

  return (
    <AgentEditorView
      f={f}
      isNew={isNew}
      part={part}
      parents={parents}
      staff={staff}
      models={models}
      errs={errs}
      saving={saving}
      access={<AccessFields f={f} set={set} depts={depts} staff={staff} />}
      set={set}
      onPart={setPart}
      onKind={setKind}
      onName={setName}
      onKey={(v) => {
        setKeyTouched(true);
        set({ key: v.toLowerCase().replace(/\s+/g, "_") });
      }}
      onCancel={closeSheet}
      onSave={() => void save()}
    />
  );
}

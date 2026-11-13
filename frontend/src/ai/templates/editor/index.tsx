"use client";
// Shablon tahrirlash oynasi — eski openTplEditor (admin.html 654–686): boshlang'ich qiymat (faol shablon yoki bo'sh),
// maydonlar ro'yxati, saqlash (tasdiqlovchi — darhol kuchga kiradi, aks holda — tasdiqqa).
import { useState } from "react";

import { api } from "@/shared/api/client";
import { useAdmin } from "@/ai/shell/AdminContext";
import { editorInit, savePayload, TYPE_NAMES, type Template, type TemplatesData } from "@/ai/templates/templates.lib";

import { TplEditorView, type EditorForm, type Row } from "./ui";

let seq = 0;
const rid = () => ++seq;

export default function TplEditor({
  d,
  byDept,
  editable,
  deptKey,
  blank = false,
}: {
  d: TemplatesData;
  byDept: Record<string, Template[]>;
  editable: string[];
  deptKey: string;
  blank?: boolean;
}) {
  const { toast, closeSheet, render } = useAdmin();
  const [init] = useState(() => editorInit(byDept, editable, deptKey, blank));
  const [v, setV] = useState<EditorForm>({ dept: init.dept, title: init.title, askAt: init.ask_at, sumAt: init.summary_at });
  const [rows, setRows] = useState<Row[]>(() => init.fields.map((f) => ({ id: rid(), ...f })));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api<{ template: Template }>("/app/api/templates", {
        method: "POST",
        body: savePayload({ dept: v.dept, title: v.title, ask_at: v.askAt, summary_at: v.sumAt, fields: rows }),
      });
      toast(r.template.status === "active" ? `Shablon v${r.template.version} kuchga kirdi` : `v${r.template.version} tasdiqqa yuborildi`);
      closeSheet();
      render();
    } catch (e) {
      toast((e as Error).message, "err");
      setBusy(false);
    }
  };

  return (
    <TplEditorView
      d={d}
      editable={editable}
      blank={blank}
      v={v}
      rows={rows}
      busy={busy}
      set={(k, val) => setV((x) => ({ ...x, [k]: val }))}
      onRow={(id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))}
      onRemove={(id) => setRows((rs) => rs.filter((r) => r.id !== id))}
      onAddRow={() => setRows((rs) => [...rs, { id: rid(), key: "", label: "", type: Object.keys(TYPE_NAMES)[0] }])}
      onSave={() => void save()}
    />
  );
}

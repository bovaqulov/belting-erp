"use client";
// Shablonlar — eski vTemplates (admin.html 620–687): tasdiqlovchi izohi, kutayotgan takliflar (tasdiqlash/rad etish),
// bo'limlar bo'yicha faol shablonlar, yangi shablon, tarix. Tahrirlash oynasi — ./editor.
import { useEffect, useState } from "react";

import { api } from "@/shared/api/client";
import { useBusy } from "@/shared/ui/panel/ui";
import { useAdmin } from "@/ai/shell/AdminContext";

import TplEditor from "./editor";
import { editableDepts, groupByDept, type TemplatesData } from "./templates.lib";
import { TemplatesStatus, TemplatesView } from "./ui";

export default function Templates() {
  const { toast, confirm, render, openSheet } = useAdmin();
  const [d, setD] = useState<TemplatesData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, run] = useBusy();

  useEffect(() => {
    let alive = true;
    api<TemplatesData>("/app/api/templates")
      .then((x) => alive && setD(x))
      .catch((e: Error) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, []);

  if (err !== null || !d) return <TemplatesStatus err={err} />;

  const decide = (id: number, ok: boolean) =>
    run(async () => {
      if (!ok && !(await confirm("Taklif rad etilsinmi?"))) return;
      try {
        await api(`/app/api/templates/${id}/${ok ? "approve" : "reject"}`, { method: "POST" });
        toast(ok ? "Tasdiqlandi — kuchga kirdi" : "Rad etildi");
        render();
      } catch (e) {
        toast((e as Error).message, "err");
      }
    });

  return (
    <TemplatesView
      d={d}
      busy={busy}
      onDecide={(id, ok) => void decide(id, ok)}
      onEdit={(deptKey, blank = false) =>
        openSheet(<TplEditor d={d} byDept={groupByDept(d.templates)} editable={editableDepts(d)} deptKey={deptKey} blank={blank} />)
      }
    />
  );
}

"use client";
// Loyihalar: oyna darhol ochiladi (ro'yxat ichida yuklanadi) — sekin aloqada "Loyihalarim" bosilgani bilinadi; "Hammasi"
// (ruxsat bo'lsa), ochish, o'chirish (ro'yxatdan darhol olib tashlanadi).
import { useEffect, useState } from "react";

import { api } from "@/shared/api/client";
import type { ProjectsResp } from "@/conveyor/lib/types";
import { useLenta, type Lenta } from "@/conveyor/model";

import { ProjectsView } from "./ui";

function Projects() {
  const L = useLenta();
  const t = L.t;
  const [all, setAll] = useState(false);
  const [res, setRes] = useState<{ all: boolean; d?: ProjectsResp; err?: string } | null>(null);
  const [gone, setGone] = useState<(number | string)[]>([]);
  const [canAll, setCanAll] = useState(false);
  useEffect(() => {
    let live = true;
    api<ProjectsResp>(`/app/api/lenta/projects${all ? "?all=1" : ""}`).then(
      (d) => {
        if (!live) return;
        setRes({ all, d });
        if (d.can_all) setCanAll(true);
      },
      (e: Error) => live && setRes({ all, err: e.message }),
    );
    return () => {
      live = false;
    };
  }, [all]);
  const cur = res && res.all === all ? res : null; // boshqa ro'yxatga o'tilganda — yuklanmoqda
  const rows = (cur?.d?.projects || []).filter((p) => !gone.includes(p.id));
  return (
    <ProjectsView
      t={t}
      all={all}
      canAll={canAll}
      cur={cur}
      rows={rows}
      projectId={L.projectId}
      meTg={L.ME?.tg_id}
      onToggleAll={() => setAll(!all)}
      onOpen={async (id) => {
        L.closeSheet();
        try {
          await L.openProject(String(id));
        } catch (err) {
          L.toastErr(err);
        }
      }}
      onDelete={async (id) => {
        if (await L.deleteProject(String(id))) setGone((l) => [...l, id]);
      }}
    />
  );
}

export const showProjects = (L: Lenta): void => L.openSheet(() => <Projects />);

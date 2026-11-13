"use client";
// Xotira — eski memSeg / bindMemSeg / vMemory (admin.html 688–726): ro'yxat yoki graf ko'rinishi (sozlamada eslab
// qolinadi), firma / bo'lim / xodim guruhlari, arxiv; tasdiqlash / arxivlash / o'chirish.
import { useEffect, useState } from "react";

import { api } from "@/shared/api/client";
import { useBusy } from "@/shared/ui/panel/ui";
import Graph from "@/ai/graph";
import { useAdmin, type Dept } from "@/ai/shell/AdminContext";

import { deptNameOf, groupMemory, type MemoryItem } from "./memory.lib";
import { MemoryListView, MemSegView, type Act } from "./ui";

function MemSeg() {
  const { prefs, setPref } = useAdmin();
  return <MemSegView graph={prefs.memView === "graph"} onView={(v) => setPref("memView", v)} />;
}

function MemoryList() {
  const { depts: ctxDepts, reloadOverview, toast, confirm, render } = useAdmin();
  const [data, setData] = useState<{ memory: MemoryItem[]; depts: Dept[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, run] = useBusy();

  useEffect(() => {
    let alive = true;
    (async () => {
      const { memory } = await api<{ memory: MemoryItem[] }>("/app/api/memory");
      const depts = ctxDepts.length ? ctxDepts : (await reloadOverview()).departments;
      if (alive) setData({ memory, depts });
    })().catch((e: Error) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
    // eski vMemory bir marta (render() da) yuklaydi — remount qayta yuklaydi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAct = (m: MemoryItem, a: Act) =>
    void run(async () => {
      if (a === "delete" && !(await confirm("O'chirilsinmi?"))) return;
      try {
        await api(`/app/api/memory/${m.id}/${a}`, { method: "POST" });
        toast(a === "approve" ? "Tasdiqlandi" : a === "archive" ? "Arxivlandi" : "O'chirildi");
        render();
      } catch (e) {
        toast((e as Error).message, "err");
      }
    });

  return (
    <MemoryListView
      seg={<MemSeg />}
      err={err}
      grouped={data ? groupMemory(data.memory, (k) => deptNameOf(data.depts, k)) : null}
      busy={busy}
      onAct={onAct}
    />
  );
}

export default function Memory() {
  const { prefs } = useAdmin();
  if (prefs.memView === "graph") return <Graph scope="xotira" seg={<MemSeg />} />;
  return <MemoryList />;
}

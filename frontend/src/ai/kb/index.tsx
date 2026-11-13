"use client";
// Bilimlar — eski kbSeg/bindKbSeg/vKb (admin.html 727–733, 875–950): daraxt / graf almashtirgich, tasdiq kutayotganlar,
// bo'lim → mavzu → hujjat daraxti, hujjatni ochish/tasdiqlash/rad etish/o'chirish, yangi hujjat (matn yoki PDF),
// chatlardan ajratish. Bir vaqtda bitta amal (useBusy) — qayta bosilsa ikkita oyna ochilmaydi.
import { useEffect, useState, type MouseEvent } from "react";

import { api } from "@/shared/api/client";
import { useBusy } from "@/shared/ui/panel/ui";
import Graph from "@/ai/graph";
import { useAdmin, type Dept } from "@/ai/shell/AdminContext";

import { extractedCount, type ExtractResult, type KbDoc } from "./kb.lib";
import { AddSheetView, DocSheet, deptName, KbSegView, KbStatus, KbView, type AddForm, type KbFull } from "./ui";

/** eski kbSeg() + bindKbSeg() */
function KbSeg() {
  const { prefs, setPref } = useAdmin();
  return <KbSegView graph={prefs.kbView === "graph"} onView={(v) => setPref("kbView", v)} />;
}

function AddSheet({ depts }: { depts: Dept[] }) {
  const { toast, closeSheet, render } = useAdmin();
  const [v, setV] = useState<AddForm>({ dept: "umumiy", path: "", title: "", body: "" });
  const [pdf, setPdf] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const b = { dept: v.dept, path: v.path.trim(), title: v.title.trim(), body: v.body.trim() };
    if (!pdf && (!b.title || !b.body)) return toast("Sarlavha va matn kerak", "err");
    setBusy(true);
    try {
      if (pdf) {
        // PDF: matn (skan sahifalar OCR) server tomonda ajratiladi, katta hujjat bo'laklarga bo'linadi
        const f = new FormData();
        f.append("file", pdf);
        f.append("dept", b.dept);
        f.append("path", b.path);
        f.append("title", b.title);
        const r = await api<{ message: string }>("/app/api/kb/pdf", { body: f });
        toast(r.message);
      } else {
        await api("/app/api/kb", { method: "POST", body: b });
        toast("Qo'shildi");
      }
      closeSheet();
      render();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AddSheetView
      depts={depts}
      v={v}
      pdf={pdf}
      busy={busy}
      set={(k, val) => setV((x) => ({ ...x, [k]: val }))}
      onPdf={setPdf}
      onSave={() => void save()}
    />
  );
}

export default function Kb() {
  const { depts, reloadOverview, prefs, toast, confirm, openSheet, render } = useAdmin();
  const graph = prefs.kbView === "graph";
  const [ready, setReady] = useState(false);
  const [docs, setDocs] = useState<KbDoc[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [busy, run] = useBusy();

  // eski: if (!state.depts.length) await loadOverview(); keyin graf yoki GET /app/api/kb
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!depts.length) await reloadOverview();
      if (!alive) return;
      setReady(true);
      if (graph) return;
      const r = await api<{ docs: KbDoc[] }>("/app/api/kb");
      if (alive) setDocs(r.docs);
    })().catch((e: Error) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
    // depts — faqat birinchi yuklashda (eski render() ham har safar boshidan chizadi)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, reloadOverview]);

  if (err !== null) return <KbStatus err={err} />;
  if (!ready) return <KbStatus />;
  if (graph) return <Graph seg={<KbSeg />} />;
  if (!docs) return <KbStatus />;

  const dn = (k: string) => deptName(depts, k);

  // hujjat yuklanguncha qayta bosilsa ikkita oyna ochilmasin; tasdiqlash/o'chirish ham bir vaqtda bittadan
  const open = (id: KbDoc["id"]) =>
    void run(async () => {
      try {
        const d = await api<KbFull>(`/app/api/kb/${id}`);
        openSheet(<DocSheet d={d} dn={dn(d.dept)} />);
      } catch (e) {
        toast((e as Error).message, "err");
      }
    });

  const decide = (id: KbDoc["id"], act: "approve" | "reject") =>
    void run(async () => {
      if (act === "reject" && !(await confirm("Bilim rad etilsinmi?"))) return;
      try {
        await api(`/app/api/kb/${id}/${act}`, { method: "POST" });
        toast(act === "approve" ? "Tasdiqlandi" : "Rad etildi");
        render();
      } catch (e) {
        toast((e as Error).message, "err");
      }
    });

  const del = (ev: MouseEvent, id: KbDoc["id"]) => {
    ev.stopPropagation();
    void run(async () => {
      if (!(await confirm("Bilim o'chirilsinmi?"))) return;
      try {
        await api(`/app/api/kb/${id}`, { method: "DELETE" });
        toast("O'chirildi");
        render();
      } catch (e) {
        toast((e as Error).message, "err");
      }
    });
  };

  const extract = async () => {
    if (extracting) return;
    setExtracting(true);
    toast("Yozishmalar tahlil qilinmoqda… (1–2 daqiqa)");
    try {
      const { result } = await api<{ result: ExtractResult }>("/app/api/knowledge/extract", { method: "POST" });
      const add = extractedCount(result);
      toast(add ? `${add} ta bilim qo'shildi/yangilandi` : "Yangi bilim topilmadi");
      render();
    } catch (e) {
      toast((e as Error).message, "err");
      setExtracting(false);
    }
  };

  return (
    <KbView
      seg={<KbSeg />}
      docs={docs}
      depts={depts}
      busy={busy}
      extracting={extracting}
      onOpen={open}
      onDecide={decide}
      onDel={del}
      onExtract={() => void extract()}
      onAdd={() => openSheet(<AddSheet depts={depts} />)}
    />
  );
}

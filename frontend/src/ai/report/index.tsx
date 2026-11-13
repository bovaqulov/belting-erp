"use client";
// Kunlik hisobot formasi (xodim) — /app/report?dept=<bo'lim>&date=<YYYY-MM-DD>. Eski report.html bilan bir xil:
// GET /app/api/report → shablon maydonlari; POST /app/api/report {dept, date, values}; muvaffaqiyatda tebranish va yopilish.
import { useEffect, useRef, useState, type FormEvent } from "react";

import { api } from "@/shared/api/client";
import { disableZoom, initTelegram, tg } from "@/shared/telegram/telegram";

import { collectValues, type ReportData } from "./report.lib";
import { ReportView, type State } from "./ui";

export default function ReportApp() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [vals, setVals] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<{ lenta: boolean; geo: boolean }>({ lenta: false, geo: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const sending = useRef(false);

  // yozilgan qiymat tasodifan (pastga surish / yopish) yo'qolmasin — Telegram yopishdan oldin so'raydi
  const edit = (key: string, v: string) => {
    setVals((cur) => ({ ...cur, [key]: v }));
    setErr("");
    tg()?.enableClosingConfirmation?.();
  };

  useEffect(() => {
    initTelegram();
    const undo = disableZoom();
    const q = new URLSearchParams(window.location.search);
    const d = q.get("dept") ?? "";
    api<ReportData>(`/app/api/report?dept=${encodeURIComponent(d)}&date=${encodeURIComponent(q.get("date") ?? "")}`)
      .then((data) => {
        setVals(Object.fromEntries(data.template.fields.map((f) => [f.key, String(data.values[f.key] ?? data.auto?.[f.key] ?? "")])));
        setState({ kind: "form", data, dept: d });
      })
      .catch((e: Error) => setState({ kind: "error", msg: e.message }));
    // sotuvchi panelga kirganda shu formaga yo'naltiriladi — Lenta va xaritaga yo'l shu yerdan
    api<{ can_lenta?: boolean; can_geo?: boolean }>("/app/api/me")
      .then((m) => setLinks({ lenta: !!m.can_lenta, geo: !!m.can_geo }))
      .catch(() => {});
    return undo;
  }, []);

  async function submit(e: FormEvent, data: ReportData, dept: string) {
    e.preventDefault();
    if (sending.current) return; // ikki marta bosilsa hisobot ikki marta yuborilmasin
    sending.current = true;
    setBusy(true);
    setErr("");
    try {
      await api("/app/api/report", {
        method: "POST",
        body: { dept, date: data.date, values: collectValues(data.template.fields, vals) },
      });
      tg()?.HapticFeedback?.notificationOccurred?.("success");
      tg()?.disableClosingConfirmation?.();
      setState({ kind: "done" });
      setTimeout(() => tg()?.close(), 1200);
    } catch (err) {
      // xato forma ichida ko'rsatiladi (alert oynasi yopilgach nima bo'lgani ko'rinmay qolardi)
      tg()?.HapticFeedback?.notificationOccurred?.("error");
      setErr((err as Error).message || "Yuborib bo'lmadi. Qayta urining.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <ReportView
      state={state}
      vals={vals}
      links={links}
      busy={busy}
      err={err}
      onEdit={edit}
      onSubmit={(e, data, dept) => void submit(e, data, dept)}
      onRetry={() => window.location.reload()}
    />
  );
}

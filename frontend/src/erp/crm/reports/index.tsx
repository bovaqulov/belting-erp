"use client";
// CRM hisoboti: davr (bu oy / o'tgan oy / 30 kun — eslab qolinadi) → GET reports?from=&to=.
import { useState } from "react";

import { useLoad } from "@/erp/kit/ui";
import { api } from "@/erp/crm/api";
import { useCrm } from "@/erp/crm/context";
import { ls, qs, type Report } from "@/erp/crm/lib";

import { ReportsView } from "./ui";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Davr → [from, to] (mahalliy sana) */
export function range(per: string, now = new Date()): [string, string] {
  if (per === "prev") return [ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), ymd(new Date(now.getFullYear(), now.getMonth(), 0))];
  if (per === "30") return [ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)), ymd(now)];
  return [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), ymd(now)];
}

export function Reports({ tick }: { tick: number }) {
  const crm = useCrm();
  const [per, setPer] = useState(() => ls<string>("rper") || "month");
  const [from, to] = range(per);
  const st = useLoad(() => api<Report>(`/app/api/erp/crm/reports?${qs({ from, to })}`), [from, to, tick]);
  return (
    <ReportsView
      st={st}
      per={per}
      stg={crm.stg}
      onPer={(v) => {
        setPer(v);
        ls("rper", v);
      }}
    />
  );
}

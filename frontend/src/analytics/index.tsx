"use client";
// /app/analytics — Analitika: rahbariyat uchun bitta ekran (savdo, ombor, marketplace). Holat va API shu yerda,
// ko'rinish — ui.tsx, formatlash — analytics.lib.ts.
import { useEffect, useState } from "react";

import { api } from "@/shared/api/client";
import s from "@/shared/ui/panel/styles";
import { Icon } from "@/shared/ui/panel/ui";
import { disableZoom, initTelegram } from "@/shared/telegram/telegram";

import type { Analytics, Period } from "./analytics.lib";
import { AnalyticsView } from "./ui";

export default function AnalyticsApp() {
  const [period, setPeriod] = useState<Period>(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    initTelegram();
    return disableZoom();
  }, []);
  useEffect(() => {
    let alive = true;
    api<Analytics>(`/app/api/analytics?days=${period}`).then(
      (d) => alive && (setData(d), setErr("")),
      (e: Error) => alive && setErr(e.message),
    );
    return () => {
      alive = false;
    };
  }, [period]);
  return (
    <>
      <div className={s.top}>
        <div className={s.wrap}>
          <div className={s.bar}>
            <a className={s["icon-btn"]} href="/app" title="Bo'limlar" aria-label="Bo'limlar">
              <Icon name="layout-grid" />
            </a>
            <div className={s.ttl}>
              <h1>Analitika</h1>
              <p>Savdo, ombor va marketplace ko&apos;rsatkichlari</p>
            </div>
          </div>
        </div>
      </div>
      <main className={s.wrap}>
        <AnalyticsView d={data && data.period.days === period ? data : null} err={err} period={period} onPeriod={setPeriod} />
      </main>
    </>
  );
}

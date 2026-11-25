// Hisobot: javob tezligi (SLA), xodimlar, javobsiz mijozlar, voronka, muddati o'tgan vazifalar. 7 / 30 kun.
import { useEffect, useState } from "react";

import { getReport, setSla, type Account, type CrmReport } from "@/tgcrm/api";

import { ReportView } from "./ui";

export default function Report({ account, onBack, onOpenChat }: { account: Account; onBack: () => void; onOpenChat: (peer: number) => void }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<CrmReport | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    getReport(account.id, days).then(
      (r) => {
        if (!alive) return;
        setData(r);
        setErr("");
      },
      (e: Error) => alive && setErr(e.message),
    );
    return () => {
      alive = false;
    };
  }, [account.id, days]);

  return (
    <ReportView
      account={account}
      days={days}
      data={data?.days === days ? data : null}
      err={err}
      onDays={setDays}
      onBack={onBack}
      onOpenChat={onOpenChat}
      onSla={async (m) => {
        try {
          setData(await setSla(account.id, m, days));
        } catch (e) {
          setErr((e as Error).message);
        }
      }}
    />
  );
}

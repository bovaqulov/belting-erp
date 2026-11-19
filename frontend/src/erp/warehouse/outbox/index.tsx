"use client";
// Internetsiz navbat holati: navbatdagi amallar soni («Yuborish»), server rad etganlari («Ko'rish» — sababi bilan,
// o'chirish). Navbat o'zi yuboriladi: sahifa ochilganda, internet qaytganda va har 20 soniyada.
import { useEffect, useSyncExternalStore } from "react";

import { toast } from "@/erp/kit/env";
import { flushOutbox, outbox, outTitle } from "@/erp/warehouse/api";
import { useWh } from "@/erp/warehouse/context";

import { OutboxView } from "./ui";

const EMPTY = { pending: [], failed: [] };

export function Outbox() {
  const { choose } = useWh();
  const s = useSyncExternalStore(outbox.subscribe, outbox.get, () => EMPTY);
  useEffect(() => {
    const go = () => void flushOutbox().catch(() => 0);
    go();
    window.addEventListener("online", go);
    const t = window.setInterval(() => {
      if (outbox.get().pending.length) go();
    }, 20_000);
    return () => {
      window.removeEventListener("online", go);
      window.clearInterval(t);
    };
  }, []);
  if (!s.pending.length && !s.failed.length) return null;
  return (
    <OutboxView
      pending={s.pending.length}
      failed={s.failed.length}
      onSend={async () => {
        const n = await flushOutbox().catch(() => 0);
        toast(n ? `${n} amal yuborildi` : "Hali internet yo'q — keyinroq o'zi yuboriladi", n ? "ok" : "info");
      }}
      onFailed={async () => {
        const a = await choose("Server rad etgan amallar", [
          ...s.failed.map((x) => ({ value: x.key, label: outTitle(x.path), sub: `${x.err ?? ""} · ${new Date(x.at).toLocaleString("uz")}`, icon: "alert", color: "red" })),
          { value: "*", label: "Hammasini o'chirish", sub: "Amallarni qo'lda qaytadan bajaring", icon: "trash", danger: true },
        ]);
        if (a === "*") outbox.dropFailed();
        else if (a) outbox.dropFailed(a);
      }}
    />
  );
}

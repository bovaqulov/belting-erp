"use client";
// Bitim tarixi: yozish (izoh, vazifa muddat/ijrochi bilan, qo'ng'iroq, uchrashuv; Ctrl+Enter) va vaqt chizig'i
// (faolliklar + bosqichlar tarixi; vazifani "bajarildi" deb belgilash — natija so'raladi).
import { useState } from "react";

import { toast } from "@/erp/kit/env";
import { post } from "@/erp/crm/api";
import { useCrm } from "@/erp/crm/context";
import { timeline, tomorrow10, type Activity as Act, type DealDetail } from "@/erp/crm/lib";

import { ActivityView, type CK } from "./ui";


export function Activity({ d, onChanged }: { d: DealDetail; onChanged: (taskChanged: boolean) => void }) {
  const crm = useCrm();
  const [ck, setCk] = useState<CK>("comment");
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [who, setWho] = useState(String(d.owner_tg || crm.me.tg_id));
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const t = text.trim();
    if (!t) return;
    const body: Record<string, unknown> = { kind: ck, text: t, deal_id: d.id };
    if (ck === "task") {
      if (!due) return toast("Muddatni tanlang", "bad");
      body.due = new Date(due).toISOString();
      body.assignee = Number(who);
    }
    setBusy(true);
    try {
      await post("/app/api/erp/crm/activity", body);
      toast("Qo'shildi");
      setText("");
      onChanged(ck === "task");
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const done = async (a: Act) => {
    const res = await crm.ask("Vazifa bajarildi", { label: "Natija (ixtiyoriy)", multiline: true, ok: "Bajarildi" });
    if (res === null) return;
    try {
      await post(`/app/api/erp/crm/tasks/${a.id}/done`, { result: res });
      onChanged(true);
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  return (
    <ActivityView
      ck={ck}
      text={text}
      due={due}
      who={who}
      busy={busy}
      evs={timeline(d)}
      userList={crm.meta.users}
      stg={crm.stg}
      users={crm.users}
      onCk={(k) => {
        setCk(k);
        if (k === "task" && !due) setDue(tomorrow10());
      }}
      onText={setText}
      onDue={setDue}
      onWho={setWho}
      onAdd={() => void add()}
      onDone={(a) => void done(a)}
    />
  );
}

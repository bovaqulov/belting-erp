"use client";
// Bitim kartochkasidagi «Mijoz bilan aloqa»: ikki tab —
//  · Chatlar: bitim mijoziga biriktirilgan o'z chatlari (Telegram / WhatsApp / Instagram — yozishmalar shaxsiy), bir nechta
//    bo'lsa tanlov, yozishma va javob (telegram/ChatThread); «Chatni ulash» — o'z chatlaridan birini shu mijozga biriktirish
//    (tg/chats/{id}/link).
//  · Qo'ng'iroqlar: mijoz qo'ng'iroqlari (IP-telefoniya webhook'i yoki qo'lda; calls?customer=), qo'ng'iroq qilish (tel:),
//    qo'lda yozish (calls).
import { useEffect, useState } from "react";

import { toast } from "@/erp/kit/env";
import { dnum } from "@/erp/kit/fmt";
import { useLoad } from "@/erp/kit/ui";
import { api, post } from "@/erp/crm/api";
import { qs, type Call, type CustomerCard } from "@/erp/crm/lib";
import { ChatThread } from "@/erp/crm/telegram";
import { TG, type TgChat, type TgChats } from "@/erp/crm/telegram/tg.lib";

import { DealChatsView, type CallForm, type Tab } from "./ui";

const C = "/app/api/erp/crm";
const EMPTY: CallForm = { direction: "out", status: "answered", minutes: "", note: "" };

export function DealChats({
  customerId,
  dealId,
  docked,
  onCount,
  onClose,
  onChanged,
}: {
  customerId: number | null | undefined;
  dealId: number;
  /** katta ekranda o'ngda doimiy (yopish tugmasi kerak emas) */
  docked: boolean;
  onCount?: (n: number) => void;
  onClose?: () => void;
  /** bitim tarixi yangilansin (qo'ng'iroq yozildi) */
  onChanged?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("chats");
  const st = useLoad(() => api<TgChats>(`${TG}/chats?${qs({})}`), [customerId]);
  const all = st.data?.chats ?? [];
  const chats: TgChat[] = customerId ? all.filter((c) => c.customer?.id === customerId) : [];
  const [sel, setSel] = useState<number | null>(null);
  const cur = chats.find((c) => c.id === sel) ?? chats[0] ?? null;
  const [linking, setLinking] = useState(false);
  const [lq, setLq] = useState("");
  const n = st.data ? chats.length : -1;
  const cb = onCount;
  useEffect(() => {
    if (n >= 0) cb?.(n);
  }, [n, cb]);

  // qo'ng'iroqlar va mijoz telefonlari — tab ochilganda
  const calls = useLoad(() => (tab === "calls" && customerId ? api<Call[]>(`${C}/calls?customer=${customerId}`) : Promise.resolve(null)), [tab, customerId]);
  const card = useLoad(() => (tab === "calls" && customerId ? api<CustomerCard>(`${C}/customers/${customerId}`) : Promise.resolve(null)), [tab, customerId]);
  const [form, setForm] = useState<CallForm | null>(null);
  const [busy, setBusy] = useState(false);

  const ql = lq.trim().toLowerCase().replace(/^@/, "");
  const candidates = all
    .filter((c) => c.customer?.id !== customerId)
    .filter((c) => !ql || c.title.toLowerCase().includes(ql) || (c.username ?? "").toLowerCase().includes(ql))
    .slice(0, 30);

  return (
    <DealChatsView
      tab={tab}
      onTab={setTab}
      docked={docked}
      loading={!st.data && !st.err}
      err={st.err}
      hasCustomer={!!customerId}
      chats={chats}
      cur={cur}
      onPick={setSel}
      onClose={onClose}
      thread={cur ? <ChatThread chat={cur} onSent={() => void st.reload()} /> : null}
      linking={linking || (!!st.data && !chats.length && !!customerId)}
      onLinking={setLinking}
      lq={lq}
      onLq={setLq}
      candidates={candidates}
      onLink={async (c) => {
        try {
          await post(`${TG}/chats/${c.id}/link`, { customer_id: customerId });
          toast(`«${c.title}» chati mijozga ulandi`);
          setLinking(false);
          setSel(c.id);
          setLq("");
          void st.reload();
        } catch (e) {
          toast((e as Error).message, "bad");
        }
      }}
      calls={calls.data ?? null}
      callsLoading={tab === "calls" && !!customerId && calls.data === undefined && !calls.err}
      phones={card.data?.phones ?? []}
      form={form}
      busy={busy}
      onForm={(f) => setForm(f === undefined ? EMPTY : f)}
      onSaveCall={async () => {
        if (!form || !customerId) return;
        setBusy(true);
        try {
          await post(`${C}/calls`, {
            customer_id: customerId,
            deal_id: dealId,
            direction: form.direction,
            status: form.status,
            duration: Math.round((Number(dnum(form.minutes)) || 0) * 60),
            note: form.note,
          });
          toast("Qo'ng'iroq yozildi");
          setForm(null);
          void calls.reload();
          onChanged?.();
        } catch (e) {
          toast((e as Error).message, "bad");
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

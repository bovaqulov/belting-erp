"use client";
// Bitim paneli: yuklash, ochilish animatsiyasi va fokus (yopish tugmasiga; yopilganda oldingi joyga), maydonni saqlash,
// bosqichga o'tkazish / yakunlash / voronkani almashtirish; o'ngda — tovarlar va tarix.
import { useEffect, useRef, useState } from "react";

import { toast } from "@/erp/kit/env";
import { dnum, dtitle, num } from "@/erp/kit/fmt";
import { useLoad } from "@/erp/kit/ui";
import { api, post } from "@/erp/crm/api";
import { moveTo, useCrm } from "@/erp/crm/context";
import { days, type DealDetail } from "@/erp/crm/lib";

import { Activity } from "./activity";
import { DealChats } from "./chats";
import { DocModal } from "./doc";
import { Items } from "./items";
import { DealBodyView, DrawerFrame, DrawerLoading } from "./ui";

// yon panel qobig'i — mijoz kartochkasi ham ishlatadi
export { DrawerFrame, DrawerLoading } from "./ui";

export function Deal({ id, onClose }: { id: number; onClose: () => void }) {
  const crm = useCrm();
  const st = useLoad(() => api<DealDetail>(`/app/api/erp/crm/deals/${id}`), [id]);
  const [on, setOn] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const r = requestAnimationFrame(() => setOn(true));
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>(".x")?.focus(), 220);
    return () => {
      cancelAnimationFrame(r);
      clearTimeout(t);
      prev?.focus?.();
    };
  }, []);

  const d = st.data;
  const [chatOpen, setChatOpen] = useState(false);
  const [chatN, setChatN] = useState(0);
  // ochiq hujjat (taklif / buyurtma) — CRM ichidagi oyna; Body qayta yuklanganda yopilib qolmasin
  const [docId, setDocId] = useState<number | null>(null);
  const changed = () => {
    void st.reload();
    crm.refresh();
  };
  const save = async (field: string, value: unknown) => {
    try {
      await post(`/app/api/erp/crm/deals/${id}`, { [field]: value });
      toast("Saqlandi");
      changed();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  return (
    <DrawerFrame on={on} wide={chatN > 0 || chatOpen} title={d ? dtitle(d.title) : "Bitim"} panelRef={panel} onClose={onClose}>
      {!d ? (
        <DrawerLoading err={st.err} onRetry={() => void st.reload()} onClose={onClose} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <Body key={st.at} d={d} save={save} changed={changed} onClose={onClose} chatN={chatN} chatOpen={chatOpen} onChat={setChatOpen} onDoc={setDocId} />
          </div>
          {/* mijoz chatlari: katta ekranda — doim o'ngda, kichikda — «Chat» tugmasi bilan ustidan (saqlashda qayta yuklanmaydi) */}
          <aside
            aria-label="Mijoz bilan chat"
            // katta ekranda — doim yonma-yon (chat bo'lsa yoki qo'lda ochilsa), drawer kengayadi; kichikda — ustidan
            className={`min-h-0 flex-col border-l border-sep ${chatN || chatOpen ? "min-[1280px]:flex min-[1280px]:w-[360px] min-[1280px]:flex-none min-[1500px]:w-[400px]" : ""} ${chatOpen ? "absolute inset-y-0 right-0 z-10 flex w-[min(400px,100%)] shadow-[-8px_0_24px_rgba(0,0,0,.3)] max-md:w-full min-[1280px]:static min-[1280px]:shadow-none" : "hidden"}`}
          >
            <DealChats customerId={d.counterparty_id} dealId={d.id} docked={chatN > 0} onCount={setChatN} onClose={() => setChatOpen(false)} onChanged={changed} />
          </aside>
        </div>
      )}
      {docId ? <DocModal id={docId} onClose={() => setDocId(null)} onChanged={changed} /> : null}
    </DrawerFrame>
  );
}

function Body({
  d,
  save,
  changed,
  onClose,
  chatN,
  chatOpen,
  onChat,
  onDoc,
}: {
  d: DealDetail;
  save: (f: string, v: unknown) => Promise<void>;
  changed: () => void;
  onClose: () => void;
  chatN: number;
  chatOpen: boolean;
  onChat: (open: boolean) => void;
  onDoc: (id: number) => void;
}) {
  const crm = useCrm();
  const { meta, stg, pipes } = crm;
  const st = stg[d.stage];
  const pipe = st?.pipeline || "main";
  const ps = meta.stages.filter((s) => s.pipeline === pipe);
  const opn = ps.filter((s) => s.kind === "open");
  const fin = ps.filter((s) => s.kind !== "open");
  const cur = opn.findIndex((s) => s.code === d.stage);
  const isOpen = !st || st.kind === "open";
  const amount0 = d.amount && Number(d.amount) ? num(d.amount, 0) : "";
  const [amount, setAmount] = useState(amount0);

  const move = async (code: string) => {
    if (code === d.stage) return;
    if (await moveTo(crm, d.id, code)) changed();
  };
  const finish = async () => {
    const s = await crm.choose(
      "Bitimni yakunlash",
      fin.map((x) => ({ value: x.code, label: x.name, color: x.color, sub: x.kind === "won" ? "muvaffaqiyatli" : "muvaffaqiyatsiz" })),
    );
    if (s) await move(s);
  };
  const changePipe = async (p: string) => {
    const s = await crm.choose(
      `${pipes[p]} — qaysi bosqichga?`,
      meta.stages.filter((x) => x.pipeline === p).map((x) => ({ value: x.code, label: x.name, color: x.color })),
    );
    if (s) await move(s);
  };

  return (
    <DealBodyView
      d={d}
      st={st}
      pipe={pipe}
      pipelines={meta.pipelines}
      users={meta.users}
      divisions={meta.divisions ?? []}
      stg={crm.stg}
      isHead={!!crm.me.is_head}
      opn={opn}
      cur={cur}
      isOpen={isOpen}
      amount={amount}
      touched={days(d.touched || d.updated)}
      inStage={days(d.stage_since)}
      items={
        <Items
          d={d}
          closed={!isOpen}
          onDoc={onDoc}
          onSaved={(a) => {
            if (a !== undefined) setAmount(Number(a) ? num(a, 0) : "");
            changed();
          }}
        />
      }
      activity={<Activity d={d} onChanged={changed} />}
      chatN={chatN}
      chatOpen={chatOpen}
      onChat={onChat}
      onClose={onClose}
      onSave={(f, v) => void save(f, v)}
      onPipe={(p) => void changePipe(p)}
      onOpenDeal={crm.openDeal}
      onOpenCustomer={crm.openCustomer}
      onPayment={async () => {
        const v = await crm.ask("To'lov summasi (so'm)", { label: "Summa", placeholder: "Masalan: 5 000 000", ok: "Qo'shish" });
        if (!v) return;
        const amount = dnum(v);
        if (!amount) return toast("Summa noto'g'ri", "bad");
        try {
          const r = await post<{ stage: string }>(`/app/api/erp/crm/deals/${d.id}/payment`, { amount, via: "bank" });
          toast(r.stage === "production" && d.stage !== "production" ? "To'lov qo'shildi — buyurtma ishlab chiqarishga berildi" : "To'lov qo'shildi");
          changed();
        } catch (e) {
          toast((e as Error).message, "bad");
        }
      }}
      onMove={(code) => void move(code)}
      onFinish={() => void finish()}
      onAmount={setAmount}
      onAmountBlur={() => amount !== amount0 && void save("amount", dnum(amount) || "0")}
      onOpenDoc={onDoc}
      onCopyLink={() => {
        const url = `${location.origin}/app/erp/crm/?deal=${d.id}`;
        navigator.clipboard?.writeText(url).then(
          () => toast("Havola nusxalandi"),
          () => toast(url),
        );
      }}
    />
  );
}

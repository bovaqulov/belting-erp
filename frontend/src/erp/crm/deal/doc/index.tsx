"use client";
// Hujjat oynasi (CRM ichida — savdo moduli hali ko'chirilmagan): tijorat taklifi yoki buyurtma — qatorlar va narxlash
// nusxasi (docs/{id}). Chop etish — brauzer (doc.lib), PDF — backend (docs/{id}/pdf). Yuborish: mijoz chatlariga
// (Telegram / WhatsApp — PDF, Instagram — matn; docs/{id}/send) va Didox'ga (qoralama — imzo Didox kabinetida;
// docs/{id}/didox, holat — didox-status). Buyurtma qoralamasi — tasdiqlash.
import { useState } from "react";

import { toast } from "@/erp/kit/env";
import { useLoad } from "@/erp/kit/ui";
import { openBlob } from "@/shared/api/client";
import { api, blob, post } from "@/erp/crm/api";
import { qs, type DocFull } from "@/erp/crm/lib";
import { chOf, TG, type TgChat, type TgChats } from "@/erp/crm/telegram/tg.lib";

import { docHtml } from "./doc.lib";
import { DocView } from "./ui";

const D = "/app/api/erp/crm/docs";

export function DocModal({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const st = useLoad(() => api<DocFull>(`${D}/${id}`), [id]);
  const cid = st.data?.customer_id ?? null;
  const ch = useLoad(() => (cid ? api<TgChats>(`${TG}/chats?${qs({})}`) : Promise.resolve(null)), [cid]);
  const chats: TgChat[] = cid ? (ch.data?.chats ?? []).filter((c) => c.customer?.id === cid) : [];
  const [busy, setBusy] = useState<string>("");

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast(ok);
      void st.reload();
      onChanged();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy("");
    }
  };
  // chop etish: tayyor HTML (qiymatlar ekranlangan — doc.lib) Blob sifatida yangi oynada, yuklangach — print
  const print = (d: DocFull) => {
    const url = URL.createObjectURL(new Blob([docHtml(d, `${location.origin}/app/brand/belting-rezina.png`)], { type: "text/html;charset=utf-8" }));
    const w = window.open(url, "_blank");
    if (!w) {
      URL.revokeObjectURL(url);
      return toast("Brauzer yangi oynani to'sdi — ruxsat bering", "bad");
    }
    w.addEventListener("load", () => {
      w.focus();
      w.print();
    });
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  return (
    <DocView
      st={st}
      busy={busy}
      chats={chats}
      onClose={onClose}
      onPrint={print}
      onPdf={async (d) => {
        setBusy("pdf");
        try {
          openBlob(await blob(`${D}/${d.id}/pdf`), `${d.number || "hujjat"}.pdf`);
        } catch (e) {
          toast((e as Error).message, "bad");
        } finally {
          setBusy("");
        }
      }}
      onConfirm={() => void run("confirm", () => post(`${D}/${id}/confirm`, {}), "Buyurtma tasdiqlandi")}
      onSend={(c) =>
        void run(`send-${c.id}`, () => post(`${D}/${id}/send`, { chat_id: c.id }), `Mijozga ${chOf(c.channel).name} orqali yuborildi`)
      }
      onDidox={(subtype) =>
        void run("didox", () => post(`${D}/${id}/didox`, { subtype }), "Didox'da qoralama yaratildi — kabinetda imzolab yuboring")
      }
      onDidoxStatus={() => void run("didox-status", () => post(`${D}/${id}/didox-status`, {}), "Didox holati yangilandi")}
    />
  );
}

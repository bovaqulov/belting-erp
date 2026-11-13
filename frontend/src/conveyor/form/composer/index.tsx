"use client";
// Zakaz yozish maydoni: kontrollerga ulanadi (L.attachOrderText — matn shu yerdan o'qiladi), qoralama tiklanadi, balandlik
// matnga moslashadi (fitOrder); yozilganda qoralama saqlanadi; yuborish — L.doParse.
import { useEffect, useRef } from "react";

import { DRAFT, LS, type Draft } from "@/conveyor/lib/draft";
import { useLenta } from "@/conveyor/model";

import { ComposerView } from "./ui";

export function Composer() {
  const L = useLenta();
  const t = L.t;
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    L.attachOrderText(ta);
    const txt = (LS.get<Draft>(DRAFT) || {}).text;
    if (txt) ta.value = txt;
    L.fitOrder();
    return () => L.detachOrderText(ta);
  }, [L]);
  return (
    <ComposerView
      t={t}
      taRef={ref}
      follow={L.CHAT.length > 0}
      parsing={L.parsing}
      onInput={() => {
        L.saveDraft();
        L.fitOrder();
      }}
      onParse={() => void L.doParse()}
    />
  );
}

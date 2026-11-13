"use client";
// "Kimga tegishli? Nimaga ishlatiladi?" (bilimlar bazasi uchun): mijoz va qo'llanilishi majburiy (yoki «Keyinroq»).
import { useRef, useState } from "react";

import type { LentaState, Meta } from "@/conveyor/lib/types";
import { useLenta, type Lenta, type MetaAnswer } from "@/conveyor/model";

import { MetaAskView } from "./ui";

function MetaAsk({ fin }: { fin: (v: Meta | null) => void }) {
  const L = useLenta();
  const t = L.t;
  const S = L.S as LentaState;
  // eski: oyna ochilgandagi qiymatlar (value="…")
  const [init] = useState(() => ({
    c: S.projectName || L.META.customer || "",
    k: L.META.contact || S.customerPhone || "",
    a: L.META.application || "",
  }));
  const cRef = useRef<HTMLInputElement>(null),
    kRef = useRef<HTMLInputElement>(null),
    aRef = useRef<HTMLTextAreaElement>(null);
  return <MetaAskView t={t} init={init} cRef={cRef} kRef={kRef} aRef={aRef} onLater={() => fin(null)} onOk={() => {
            // kalitlar tartibi eskidagidek: customer, contact, application (so'rov tanasida ham shu tartib)
            const v = {
              customer: (cRef.current?.value ?? "").trim(),
              contact: (kRef.current?.value ?? "").trim(),
              application: (aRef.current?.value ?? "").trim(),
            };
            if (!v.customer || !v.application) {
              L.toast(t("Mijoz va qo'llanilishini yozing yoki «Keyinroq»ni bosing", "Укажите клиента и применение или нажмите «Позже»"), "err");
              (v.customer ? aRef : cRef).current?.focus();
              return;
            }
            fin(v);
          }} />;
}

/** Oyna fon / "Orqaga" / Esc bilan yopilsa — "cancel": amal bekor qilinadi. (Eskida va'da hal bo'lmay qolardi —
 *  "Telegramga yuborish" tugmasi sahifa qayta yuklanguncha o'chiq turardi.) */
export const askMeta = (L: Lenta) => (): Promise<MetaAnswer> =>
  new Promise((resolve) => {
    let done = false;
    const fin = (v: Meta | null) => {
      if (done) return;
      done = true;
      L.closeSheet();
      resolve(v);
    };
    L.openSheet(
      () => <MetaAsk fin={fin} />,
      () => {
        if (done) return;
        done = true;
        resolve("cancel");
      },
    );
  });

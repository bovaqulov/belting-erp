"use client";
// Mijoz kartasi: mijoz/telefon/muallif — Lenta holatiga bog'langan maydonlar; qo'llanilishi — META (bilimlar bazasi uchun).
import { useRef } from "react";

import { FTxt, useSynced } from "@/conveyor/form/fields";
import type { IssueMarks } from "@/conveyor/lib/logic";
import { useLenta } from "@/conveyor/model";

import { CustomerView } from "./ui";

export function CustCard({ m }: { m: IssueMarks }) {
  const L = useLenta();
  const t = L.t;
  const ref = useRef<HTMLTextAreaElement>(null);
  useSynced(ref, L.META.application || "");
  return (
    <CustomerView
      t={t}
      appRef={ref}
      nameField={<FTxt k="projectName" label={t("Kimga tegishli (mijoz / firma)", "Клиент / фирма")} ph={t("masalan: Megaplast", "например: Megaplast")} m={m} />}
      phoneField={<FTxt k="customerPhone" label={t("Telefon", "Телефон")} ph="+998 __ ___ __ __" mode="tel" m={m} />}
      authorField={<FTxt k="author" label={t("Ishlab chiqdi", "Разработал")} ph={t("chizma sarlavhasiga tushadi", "в штамп чертежа")} m={m} />}
      onApplication={(v) => L.setMetaApplication(v)}
    />
  );
}

// Mijoz kartasi (faqat ko'rinish): kimga tegishli, telefon (bog'langan maydonlar — slot), qo'llanilishi, ishlab chiqdi.
import type { ReactNode, RefObject } from "react";

import { c } from "@/conveyor/kit";

export function CustomerView({
  t,
  appRef,
  nameField,
  phoneField,
  authorField,
  onApplication,
}: {
  t: (uz: string, ru: string) => string;
  appRef: RefObject<HTMLTextAreaElement | null>;
  nameField: ReactNode;
  phoneField: ReactNode;
  authorField: ReactNode;
  onApplication: (v: string) => void;
}) {
  return (
    <section className={c("card custCard")} id="custCard">
      <div className={c("grp h3")} style={{ borderTop: 0 }}>
        {t("Mijoz", "Клиент")}
      </div>
      {nameField}
      {phoneField}
      <div className={c("field col")}>
        <label htmlFor="appText">{t("Nimaga ishlatiladi", "Применение")}</label>
        <textarea
          ref={appRef}
          id="appText"
          autoComplete="off"
          placeholder={t("masalan: non zavodi, xamir yoyish konveyeri", "например: хлебозавод, конвейер раскатки теста")}
          onInput={(e) => onApplication(e.currentTarget.value)}
        />
      </div>
      {authorField}
    </section>
  );
}

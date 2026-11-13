// Zakaz yozish maydoni (faqat ko'rinish; ChatGPT uslubi): matn + yumaloq "Chizish" tugmasi. Kompyuterda Enter — yuborish,
// Shift+Enter — yangi qator; Ctrl/Cmd+Enter — har joyda.
import type { RefObject } from "react";

import { c, Icon } from "@/conveyor/kit";
import { isDesk } from "@/conveyor/model";

export function ComposerView({
  t,
  taRef,
  follow,
  parsing,
  onInput,
  onParse,
}: {
  t: (uz: string, ru: string) => string;
  taRef: RefObject<HTMLTextAreaElement | null>;
  /** suhbat boshlangan — "aniqlashtiring" taklifi */
  follow: boolean;
  parsing: boolean;
  onInput: () => void;
  onParse: () => void;
}) {
  return (
    <div className={c("composer")}>
      <textarea
        ref={taRef}
        className={c("otext")}
        id="orderText"
        rows={1}
        aria-label={t("Zakaz", "Заказ")}
        placeholder={
          follow
            ? t("Aniqlashtiring yoki o'zgartiring…", "Уточните или измените…")
            : t("Zakazni yozing: lenta turi, eni×uzunligi, qulf, profil…", "Опишите заказ: тип ленты, ширина×длина, замок, профили…")
        }
        onInput={onInput}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey || (!e.shiftKey && isDesk() && !e.nativeEvent.isComposing))) {
            e.preventDefault();
            onParse();
          }
        }}
      />
      <button
        className={c("sendc")}
        id="parseBtn"
        disabled={parsing}
        aria-busy={parsing}
        title={parsing ? t("Zakaz o'qilmoqda…", "Разбираем заказ…") : t("Chizish", "Начертить")}
        aria-label={parsing ? t("Zakaz o'qilmoqda…", "Разбираем заказ…") : t("Chizish", "Начертить")}
        onClick={onParse}
      >
        {parsing ? <span className={c("spin sm")} /> : <Icon name="arrow-up" />}
      </button>
    </div>
  );
}

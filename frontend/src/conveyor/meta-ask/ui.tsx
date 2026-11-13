// "Chizma kimga va nima uchun?" oynasi (faqat ko'rinish): mijoz, kontakt, qo'llanilishi; Keyinroq / Davom etish.
import type { RefObject } from "react";

import { c } from "@/conveyor/kit";

export function MetaAskView({
  t,
  init,
  cRef,
  kRef,
  aRef,
  onLater,
  onOk,
}: {
  t: (uz: string, ru: string) => string;
  /** oyna ochilgandagi qiymatlar */
  init: { c: string; k: string; a: string };
  cRef: RefObject<HTMLInputElement | null>;
  kRef: RefObject<HTMLInputElement | null>;
  aRef: RefObject<HTMLTextAreaElement | null>;
  onLater: () => void;
  onOk: () => void;
}) {
  return (
    <div className={c("meta-q")}>
      <h3>{t("Chizma kimga va nima uchun?", "Для кого и для чего чертёж?")}</h3>
      <p>{t("Mijoz va qo'llanilishi bilimlar bazasiga yoziladi (narxsiz).", "Клиент и применение сохранятся в базе знаний (без цен).")}</p>
      <label htmlFor="mqC">{t("Kimga tegishli? (mijoz / firma)", "Кому принадлежит? (клиент / фирма)")}</label>
      <input ref={cRef} id="mqC" defaultValue={init.c} autoComplete="off" enterKeyHint="next" placeholder={t("masalan: Megaplast", "например: Megaplast")} />
      <label htmlFor="mqK">{t("Kontakt (ixtiyoriy)", "Контакт (необязательно)")}</label>
      <input ref={kRef} id="mqK" defaultValue={init.k} inputMode="tel" autoComplete="off" enterKeyHint="next" placeholder="+998 __ ___ __ __" />
      <label htmlFor="mqA">{t("Nimaga ishlatiladi?", "Для чего используется?")}</label>
      <textarea
        ref={aRef}
        id="mqA"
        defaultValue={init.a}
        placeholder={t("masalan: non zavodi, xamir yoyish konveyeri", "например: хлебозавод, конвейер раскатки теста")}
      />
      <div className={c("row")}>
        <button className={c("btn sec")} data-a="later" onClick={onLater}>
          {t("Keyinroq", "Позже")}
        </button>
        <button
          className={c("btn")}
          data-a="ok"
          onClick={onOk}
        >
          {t("Davom etish", "Продолжить")}
        </button>
      </div>
    </div>
  );
}

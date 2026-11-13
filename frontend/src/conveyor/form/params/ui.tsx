// "Tushunilgan parametrlar" kartasi (faqat ko'rinish): sarlavha (xulosa, holat nuqtasi), savollar, asosiy maydonlar,
// "Qo'shimcha" opsiyalar qatori (sarlavha, xulosa, nuqta, kalit, ichki maydonlar). Kompyuterda doim ochiq.
import type { ReactNode, Ref } from "react";

import { c, Icon } from "@/conveyor/kit";
import { isDesk } from "@/conveyor/model";

type T = (uz: string, ru: string) => string;

/** "Aniqlashtiring" — savollar sarlavhasi (yon panel va mobil tasma) */
export const askTitle = (t: (uz: string, ru: string) => string) => t("Aniqlashtiring", "Уточните");

export function QuestionsView({ t, questions }: { t: T; questions: string[] }) {
  if (!questions.length) return null;
  return (
    <div className={c("qs")}>
      <div className={c("qh")}>
        <Icon name="help" />
        <span>{askTitle(t)}</span>
      </div>
      <ul>
        {questions.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

export function OptRowView({
  optKey,
  title,
  summary,
  hidden,
  on,
  fieldCls,
  dots,
  sw,
  msg,
  body,
}: {
  optKey: string;
  title: string;
  summary: string;
  /** shart bajarilmasa — qator yashirin */
  hidden: boolean;
  /** opsiya yoqilgan — ichki maydonlar ko'rinadi */
  on: boolean;
  fieldCls?: string;
  dots: string[];
  sw: ReactNode;
  msg: ReactNode;
  body: ReactNode;
}) {
  return (
    <div className={c("opt", hidden && "hide")} data-opt={optKey}>
      <div className={c("field", fieldCls)}>
        <label>
          {title}
          <small data-sum={optKey}>{summary}</small>
        </label>
        <span className={c("dot", ...dots)} data-dot={optKey} />
        {sw}
        {msg}
      </div>
      <div className={c("ob", !on && "hide")} data-ob={optKey}>
        {body}
      </div>
    </div>
  );
}

export function ParamsView({
  t,
  paramsRef,
  summary,
  pDot,
  questionsNode,
  essentials,
  opts,
}: {
  t: T;
  paramsRef: Ref<HTMLDetailsElement>;
  summary: string;
  pDot: string;
  questionsNode: ReactNode;
  essentials: ReactNode;
  opts: ReactNode;
}) {
  return (
    <details className={c("card pcard params")} id="params" ref={paramsRef}>
      <summary
        onClick={(e) => {
          if (isDesk()) e.preventDefault();
        }}
      >
        <div className={c("main")}>
          <div className={c("t")}>{t("Tushunilgan parametrlar", "Распознанные параметры")}</div>
          <div className={c("s")} data-sum="belt">
            {summary}
          </div>
        </div>
        <span className={c("dot", pDot)} id="pDot" />
        <span className={c("chev")}>
          <Icon name="chevron-down" />
        </span>
      </summary>
      <div id="qbox">
        {questionsNode}
      </div>
      {essentials}
      <div className={c("grp h3")}>{t("Qo'shimcha", "Дополнительно")}</div>
      {opts}
    </details>
  );
}

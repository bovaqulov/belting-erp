// Markaz (faqat ko'rinish; eski #center): list tablari, masshtab tugmalari, xatolar/ogohlantirishlar, chizma ko'ruvchi
// (#vscroll), bo'sh holat (namunalar). SVG — backend chizgan (server SVG): dangerouslySetInnerHTML faqat shu uchun.
import type { ReactNode, Ref } from "react";

import { c, Icon } from "@/conveyor/kit";
import { tabName } from "@/conveyor/lib/logic";
import type { Lang, RenderResp } from "@/conveyor/lib/types";
import type { ViewMode } from "@/conveyor/model";

type T = (uz: string, ru: string) => string;

const EXAMPLES = [
  { text: "U13 ko'k, 600×5000, MR01 qulf", note: ["Oddiy lenta, mexanik qulf", "Простая лента, механический замок"] },
  { text: "F21 FDA 3 mm, 800×12000, L50 profil har 300 mm", note: ["Ko'ndalang profillar bilan", "С поперечными профилями"] },
  { text: "U10, 400×3000, ostidan K10", note: ["Ostidan yo'naltiruvchi bilan", "С направляющей снизу"] },
] as const;

export function EmptyView({ t, parsing, onExample }: { t: T; parsing: boolean; onExample: (text: string) => void }) {
  return (
    <div className={c("empty")}>
      <div className={c("ico")}>
        <Icon name="ruler" />
      </div>
      <h2>{t("Chizma shu yerda chiqadi", "Здесь появится чертёж")}</h2>
      <p>
        {t(
          "Pastda zakazni yozing va yuboring — yoki namunadan boshlang:",
          "Опишите заказ внизу и отправьте — или начните с примера:",
        )}
      </p>
      {EXAMPLES.map((x, i) => (
        <button
          key={i}
          className={c("ex")}
          data-ex={i}
          disabled={parsing}
          onClick={() => onExample(x.text)}
        >
          <Icon name="file-text" />
          <span className={c("m")}>
            {x.text}
            <small>{t(x.note[0], x.note[1])}</small>
          </span>
          <Icon name="chevron-right" />
        </button>
      ))}
    </div>
  );
}

export function IssuesView({
  t,
  list,
  lang,
  renderFail,
  onRetry,
}: {
  t: T;
  list: NonNullable<RenderResp["issues"]>;
  lang: Lang;
  renderFail: boolean;
  onRetry: () => void;
}) {
  const txt = (i: (typeof list)[number]) => (lang === "ru" ? i.ru || i.message : i.message);
  const errs = list.filter((i) => i.level === "error"),
    warns = list.filter((i) => i.level !== "error");
  return (
    <div className={c("iss-line")} id="issuesBox">
      {renderFail ? (
        <div className={c("iss error")} role="alert">
          <Icon name="circle-alert" />
          <div>
            {t("Chizma yangilanmadi — ekrandagisi eski bo'lishi mumkin.", "Чертёж не обновился — на экране может быть старый.")}{" "}
            <button className={c("lnk")} id="retryBtn" onClick={onRetry}>
              {t("Qayta urinish", "Повторить")}
            </button>
          </div>
        </div>
      ) : null}
      {errs.map((i, n) => (
        <div key={n} className={c("iss error")}>
          <Icon name="circle-alert" />
          <div>{txt(i)}</div>
        </div>
      ))}
      {warns.length === 1 ? (
        // bitta ogohlantirish — yig'masdan, to'g'ridan-to'g'ri (bosib ochish shart emas)
        <div className={c("iss warning")}>
          <Icon name="triangle-alert" />
          <div>{txt(warns[0])}</div>
        </div>
      ) : warns.length ? (
        <details className={c("fold warns")}>
          <summary>
            <Icon name="triangle-alert" />
            <span>
              {warns.length} {t("ta ogohlantirish", "предупр.")}
            </span>
            <Icon name="chevron-down" />
          </summary>
          {warns.map((i, n) => (
            <div key={n} className={c("iss warning")}>
              <Icon name="triangle-alert" />
              <div>{txt(i)}</div>
            </div>
          ))}
        </details>
      ) : null}
    </div>
  );
}

export function CenterView({
  t,
  lang,
  sh,
  i,
  cur,
  view,
  message,
  tabsDrawn,
  tools,
  zoomTools,
  busy,
  parsing,
  empty,
  issues,
  centerRef,
  viewerRef,
  vscrollRef,
  vpaperRef,
  tabsRef,
  onTab,
}: {
  t: T;
  lang: Lang;
  sh: RenderResp["sheets"];
  i: number;
  cur: string | null;
  view: ViewMode;
  message?: string | null;
  tabsDrawn: boolean;
  /** masshtab tugmalari o'chiq */
  tools: boolean;
  /** [id, ikonka, yorliq, bosilganda, qo'shimcha klass] */
  zoomTools: [string, string, string, () => void, string?][];
  busy: boolean;
  parsing: boolean;
  /** bo'sh holat (konteyner) */
  empty: ReactNode;
  /** xatolar qatori (chizilgan bo'lsa) */
  issues: ReactNode | null;
  /** kontroller DOM havolalari (L.refFor) */
  centerRef: Ref<HTMLElement>;
  viewerRef: Ref<HTMLDivElement>;
  vscrollRef: Ref<HTMLDivElement>;
  vpaperRef: Ref<HTMLDivElement>;
  tabsRef: Ref<HTMLDivElement>;
  onTab: (key: string) => void;
}) {
  let content: ReactNode = null;
  if (view === "empty") content = empty;
  else if (view === "skel") content = <div className={c("skel")} />;
  else if (view === "sheet") {
    content =
      !sh.length || i < 0 ? (
        <div className={c("vmsg")}>{message || "—"}</div>
      ) : (
        <div
          key={cur}
          className={c("vpaper")}
          id="vpaper"
          title={sh[i].title}
          ref={vpaperRef}
          dangerouslySetInnerHTML={{ __html: sh[i].svg }}
        />
      );
  }

  return (
    <section className={c("centerCol")} id="center" ref={centerRef}>
      <div className={c("vhead", tabsDrawn && !sh.length && "hide")}>
        <div className={c("tabs")} id="tabs" role="tablist" ref={tabsRef}>
          {tabsDrawn &&
            sh.map((s) => (
              <button
                key={s.key}
                className={c("tab", s.key === cur && "on")}
                role="tab"
                aria-selected={s.key === cur}
                data-tab={s.key}
                title={s.title}
                onClick={() => onTab(s.key)}
              >
                {tabName(s, lang)}
              </button>
            ))}
        </div>
        <div className={c("tools")}>
          {zoomTools.map(([id, icon, label, onClick, cls]) => (
            <button key={id} className={c("icon-btn", cls)} id={id} disabled={tools} title={label} aria-label={label} onClick={onClick}>
              <Icon name={icon} />
            </button>
          ))}
        </div>
      </div>
      {issues ?? <div className={c("iss-line")} id="issuesBox" />}
      <div className={c("viewer", (busy || parsing) && "loading")} id="viewer" aria-busy={busy || parsing} ref={viewerRef}>
        <div className={c("vscroll")} id="vscroll" ref={vscrollRef}>
          {content}
        </div>
        <div className={c("vbusy", parsing && "solid")} role="status">
          <div className={c("spin")} />
          {/* zakaz matnini tahlil qilish bir necha soniya oladi — nima bo'layotgani yozib qo'yiladi */}
          {parsing ? <div className={c("vbusy-t")}>{t("Zakaz o'qilmoqda…", "Разбираем заказ…")}</div> : null}
        </div>
      </div>
    </section>
  );
}

// Lenta chizmasi (faqat ko'rinish): sarlavha (orqaga, logo, foydalanuvchi, menyu), holatlar, asosiy qism, pastki panel
// (chiplar, narx, yuborish, sabab), narx tafsiloti, oynalar, toast; brauzerda kirish ekrani.
import { useEffect, useState, type ReactNode, type RefObject } from "react";

import { money } from "@/conveyor/lib/format";
import type { Lang, PriceResp } from "@/conveyor/lib/types";
import { c, Icon } from "@/conveyor/kit";
import type { Mode, SheetItem, ToastKind } from "@/conveyor/model";

type T = (uz: string, ru: string) => string;

/** Pastdan chiquvchi oyna (ochilish animatsiyasi — mahalliy holat) */
export function SheetView({ render, closing, onBg }: { render: () => ReactNode; closing: boolean; onBg: () => void }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(r);
  }, []);
  const vis = on && !closing;
  return (
    <>
      <div className={c("sheet-bg", vis && "on")} onClick={onBg} />
      <div className={c("sheet", vis && "on")} role="dialog" aria-modal="true">
        <div className={c("grab")} />
        {render()}
      </div>
    </>
  );
}

export type LoginMsg = { kind: "text"; text: string } | { kind: "link"; link: string };

export function LoginScreen({ t, ru, lmsg, onStart }: { t: T; ru: boolean; lmsg: LoginMsg; onStart: () => void }) {
  return (
    <div className={c("login span")}>
      <div className={c("logo")}>
        <Icon name="ruler" />
      </div>
      <h2 style={{ margin: "0 0 6px" }}>{t("Lenta chizmasi", "Чертёж ленты")}</h2>
      <p style={{ color: "var(--hint)", margin: "0 0 22px" }}>{t("Telegram orqali kiring", "Войдите через Telegram")}</p>
      <button className={c("btn")} id="tglogin" onClick={onStart}>
        <Icon name="send" /> {t("Telegram orqali kirish", "Войти через Telegram")}
      </button>
      <p style={{ color: "var(--hint)", fontSize: 14, marginTop: 16 }} id="lmsg">
        {lmsg.kind === "text" ? (
          lmsg.text
        ) : (
          <>
            {ru ? (
              <>
                Откройте бота в Telegram и нажмите <b>Start</b>.
              </>
            ) : (
              <>
                Telegram&apos;da botni oching va <b>Start</b> bosing.
              </>
            )}
            <br />
            <a href={lmsg.link} target="_blank" rel="noreferrer" style={{ color: "var(--link)" }}>
              {t("Havola ochilmasa — shu yerni bosing", "Если не открылось — нажмите здесь")}
            </a>
          </>
        )}
      </p>
    </div>
  );
}

export function PricePopView({ t, p, lang }: { t: T; p: PriceResp | null; lang: Lang }) {
  if (!p) return null;
  const totals: [string, number, string?][] = [
    [t("Jami (QQS'siz)", "Итого (без НДС)"), p.totals.subtotal],
    [t("QQS", "НДС"), p.totals.vatAmount],
    [t("Yakuniy narx", "Итоговая цена"), p.totals.final, "final"],
  ];
  return (
    <div className={c("pop")} id="pricePop" role="dialog">
      {p.lines.map((l, i) => (
        <div key={i} className={c("prow")}>
          <div className={c("main")}>
            <div>{l.title}</div>
            <div className={c("d")}>{l.desc}</div>
          </div>
          <div className={c("a")}>{money(l.amount, lang)}</div>
        </div>
      ))}
      {totals.map(([label, amount, cls]) => (
        <div key={label} className={c("prow", cls)}>
          <div className={c("main")}>{label}</div>
          <div className={c("a")}>{money(amount, lang)}</div>
        </div>
      ))}
    </div>
  );
}

export function ActBarView({
  t,
  lang,
  barRef,
  app,
  has,
  ok,
  busy,
  sending,
  sendLock,
  why,
  chips,
  P,
  popOpen,
  composer,
  onPrice,
  onSend,
}: {
  t: T;
  lang: Lang;
  barRef: RefObject<HTMLDivElement | null>;
  app: boolean;
  /** o'lchamlar kiritilgan */
  has: boolean;
  /** yuborish mumkin */
  ok: boolean;
  busy: boolean;
  sending: boolean;
  sendLock: boolean;
  /** nega yuborib bo'lmaydi (bo'sh — sabab yo'q) */
  why: string;
  chips: string[];
  P: PriceResp | null;
  popOpen: boolean;
  /** yozish maydoni (konteyner) */
  composer: ReactNode;
  onPrice: () => void;
  onSend: () => void;
}) {
  const wait = sending || busy;
  const sendLong = sending ? t("Yuborilmoqda…", "Отправка…") : t("Telegramga yuborish", "Отправить в Telegram");
  const sendShort = sending ? t("Yuborilmoqda…", "Отправка…") : t("Yuborish", "Отправить");
  return (
    <div className={c("actbar", !app && "hide")} id="actbar" ref={barRef}>
      <div className={c("in", !has && "hide")}>
        <div className={c("chips")} id="chips">
          {chips.map((x, i) => (
            <span key={i} className={c("chip")}>
              {x}
            </span>
          ))}
        </div>
        <button
          className={c("pricebtn", !P && "hide", busy && "stale")}
          id="priceBtn"
          aria-haspopup="dialog"
          aria-expanded={popOpen}
          title={t("Narx tafsiloti", "Детали цены")}
          onClick={onPrice}
        >
          {P ? (
            <>
              <small>{t("Jami, QQS bilan", "Итого с НДС")}</small>
              <b>
                {money(P.totals.final, lang)}
                <Icon name="chevron-up" />
              </b>
            </>
          ) : null}
        </button>
        <div className={c("sendwrap")}>
          <button
            className={c("btn")}
            id="sendBtn"
            disabled={!ok || sendLock || sending}
            aria-busy={wait}
            title={busy ? t("Chizma tayyorlanmoqda…", "Готовим чертёж…") : sendLong}
            onClick={onSend}
          >
            {wait ? <span className={c("spin sm")} /> : <Icon name="send" />}
            <span className={c("lbl-l")}>{sendLong}</span>
            <span className={c("lbl-s")}>{sendShort}</span>
          </button>
          <div className={c("why", !why && "hide")} id="sendWhy" role="status">
            {why}
          </div>
        </div>
      </div>
      {composer}
    </div>
  );
}

export function ConveyorView({
  t,
  mode,
  app,
  showBack,
  who,
  login,
  body,
  actbar,
  pricePop,
  sheets,
  fullscreen,
  toastSt,
  onMenu,
  onCloseSheet,
}: {
  t: T;
  mode: Mode;
  app: boolean;
  showBack: boolean;
  who: string;
  login: ReactNode;
  /** forma va ko'ruvchi */
  body: ReactNode;
  actbar: ReactNode;
  pricePop: ReactNode;
  sheets: SheetItem[];
  fullscreen: ReactNode;
  toastSt: { msg: string; kind: ToastKind; shown: boolean } | null;
  onMenu: () => void;
  onCloseSheet: () => void;
}) {
  return (
    <>
    <div className={c("top")}>
      <div className={c("bar")}>
        {showBack ? (
          <a className={c("icon-btn")} id="backBtn" href="/app" title={t("Panelga qaytish", "В панель")} aria-label={t("Panelga qaytish", "В панель")} style={{ display: "grid" }}>
            <Icon name="arrow-left" />
          </a>
        ) : null}
        <div className={c("logo")} id="logo" aria-hidden="true">
          <Icon name="ruler" />
        </div>
        <div className={c("ttl")}>
          <h1 id="h1">{t("Lenta chizmasi", "Чертёж ленты")}</h1>
          <p id="who">{who}</p>
        </div>
        <button className={c("icon-btn")} id="menuBtn" title={t("Menyu", "Меню")} aria-label={t("Menyu", "Меню")} aria-haspopup="menu" disabled={!app} onClick={onMenu}>
          <Icon name="more-horizontal" />
        </button>
      </div>
    </div>
    <main id="app" className={app ? c("app") : undefined}>
      {mode.kind === "loading" && (
        <div className={c("center span")}>
          Yuklanmoqda…
        </div>
      )}
      {mode.kind === "err" && (
        <div className={c("center err span")}>
          {mode.msg}
        </div>
      )}
      {mode.kind === "login" && login}
      {app && body}
    </main>
    {actbar}
    {pricePop}
    {sheets.map((x) => (
      <SheetView key={x.id} render={x.render} closing={x.closing} onBg={onCloseSheet} />
    ))}
    {fullscreen}
    {toastSt && (
      <div
        className={c("toast", toastSt.kind === "err" && "err")}
        id="toast"
        role={toastSt.kind === "err" ? "alert" : "status"}
        style={{ opacity: toastSt.shown ? 1 : 0 }}
      >
        <Icon name={toastSt.kind === "err" ? "x" : "check"} />
        <span>{toastSt.msg}</span>
      </div>
    )}
    </>
  );
}

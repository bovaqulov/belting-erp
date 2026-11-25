// Modul karkasi (ERP kit): kompyuterda — chap menyu (brend, "Bo'limlar"ga qaytish, guruhlangan bo'limlar) + sarlavha;
// telefonda / Telegram ichida — modul o'z tepasini beradi (AppTop + Seg / AppTabs). Demo rejim belgisi — ikkalasida.
// Uslub — Tailwind. Kompyuterda body'ga `mod-desk` qo'yiladi (desk: varianti — oynalar markazda, pastki tugma o'ngda).
// Foydalanuvchilar: Marketplace, Accounting, Ombor.
import { useEffect, type ReactNode } from "react";

import { Icon } from "./ui";
import { FIRM_LOGO } from "@/shared/ui/brand";

export type NavItem = { key: string; label: string; icon: string; on: boolean; onClick: () => void; extra?: ReactNode; /** hali tayyor emas — xira */ dim?: boolean };
export type NavGroup = { title?: string; items: NavItem[] };

/** Demo rejimi belgisi (yopilmaydi): "Qayta tiklash" — boshlang'ich ma'lumotlar */
export const DemoStrip = ({ text, onReset }: { text: string; onReset: () => void }) => (
  <div
    className="flex min-h-9 items-center gap-2 border-b border-sep bg-[color-mix(in_srgb,var(--st-work)_12%,var(--page))] px-4 py-1 text-[13px] [.mod-wide_&]:-mx-3 [.mod-wide_&]:px-7"
    role="status"
  >
    <span className="font-bold whitespace-nowrap text-st-work">Demo rejim</span>
    <span className="min-w-0 flex-1 leading-tight text-sub">{text}</span>
    <button type="button" className="b h-7 flex-none px-2.5 text-[13px]" onClick={onReset}>
      <Icon n="refresh" /> Qayta tiklash
    </button>
  </div>
);

export { FIRM_LOGO };
const Firm = ({ cls = "" }: { cls?: string }) => <span className={`${FIRM_LOGO} ${cls}`} role="img" aria-label="Belting rezina" />;

/** sarlavha ostidagi tanlov tugmasi */
const PICK =
  "-ml-1 flex max-w-full cursor-pointer items-center gap-1 rounded-lg border-0 bg-transparent px-1 py-0.5 text-[15px] font-medium tracking-normal text-link coarse:min-h-11 [&_svg.i]:size-4 [&_svg.i]:flex-none";

const UP = "grid size-11 flex-none cursor-pointer place-items-center rounded-[10px] border-0 bg-transparent p-0 text-link hover:bg-fill [&_svg.i]:size-[22px]";

/** Telefon sarlavhasi: chapda qaytish (havola yoki ilova ichida — onUp), katta sarlavha va izoh */
/** up=null va onUp yo'q — qaytish tugmasi ko'rsatilmaydi */
export const AppTop = ({
  up,
  upLabel = "",
  title,
  sub,
  onUp,
  logo,
  pick,
}: {
  up: string | null;
  upLabel?: string;
  title: string;
  sub?: string;
  onUp?: () => void;
  logo?: boolean;
  /** sarlavha ostida tanlov tugmasi (masalan joriy ombor — bosilsa almashtiriladi) */
  pick?: { label: string; onClick?: () => void };
}) => (
  <div className={`flex items-start gap-1 pt-2.5 ${up || onUp ? "px-2" : "px-3"}`}>
    {onUp ? (
      <button type="button" className={UP} onClick={onUp} aria-label={upLabel} title={upLabel}>
        <Icon n="back" />
      </button>
    ) : up ? (
      <a className={UP} href={up} aria-label={upLabel} title={upLabel}>
        <Icon n="layout-grid" />
      </a>
    ) : null}
    <div className="large min-w-0 flex-1 pt-0.5 pl-1">
      {title}
      {sub ? <small>{sub}</small> : null}
      {pick ? (
        pick.onClick ? (
          <button type="button" className={PICK} onClick={pick.onClick} aria-label={`${pick.label} — almashtirish`}>
            <span className="truncate">{pick.label}</span>
            <Icon n="chevrons-up-down" />
          </button>
        ) : (
          <small>{pick.label}</small>
        )
      ) : null}
    </div>
    {/* firma logosi — sarlavha qatorida o'ngda, ixcham */}
    {logo ? (
      <span className="flex-none self-center pt-1 pr-2">
        <Firm />
      </span>
    ) : null}
  </div>
);

/** Bo'lim tablari (telefon): pastki chiziq bilan — filtr chiplaridan ajralib tursin */
export function AppTabs<K extends string>({ items, cur, onPick, label }: { items: [K, ReactNode, ReactNode?][]; cur: K; onPick: (k: K) => void; label: string }) {
  return (
    // teng bo'linadi, aylanmaydi: tor ekranda nom «…» bilan qisqaradi (to'liq nomi — title)
    <nav className="mx-4 mt-1 flex border-b border-sep" aria-label={label}>
      {items.map(([k, t, extra]) => (
        <button
          key={k}
          type="button"
          title={typeof t === "string" ? t : undefined}
          className={`-mb-px inline-flex min-h-11 min-w-0 flex-auto cursor-pointer items-center justify-center gap-1 border-0 border-b-2 bg-transparent px-1 pt-2.5 pb-[9px] text-[clamp(12.5px,3.7vw,14.5px)] whitespace-nowrap ${cur === k ? "border-link font-semibold text-fg" : "border-transparent font-medium text-hint"}`}
          aria-current={cur === k ? "page" : undefined}
          onClick={() => onPick(k)}
        >
          <span className="min-w-0 truncate">{t}</span>
          {extra}
        </button>
      ))}
    </nav>
  );
}

/** Pastki menyu (telefon): suzuvchi yumaloq panel, tanlangan bo'lim — och fonli «tabletka». data-bnav — base.css shu
 *  bo'lsa kontent va #mainbtn ni menyu balandligicha ko'taradi. Pastki xavfsiz zona: brauzer (env) yoki Telegram to'liq
 *  ekrani (--tg-safe-area-inset-bottom). */
export function BottomTabs<K extends string>({ items, cur, onPick, label }: { items: [K, string, string][]; cur: K; onPick: (k: K) => void; label: string }) {
  return (
    <nav
      data-bnav=""
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(10px,env(safe-area-inset-bottom),var(--tg-safe-area-inset-bottom,0px))]"
      aria-label={label}
    >
      <div className="pointer-events-auto mx-auto flex max-w-[560px] gap-0.5 rounded-[30px] border border-sep bg-sec/92 p-1 shadow-[0_8px_28px_-6px_rgba(0,0,0,.45)] backdrop-blur-[16px] backdrop-saturate-180">
        {items.map(([k, t, icon]) => (
          <button
            key={k}
            type="button"
            title={t}
            className={`flex min-h-[54px] min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[26px] border-0 px-0.5 text-fg [font:inherit] [&_svg.i]:size-6 ${cur === k ? "bg-fill" : "bg-transparent active:bg-fill"}`}
            aria-current={cur === k ? "page" : undefined}
            onClick={() => onPick(k)}
          >
            <Icon n={icon} />
            <span className={`max-w-full truncate text-[11px] leading-tight ${cur === k ? "font-semibold" : "font-medium"}`}>{t}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

/** modul ichida: chiplar bir qatorda aylanadi (telefonda o'ralib ketmasin), raqamlar teng kenglikda */
const MAIN = "[&_.chips]:flex-nowrap [&_.chips]:overflow-x-auto [&_.chips]:pb-0.5 [&_.chips]:[scrollbar-width:none] [&_.chips::-webkit-scrollbar]:hidden [&_.chip]:whitespace-nowrap [&_.chip]:tabular-nums";
/** kompyuterda ikki teng ustun (telefonda — ketma-ket) */
export const WIDE_COLS = "[.mod-wide_&]:grid [.mod-wide_&]:grid-cols-2 [.mod-wide_&]:items-start [.mod-wide_&]:gap-4";
/** matn ko'rinishidagi tugma (havola kabi) */
export const LINK_BTN = "cursor-pointer border-0 bg-transparent p-0 text-link normal-case disabled:cursor-default disabled:opacity-50 coarse:min-h-11";

const SIDE_BTN = "group/nav flex min-h-9 cursor-pointer items-center gap-2.5 rounded-[9px] border-0 px-2.5 py-2 text-left text-[14.5px] [&_svg.i]:size-[18px] [&_svg.i]:flex-none";

export function AppLayout({
  brand,
  logo,
  up = "/app",
  upLabel = "Bo'limlar",
  onUp,
  wide,
  nav,
  title,
  titleAside,
  top,
  demo,
  cls = "",
  children,
}: {
  brand: string;
  /** chap menyuda brend ustida firma logosi */
  logo?: boolean;
  /** null — chap menyuda qaytish havolasi yo'q */
  up?: string | null;
  upLabel?: string;
  /** ilova ichida qaytish (havola o'rniga tugma) */
  onUp?: () => void;
  wide: boolean;
  nav: NavGroup[];
  /** kompyuterdagi sarlavha */
  title: string;
  /** kompyuterda sarlavha yonida (masalan kanal tanlovi) */
  titleAside?: ReactNode;
  /** telefondagi tepa (AppTop + Seg/AppTabs) */
  top: ReactNode;
  demo?: ReactNode;
  cls?: string;
  children: ReactNode;
}) {
  // kompyuterda oynalar (Sheet — body'ga portal) pastdan emas, markazda chiqsin: body.mod-desk (desk: varianti)
  useEffect(() => {
    document.body.classList.toggle("mod-desk", wide);
    return () => document.body.classList.remove("mod-desk");
  }, [wide]);
  const upCls = "inline-flex items-center gap-1 self-start rounded-md border-0 bg-transparent pt-0.5 pr-2 pb-2.5 pl-1.5 text-[13px] text-hint hover:text-link [&_svg.i]:size-[15px]";
  return (
    <div className={`min-h-screen min-h-dvh ${wide ? "mod-wide pl-[232px]" : ""} ${cls}`}>
      {wide ? (
        <nav
          className="fixed top-0 bottom-0 left-0 z-20 flex w-[232px] flex-col gap-0.5 overflow-y-auto border-r border-sep bg-sec px-2 pt-4 pb-6"
          aria-label={`${brand} bo'limlari`}
        >
          <div className={`flex items-center justify-between gap-2 px-2.5 pt-0.5 ${up || onUp ? "" : "mb-2"}`}>
            <span className={`min-w-0 truncate font-bold ${logo ? "text-lg" : "text-xl"}`}>{brand}</span>
            {logo ? <Firm cls="!h-[11px]" /> : null}
          </div>
          {onUp ? (
            <button type="button" className={`${upCls} cursor-pointer`} onClick={onUp}>
              <Icon n="back" /> {upLabel}
            </button>
          ) : up ? (
            <a className={upCls} href={up}>
              <Icon n="back" /> {upLabel}
            </a>
          ) : null}
          {nav.map((g, i) => (
            <div key={g.title ?? i} className="flex flex-col gap-0.5" role="group" aria-label={g.title}>
              {g.title ? <div className="mx-2.5 mt-3 mb-0.5 text-[12.5px] font-semibold text-hint">{g.title}</div> : null}
              {g.items.map((x) => (
                <button
                  key={x.key}
                  type="button"
                  className={`${SIDE_BTN} ${x.on ? "bg-btn text-btn-fg [&_svg.i]:text-btn-fg" : `bg-transparent hover:bg-fill [&_svg.i]:text-hint ${x.dim ? "text-hint" : "text-fg"}`}`}
                  aria-current={x.on ? "page" : undefined}
                  onClick={x.onClick}
                >
                  <Icon n={x.icon} />
                  {x.label}
                  {x.extra}
                </button>
              ))}
            </div>
          ))}
        </nav>
      ) : null}
      <main className={`min-w-0 ${MAIN} ${wide ? "max-w-[1400px] px-3 pb-10 [&_.btns]:max-w-[420px]" : "pb-[calc(40px+var(--safe-b,0px))]"}`}>
        {demo}
        {!wide ? (
          top
        ) : titleAside ? (
          <div className="mx-4 mt-[18px] mb-1 flex flex-wrap items-center gap-x-6 gap-y-2">
            <h1 className="text-[26px] font-bold tracking-[-0.01em]">{title}</h1>
            {titleAside}
          </div>
        ) : (
          <h1 className="mx-4 mt-[18px] mb-1 text-[26px] font-bold tracking-[-0.01em]">{title}</h1>
        )}
        {children}
      </main>
    </div>
  );
}

/** Menyudagi son (masalan "yangi | yig'ilmoqda"): tanlangan bo'limda rangi tugma matniga moslanadi */
export const NAV_CNT = "ml-auto text-xs tabular-nums opacity-85";
/** e'tibor talab qiladigan son: qizil (tanlangan bo'limda — oq) */
export const NAV_HOT = "text-danger group-aria-[current=page]/nav:text-inherit";
/** son nishoni: e'tibor talab qiladi (qizil) yoki oddiy (kulrang, joriy matn rangidan) */
export const PILL_HOT = "ml-auto min-w-5 rounded-full bg-danger px-1.5 text-center text-xs leading-5 font-semibold text-white tabular-nums";
export const PILL = "ml-auto min-w-5 rounded-full bg-[color-mix(in_srgb,currentColor_16%,transparent)] px-1.5 text-center text-xs leading-5 tabular-nums";
/** telefon tabidagi son */
export const TAB_CNT = "ml-1 text-xs text-danger tabular-nums";

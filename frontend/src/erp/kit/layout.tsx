// Modul karkasi (ERP kit): kompyuterda — chap menyu (brend, "Bo'limlar"ga qaytish, guruhlangan bo'limlar) + sarlavha;
// telefonda / Telegram ichida — modul o'z tepasini beradi (AppTop + Seg / AppTabs). Demo rejim belgisi — ikkalasida.
// Uslub: kit.css (.mod*; .app ui.css'da band — ilova ikonkasi). Foydalanuvchilar: Marketplace, Accounting.
import { useEffect, type ReactNode } from "react";

import { Icon } from "./ui";

import "./kit.css";

export type NavItem = { key: string; label: string; icon: string; on: boolean; onClick: () => void; extra?: ReactNode };
export type NavGroup = { title?: string; items: NavItem[] };

/** Demo rejimi belgisi (yopilmaydi): "Qayta tiklash" — boshlang'ich ma'lumotlar */
export const DemoStrip = ({ text, onReset }: { text: string; onReset: () => void }) => (
  <div className="mod-demo" role="status">
    <span className="dtag">Demo rejim</span>
    <span className="dtx">{text}</span>
    <button type="button" className="b" onClick={onReset}>
      <Icon n="refresh" /> Qayta tiklash
    </button>
  </div>
);

/** Telefon sarlavhasi: chapda qaytish (havola yoki ilova ichida — onUp), katta sarlavha va izoh */
export const AppTop = ({ up, upLabel, title, sub, onUp }: { up: string; upLabel: string; title: string; sub?: string; onUp?: () => void }) => (
  <div className="mod-top">
    {onUp ? (
      <button type="button" className="mod-up" onClick={onUp} aria-label={upLabel} title={upLabel}>
        <Icon n="back" />
      </button>
    ) : (
      <a className="mod-up" href={up} aria-label={upLabel} title={upLabel}>
        <Icon n="layout-grid" />
      </a>
    )}
    <div className="large">
      {title}
      {sub ? <small>{sub}</small> : null}
    </div>
  </div>
);

/** Bo'lim tablari (telefon): pastki chiziq bilan — filtr chiplaridan ajralib tursin */
export function AppTabs<K extends string>({ items, cur, onPick, label }: { items: [K, string, ReactNode?][]; cur: K; onPick: (k: K) => void; label: string }) {
  return (
    <nav className="mod-tabs" aria-label={label}>
      {items.map(([k, t, extra]) => (
        <button key={k} type="button" className={cur === k ? "on" : ""} aria-current={cur === k ? "page" : undefined} onClick={() => onPick(k)}>
          {t}
          {extra}
        </button>
      ))}
    </nav>
  );
}

export function AppLayout({
  brand,
  up = "/app",
  upLabel = "Bo'limlar",
  onUp,
  wide,
  nav,
  title,
  top,
  demo,
  cls = "",
  children,
}: {
  brand: string;
  up?: string;
  upLabel?: string;
  /** ilova ichida qaytish (havola o'rniga tugma) */
  onUp?: () => void;
  wide: boolean;
  nav: NavGroup[];
  /** kompyuterdagi sarlavha */
  title: string;
  /** telefondagi tepa (AppTop + Seg/AppTabs) */
  top: ReactNode;
  demo?: ReactNode;
  cls?: string;
  children: ReactNode;
}) {
  // kompyuterda oynalar (Sheet — body'ga portal) pastdan emas, markazda chiqsin: kit.css body.mod-desk .sheet
  useEffect(() => {
    document.body.classList.toggle("mod-desk", wide);
    return () => document.body.classList.remove("mod-desk");
  }, [wide]);
  return (
    <div className={`mod ${wide ? "wide" : ""} ${cls}`}>
      {wide ? (
        <nav className="mod-side" aria-label={`${brand} bo'limlari`}>
          <div className="brand">{brand}</div>
          {onUp ? (
            <button type="button" className="up" onClick={onUp}>
              <Icon n="back" /> {upLabel}
            </button>
          ) : (
            <a className="up" href={up}>
              <Icon n="back" /> {upLabel}
            </a>
          )}
          {nav.map((g, i) => (
            <div key={g.title ?? i} className="grp" role="group" aria-label={g.title}>
              {g.title ? <div className="gh">{g.title}</div> : null}
              {g.items.map((x) => (
                <button key={x.key} type="button" className={x.on ? "on" : ""} aria-current={x.on ? "page" : undefined} onClick={x.onClick}>
                  <Icon n={x.icon} />
                  {x.label}
                  {x.extra}
                </button>
              ))}
            </div>
          ))}
        </nav>
      ) : null}
      <main className="mod-main">
        {demo}
        {wide ? <h1 className="mod-h1">{title}</h1> : top}
        {children}
      </main>
    </div>
  );
}

// CRM ildizi (faqat ko'rinish): sarlavha (bo'limlar, "Mobil", "+ Bitim"), demo rejim belgisi, ishga tushish ekrani.
import type { ReactNode } from "react";

import { Empty, ErrHint, Icon, Skeleton } from "@/erp/kit/ui";
import { SECS, type Sec } from "@/erp/crm/lib";

export const Header = ({ children }: { children?: ReactNode }) => (
  <header className="hdr">
    <div className="hrow">
      <div className="logo">
        CRM <a href="/app/erp">Belting ERP</a>
      </div>
      {children}
    </div>
  </header>
);

/** Ishga tushish: yuklanmoqda (skelet) yoki xato + "Qayta urinish" */
export const BootView = ({ err, net, onRetry }: { err: string; net: boolean; onRetry: () => void }) => (
  <div className="crm">
    <Header />
    <div className="cmain">
      {err ? (
        <Empty icon="alert" title="CRM ochilmadi">
          {err}
          <ErrHint net={net} />
          <div className="btns">
            <button className="btn sec" onClick={onRetry}>
              Qayta urinish
            </button>
          </div>
        </Empty>
      ) : (
        <div style={{ paddingTop: 16 }}>
          <Skeleton />
        </div>
      )}
    </div>
  </div>
);

/** Demo rejimi belgisi (yopilmaydi): ma'lumot faqat shu brauzerda; "Qayta tiklash" — boshlang'ich ma'lumotlar */
export const DemoStrip = ({ onReset }: { onReset: () => void }) => (
  <div className="demo" role="status">
    <span className="dtag">Demo rejim</span>
    <span className="dtx">ma&apos;lumotlar faqat shu brauzerda saqlanadi</span>
    <button type="button" className="b" onClick={onReset}>
      <Icon n="refresh" /> Qayta tiklash
    </button>
  </div>
);

/** Sahifa karkasi: demo belgisi, sarlavha, bo'lim mazmuni; ustida — panel va oynalar */
export function CrmLayout({
  demo,
  sec,
  unassigned,
  onSec,
  onNewDeal,
  onDemoReset,
  children,
}: {
  demo: boolean;
  sec: Sec;
  unassigned: number;
  onSec: (s: Sec) => void;
  onNewDeal: () => void;
  onDemoReset: () => void;
  children: ReactNode;
}) {
  return (
    <div className="crm">
      {demo ? <DemoStrip onReset={onDemoReset} /> : null}
      <Header>
        <nav className="secs" aria-label="Bo'limlar">
          {SECS.map(([k, t]) => (
            <button key={k} type="button" className={`sec ${sec === k ? "on" : ""}`} aria-current={sec === k ? "page" : undefined} onClick={() => onSec(k)}>
              {t}
              {k === "leads" && unassigned ? <b>{unassigned}</b> : null}
            </button>
          ))}
        </nav>
        <span className="sp" />
        <a className="b mob-hide" href="/app/erp/savdo?mobile=1" title="Telefon ko'rinishi">
          Mobil
        </a>
        {sec === "deals" ? (
          <button type="button" className="b pri" onClick={onNewDeal}>
            <Icon n="plus" /> Bitim
          </button>
        ) : null}
      </Header>
      {children}
    </div>
  );
}

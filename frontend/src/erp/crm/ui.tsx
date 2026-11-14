// CRM ildizi (faqat ko'rinish): sarlavha (bo'limlar, "Mobil", "+ Bitim"), demo rejim belgisi, ishga tushish ekrani.
import type { ReactNode } from "react";

import { Empty, ErrHint, Icon, Skeleton } from "@/erp/kit/ui";
import { SECS, type Sec } from "@/erp/crm/lib";
import { HDR, HROW, MAIN, ROOT, SCROLL_X, SP } from "@/erp/crm/tw";

export const Header = ({ children }: { children?: ReactNode }) => (
  <header className={HDR}>
    <div className={HROW}>
      <div className="mr-1.5 flex items-baseline gap-2 text-xl font-bold whitespace-nowrap max-md:mr-0 max-md:text-lg">
        CRM{" "}
        <a className="text-[13px] font-normal text-hint max-md:hidden" href="/app/erp">
          Belting ERP
        </a>
      </div>
      {children}
    </div>
  </header>
);

/** Ishga tushish: yuklanmoqda (skelet) yoki xato + "Qayta urinish" */
export const BootView = ({ err, net, onRetry }: { err: string; net: boolean; onRetry: () => void }) => (
  <div className={ROOT}>
    <Header />
    <div className={MAIN}>
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
  <div
    className="flex min-h-9 flex-none items-center gap-2 border-b border-sep bg-[color-mix(in_srgb,var(--st-work)_14%,var(--sec))] px-5 py-1 text-[13px] text-fg max-md:gap-1.5 max-md:px-3"
    role="status"
  >
    <span className="font-bold whitespace-nowrap text-st-work">Demo rejim</span>
    <span className="min-w-0 flex-1 truncate text-sub max-md:text-xs max-md:leading-tight max-md:whitespace-normal">ma&apos;lumotlar faqat shu brauzerda saqlanadi</span>
    <button type="button" className="b h-7 flex-none px-2.5 text-[13px]" onClick={onReset}>
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
    <div className={ROOT}>
      {demo ? <DemoStrip onReset={onDemoReset} /> : null}
      <Header>
        <nav className={`flex min-w-0 gap-1 ${SCROLL_X}`} aria-label="Bo'limlar">
          {SECS.map(([k, t]) => (
            <button key={k} type="button" className={`cursor-pointer rounded-lg border-0 px-3.5 py-[7px] text-[15px] font-semibold whitespace-nowrap max-md:px-2.5 max-md:text-sm coarse:min-h-11 ${sec === k ? "bg-fill text-fg" : "bg-transparent text-hint"}`} aria-current={sec === k ? "page" : undefined} onClick={() => onSec(k)}>
              {t}
              {k === "leads" && unassigned ? <b className="ml-1 text-xs text-danger tabular-nums">{unassigned}</b> : null}
            </button>
          ))}
        </nav>
        <span className={SP} />
        <a className="b max-md:hidden" href="/app/erp/savdo?mobile=1" title="Telefon ko'rinishi">
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

// CRM ildizi (faqat ko'rinish): sarlavha (bo'limlar, "+ Bitim"), demo rejim belgisi, ishga tushish ekrani.
import type { ReactNode } from "react";

import { Empty, ErrHint, Icon, Skeleton } from "@/erp/kit/ui";
import { SECS, type Me, type Meta, type Sec } from "@/erp/crm/lib";
import { FIRM_LOGO } from "@/shared/ui/brand";
import { HDR, HROW, MAIN, ROOT, SCROLL_X, SP } from "@/erp/crm/tw";

export const Header = ({ children }: { children?: ReactNode }) => (
  <header className={HDR}>
    <div className={HROW}>
      <div className="mr-1.5 flex items-baseline gap-2 text-xl font-bold whitespace-nowrap max-md:mr-0 max-md:text-lg">
        CRM
        <a href="/app/erp" className="self-center max-md:hidden" title="Belting ERP" aria-label="Belting ERP">
          <span className={`${FIRM_LOGO} h-4`} />
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
export const DemoStrip = ({ onReset, me, users, onAs }: { onReset: () => void; me: Me; users: Meta["users"]; onAs: (tg: number) => void }) => (
  <div
    className="flex min-h-9 flex-none items-center gap-2 border-b border-sep bg-[color-mix(in_srgb,var(--st-work)_14%,var(--sec))] px-5 py-1 text-[13px] text-fg max-md:gap-1.5 max-md:px-3"
    role="status"
  >
    <span className="font-bold whitespace-nowrap text-st-work">Demo rejim</span>
    <span className="min-w-0 flex-1 truncate text-sub max-md:text-xs max-md:leading-tight max-md:whitespace-normal">ma&apos;lumotlar faqat shu brauzerda saqlanadi</span>
    <select
      className="sel h-7 max-w-[46vw] flex-none py-0 text-[13px] coarse:h-11"
      aria-label="Demo: kim sifatida"
      title="Demo: kim sifatida ishlash"
      value={me.tg_id}
      onChange={(e) => onAs(Number(e.target.value))}
    >
      {users.map((u) => (
        <option key={u.tg_id} value={u.tg_id}>
          {u.name}
          {u.tg_id === me.tg_id ? (me.is_head ? " · rahbar" : " · sotuvchi") : ""}
        </option>
      ))}
    </select>
    <button type="button" className="b h-7 flex-none px-2.5 text-[13px]" onClick={onReset}>
      <Icon n="refresh" /> Qayta tiklash
    </button>
  </div>
);

/** Sahifa karkasi: demo belgisi, sarlavha, bo'lim mazmuni; ustida — panel va oynalar */
export function CrmLayout({
  demo,
  pipeName,
  sec,
  unassigned,
  onSec,
  onNewDeal,
  onDemoReset,
  me,
  users,
  onDemoAs,
  children,
}: {
  demo: boolean;
  /** voronka nomi (sarlavhada) — CRM'da faqat Sales */
  pipeName?: string;
  sec: Sec;
  unassigned: number;
  onSec: (s: Sec) => void;
  onNewDeal: () => void;
  onDemoReset: () => void;
  me: Me;
  users: Meta["users"];
  onDemoAs: (tg: number) => void;
  children: ReactNode;
}) {
  return (
    <div className={ROOT}>
      {demo ? <DemoStrip onReset={onDemoReset} me={me} users={users} onAs={onDemoAs} /> : null}
      <Header>
        <nav className={`flex min-w-0 gap-1 ${SCROLL_X}`} aria-label="Bo'limlar">
          {SECS.map(([k, t]) => (
            <button key={k} type="button" className={`cursor-pointer rounded-lg border-0 px-3.5 py-[7px] text-[15px] font-semibold whitespace-nowrap max-md:px-2.5 max-md:text-sm coarse:min-h-11 ${sec === k ? "bg-fill text-fg" : "bg-transparent text-hint"}`} aria-current={sec === k ? "page" : undefined} onClick={() => onSec(k)}>
              {t}
              {k === "leads" && unassigned ? <b className="ml-1 text-xs text-danger tabular-nums">{unassigned}</b> : null}
            </button>
          ))}
        </nav>
        {pipeName ? (
          <span className="ml-1 rounded-lg border border-sep px-2.5 py-1 text-[13px] font-semibold whitespace-nowrap text-sub max-md:hidden" title="Voronka">
            {pipeName}
          </span>
        ) : null}
        <span className={SP} />
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

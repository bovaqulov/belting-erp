// Marketplace karkasi (faqat ko'rinish) — @/erp/kit/layout ustida. Kompyuter: chap menyu (Umumiy + har kanal bo'limlari,
// buyurtmalar yonida "yangi | yig'ilmoqda"). Telefon: sarlavha, kanal segmenti, bo'lim tablari. Ishga tushish ekrani.
import type { ReactNode } from "react";

import { AppLayout, AppTabs, AppTop, DemoStrip, type NavGroup } from "@/erp/kit/layout";
import { Empty, ErrHint, Seg, Skeleton } from "@/erp/kit/ui";
import { CHN, CHS, SEC, SECS, switchCh, viewTitle, type Ch, type Counts, type Sec, type View } from "@/erp/marketplace/lib";

/** Ishga tushish: yuklanmoqda (skelet) yoki xato + "Qayta urinish" */
export const BootView = ({ err, net, onRetry }: { err: string; net: boolean; onRetry: () => void }) => (
  <div className="mod mk">
    <div className="large">Marketplace</div>
    {err ? (
      <Empty icon="alert" title="Marketplace ochilmadi">
        {err}
        <ErrHint net={net} />
        <div className="btns">
          <button className="btn sec" onClick={onRetry}>
            Qayta urinish
          </button>
        </div>
      </Empty>
    ) : (
      <Skeleton />
    )}
  </div>
);

/** Buyurtmalar yonidagi raqam: yangi (qizil, bo'lsa) | yig'ilmoqda */
const OrderCnt = ({ c }: { c?: { new: number; assembly: number } }) =>
  c ? (
    <span className="cnt" title="yangi | yig'ilmoqda">
      <b className={c.new ? "hot" : ""}>{c.new}</b>
      <span className="sl"> | </span>
      {c.assembly}
    </span>
  ) : null;

export function MkLayout({
  view,
  wide,
  counts,
  demo,
  onGo,
  onDemoReset,
  children,
}: {
  view: View;
  wide: boolean;
  counts: Counts | null;
  demo: boolean;
  onGo: (v: View) => void;
  onDemoReset: () => void;
  children: ReactNode;
}) {
  const nav: NavGroup[] = [
    { items: [{ key: "home", label: "Umumiy", icon: "home", on: view.home, onClick: () => onGo({ home: true }) }] },
    ...CHS.map((ch) => ({
      title: CHN[ch],
      items: SECS[ch].map((s) => ({
        key: s,
        label: SEC[s].t,
        icon: SEC[s].icon,
        on: !view.home && view.ch === ch && view.sec === s,
        onClick: () => onGo({ home: false, ch, sec: s }),
        extra: s === "orders" && ch !== "site" ? <OrderCnt c={counts?.[ch]} /> : null,
      })),
    })),
  ];
  const cur: "home" | Ch = view.home ? "home" : view.ch;
  const top = (
    <>
      <AppTop up="/app/erp" upLabel="ERP" title="Marketplace" sub={view.home ? undefined : viewTitle(view)} />
      <Seg<"home" | Ch> items={[["home", "Umumiy"], ...CHS.map((c) => [c, CHN[c]] as [Ch, string])]} cur={cur} onPick={(k) => onGo(k === "home" ? { home: true } : switchCh(view, k))} />
      {view.home ? null : (
        <AppTabs<Sec>
          label="Bo'limlar"
          cur={view.sec}
          onPick={(s) => onGo({ ...view, sec: s })}
          items={SECS[view.ch].map((s) => [s, SEC[s].t, s === "orders" && view.ch !== "site" && counts?.[view.ch]?.new ? <b className="cnt">{counts[view.ch].new}</b> : null])}
        />
      )}
    </>
  );
  return (
    <AppLayout
      cls="mk"
      brand="Marketplace"
      up="/app/erp"
      upLabel="ERP"
      wide={wide}
      nav={nav}
      title={viewTitle(view)}
      top={top}
      demo={demo ? <DemoStrip text="namunaviy ma'lumot, faqat shu brauzerda" onReset={onDemoReset} /> : null}
    >
      {children}
    </AppLayout>
  );
}

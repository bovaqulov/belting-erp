// Ombor karkasi (faqat ko'rinish) — @/erp/kit/layout ustida. Kompyuter: chap menyu (Kundalik, Jarayonlar, Asboblar;
// Yig'ish yonida navbat soni). Telefon: sarlavha (Amallar ichidagi bo'limda — "Amallar"ga qaytish) va 6 ta tab.
import type { ReactNode } from "react";

import { AppLayout, AppTabs, AppTop, DemoStrip, type NavGroup } from "@/erp/kit/layout";
import { Empty, ErrHint, Skeleton } from "@/erp/kit/ui";
import { MORE, NAV, SEC, tabOf, TABS, viewTitle, type View } from "@/erp/warehouse/lib";

/** Ishga tushish: yuklanmoqda (skelet) yoki xato + "Qayta urinish" */
export const BootView = ({ err, net, onRetry }: { err: string; net: boolean; onRetry: () => void }) => (
  <div className="mod wh">
    <div className="large">Ombor</div>
    {err ? (
      <Empty icon="alert" title="Ombor ochilmadi">
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

const Cnt = ({ n }: { n: number | null }) => (n ? <span className="cnt">{n}</span> : null);

export function WhLayout({
  view,
  wide,
  picks,
  demo,
  demoText,
  onGo,
  onDemoReset,
  children,
}: {
  view: View;
  wide: boolean;
  picks: number | null;
  demo: boolean;
  demoText: string;
  onGo: (v: View) => void;
  onDemoReset: () => void;
  children: ReactNode;
}) {
  const nav: NavGroup[] = NAV.map((g) => ({
    title: g.title,
    items: g.items.map((s) => ({ key: s, label: SEC[s].t, icon: SEC[s].icon, on: view === s, onClick: () => onGo(s), extra: s === "pick" ? <Cnt n={picks} /> : null })),
  }));
  const inMore = (MORE as View[]).includes(view);
  const top = (
    <>
      <AppTop up="/app/erp" upLabel={inMore ? "Amallar" : "ERP"} title="Ombor" sub={view === "panel" ? undefined : viewTitle(view)} onUp={inMore ? () => onGo("more") : undefined} />
      <AppTabs<View>
        label="Ombor bo'limlari"
        cur={tabOf(view)}
        onPick={onGo}
        items={TABS.map((t) => [t, t === "more" ? "Amallar" : t === "place" ? "Joylash" : SEC[t].t, t === "pick" && picks ? <b className="cnt">{picks}</b> : null])}
      />
    </>
  );
  return (
    <AppLayout
      cls="wh"
      brand="Ombor"
      up="/app/erp"
      upLabel="ERP"
      wide={wide}
      nav={nav}
      title={viewTitle(view)}
      top={top}
      demo={demo ? <DemoStrip text={demoText} onReset={onDemoReset} /> : null}
    >
      {children}
    </AppLayout>
  );
}

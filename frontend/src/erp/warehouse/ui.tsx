// Ombor karkasi (faqat ko'rinish) — @/erp/kit/layout ustida. Kompyuter: chap menyu (Jarayonlar, Asboblar).
// Telefon: sarlavha (Amallar ichidagi bo'limda — "Amallar"ga qaytish) va 5 ta tab.
import type { ReactNode } from "react";

import { AppLayout, AppTabs, AppTop, DemoStrip, type NavGroup } from "@/erp/kit/layout";
import { Empty, ErrHint, Skeleton } from "@/erp/kit/ui";
import { HOME, MORE, NAV, SEC, tabOf, TABS, viewTitle, type View } from "@/erp/warehouse/lib";

/** Ishga tushish: yuklanmoqda (skelet) yoki xato + "Qayta urinish" */
export const BootView = ({ err, net, onRetry }: { err: string; net: boolean; onRetry: () => void }) => (
  <div className="min-h-screen">
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

/** Kompyuterda: plitkalar kengroq to'r, qator ustida hover, jadvaldagi kodlar o'ralmasin */
const WIDE_CLS =
  "[&.mod-wide_.tiles]:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] [&.mod-wide_.tiles]:gap-3 [&.mod-wide_.tile]:min-h-[88px] [&.mod-wide_.tile]:px-4 [&.mod-wide_.tile]:py-3.5 [&.mod-wide_.tile_.v]:text-[25px] [&.mod-wide_.item.tap:hover]:bg-fill [&_table_.code]:whitespace-nowrap";

export function WhLayout({
  view,
  wide,
  demo,
  demoText,
  onGo,
  onDemoReset,
  children,
}: {
  view: View;
  wide: boolean;
  demo: boolean;
  demoText: string;
  onGo: (v: View) => void;
  onDemoReset: () => void;
  children: ReactNode;
}) {
  const nav: NavGroup[] = NAV.map((g) => ({
    title: g.title,
    items: g.items.map((s) => ({ key: s, label: SEC[s].t, icon: SEC[s].icon, on: view === s, onClick: () => onGo(s) })),
  }));
  const inMore = (MORE as View[]).includes(view);
  const top = (
    <>
      <AppTop up="/app/erp" upLabel={inMore ? "Amallar" : "ERP"} title="Ombor" sub={view === HOME ? undefined : viewTitle(view)} onUp={inMore ? () => onGo("more") : undefined} />
      <AppTabs<View>
        label="Ombor bo'limlari"
        cur={tabOf(view)}
        onPick={onGo}
        items={TABS.map((t) => [t, t === "more" ? "Amallar" : t === "place" ? "Joylash" : SEC[t].t])}
      />
    </>
  );
  return (
    <AppLayout
      cls={WIDE_CLS}
      brand="Ombor"
      up={null}
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

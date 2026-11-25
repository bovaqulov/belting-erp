// Ombor karkasi (faqat ko'rinish) — @/erp/kit/layout ustida. Kompyuter: chap menyu (Jarayonlar, Asboblar).
// Telefon: sarlavha (Amallar ichidagi bo'limda — "Amallar"ga qaytish) va 5 ta tab.
import type { ReactNode } from "react";

import { AppLayout, AppTop, BottomTabs, DemoStrip, type NavGroup } from "@/erp/kit/layout";
import { Empty, ErrHint, Icon, List, Row, Skeleton } from "@/erp/kit/ui";
import { MORE, NAV, SEC, tabOf, TABS, viewTitle, type View, type Warehouse } from "@/erp/warehouse/lib";

const KIND: Record<string, { t: string; icon: string; color: string }> = {
  store: { t: "Ombor", icon: "package", color: "blue" },
  production: { t: "Sex", icon: "factory", color: "orange" },
  shop: { t: "Do'kon", icon: "store", color: "purple" },
};

/** Kirish: qaysi omborda ishlash (tanlov shu qurilmada eslab qolinadi; keyin sarlavhadan almashtiriladi) */
export const StorePick = ({ stores, onPick }: { stores: Warehouse[]; onPick: (id: number) => void }) => (
  <div className="mx-auto min-h-screen max-w-[560px] pt-2">
    <AppTop up="/app/erp" upLabel="ERP" title="Ombor" sub="Qaysi omborda ishlaysiz?" logo />
    <List cls="mt-3">
      {stores.map((w) => {
        const k = KIND[w.kind] ?? KIND.store;
        return <Row key={w.id} icon={k.icon} color={k.color} t={w.name} s={[k.t, w.code].filter(Boolean).join(" · ")} chev onClick={() => onPick(w.id)} data={{ store: w.id }} />;
      })}
    </List>
  </div>
);

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
  store,
  onSwitch,
  wide,
  demo,
  demoText,
  onGo,
  onDemoReset,
  children,
}: {
  view: View;
  /** joriy ombor nomi */
  store?: string;
  /** boshqa omborga o'tish (bitta ombor bo'lsa — yo'q) */
  onSwitch?: () => void;
  wide: boolean;
  demo: boolean;
  demoText: string;
  onGo: (v: View) => void;
  onDemoReset: () => void;
  children: ReactNode;
}) {
  const nav: NavGroup[] = [
    ...(store && onSwitch ? [{ items: [{ key: "store", label: store, icon: "store", on: false, onClick: onSwitch, extra: <span className="ml-auto opacity-60"><Icon n="chevrons-up-down" /></span> }] }] : []),
    ...NAV.map((g) => ({
      title: g.title,
      items: g.items.map((s) => ({ key: s, label: SEC[s].t, icon: SEC[s].icon, on: view === s, onClick: () => onGo(s) })),
    })),
  ];
  const inMore = (MORE as View[]).includes(view);
  const top = (
    <>
      <AppTop up={null} upLabel="Amallar" title="Ombor" logo onUp={inMore ? () => onGo("more") : undefined} pick={store ? { label: store, onClick: onSwitch } : undefined} />
      <BottomTabs<View>
        label="Ombor bo'limlari"
        cur={tabOf(view)}
        onPick={onGo}
        items={TABS.map((t) => [t, t === "more" ? "Amallar" : t === "place" ? "Joylash" : SEC[t].t, t === "more" ? "layout-grid" : SEC[t].icon])}
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

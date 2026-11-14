// Accounting qismi karkasi (faqat ko'rinish) — @/erp/kit/layout ustida. Kompyuter: yon menyu faqat joriy qismniki
// (sarlavha — qism nomi, "← Accounting" — hub'ga qaytish, shu qism bo'limlari). Telefon: hub'da — ERP'ga qaytish; qism ichida — hub'ga qaytish,
// bo'limlar (bittadan ko'p bo'lsa) segmenti. Hub (3 kartochka) — hub/ da, bu karkassiz. Ishga tushish ekrani.
import type { ReactNode } from "react";

import { AppLayout, AppTop, DemoStrip, type NavGroup } from "@/erp/kit/layout";
import { Empty, ErrHint, Seg, Skeleton } from "@/erp/kit/ui";
import { AREAS, areaOf, type Sec, type View } from "@/erp/finance/lib";

export const BootView = ({ err, net, onRetry }: { err: string; net: boolean; onRetry: () => void }) => (
  <div className="min-h-screen">
    <div className="large">Accounting</div>
    {err ? (
      <Empty icon="alert" title="Accounting ochilmadi">
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

export function AccLayout({
  view,
  wide,
  demo,
  onGo,
  onDemoReset,
  children,
}: {
  view: View;
  wide: boolean;
  demo: boolean;
  onGo: (v: View) => void;
  onDemoReset: () => void;
  children: ReactNode;
}) {
  // hub — alohida sahifa (hub/, ERP bosh sahifasi ko'rinishida); bu karkas faqat qism ichida: yon menyuda — faqat shu qism
  const area = view.hub ? AREAS[0] : areaOf(view.area);
  const sec = view.hub ? area.secs[0] : area.secs.find((s) => s.key === view.sec)!;
  const nav: NavGroup[] = [
    {
      items: area.secs.map((s) => ({
        key: s.key,
        label: s.t,
        icon: s.icon,
        on: !view.hub && view.sec === s.key,
        onClick: () => onGo({ hub: false, area: area.key, sec: s.key }),
      })),
    },
  ];
  const top = (
    <>
      <AppTop up="/app/erp" upLabel="Accounting" title={area.t} sub="Accounting" onUp={() => onGo({ hub: true })} />
      {area.secs.length > 1 && !view.hub ? (
        <Seg<Sec> items={area.secs.map((s) => [s.key, s.t])} cur={view.sec} onPick={(s) => onGo({ hub: false, area: area.key, sec: s })} />
      ) : null}
    </>
  );
  return (
    <AppLayout
      cls="acc"
      brand={area.t}
      upLabel="Accounting"
      onUp={() => onGo({ hub: true })}
      wide={wide}
      nav={nav}
      title={sec.t}
      top={top}
      demo={demo ? <DemoStrip text="namunaviy ma'lumot, faqat shu brauzerda" onReset={onDemoReset} /> : null}
    >
      {children}
    </AppLayout>
  );
}

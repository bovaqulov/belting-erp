// Marketplace karkasi (faqat ko'rinish) — @/erp/kit/layout ustida. Kompyuter: chap menyu — bo'limlar (buyurtmalar yonida
// barcha kanallar soni; tayyor bo'lmaganlari — "tez orada"), kanal — sarlavha yonidagi tanlovda (logotip, soni).
// Telefon: sarlavha, kanal segmenti, bo'lim tablari. Ishga tushish ekrani.
import type { ReactNode } from "react";

import { AppLayout, AppTabs, AppTop, DemoStrip, PILL, PILL_HOT, TAB_CNT, type NavGroup } from "@/erp/kit/layout";

/** Marketplace ichida: qatordagi kod/nishon o'lchami, kompyuterda kanal plitalari — 3 ustun */
const MK =
  "[&_.badge]:tabular-nums [&_.item_.val_.code]:text-[15px] [&_.item_.s_.badge]:px-1.5 [&_.item_.s_.badge]:py-px [&_.item_.s_.badge]:text-[11.5px] [&.mod-wide_.tiles]:grid-cols-3";
import { Empty, ErrHint, Seg, Skeleton } from "@/erp/kit/ui";
import { CH_LOGO, chsOf, CHN, CHS, goSec, READY, SEC, SEC_ORDER, SECS, switchCh, type Ch, type Counts, type Sec, type View } from "@/erp/marketplace/lib";

/** Ishga tushish: yuklanmoqda (skelet) yoki xato + "Qayta urinish" */
export const BootView = ({ err, net, onRetry }: { err: string; net: boolean; onRetry: () => void }) => (
  <div className="min-h-screen">
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

type Cnt = { new: number; assembly: number };

/** Buyurtmalar soni: yangi bo'lsa — qizil (yangilar soni), aks holda yig'ilayotganlar — kulrang; 0 — ko'rinmaydi */
const OrderPill = ({ c }: { c?: Cnt }) => {
  if (!c || (!c.new && !c.assembly)) return null;
  const tip = `yangi: ${c.new} · yig'ilmoqda: ${c.assembly}`;
  return c.new ? (
    <span className={PILL_HOT} title={tip} aria-label={tip}>
      {c.new}
    </span>
  ) : (
    <span className={PILL} title={tip} aria-label={tip}>
      {c.assembly}
    </span>
  );
};

const sum = (counts: Counts | null): Cnt | undefined =>
  counts ? Object.values(counts).reduce((a, c) => ({ new: a.new + c.new, assembly: a.assembly + c.assembly }), { new: 0, assembly: 0 }) : undefined;

const Logo = ({ ch }: { ch: Ch }) => (
  // eslint-disable-next-line @next/next/no-img-element -- statik eksport, kichik ikonka
  <img src={CH_LOGO[ch]} alt="" width={18} height={18} className={`mr-2 size-[18px] flex-none rounded-[5px] ${ch === "site" ? "bg-white p-px" : ""}`} />
);

/** Kompyuter: sarlavha yonida kanal tanlovi (faqat shu bo'lim bor kanallar) */
function ChannelTabs({ view, counts, onGo }: { view: Extract<View, { home: false }>; counts: Counts | null; onGo: (v: View) => void }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Kanallar">
      {chsOf(view.sec).map((ch) => {
        const on = ch === view.ch;
        return (
          <button
            key={ch}
            type="button"
            aria-pressed={on}
            className={`flex h-9 cursor-pointer items-center rounded-full border-0 px-3.5 text-[14.5px] ${on ? "bg-fill font-semibold text-fg" : "bg-transparent text-hint hover:bg-fill hover:text-fg"}`}
            onClick={() => onGo({ home: false, ch, sec: view.sec })}
          >
            <Logo ch={ch} />
            {CHN[ch]}
            {view.sec === "orders" && ch !== "site" ? (
              <span className="ml-2 flex">
                <OrderPill c={counts?.[ch]} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

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
    {
      items: [
        { key: "home", label: "Umumiy", icon: "home", on: view.home, onClick: () => onGo({ home: true }) },
        ...SEC_ORDER.map((s) => {
          const ready = READY.includes(s);
          return {
            key: s,
            label: SEC[s].t,
            icon: SEC[s].icon,
            on: !view.home && view.sec === s,
            dim: !ready,
            onClick: () => onGo(goSec(view, s)),
            extra: s === "orders" ? <OrderPill c={sum(counts)} /> : ready ? null : <span className="ml-auto text-[11.5px] whitespace-nowrap opacity-80">tez orada</span>,
          };
        }),
      ],
    },
  ];
  const cur: "home" | Ch = view.home ? "home" : view.ch;
  const top = (
    <>
      <AppTop up={null} title="Marketplace" logo />
      <Seg<"home" | Ch> items={[["home", "Umumiy"], ...CHS.map((c) => [c, CHN[c]] as [Ch, string])]} cur={cur} onPick={(k) => onGo(k === "home" ? { home: true } : switchCh(view, k))} />
      {view.home ? null : (
        <AppTabs<Sec>
          label="Bo'limlar"
          cur={view.sec}
          onPick={(s) => onGo({ ...view, sec: s })}
          items={SECS[view.ch].map((s) => [s, SEC[s].t, s === "orders" && view.ch !== "site" && counts?.[view.ch]?.new ? <b className={TAB_CNT}>{counts[view.ch].new}</b> : null])}
        />
      )}
    </>
  );
  return (
    <AppLayout
      cls={MK}
      brand="Marketplace"
      logo
      up={null}
      wide={wide}
      nav={nav}
      title={view.home ? "Umumiy" : SEC[view.sec].t}
      titleAside={view.home ? null : <ChannelTabs view={view} counts={counts} onGo={onGo} />}
      top={top}
      demo={demo ? <DemoStrip text="namunaviy ma'lumot, faqat shu brauzerda" onReset={onDemoReset} /> : null}
    >
      {children}
    </AppLayout>
  );
}

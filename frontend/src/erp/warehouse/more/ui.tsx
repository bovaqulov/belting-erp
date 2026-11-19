// "Amallar" (telefon): tablarga sig'magan bo'limlar ro'yxati va katalogga havola.
import { C, Icon, List, Row, Sf } from "@/erp/kit/ui";
import { MORE, SEC, type Sec } from "@/erp/warehouse/lib";

const COLOR: Partial<Record<Sec, string>> = { acc: "teal", move: "blue", off: "red", cells: "orange" };

/** «Ombor xaritasi» — premium plitka: issiq gradient, yuqorida yaltiroq, yumshoq rangli soya */
const PremiumSq = ({ icon }: { icon: string }) => (
  <span
    className="sq relative overflow-hidden bg-[linear-gradient(135deg,#ffb547_0%,#ff7a3d_52%,#e8456b_100%)] shadow-[0_4px_12px_-3px_rgba(255,110,60,.55),inset_0_1px_0_rgba(255,255,255,.45),inset_0_0_0_1px_rgba(255,255,255,.12)] after:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(180deg,rgba(255,255,255,.28),rgba(255,255,255,0)_55%)] after:content-['']"
    aria-hidden="true"
  >
    <Icon n={icon} />
  </span>
);

export const MoreView = ({ onGo }: { onGo: (s: Sec) => void }) => (
  <>
    <div style={{ height: 12 }} />
    <List>
      {MORE.map((s) => (
        <Row
          key={s}
          icon={SEC[s].icon}
          color={COLOR[s] ?? "gray"}
          lead={s === "cells" ? <PremiumSq icon={SEC[s].icon} /> : undefined}
          t={SEC[s].t}
          s={SEC[s].s}
          chev
          onClick={() => onGo(s)}
        />
      ))}
    </List>
    <List style={{ marginTop: 16 }}>
      <a className="item tap" href="/app/erp/moliya/?a=products&sec=items">
        <span className="sq" style={{ background: C.green }} aria-hidden="true">
          <Icon n="layers" />
        </span>
        <div className="main">
          <div className="t">Katalog</div>
          <div className="s">Tovarlar va kategoriyalar — Accounting › Mahsulotlar</div>
        </div>
        <span className="chev">
          <Icon n="chev" />
        </span>
      </a>
    </List>
    <Sf>«Ombor xaritasi» — binolar, bloklar va javon joylari: qo&apos;shish, tahrirlash, yorliqlar.</Sf>
  </>
);

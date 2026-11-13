// "Amallar" (telefon): tablarga sig'magan bo'limlar ro'yxati va katalogga havola.
import { C, Icon, List, Row, Sf } from "@/erp/kit/ui";
import { MORE, SEC, type Sec } from "@/erp/warehouse/lib";

const COLOR: Partial<Record<Sec, string>> = { stock: "green", acc: "teal", move: "blue", off: "red", cells: "orange", plan: "purple" };

export const MoreView = ({ onGo }: { onGo: (s: Sec) => void }) => (
  <>
    <div style={{ height: 12 }} />
    <List>
      {MORE.map((s) => (
        <Row key={s} icon={SEC[s].icon} color={COLOR[s] ?? "gray"} t={SEC[s].t} s={SEC[s].s} chev onClick={() => onGo(s)} />
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
    <Sf>Ombor tuzilmasi (bloklar, javobgarlar) — kompyuterda, Joylar bo&apos;limida.</Sf>
  </>
);

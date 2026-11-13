// Yig'ish (faqat ko'rinish): navbat (telefon — ro'yxat, kompyuter — jadval), buyurtma (qatorlar: kerak / yig'ildi,
// taklif qilingan birliklar va joylari, progress), yig'ilganlar, natija.
import type { ReactNode } from "react";

import { CH, d8, num, un } from "@/erp/kit/fmt";
import { Tbl } from "@/erp/kit/table";
import { Empty, Icon, List, Row, Sf, Sh } from "@/erp/kit/ui";
import { Btns, Done, Split } from "@/erp/warehouse/common";
import { EPS, size, type PickBrief, type PickLine, type PickOrder } from "@/erp/warehouse/lib";

export type Picked = { line_no: number; batch_id: number | null; qty: number; label: string; sub: string; scan: string };

const ch = (c: string | null) => (c ? (CH[c] ?? c) : "Ulgurji");
const EMPTY = (
  <Empty icon="cart" title="Yig'ishga buyurtma yo'q">
    Shartnomasi imzolangan yoki oldindan to&apos;langan buyurtmalar shu yerda ko&apos;rinadi
  </Empty>
);

export function PickList({ wide, rs, onOpen }: { wide: boolean; rs: PickBrief[]; onOpen: (id: number) => void }) {
  if (!rs.length) return EMPTY;
  if (wide)
    return (
      <>
        <p className="wh-sub">{rs.length} buyurtma yig&apos;ishga tayyor</p>
        <Tbl
          label="Yig'ish navbati"
          rows={rs}
          rowKey={(r) => String(r.id)}
          onRow={(r) => onOpen(r.id)}
          cols={[
            { h: "Buyurtma", f: (r) => (<><span className="code">{r.number}</span><div className="t2">{d8(r.date)}</div></>) },
            { h: "Mijoz", f: (r) => r.customer ?? "—" },
            { h: "Tovarlar", f: (r) => (<>{r.names.join(", ")}{r.lines > 3 ? <div className="t2">va yana {r.lines - 3}</div> : null}</>) },
            { h: "Firma", f: (r) => r.firm },
            { h: "Kanal", f: (r) => ch(r.channel) },
            { h: "Ombor", f: (r) => r.warehouse },
            { h: "Qator", n: true, f: (r) => r.lines },
          ]}
        />
      </>
    );
  return (
    <>
      <Sh t="Yig'ishga tayyor buyurtmalar" r={rs.length} />
      <List>
        {rs.map((r) => (
          <Row
            key={r.id}
            icon={r.channel ? "store" : "cart"}
            color={r.channel ? "purple" : "blue"}
            t={r.customer ?? r.number}
            tcls="wrap2"
            s={
              <>
                <span className="code">{r.number}</span> · {[r.firm, r.channel && ch(r.channel), `${r.lines} qator`, r.names.join(", ")].filter(Boolean).join(" · ")}
              </>
            }
            val={d8(r.date)}
            chev
            onClick={() => onOpen(r.id)}
          />
        ))}
      </List>
    </>
  );
}

export function PickOrderView({
  wide,
  o,
  wh,
  bar,
  picks,
  got,
  onBack,
  onRemove,
  onLine,
}: {
  wide: boolean;
  o: PickOrder;
  wh: string;
  bar: ReactNode;
  picks: Picked[];
  got: (ln: PickLine) => number;
  onBack: () => void;
  onRemove: (i: number) => void;
  onLine: (ln: PickLine) => void;
}) {
  const top = (
    <>
      {bar}
      <List>
        <Row icon="cart" color="blue" t={o.customer ?? ""} s={<><span className="code">{o.number}</span> · {o.firm} · {wh}</>} />
      </List>
    </>
  );
  const lines = (
    <>
      <Sh t="Qatorlar" r="kerak / yig'ildi" />
      <List>
        {o.lines.map((ln) => {
          const g = got(ln);
          const left = Number(ln.left);
          const full = g >= left - EPS;
          const pct = Math.min(100, (g * 100) / left);
          const hint = ln.units
            .slice(0, 3)
            .map((u) => `${u.code ?? "partiya"}${u.loc ? " @" + u.loc : ""} (${num(u.qty, 3)}${size(u) ? ", " + size(u) : ""})`)
            .join("; ");
          return (
            <Row
              key={ln.line_no}
              icon={full ? "check" : ln.dims ? "layers" : "package"}
              color={full ? "green" : "orange"}
              t={ln.name}
              tcls="wrap2"
              s={
                <>
                  {hint ? `Taklif: ${hint}` : "Omborda mos birlik yo'q"}
                  <span className="wh-prog" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Yig'ildi">
                    <i style={{ width: `${pct}%` }} />
                  </span>
                </>
              }
              val={<span className="num">{num(left, 3)}</span>}
              valSmall={`${num(g, 3)} ${un(ln.unit)}`}
              chev
              onClick={() => onLine(ln)}
            />
          );
        })}
      </List>
    </>
  );
  const rest = (
    <>
      {picks.length ? (
        <>
          <Sh t="Yig'ilgan" r={picks.length} />
          <List>
            {picks.map((p, i) => (
              <Row
                key={i}
                icon="check"
                color="green"
                t={p.label}
                s={p.sub}
                val={<span className="num">{num(p.qty, 3)}</span>}
                right={
                  <button type="button" className="mini" title="Olib tashlash" aria-label="Olib tashlash" onClick={() => onRemove(i)}>
                    <Icon n="x" />
                  </button>
                }
              />
            ))}
          </List>
        </>
      ) : null}
      <Sf>
        Har tovar skaner bilan tasdiqlanadi — qo&apos;lda qo&apos;shib bo&apos;lmaydi. Birlik QR — butun birlik (kerakdan katta bo&apos;lsa kesish taklif qilinadi). Donali tovar: birinchi
        skanda soni so&apos;raladi, keyingi har skan +1. Noto&apos;g&apos;ri tovar bloklanadi. Yorlig&apos;i yo&apos;q tovar — qatorni bosib stiker chiqaring.
      </Sf>
      <Btns>
        <button className="btn plain" onClick={onBack}>
          Boshqa buyurtma
        </button>
      </Btns>
    </>
  );
  return wide ? (
    <Split
      wide
      left={
        <>
          {top}
          {rest}
        </>
      }
      right={lines}
    />
  ) : (
    <>
      {top}
      {lines}
      {rest}
    </>
  );
}

export const PickDone = ({ number, total, onBack }: { number: string; total: number; onBack: () => void }) => (
  <>
    <Done ok title={`Jo'natildi: ${number}`}>
      Summa {num(total, 0)} so&apos;m
      <br />
      Hisob-faktura va 1C uzatish avtomatik
    </Done>
    <Btns>
      <button className="btn sec" onClick={onBack}>
        Yig&apos;ish navbati
      </button>
    </Btns>
  </>
);

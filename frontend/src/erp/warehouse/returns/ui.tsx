// Mijozdan qaytarish (faqat ko'rinish): jo'natishni topish, qatorlarni belgilash, natija.
import type { ReactNode } from "react";

import { d8, num, un } from "@/erp/kit/fmt";
import { Empty, Icon, List, Row, Sf, Sh } from "@/erp/kit/ui";
import { Btns, Done, Split } from "@/erp/warehouse/common";
import type { ReturnRes, Sale, SaleLine } from "@/erp/warehouse/lib";

export type RetLine = { line: number; name: string; code: string | null; unit: string; qty: number; grade: "ok" | "defect" };

export function RetFindView({ bar, q, rs, onClear, onPick, onBack }: { bar: ReactNode; q: string; rs: Sale[]; onClear: () => void; onPick: (s: Sale) => void; onBack: () => void }) {
  return (
    <>
      {bar}
      <Sh
        t={q ? `«${q}» bo'yicha` : "Oxirgi jo'natishlar"}
        r={
          q ? (
            <button type="button" className="mini" aria-label="Tozalash" title="Tozalash" onClick={onClear}>
              <Icon n="x" />
            </button>
          ) : undefined
        }
      />
      {rs.length ? (
        <List>
          {rs.map((s) => {
            const all = s.lines.every((l) => l.returned >= l.qty);
            return (
              <Row
                key={s.id}
                icon="undo-2"
                color={all ? "gray" : "teal"}
                t={s.customer ?? s.number}
                tcls="wrap2"
                s={
                  <>
                    <span className="code">{s.number}</span> · {[d8(s.date), s.firm, `${s.lines.length} qator`, all ? "to'liq qaytarilgan" : ""].filter(Boolean).join(" · ")}
                  </>
                }
                chev
                onClick={() => onPick(s)}
              />
            );
          })}
        </List>
      ) : (
        <Empty icon="undo-2" title="Jo'natish topilmadi">
          Qaytgan birlik QR&apos;ini skanerlang yoki jo&apos;natish raqami (JN-…) / mijoz nomini yozing. Oxirgi 180 kun.
        </Empty>
      )}
      <Btns>
        <button className="btn plain" onClick={onBack}>
          Qabulga qaytish
        </button>
      </Btns>
    </>
  );
}

export function RetSaleView({
  wide,
  sale,
  bar,
  wh,
  sel,
  left,
  onWh,
  onLine,
  onRemove,
  onBack,
}: {
  wide: boolean;
  sale: Sale;
  bar: ReactNode;
  wh: string;
  sel: RetLine[];
  left: (l: SaleLine) => number;
  onWh: () => void;
  onLine: (l: SaleLine) => void;
  onRemove: (line: number) => void;
  onBack: () => void;
}) {
  const top = (
    <>
      {bar}
      <List>
        <Row icon="undo-2" color="teal" t={sale.customer ?? "Mijoz"} s={<><span className="code">{sale.number}</span> · {[d8(sale.date), sale.firm, sale.base].filter(Boolean).join(" · ")}</>} />
        <Row icon="store" color="gray" t="Qaysi omborga" val={wh} chev onClick={onWh} />
        <Row icon="arrow-left" color="gray" t="Boshqa jo'natish" chev onClick={onBack} />
      </List>
      {sel.length ? (
        <>
          <Sh t="Qaytariladi" r={sel.length} />
          <List>
            {sel.map((x) => (
              <Row
                key={x.line}
                icon={x.grade === "ok" ? "check" : "alert"}
                color={x.grade === "ok" ? "green" : "red"}
                t={x.name}
                tcls="wrap2"
                s={[x.code, x.grade === "ok" ? "yaroqli → joylash navbati" : "brak → karantin"].filter(Boolean).join(" · ")}
                val={<span className="num">{num(x.qty, 3)}</span>}
                valSmall={un(x.unit)}
                right={
                  <button type="button" className="mini" aria-label="Olib tashlash" title="Olib tashlash" onClick={() => onRemove(x.line)}>
                    <Icon n="x" />
                  </button>
                }
              />
            ))}
          </List>
        </>
      ) : null}
    </>
  );
  const lines = (
    <>
      <Sh t="Jo'natilgan" r="qaytarish mumkin" />
      <List>
        {sale.lines.map((l) => {
          const n = left(l);
          const on = sel.some((x) => x.line === l.line);
          return (
            <Row
              key={l.line}
              icon={on ? "check" : l.batch_id ? "layers" : "package"}
              color={on ? "green" : n > 0 ? "orange" : "gray"}
              t={l.name}
              tcls="wrap2"
              s={[l.code, `jo'natilgan ${num(l.qty, 3)}`, l.returned ? `qaytgan ${num(l.returned, 3)}` : ""].filter(Boolean).join(" · ")}
              val={<span className="num">{num(n, 3)}</span>}
              valSmall={un(l.unit)}
              chev={n > 0}
              onClick={n > 0 ? () => onLine(l) : undefined}
            />
          );
        })}
      </List>
      <Sf>{"Qaytgan birlik QR'ini skanerlang yoki qatorni bosing: miqdor va holati (yaroqli / brak). Miqdor jo'natilgandan oshmaydi."}</Sf>
    </>
  );
  return wide ? <Split wide left={top} right={lines} /> : (
    <>
      {top}
      {lines}
    </>
  );
}

export const RetDoneView = ({ r, onBack }: { r: ReturnRes; onBack: () => void }) => (
  <>
    <Done ok title={`Qaytarish qabul qilindi: ${r.number}`}>
      {r.ok ? `${r.ok} qator yaroqli — Joylashtirish navbatida. ` : ""}
      {r.defect ? (r.quarantine ? `${r.defect} qator brak — karantin joyi ${r.quarantine}.` : `${r.defect} qator brak — karantin joyi yo'q: navbatda, alohida qo'ying.`) : ""}
    </Done>
    <Btns>
      <button className="btn sec" onClick={onBack}>
        Qabulga qaytish
      </button>
    </Btns>
  </>
);

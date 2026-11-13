// Ko'chirish / hisobdan chiqarish (faqat ko'rinish): skaner, ombor(lar), donali tovar egasi; ro'yxat.
import type { ReactNode } from "react";

import { num, un } from "@/erp/kit/fmt";
import { Empty, Icon, List, Row, Sf, Sh } from "@/erp/kit/ui";
import { CodeAnd, Pane, Split } from "@/erp/warehouse/common";

export type BagLine = { item_id: number; char_id: number | null; batch_id: number | null; qty: number; firm: string; name: string; code?: string; size: string; unit: string };

export function BagView({
  wide,
  move,
  bar,
  from,
  to,
  firm,
  lines,
  onFrom,
  onTo,
  onFirm,
  onRemove,
}: {
  wide: boolean;
  move: boolean;
  bar: ReactNode;
  from: string;
  to: string | null;
  firm: string;
  lines: BagLine[];
  onFrom: () => void;
  onTo: () => void;
  onFirm: () => void;
  onRemove: (i: number) => void;
}) {
  const hint = move
    ? "Rulon/bo'lak — butun birlik ko'chadi. Donali tovar — har skanerda +1."
    : "Brak yoki yo'qolgan tovarni skanerlang. Sabab majburiy; huquq bo'lmasa — rahbar tasdig'iga qoralama.";
  const left = (
    <>
      {bar}
      <List>
        <Row icon="store" color="gray" t={move ? "Qayerdan" : "Ombor"} val={from} chev onClick={onFrom} />
        {move ? <Row icon="store" color="blue" t="Qayerga" val={to ?? "tanlang"} chev onClick={onTo} /> : null}
        <Row icon="building" color="gray" t="Donali tovar egasi" val={firm} chev onClick={onFirm} />
      </List>
    </>
  );
  const right = (
    <>
      <Sh t="Ro'yxat" r={lines.length || undefined} />
      {lines.length ? (
        <List>
          {lines.map((l, i) => (
            <Row
              key={`${l.batch_id ?? "i" + l.item_id}:${l.firm}:${i}`}
              icon={l.batch_id ? "layers" : "package"}
              color="orange"
              t={l.name}
              tcls="wrap2"
              s={<CodeAnd code={l.code} rest={[l.size, l.firm]} />}
              val={<span className="num">{num(l.qty, 3)}</span>}
              valSmall={un(l.unit)}
              right={
                <button type="button" className="mini" aria-label="Olib tashlash" title="Olib tashlash" onClick={() => onRemove(i)}>
                  <Icon n="x" />
                </button>
              }
            />
          ))}
        </List>
      ) : (
        <>
          {wide ? (
            <Pane>
              <Empty icon="list" title="Ro'yxat bo'sh" />
            </Pane>
          ) : null}
          <Sf>{hint}</Sf>
        </>
      )}
    </>
  );
  return <Split wide={wide} left={left} right={right} />;
}

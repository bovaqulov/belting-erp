// Ko'chirish (faqat ko'rinish): joydan joyga ro'yxati, to'ldirish takliflari va me'yorlar.
import type { ReactNode } from "react";

import { num, un } from "@/erp/kit/fmt";
import { Empty, Icon, List, Row, Sf, Sh } from "@/erp/kit/ui";
import { CodeAnd, Pane, Split } from "@/erp/warehouse/common";
import type { Level, Replenish } from "@/erp/warehouse/lib";

export type InnerLine = { batch_id: number; item_id: number; code: string | null; name: string; size: string; from: string | null; width_mm: number | null };

export function InnerView({
  wide,
  bar,
  store,
  dest,
  lines,
  onStore,
  onDest,
  onTips,
  onRemove,
}: {
  wide: boolean;
  bar: ReactNode;
  store: string;
  dest: string | null;
  lines: InnerLine[];
  onStore: () => void;
  onDest: () => void;
  onTips: () => void;
  onRemove: (i: number) => void;
}) {
  const left = (
    <>
      {bar}
      <List>
        <Row icon="store" color="gray" t="Ombor" val={store} chev onClick={onStore} />
        <Row icon="pin" color={dest ? "green" : "blue"} t="Qayerga" val={dest ?? "javonni tanlang"} chev onClick={onDest} />
        {lines.length ? <Row icon="sparkles" color="purple" t="Bo'sh joy tavsiyasi" s="Sig'im, eni va tovar guruhi bo'yicha" chev onClick={onTips} /> : null}
      </List>
    </>
  );
  const right = (
    <>
      <Sh t="Ko'chiriladigan birliklar" r={lines.length || undefined} />
      {lines.length ? (
        <List>
          {lines.map((l, i) => (
            <Row
              key={l.batch_id}
              icon="layers"
              color="orange"
              t={l.name}
              tcls="wrap2"
              s={<CodeAnd code={l.code} rest={[l.size, `hozir ${l.from ?? "joysiz"}`]} />}
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
          <Sf>{"Birlik QR'larini skanerlang, keyin yangi javon yorlig'ini. Har ko'chirish tarixda (kim, qachon, qayerdan → qayerga) saqlanadi."}</Sf>
        </>
      )}
    </>
  );
  return <Split wide={wide} left={left} right={right} />;
}

export function ReplenishView({
  store,
  rp,
  levels,
  onStore,
  onAdd,
  onLevel,
}: {
  store: string;
  rp: Replenish;
  levels: Level[];
  onStore: () => void;
  onAdd: () => void;
  onLevel: (l: Level) => void;
}) {
  return (
    <>
      <List>
        <Row icon="store" color="blue" t="To'ldiriladigan ombor" val={store} chev onClick={onStore} />
      </List>
      {levels.length ? <Sh t={rp.from ? `Taklif — ${rp.from} dan` : "Taklif"} r={rp.rows.length || undefined} /> : null}
      {!levels.length ? null : rp.rows.length ? (
        <List>
          {rp.rows.map((r) => (
            <Row
              key={r.id}
              icon="truck"
              color={r.suggest > 0 ? "orange" : "red"}
              t={r.name}
              tcls="wrap2"
              s={`bor ${num(r.have, 3)} · min ${num(r.min_qty, 3)} · manbada ${num(r.available, 3)}`}
              val={<span className="num">{num(r.suggest, 3)}</span>}
              valSmall={r.suggest > 0 ? un(r.unit) : "manbada yo'q"}
            />
          ))}
        </List>
      ) : (
        <Sf>{"Hamma tovar me'yorda — to'ldirish kerak emas."}</Sf>
      )}
      {rp.rows.some((r) => r.suggest > 0) ? <Sf>{"Taklifni «Boshqa omborga» bo'limida skanerlab ko'chiring — tovar yo'lga chiqadi va shu omborda qabul qilinadi."}</Sf> : null}
      <Sh
        t="Me'yorlar (min / max)"
        r={
          <button type="button" className="mini" aria-label="Me'yor qo'shish" title="Me'yor qo'shish" onClick={onAdd}>
            <Icon n="plus" />
          </button>
        }
      />
      {levels.length ? (
        <List>
          {levels.map((l) => (
            <Row
              key={l.id}
              icon="activity"
              color={l.have < l.min_qty ? "red" : "green"}
              t={l.name}
              tcls="wrap2"
              s={`min ${num(l.min_qty, 3)} · max ${num(l.max_qty, 3)}`}
              val={<span className="num">{num(l.have, 3)}</span>}
              valSmall={un(l.unit)}
              chev
              onClick={() => onLevel(l)}
            />
          ))}
        </List>
      ) : (
        <Sf>{"Tovar uchun eng kam (min) va to'ldirish (max) miqdorini qo'ying — kam qolganda shu yerda taklif chiqadi."}</Sf>
      )}
    </>
  );
}

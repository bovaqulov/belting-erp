// Joylashtirish (faqat ko'rinish): 1. joy, 2. tovar, egasi; 3. o'lcham (har birlik — o'z stikeri) yoki miqdor;
// natija xabari (PDF); o'ngda — bugun joylaganlarim / shu javonda, joylash navbati.
import type { ReactNode } from "react";

import { dt, num, un } from "@/erp/kit/fmt";
import { Icon, List, Row, Sf, Sh } from "@/erp/kit/ui";
import { CodeAnd, Split } from "@/erp/warehouse/common";
import type { Size } from "@/erp/warehouse/context";
import { size, type CatItem, type Dims, type PlaceRec, type Placed, type PutawayTip, type Unplaced } from "@/erp/warehouse/lib";
import { ScanMsg } from "@/erp/warehouse/scan-bar";

export type Loc = { id: number; code: string; parent_id: number; block?: string };

const kindText = (d: Dims) => (d === "w" ? "rukav — eni mm" : d === "wl" ? "eni × uzunligi" : d === "l" ? "uzunlik" : "dona");
const sizeText = (u: Size, d: Dims) => (d === "wl" ? `${num(u.w, 0)}×${num(u.l, 0)} mm` : d === "w" ? `eni ${num(u.q, 0)} mm` : num(u.q, 3));

export function PlaceView(p: {
  wide: boolean;
  bar: ReactNode;
  loc: Loc | null;
  locSub: string;
  item: CatItem | null;
  dims: Dims;
  firm: string;
  myBlocks: string | null;
  units: Size[];
  qty: string;
  char: number | null;
  last: Placed | null;
  rec: PlaceRec[];
  wait: Unplaced[];
  /** joylashtirish tavsiyasi (tovar tanlanganda): mos joylar sababi bilan */
  tips: PutawayTip[];
  /** navbat yuklangan vaqt (kutish vaqtini hisoblash uchun) */
  now: number;
  onTip: (t: PutawayTip) => void;
  meId: number;
  onLoc: () => void;
  onItem: () => void;
  onFirm: () => void;
  onAddUnit: () => void;
  onDelUnit: (i: number) => void;
  onQty: (v: string) => void;
  onChar: (v: number | null) => void;
  onPdf: () => void;
  onWait: (w: Unplaced) => void;
  onUndo: (r: PlaceRec) => void;
}) {
  const { loc, item: it, dims: d, last } = p;
  const left = (
    <>
      {p.bar}
      <List>
        <Row
          icon="pin"
          color={loc ? "red" : "gray"}
          t={loc ? <span className="code lg">{loc.code}</span> : "1. Joy (javon)"}
          s={loc ? p.locSub : "yorliqni skanerlang yoki tanlang"}
          chev
          onClick={p.onLoc}
        />
        <Row
          icon="package"
          color={it ? "green" : "gray"}
          t={it ? it.name : "2. Tovar"}
          tcls="wrap2"
          s={it ? [it.grp, kindText(d)].filter(Boolean).join(" · ") : "shtrixkod yoki katalogdan qidirish"}
          chev
          onClick={p.onItem}
        />
        <Row icon="building" color="gray" t="Egasi (firma)" val={p.firm} chev onClick={p.onFirm} />
        {p.myBlocks !== null ? <Row icon="users" color="indigo" t="Bloklaringiz" s={p.myBlocks} /> : null}
      </List>
      {it && p.tips.length ? (
        <>
          <Sh t="Tavsiya etilgan joylar" />
          <List>
            {p.tips.map((x, i) => (
              <Row
                key={x.id}
                icon={i === 0 ? "sparkles" : "pin"}
                color={loc?.id === x.id ? "blue" : i === 0 ? "green" : "gray"}
                t={<span className="code">{x.code}</span>}
                s={`${x.reason}${x.capacity ? ` · ${x.units}/${x.capacity}` : x.units ? ` · ${x.units} birlik` : ""}`}
                val={loc?.id === x.id ? "tanlangan" : undefined}
                chev={loc?.id !== x.id}
                onClick={() => p.onTip(x)}
              />
            ))}
          </List>
        </>
      ) : null}
      {last ? (
        <ScanMsg
          msg={{
            ok: true,
            title: `${last.item} → ${last.loc}`,
            sub: `${last.number} · ${num(last.qty, 3)} ${un(last.unit)} · ${last.units.length} stiker`,
            act: { label: "PDF", icon: "download", onClick: p.onPdf },
          }}
        />
      ) : null}
      {it && d ? (
        <>
          <Sh t="3. O'lcham" r={p.units.length ? `${p.units.length} birlik` : undefined} />
          <List>
            {p.units.map((u, i) => (
              <Row
                key={i}
                icon="ruler"
                color="orange"
                t={<span className="code">{sizeText(u, d)}</span>}
                right={
                  <button type="button" className="mini" aria-label="Olib tashlash" onClick={() => p.onDelUnit(i)}>
                    <Icon n="x" />
                  </button>
                }
              />
            ))}
            <Row
              icon="plus"
              color="blue"
              t={p.units.length ? "Yana birlik" : d === "w" ? "Rukav enini kiritish" : "O'lchamni kiritish"}
              onClick={p.onAddUnit}
            />
          </List>
          <Sf>{d === "w" ? "Har rukav — alohida birlik (o'z QR stikeri). Enini o'lchab kiriting." : "Har rulon/bo'lak — alohida birlik (o'z QR stikeri)."}</Sf>
        </>
      ) : it ? (
        <>
          <Sh t="3. Miqdor" />
          <div className="list">
            {it.chars.length ? (
              <div className="field">
                <label htmlFor="pl-ch">Kenglik</label>
                <select id="pl-ch" value={p.char ?? ""} onChange={(e) => p.onChar(Number(e.target.value) || null)}>
                  <option value="">— kengliksiz —</option>
                  {it.chars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="pl-q">Soni, {un(it.unit)}</label>
              <input id="pl-q" inputMode="decimal" value={p.qty} placeholder="0" onChange={(e) => p.onQty(e.target.value)} />
            </div>
          </div>
        </>
      ) : null}
    </>
  );
  const right = (
    <>
      <Sh t={loc ? `${loc.code} da` : "Bugun joylaganlarim"} r={p.rec.length || undefined} />
      {p.rec.length ? (
        <List>
          {p.rec.map((r) => (
            <Row
              key={r.id}
              icon="inbox"
              color="teal"
              t={r.name}
              tcls="wrap2"
              s={<CodeAnd code={r.loc} rest={[r.number, r.firm, dt(r.date)]} />}
              val={<span className="num">{num(r.qty, 3)}</span>}
              valSmall={un(r.unit)}
              right={
                r.author === p.meId ? (
                  <button type="button" className="mini danger" aria-label="Bekor qilish" title="Bekor qilish" onClick={() => p.onUndo(r)}>
                    <Icon n="x" />
                  </button>
                ) : null
              }
            />
          ))}
        </List>
      ) : (
        <Sf>Hali yo&apos;q.</Sf>
      )}
      {p.wait.length ? (
        <>
          <Sh t="Joylash navbati (qabul qilingan)" r={p.wait.length} />
          <List>
            {p.wait.map((w) => {
              // kutish vaqti (dock-to-stock): 2 soatdan oshsa — qizil
              const hrs = w.since ? (p.now - Date.parse(w.since)) / 36e5 : null;
              const age =
                hrs === null
                  ? null
                  : hrs < 1
                    ? `${Math.max(1, Math.round(hrs * 60))} daq`
                    : hrs < 48
                      ? `${Math.round(hrs)} soat`
                      : `${Math.round(hrs / 24)} kun`;
              return (
                <Row
                  key={w.batch_id}
                  icon="truck"
                  color={hrs !== null && hrs > 2 ? "red" : "orange"}
                  t={w.name}
                  tcls="wrap2"
                  s={<CodeAnd code={w.code} rest={[size(w), w.doc, w.firm, age && `kutmoqda ${age}`]} />}
                  val={<span className="num">{num(w.qty, 3)}</span>}
                  valSmall={un(w.unit)}
                  onClick={() => p.onWait(w)}
                />
              );
            })}
          </List>
          <Sf>Birlikni bosing: javon tanlangan bo&apos;lsa — unga qo&apos;yiladi, bo&apos;lmasa — mos joylar tavsiya qilinadi. Yoki stikerini skanerlang.</Sf>
        </>
      ) : null}
    </>
  );
  return <Split wide={p.wide} left={left} right={right} />;
}

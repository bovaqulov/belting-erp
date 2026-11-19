// Qabul (faqat ko'rinish): kutilgan kirimlar ro'yxati va qabul ko'rsatkichi (dock-to-stock), yangi kirim formasi,
// skaner bilan sanash (ko'rmasdan sanash — kutilgan miqdor yashirin; rejadan tashqari tovarlar alohida), natija (farqlar).
import type { ReactNode } from "react";

import { d8, num, un } from "@/erp/kit/fmt";
import { C, Empty, Icon, List, Row, Seg, Sf, Sh } from "@/erp/kit/ui";
import { Btns, Done, Split } from "@/erp/warehouse/common";
import { size, type AccDiff, type DockKpi, type Incoming, type Transit } from "@/erp/warehouse/lib";

export type AccResult = { number: string; diff: (AccDiff & { name: string })[] };
export type Extra = { item_id: number; char_id: number | null; name: string; unit: string };
export type NewLine = { item_id: number; name: string; unit: string; qty: string };
type It = Incoming["items"][number];

const PLUS =
  "flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 text-white shadow-[0_3px_10px_-3px_rgba(52,199,89,.7)] hover:brightness-110 active:scale-95 coarse:size-11 [&_svg.i]:size-[22px]";
const h = (x: number | null) => (x === null ? "—" : x < 1 ? `${Math.round(x * 60)} daq` : `${num(x, 1)} soat`);

/** Qabul ko'rsatkichi: joylash navbati va qabuldan joylashgacha vaqt (yaxshi ko'rsatkich ≤ 2 soat) */
function DockCard({ k }: { k: DockKpi }) {
  const late = (k.oldest_h ?? 0) > 2;
  return (
    <List>
      <Row
        icon="clock"
        color={late ? "red" : k.waiting ? "orange" : "green"}
        t={k.waiting ? `Joylash navbatida: ${k.waiting}` : "Joylash navbati bo'sh"}
        s={k.waiting ? `eng eskisi ${h(k.oldest_h)} kutmoqda${late ? " — 2 soatdan oshdi" : ""}` : "qabul qilinganlar joyiga qo'yilgan"}
      />
      <Row
        icon="chart"
        color="blue"
        t="Qabuldan joylashgacha"
        s={k.placed ? `o'rtacha ${h(k.avg_h)} · median ${h(k.median_h)} · ${k.placed} birlik, ${k.days} kun` : `${k.days} kunda ma'lumot yo'q`}
        val={k.within_2h === null ? undefined : <span className={`num ${k.within_2h >= 90 ? "text-ok" : "text-warn"}`}>{k.within_2h}%</span>}
        valSmall={k.within_2h === null ? undefined : "≤ 2 soat"}
      />
    </List>
  );
}

export function AccListView({
  rs,
  kpi,
  tr,
  onOpen,
  onNew,
  onUnplanned,
  onTransit,
  onReturn,
}: {
  rs: Incoming[];
  kpi: DockKpi | null;
  tr: Transit[];
  onOpen: (r: Incoming) => void;
  onNew: () => void;
  onUnplanned: () => void;
  onTransit: (t: Transit) => void;
  onReturn: () => void;
}) {
  return (
    <>
      {kpi ? <DockCard k={kpi} /> : null}
      {tr.length ? (
        <>
          <Sh t="Ko'chirishdan kelayotganlar" r={tr.length} />
          <List>
            {tr.map((t) => {
              const got = t.units.filter((u) => u.received).length;
              return (
                <Row
                  key={t.id}
                  icon="swap"
                  color="purple"
                  t={`${t.from} → ${t.to}`}
                  s={
                    <>
                      <span className="code">{t.number}</span> ·{" "}
                      {[t.units.length && `${got}/${t.units.length} birlik`, t.lots.length && `${t.lots.length} donali${t.lots_done ? " ✓" : ""}`, d8(t.date)].filter(Boolean).join(" · ")}
                    </>
                  }
                  chev
                  onClick={() => onTransit(t)}
                />
              );
            })}
          </List>
        </>
      ) : null}
      <div className="mx-4 mt-6 mb-2 flex min-h-11 items-center gap-3">
        <h2 className="m-0 flex min-w-0 flex-1 items-baseline gap-2 text-[20px] leading-tight font-bold">
          <span className="truncate">Kutilgan kirimlar</span>
          {rs.length ? <span className="num text-[15px] font-semibold text-hint">{rs.length}</span> : null}
        </h2>
        <button type="button" className={PLUS} style={{ background: C.green }} aria-label="Kutilgan kirim qo'shish" title="Kutilgan kirim qo'shish" onClick={onNew}>
          <Icon n="plus" />
        </button>
      </div>
      {rs.length ? (
        <List>
          {rs.map((r) => (
            <Row
              key={r.id}
              icon="truck"
              color="teal"
              t={r.supplier ?? "Ta'minotchi"}
              s={
                <>
                  <span className="code">{r.number}</span> · {[`${r.items.length} pozitsiya`, r.firm, r.expected && `kutilgan ${d8(r.expected)}`].filter(Boolean).join(" · ")}
                </>
              }
              chev
              onClick={() => onOpen(r)}
            />
          ))}
        </List>
      ) : (
        <Empty icon="truck" title="Yo'lda tovar yo'q">
          Ta&apos;minotchi yuboradigan tovarni oldindan «+» bilan kiriting — yetib kelganda skaner bilan tez qabul qilinadi.
        </Empty>
      )}
      <div className="mt-4" />
      <List>
        <Row icon="scan" color="indigo" t="Rejasiz qabul" s="Kirim kiritilmagan tovar keldi — skanerlab qabul qilish" chev onClick={onUnplanned} />
        <Row icon="undo-2" color="teal" t="Mijozdan qaytarish" s="Jo'natilgan tovar qaytdi — yaroqli yoki brak" chev onClick={onReturn} />
      </List>
    </>
  );
}

export function NewIncomingView(p: {
  supplier: string;
  firm: string;
  firms: [string, string][];
  expected: string;
  lines: NewLine[];
  onSupplier: (v: string) => void;
  onFirm: (v: string) => void;
  onExpected: (v: string) => void;
  onAdd: () => void;
  onQty: (i: number, v: string) => void;
  onDel: (i: number) => void;
  onBack: () => void;
}) {
  return (
    <>
      <Sh t="Kutilgan kirim" />
      <div className="mx-4 grid gap-1">
        <label className="l" htmlFor="ni-s">
          Ta&apos;minotchi
        </label>
        <input id="ni-s" className="inp w-full" value={p.supplier} maxLength={255} placeholder="masalan, Bando" onChange={(e) => p.onSupplier(e.target.value)} />
        <label className="l" htmlFor="ni-d">
          Kutilgan sana
        </label>
        <input id="ni-d" className="inp w-full" type="date" value={p.expected} onChange={(e) => p.onExpected(e.target.value)} />
        <span className="l">Tovar egasi (firma)</span>
      </div>
      <Seg<string> items={p.firms} cur={p.firm} onPick={p.onFirm} />
      <Sh t="Tovarlar" r={p.lines.length || undefined} />
      {p.lines.length ? (
        <List>
          {p.lines.map((l, i) => (
            <div key={l.item_id} className="item">
              <div className="main">
                <div className="t wrap2">{l.name}</div>
                <div className="s">{un(l.unit)}</div>
              </div>
              <input className="inp w-24 text-right" inputMode="decimal" aria-label={`${l.name} — miqdor`} placeholder="miqdor" value={l.qty} onChange={(e) => p.onQty(i, e.target.value)} />
              <button type="button" className="btn plain shrink-0 coarse:min-h-11" aria-label={`${l.name} — olib tashlash`} onClick={() => p.onDel(i)}>
                <Icon n="x" />
              </button>
            </div>
          ))}
        </List>
      ) : null}
      <List>
        <Row icon="plus" color="blue" t="Tovar qo'shish" s="katalogdan qidirish" chev onClick={p.onAdd} />
      </List>
      <Btns>
        <button className="btn plain" onClick={p.onBack}>
          Bekor qilish
        </button>
      </Btns>
    </>
  );
}

export function AccCountView({
  wide,
  r,
  unplanned,
  bar,
  to,
  partial,
  blind,
  counted,
  extras,
  onTo,
  onPartial,
  onBlind,
  onBack,
  onCancel,
  onLine,
}: {
  wide: boolean;
  r: Incoming;
  unplanned: boolean;
  bar: ReactNode;
  to: string;
  partial: boolean;
  /** ko'rmasdan sanash — kutilgan miqdor yashirin */
  blind: boolean;
  counted: (x: It) => number;
  extras: (Extra & { got: number })[];
  onTo: () => void;
  onPartial: (v: boolean) => void;
  onBlind: (v: boolean) => void;
  onBack: () => void;
  onCancel?: () => void;
  onLine: (x: { item_id: number; char_id?: number | null; name: string }) => void;
}) {
  const sw = (id: string, icon: string, color: string, t: string, s: string, on: boolean, set: (v: boolean) => void) => (
    <label className="item cursor-pointer" htmlFor={id}>
      <span className="sq" style={{ background: C[color] }} aria-hidden="true">
        <Icon n={icon} />
      </span>
      <div className="main">
        <div className="t">{t}</div>
        <div className="s">{s}</div>
      </div>
      <input id={id} type="checkbox" className="switch" checked={on} onChange={(e) => set(e.target.checked)} />
    </label>
  );
  const left = (
    <>
      {bar}
      <List>
        <Row icon="truck" color="teal" t={unplanned ? "Rejasiz qabul" : (r.supplier ?? "Ta'minotchi")} s={unplanned ? "kirim oxirida yaratiladi" : <span className="code">{r.number}</span>} />
        <Row icon="pin" color="red" t="Qayerga" val={to} chev onClick={onTo} />
        {unplanned ? null : sw("acc-blind", "eye-off", "indigo", "Ko'rmasdan sanash", "Kutilgan miqdor yashirin — farq oxirida", blind, onBlind)}
        {unplanned ? null : sw("acc-part", "clock", "orange", "Qisman qabul", "Qolgani yo'lda kutadi, kamomad yozilmaydi", partial, onPartial)}
      </List>
      <Sf>Tovar shtrixkodi — har skanerda +1, birlik QR — butun birlik. Miqdorni qo&apos;lda tuzatish uchun qatorni bosing.</Sf>
      <Btns>
        <button className="btn plain" onClick={onBack}>
          Boshqa kirimni tanlash
        </button>
        {onCancel ? (
          <button className="btn plain text-danger" onClick={onCancel}>
            Kirimni bekor qilish
          </button>
        ) : null}
      </Btns>
    </>
  );
  const right = (
    <>
      {r.items.length ? (
        <>
          <Sh t="Tovarlar" r={blind ? "keldi" : "kutilgan / keldi"} />
          <List>
            {r.items.map((x) => {
              const c = counted(x);
              const d = c - Number(x.qty);
              return (
                <Row
                  key={`${x.item_id}:${x.char_id ?? ""}`}
                  t={x.name}
                  tcls="wrap2"
                  s={[x.char, blind ? un(x.unit) : `kutilgan ${num(x.qty, 3)} ${un(x.unit)}`].filter(Boolean).join(" · ")}
                  val={<span className={`num ${blind ? "" : d < 0 ? "text-danger" : d > 0 ? "text-warn" : "text-ok"}`}>{num(c, 3)}</span>}
                  valSmall={blind ? undefined : d ? `${d > 0 ? "+" : ""}${num(d, 3)}` : "✓"}
                  chev
                  onClick={() => onLine(x)}
                />
              );
            })}
          </List>
        </>
      ) : null}
      {extras.length ? (
        <>
          <Sh t={unplanned ? "Sanalgan tovarlar" : "Rejadan tashqari"} r={extras.length} />
          <List>
            {extras.map((x) => (
              <Row
                key={`${x.item_id}:${x.char_id ?? ""}`}
                icon={unplanned ? "package" : "alert"}
                color={unplanned ? "green" : "orange"}
                t={x.name}
                tcls="wrap2"
                s={un(x.unit)}
                val={<span className="num">{num(x.got, 3)}</span>}
                chev
                onClick={() => onLine(x)}
              />
            ))}
          </List>
        </>
      ) : unplanned ? (
        <Sf>Kelgan tovarlarni skanerlang — ro&apos;yxat shu yerda yig&apos;iladi.</Sf>
      ) : null}
    </>
  );
  return <Split wide={wide} left={left} right={right} />;
}

export const AccDoneView = ({ r, onBack }: { r: AccResult; onBack: () => void }) => (
  <>
    <Done ok={!r.diff.length} title={r.number}>
      {r.diff.length ? `Farq dalolatnomasi: ${r.diff.length} pozitsiya` : "Farq yo'q"}
      <br />
      Birliklar — Joylashtirish › joylash navbatida (joy tavsiyasi bilan).
    </Done>
    {r.diff.length ? (
      <List>
        {r.diff.map((x, i) => (
          <Row
            key={i}
            t={x.name}
            s={x.extra ? `rejadan tashqari · keldi ${num(x.counted, 3)}` : `kutilgan ${num(x.expected, 3)} → keldi ${num(x.counted, 3)}`}
            val={<span className={`num ${Number(x.diff) < 0 ? "text-danger" : "text-warn"}`}>{`${Number(x.diff) > 0 ? "+" : ""}${num(x.diff, 3)}`}</span>}
          />
        ))}
      </List>
    ) : null}
    <Btns>
      <button className="btn sec" onClick={onBack}>
        Kutilgan kirimlar
      </button>
    </Btns>
  </>
);

/** Yo'ldagi ko'chirishni qabul qilish: har birlik skanerlanadi (yoki «Hammasi keldi»), donali tovarlar — bitta tasdiq bilan */
export function TransitView({ wide, t, bar, onLots, onBack }: { wide: boolean; t: Transit; bar: ReactNode; onLots: () => void; onBack: () => void }) {
  const got = t.units.filter((u) => u.received).length;
  const left = (
    <>
      {bar}
      <List>
        <Row icon="swap" color="purple" t={`${t.from} → ${t.to}`} s={<span className="code">{t.number}</span>} val={t.firm} />
        <Row icon="arrow-left" color="gray" t="Ro'yxatga qaytish" chev onClick={onBack} />
      </List>
      <Sf>{"Kelgan har birlik QR'ini skanerlang — qabul qilingani shu omborga o'tadi va Joylashtirish navbatiga tushadi. Kelmagani yo'lda qoladi."}</Sf>
    </>
  );
  const right = (
    <>
      {t.units.length ? (
        <>
          <Sh t="Birliklar" r={`${got}/${t.units.length}`} />
          <List>
            {t.units.map((u) => (
              <Row
                key={u.batch_id}
                icon={u.received ? "check" : "layers"}
                color={u.received ? "green" : "orange"}
                t={u.name}
                tcls="wrap2"
                s={[u.code, size(u)].filter(Boolean).join(" · ")}
                val={u.received ? "keldi" : "kutilmoqda"}
              />
            ))}
          </List>
        </>
      ) : null}
      {t.lots.length ? (
        <>
          <Sh t="Donali tovarlar" r={t.lots_done ? "qabul qilindi" : undefined} />
          <List>
            {t.lots.map((l) => (
              <Row key={`${l.item_id}:${l.char_id ?? ""}`} icon="package" color={t.lots_done ? "green" : "orange"} t={l.name} tcls="wrap2" val={<span className="num">{num(l.qty, 3)}</span>} />
            ))}
            {t.lots_done ? null : <Row icon="check" color="green" t="Donali tovarlar keldi" s="Sanab ko'ring — hammasi bo'lsa tasdiqlang" chev onClick={onLots} />}
          </List>
        </>
      ) : null}
    </>
  );
  return <Split wide={wide} left={left} right={right} />;
}

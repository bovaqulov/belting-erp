// Ko'rsatkichlar paneli (faqat ko'rinish): asosiy plitkalar (jahon me'yori bilan rangli), 14 kunlik faollik, xonalar
// bandligi (issiqlik ranglari), eng faol joylar va joylashuv maslahatlari.
import { num } from "@/erp/kit/fmt";
import { C, List, Row, Sf, Sh } from "@/erp/kit/ui";
import { Split, Tile } from "@/erp/warehouse/common";
import type { Kpi } from "@/erp/warehouse/lib";

const p = (x: number | null) => (x === null ? "—" : `${num(x, 1)}%`);
const h = (x: number | null) => (x === null ? "—" : x < 1 ? `${Math.round(x * 60)} daq` : `${num(x, 1)} soat`);
/** bandlik rangi: ≥90% — to'la (qizil), ≥70% — ogohlantirish, aks holda yashil */
const heat = (x: number | null) => (x === null ? C.gray : x >= 90 ? C.red : x >= 70 ? C.orange : C.green);

function Activity({ a }: { a: Kpi["activity"] }) {
  const max = Math.max(1, ...a.map((d) => d.in + d.out + d.move));
  return (
    <div className="mx-4 rounded-[14px] bg-sec px-3 pt-3 pb-2">
      <div className="flex h-28 items-end gap-[3px]" role="img" aria-label="14 kunlik harakatlar: kirim, chiqim, ko'chish">
        {a.map((d) => {
          const tot = d.in + d.out + d.move;
          return (
            <div key={d.date} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${d.date}: kirim ${d.in}, chiqim ${d.out}, ko'chish ${d.move}`}>
              <div className="flex flex-col overflow-hidden rounded-t-[3px]" style={{ height: `${(tot * 100) / max}%` }}>
                <i className="block" style={{ flex: d.out, background: C.red }} />
                <i className="block" style={{ flex: d.move, background: C.gray }} />
                <i className="block" style={{ flex: d.in, background: C.green }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-hint tabular-nums">
        <span>{a[0]?.date.slice(5)}</span>
        <span className="flex gap-3">
          <span><i className="mr-1 inline-block size-2 rounded-full" style={{ background: C.green }} />kirim</span>
          <span><i className="mr-1 inline-block size-2 rounded-full" style={{ background: C.red }} />chiqim</span>
          <span><i className="mr-1 inline-block size-2 rounded-full" style={{ background: C.gray }} />ko&apos;chish</span>
        </span>
        <span>{a.at(-1)?.date.slice(5)}</span>
      </div>
    </div>
  );
}

export function KpiView({ wide, k, store, onStore }: { wide: boolean; k: Kpi; store: string; onStore: () => void }) {
  const o = k.outbound;
  const s = k.space;
  const tiles = (
    <>
      <List>
        <Row icon="store" color="blue" t="Ombor" val={store} chev onClick={onStore} />
      </List>
      <Sh t="Asosiy ko'rsatkichlar" r={`${k.days} kun`} />
      <div className="tiles">
        <Tile l="Sanash aniqligi (IRA)" v={p(k.ira.ira)} sub={k.ira.positions ? `${k.ira.positions} pozitsiya` : "sanash yo'q"} k={k.ira.ira === null ? "" : k.ira.ira >= 95 ? "ok" : "bad"} />
        <Tile l="Qabuldan joylashgacha" v={h(k.dock.median_h)} sub={k.dock.within_2h === null ? undefined : `${k.dock.within_2h}% ≤2 soat`} k={k.dock.within_2h === null ? "" : k.dock.within_2h >= 90 ? "ok" : "bad"} />
        <Tile l="Joylash navbati" v={num(k.dock.waiting, 0)} sub={k.dock.waiting ? `eng eskisi ${h(k.dock.oldest_h)}` : "bo'sh"} k={(k.dock.oldest_h ?? 0) > 2 ? "bad" : "ok"} />
        <Tile l="Jo'natilgan" v={num(o.orders, 0)} sub={`${num(o.lines, 0)} qator · navbatda ${o.open}`} />
        <Tile l="Qaytarish" v={p(o.return_pct)} sub={`${o.return_lines} qator, brak ${o.defect}`} k={o.return_pct === null ? "" : o.return_pct <= 2 ? "ok" : "bad"} />
        <Tile l="Topilmadi" v={num(o.shorts, 0)} sub="yig'ishda" k={o.shorts ? "bad" : "ok"} />
        <Tile l="Joy bandligi" v={p(s.pct)} sub={`${s.used}/${s.cells} joy`} k={s.pct !== null && s.pct >= 90 ? "bad" : ""} />
        <Tile l="Sex chiqindisi" v={p(k.production.scrap_pct)} sub={`${k.production.consumes} sarf · ${k.production.products} mahsulot`} k={k.production.scrap_pct === null ? "" : k.production.scrap_pct <= 5 ? "ok" : "bad"} />
        <Tile l="Hisobdan chiqarildi" v={num(k.writeoff.value, 0)} sub={`so'm · ${k.writeoff.docs} hujjat`} />
      </div>
      <Sf>{"Yashil — jahon me'yorida: IRA ≥ 95%, qabuldan joylashgacha ≤ 2 soat (90%), qaytarish ≤ 2%, chiqindi ≤ 5%."}</Sf>
      <Sh t="Faollik" r="14 kun" />
      <Activity a={k.activity} />
    </>
  );
  const side = (
    <>
      <Sh t="Xonalar bandligi" r={s.blocked || s.quarantine ? `bloklangan ${s.blocked} · karantin ${s.quarantine}` : undefined} />
      {s.by_block.length ? (
        <List>
          {s.by_block.map((b) => (
            <Row
              key={b.code}
              lead={<span className="sq code text-[13px] font-bold text-white" style={{ background: heat(b.pct) }}>{b.code}</span>}
              t={b.name || b.code}
              s={
                <span className="mt-1 block h-1.5 overflow-hidden rounded-sm bg-fill" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(b.pct ?? 0)} aria-label={`${b.code} bandligi`}>
                  <i className="block h-full" style={{ width: `${b.pct ?? 0}%`, background: heat(b.pct) }} />
                </span>
              }
              val={<span className="num">{p(b.pct)}</span>}
              valSmall={`${b.used}/${b.cells}`}
            />
          ))}
        </List>
      ) : (
        <Sf>{"Joylar yo'q — Ombor xaritasida stellaj qo'shing."}</Sf>
      )}
      <Sh t="Eng faol joylar" r={`${k.days} kun`} />
      {k.hot.length ? (
        <List>
          {k.hot.map((x, i) => (
            <Row key={x.code} icon={i < 3 ? "activity" : "pin"} color={i < 3 ? "orange" : "gray"} t={<span className="code">{x.code}</span>} val={<span className="num">{x.moves}</span>} valSmall="harakat" />
          ))}
        </List>
      ) : (
        <Sf>{"Davrda harakat yo'q."}</Sf>
      )}
      <Sh t="Joylashuv maslahati" r={k.slotting.length || undefined} />
      {k.slotting.length ? (
        <List>
          {k.slotting.map((x) => (
            <Row key={x.unit_id} icon="triangle-alert" color="orange" t={x.name} tcls="wrap2" scls="ml" s={`${x.code ?? "partiya"} · ${x.loc ?? ""} — ${x.hint}`} />
          ))}
        </List>
      ) : (
        <Sf>{"Tez aylanadigan (A-sinf) tovarlar qulay qavatlarda — maslahat yo'q."}</Sf>
      )}
    </>
  );
  return <Split wide={wide} left={tiles} right={side} />;
}

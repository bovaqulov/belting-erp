// Birlik, tovar va joy kartochkalari (faqat ko'rinish). Identifikatorlar (birlik, joy, o'lcham) — .code.
import { C, Icon, List, Row, Sf, Sh } from "@/erp/kit/ui";
import { dt, num, un } from "@/erp/kit/fmt";
import { Btns, CodeAnd, Done } from "@/erp/warehouse/common";
import { KINDN, size, type CellUnit, type ItemStock, type Move, type ScanUnit, type Trace } from "@/erp/warehouse/lib";

import type { Cut } from "@/erp/warehouse/cut";

const Hero = ({ icon, color, title, sub, code }: { icon: string; color: string; title: React.ReactNode; sub: React.ReactNode; code?: boolean }) => (
  <div className="hero">
    <span className="av" style={{ background: C[color] }}>
      <Icon n={icon} />
    </span>
    <h2 className={code ? "code" : "num"}>{title}</h2>
    <p>{sub}</p>
  </div>
);

export function UnitView({
  u,
  total,
  canCut,
  onPrint,
  onPdf,
  onLoc,
  onCut,
}: {
  u: ScanUnit;
  total: number;
  canCut: boolean;
  onPrint: () => void;
  onPdf: () => void;
  onLoc: () => void;
  onCut: () => void;
}) {
  const cuts = u.cuts ?? [];
  return (
    <>
      <Hero
        icon={u.kind === "roll" ? "layers" : "package"}
        color="orange"
        title={`${num(total, 3)} ${un(u.unit)}`}
        sub={
          <>
            {KINDN[u.kind] ?? u.kind} · <span className="code">{u.code}</span> · {u.firm}
            {u.pending ? (
              <>
                {" "}
                · <span className="badge warn">hisobda emas</span>
              </>
            ) : null}
          </>
        }
      />
      <Sh t="Tovar" />
      <List>
        <Row t={u.name} tcls="wrap2" s={[size(u), u.char].filter(Boolean).join(" · ")} />
        {u.parent_code ? <Row icon="scissors" color="purple" t="Qaysi rulondan" val={<span className="code">{u.parent_code}</span>} /> : null}
        {u.made?.kind === "cut" ? (
          <Row icon="user" color="purple" t="Kesgan" val={u.made.by_name ?? "—"} s={[dt(u.made.posted_at), u.made.job && `zakaz ${u.made.job}`].filter(Boolean).join(" · ")} />
        ) : null}
      </List>
      {cuts.length ? (
        <>
          <Sh t="Bu birlikdan kesilgan" r={cuts.length} />
          <List>
            {cuts.map((c, i) => (
              <Row
                key={i}
                icon="scissors"
                color="purple"
                t={c.by_name ?? "—"}
                s={[dt(c.posted_at), c.job && `zakaz ${c.job}`, c.number].filter(Boolean).join(" · ")}
                val={c.width_mm && c.length_mm ? <span className="code">{`${num(c.width_mm, 0)} × ${num(c.length_mm, 0)}`}</span> : <span className="num">{num(c.qty, 3)}</span>}
                valSmall={c.width_mm && c.length_mm ? undefined : un(u.unit)}
              />
            ))}
          </List>
        </>
      ) : null}
      <Sh t="Qayerda" />
      <List>
        <Row icon="pin" color="red" t="Joy" val={u.loc ? <span className="code">{u.loc}</span> : "belgilanmagan"} chev onClick={onLoc} />
        {u.stock.map((s, i) => (
          <Row key={i} icon="store" color="gray" t={s.warehouse} s={s.firm} val={<span className="num">{num(s.qty, 3)}</span>} />
        ))}
      </List>
      {u.pending ? <Sf>Stiker sanashda chiqarilgan, birlik inventarizatsiya yakunlanganda hisobga kiradi.</Sf> : null}
      <Sh t="Amallar" />
      <List>
        <Row icon="printer" color="blue" t="Stiker chop etish" onClick={onPrint} />
        <Row icon="file" color="gray" t="Stiker PDF" onClick={onPdf} />
        {canCut ? (
          <Row icon="scissors" color="purple" t="Kesish" s={u.dims === "wl" ? "Eni × uzunligi bo'yicha, qoldiq o'zi hisoblanadi" : "Kerakli o'lchamni kesib olish"} chev onClick={onCut} />
        ) : null}
      </List>
    </>
  );
}

export const CutDoneView = ({ c, unit, onPdf }: { c: Cut; unit: string; onPdf: () => void }) => (
  <>
    <Done ok title={`Kesildi: ${c.number}`}>
      Yangi stikerlar: {c.ids.length}
      {c.scrap ? ` · chiqindi ${num(c.scrap, 3)} ${un(unit)}` : ""}
      <br />
      Stikerlar chop etish navbatida
    </Done>
    <Btns>
      <button className="btn sec" onClick={onPdf}>
        Stikerlar PDF
      </button>
    </Btns>
  </>
);

export function ItemView({
  it,
  s,
  onUnitPrint,
  onPrint,
  onPdf,
}: {
  it: { name: string; unit: string; dims?: unknown; char?: string | null; legacy?: string | null };
  s: ItemStock;
  onUnitPrint: (batch: number) => void;
  onPrint: () => void;
  onPdf: () => void;
}) {
  return (
    <>
      <Hero icon="package" color="blue" title={`${num(s.total, 3)} ${un(it.unit)}`} sub={`rezerv ${num(s.reserved, 3)} · erkin ${num(s.free, 3)}`} />
      <Sh t="Tovar" />
      <List>
        <Row t={it.name} tcls="wrap2" s={[it.dims ? null : it.char, it.legacy && `1C ${it.legacy} kodi`].filter(Boolean).join(" · ")} />
      </List>
      <Sh t="Birliklar" r={s.units.length || undefined} />
      {s.units.length ? (
        <List>
          {s.units.map((x, i) => (
            <Row
              key={x.batch_id ?? `l${i}`}
              icon={x.kind === "roll" ? "layers" : "package"}
              color="orange"
              t={x.code ? <span className="code">{x.code}</span> : "partiya"}
              s={[size(x), x.warehouse, x.firm].filter(Boolean).join(" · ")}
              val={<span className="num">{num(x.qty, 3)}</span>}
              right={
                x.batch_id ? (
                  <button className="mini" title="Stiker" aria-label={`${x.code} stikeri`} onClick={() => onUnitPrint(x.batch_id!)}>
                    <Icon n="printer" />
                  </button>
                ) : null
              }
            />
          ))}
        </List>
      ) : (
        <Sf>Omborda yo&apos;q</Sf>
      )}
      <Sh t="Amallar" />
      <List>
        <Row icon="printer" color="blue" t="Tovar stikeri" onClick={onPrint} />
        <Row icon="file" color="gray" t="Stiker PDF" onClick={onPdf} />
      </List>
    </>
  );
}

export function CellView({ c, wh, us, onPdf }: { c: { code: string }; wh: string; us: CellUnit[]; onPdf: () => void }) {
  return (
    <>
      <Hero icon="pin" color="red" title={c.code} code sub={`${wh} · ${us.length} birlik`} />
      {us.length ? (
        <List>
          {us.map((x, i) => (
            <Row
              key={i}
              icon={x.kind === "roll" ? "layers" : "package"}
              color="orange"
              t={x.name}
              tcls="wrap2"
              s={<CodeAnd code={x.code} rest={[size(x), x.firm]} />}
              val={<span className="num">{num(x.qty, 3)}</span>}
              valSmall={un(x.unit)}
            />
          ))}
        </List>
      ) : (
        <Sf>Bu joyda birlik yo&apos;q.</Sf>
      )}
      <Btns>
        <button className="btn sec" onClick={onPdf}>
          Joy yorlig&apos;i PDF
        </button>
      </Btns>
    </>
  );
}

/** Harakatlar tarixi (jurnal): eng yangisi tepada; delta — rangli (+ kirim, − chiqim, 0 — ko'chish) */
export function MovesView({ ms, unit, showUnit }: { ms: Move[]; unit?: string; showUnit?: boolean }) {
  if (!ms.length) return <Sf>Harakat yo&apos;q.</Sf>;
  return (
    <List>
      {ms.map((m) => {
        const from = m.loc_from ?? m.wh_from;
        const to = m.loc_to ?? m.wh_to;
        const path = m.wh_from && m.wh_to && m.wh_from !== m.wh_to ? `${m.wh_from} → ${m.wh_to}` : from || to ? `${from ?? "—"} → ${to ?? "—"}` : "";
        return (
          <Row
            key={m.id}
            icon={m.delta > 0 ? "plus" : m.delta < 0 ? "minus" : "swap"}
            color={m.delta > 0 ? "green" : m.delta < 0 ? "red" : "gray"}
            t={
              <>
                {m.op_title}
                {m.doc_number ? <span className="code text-hint"> · {m.doc_number}</span> : null}
              </>
            }
            tcls="wrap2"
            s={[showUnit && m.unit_code ? m.unit_code : "", path, m.reason, m.author_name, dt(m.at)].filter(Boolean).join(" · ")}
            val={m.delta ? <span className={`num ${m.delta > 0 ? "text-st-done" : "text-danger"}`}>{`${m.delta > 0 ? "+" : "−"}${num(Math.abs(m.delta), 3)}`}</span> : <span className="text-hint">0</span>}
            valSmall={`qoldiq ${num(m.qty_after, 3)}${unit ? ` ${un(unit)}` : ""}`}
          />
        );
      })}
    </List>
  );
}

/** Kelib chiqish zanjiri: mahsulot — qaysi material birliklaridan; material — qaysi zakaz va mahsulotga ishlatilgan */
export function TraceView({ t }: { t: Trace }) {
  if (!t.from.length && !t.used.length) return null;
  return (
    <>
      {t.from.length ? (
        <>
          <Sh t="Qaysi materialdan qilingan" r={t.job ?? undefined} />
          <List>
            {t.from.map((x, i) => (
              <Row
                key={`${x.doc}:${i}`}
                icon="layers"
                color="orange"
                t={x.name}
                tcls="wrap2"
                s={<CodeAnd code={x.code} rest={[x.doc]} />}
                val={<span className="num">{num(x.qty, 3)}</span>}
                valSmall={un(x.unit)}
              />
            ))}
          </List>
        </>
      ) : null}
      {t.used.length ? (
        <>
          <Sh t="Sexda ishlatilgan" r={t.used.length} />
          <List>
            {t.used.map((x) => (
              <Row
                key={x.doc}
                icon={x.returned ? "undo-2" : "factory"}
                color={x.returned ? "gray" : "purple"}
                t={x.job ? `Zakaz ${x.job}` : x.doc}
                tcls="wrap2"
                scls="ml"
                s={[
                  x.doc,
                  dt(x.date),
                  x.returned ? `omborga qaytarilgan (${x.returned})` : x.products.length ? `→ ${x.products.map((p) => `${p.code ?? ""} ${p.name}`.trim()).join(", ")}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                val={<span className="num">{num(x.qty, 3)}</span>}
              />
            ))}
          </List>
        </>
      ) : null}
    </>
  );
}

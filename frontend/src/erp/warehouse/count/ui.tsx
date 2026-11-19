// Sanash (faqat ko'rinish): skaner, kontekst chiplari (ombor, firma, joy, rejim), ABC reja yoki sikl ro'yxati,
// sanalgan pozitsiyalar (oxirgisi tepada); yakunlangach — natija (farqlar).
import type { ReactNode } from "react";

import { num, un } from "@/erp/kit/fmt";
import { Empty, Icon, List, Row, Sf, Sh } from "@/erp/kit/ui";
import { Btns, CodeAnd, Done, Pane, Split } from "@/erp/warehouse/common";
import { ago, invKey, type Cycle, type InvDiff } from "@/erp/warehouse/lib";

export type Line = {
  item_id: number;
  char_id: number | null;
  batch_id: number | null;
  qty: number;
  data: { name?: string; code?: string; size?: string; unit: string; loc?: string; firm_id?: number; created?: boolean };
};
export type Result = { number: string; diff: (InvDiff & { name: string; from: string | null })[] };
/** Sanashni o'tkazishdan oldin ko'rish (server): har pozitsiya — tolerans bo'yicha */
export type Review = {
  lines: (InvDiff & { name: string; cls: string; value: number; ok: boolean })[];
  positions: number;
  need: number;
  value: number;
  can_approve: boolean;
  reasons: { code: string; title: string }[];
};

/** Katta farqlar: qayta sanash yoki rahbar tasdig'i (sabab bilan). Jahon amaliyoti — tolerans sinf bo'yicha. */
export function ReviewView({ r, reason, onReason, onRecount, onApprove }: { r: Review; reason: string; onReason: (c: string) => void; onRecount: () => void; onApprove: () => void }) {
  const bad = r.lines.filter((x) => !x.ok);
  return (
    <>
      <Done ok={false} title={`${r.need} ta katta farq`}>
        {r.positions} pozitsiyadan {r.positions - r.need} tasi toleransda. Farq summasi: <b className="num">{num(r.value, 0)}</b> so&apos;m.
        <br />
        Avval shu pozitsiyalarni qayta sanang — farq qolsa, rahbar sabab bilan tasdiqlaydi.
      </Done>
      <List>
        {bad.map((x, i) => (
          <Row
            key={i}
            icon="alert"
            color={x.cls === "A" ? "red" : "orange"}
            t={x.name}
            tcls="wrap2"
            s={`${x.cls} sinf · hisobda ${num(x.book, 3)} → sanaldi ${num(x.counted, 3)}${x.value ? ` · ${num(x.value, 0)} so'm` : ""}`}
            val={<span className={`num ${Number(x.diff) < 0 ? "text-danger" : "text-warn"}`}>{`${Number(x.diff) > 0 ? "+" : ""}${num(x.diff, 3)}`}</span>}
          />
        ))}
      </List>
      {r.can_approve ? (
        <>
          <Sh t="Farq sababi (rahbar tasdig'i)" />
          <List>
            {r.reasons.map((x) => (
              <Row key={x.code} icon={reason === x.code ? "check" : "circle-dot"} color={reason === x.code ? "blue" : "gray"} t={x.title} onClick={() => onReason(x.code)} />
            ))}
          </List>
        </>
      ) : (
        <Sf>Katta farqni faqat rahbar (egasi, admin) tasdiqlay oladi. Qoralama saqlangan — rahbar shu sanashni ochib tasdiqlaydi.</Sf>
      )}
      <Btns>
        <button className="btn sec" onClick={onRecount}>
          Qayta sanash
        </button>
        {r.can_approve ? (
          <button className="btn" disabled={!reason} onClick={onApprove}>
            Tasdiqlab o&apos;tkazish
          </button>
        ) : null}
      </Btns>
    </>
  );
}

const CLSC: Record<string, string> = { A: "red", B: "orange", C: "gray" };

const Chip = ({ icon, children, onClick, label }: { icon?: string; children: ReactNode; onClick: () => void; label: string }) => (
  <button
    type="button"
    className="chip inline-flex max-w-full items-center gap-1.5 [&_svg.i]:size-4 [&_svg.i]:flex-none [&_svg.i]:text-hint"
    onClick={onClick}
    aria-label={label}
  >
    {icon ? <Icon n={icon} /> : null} {children}
  </button>
);

export function CountView(p: {
  wide: boolean;
  result: Result | null;
  bar: ReactNode;
  wh: string;
  firm: string;
  loc: string | null;
  full: boolean;
  mode: string;
  items: number[] | null;
  plan: Cycle | null;
  counted: Set<number>;
  lines: Line[];
  saved: string;
  firmName: (id: number) => string;
  onAgain: () => void;
  onWh: () => void;
  onFirm: () => void;
  onLoc: () => void;
  onMode: () => void;
  onCycle: () => void;
  onUndo: () => void;
  onLine: (l: Line) => void;
}) {
  if (p.result) {
    const r = p.result;
    return (
      <>
        <Done ok={!r.diff.length} title={r.number}>
          {r.diff.length ? `Farq: ${r.diff.length} pozitsiya` : "Farq yo'q"}
        </Done>
        {r.diff.length ? (
          <List>
            {r.diff.map((x, i) => (
              <Row
                key={i}
                t={x.name}
                tcls="wrap2"
                s={`hisobda ${num(x.book, 3)} → sanaldi ${num(x.counted, 3)}${x.from ? ` · ${x.from} dan ko'chdi` : ""}`}
                val={<span className={`num ${Number(x.diff) < 0 ? "text-danger" : "text-ok"}`}>{`${Number(x.diff) > 0 ? "+" : ""}${num(x.diff, 3)}`}</span>}
              />
            ))}
          </List>
        ) : null}
        <Btns>
          <button className="btn sec" onClick={p.onAgain}>
            Yangi sanash
          </button>
        </Btns>
      </>
    );
  }

  let cycle: ReactNode = null;
  if (p.items?.length) {
    const info = Object.fromEntries((p.plan?.due ?? []).map((x) => [x.item_id, x]));
    const left = p.items.filter((i) => !p.counted.has(i));
    cycle = (
      <>
        <Sh t="Sikl sanoq" r={`${p.items.length - left.length} / ${p.items.length}`} />
        {left.length ? (
          <List>
            {left.map((i) => {
              const x = info[i];
              return (
                <Row
                  key={i}
                  icon="clipboard"
                  color={CLSC[x?.cls ?? ""] ?? "gray"}
                  t={x?.name ?? `#${i}`}
                  tcls="wrap2"
                  s={[x?.cls && `${x.cls} sinf`, x?.locs.length ? "joy: " + x.locs.join(", ") : "joyi belgilanmagan"].filter(Boolean).join(" · ")}
                />
              );
            })}
          </List>
        ) : (
          <Sf>Ro&apos;yxatdagi hamma tovar sanaldi — yakunlang.</Sf>
        )}
        <Sf>Har tovarning BARCHA birliklarini skanerlang: yakunlanganda shu tovarlarning sanalmagan qoldig&apos;i hisobdan chiqadi.</Sf>
      </>
    );
  } else if (p.plan && !p.lines.length && !p.full) {
    const pl = p.plan;
    const sm = Object.entries(pl.summary)
      .map(([k, v]) => `${k}: ${v.due}/${v.items}`)
      .join(" · ");
    cycle = (
      <>
        <Sh t="Bugun sanash (ABC)" r={pl.due_total || undefined} />
        {pl.due.length ? (
          <>
            <List>
              {pl.due.slice(0, 10).map((x) => (
                <Row
                  key={x.item_id}
                  icon="clipboard"
                  color={CLSC[x.cls]}
                  t={x.name}
                  tcls="wrap2"
                  s={[`${x.cls} sinf`, ago(x), x.locs.length ? "joy: " + x.locs.join(", ") : ""].filter(Boolean).join(" · ")}
                  val={<span className="num">{x.units}</span>}
                  valSmall="birlik"
                />
              ))}
            </List>
            <Btns>
              <button className="btn sec" onClick={p.onCycle}>
                Shu {Math.min(10, pl.due.length)} tasini sanash
              </button>
            </Btns>
            <Sf>
              Muddati o&apos;tgan / jami tovar — {sm}. A — sotuvning 80%i (har {pl.summary.A.days} kunda), B — keyingi 15% ({pl.summary.B.days}), C — qolgani (
              {pl.summary.C.days}). Hisobdagi miqdor ko&apos;rsatilmaydi — sanoq ko&apos;r-ko&apos;rona.
            </Sf>
          </>
        ) : (
          <Sf>Bu omborda bugun sanash kerak bo&apos;lgan tovar yo&apos;q.</Sf>
        )}
      </>
    );
  }

  const left = (
    <>
      {p.bar}
      <div className="mx-4 mt-2 flex flex-wrap gap-1.5">
        <Chip icon="store" onClick={p.onWh} label={`Ombor: ${p.wh}`}>
          {p.wh}
        </Chip>
        <Chip icon="building" onClick={p.onFirm} label={`Firma: ${p.firm}`}>
          {p.firm}
        </Chip>
        <Chip icon="pin" onClick={p.onLoc} label="Joy">
          {p.loc ? <span className="code">{p.loc}</span> : "joy tanlanmagan"}
        </Chip>
        <Chip onClick={p.onMode} label={`Rejim: ${p.mode}`}>
          {p.mode}
        </Chip>
      </div>
      {cycle}
    </>
  );
  const right = (
    <>
      <Sh t="Sanalgan" r={p.lines.length ? `${p.lines.length} poz. · ${p.saved}` : undefined} />
      {p.lines.length ? (
        <>
          <List>
            {p.lines
              .slice()
              .reverse()
              .map((l) => (
                <Row
                  key={invKey(l)}
                  icon={l.batch_id ? "layers" : "package"}
                  color={l.batch_id ? "orange" : "blue"}
                  t={l.data.name ?? `#${l.item_id}`}
                  tcls="wrap2"
                  s={<CodeAnd code={l.data.code} rest={[l.data.size, l.data.loc, l.data.firm_id ? p.firmName(l.data.firm_id) : null]} />}
                  val={<span className="num">{num(l.qty, 3)}</span>}
                  valSmall={un(l.data.unit)}
                  chev
                  onClick={() => p.onLine(l)}
                />
              ))}
          </List>
          <Btns>
            <button className="btn plain" onClick={p.onUndo}>
              Oxirgi skanni bekor qilish
            </button>
          </Btns>
        </>
      ) : (
        <>
          {p.wide ? (
            <Pane>
              <Empty icon="clipboard" title="Hali hech narsa sanalmagan" />
            </Pane>
          ) : null}
          <Sf>
            1) Joy yorlig&apos;ini skanerlang (ixtiyoriy) — keyingi birliklar shu joyga yoziladi.
            <br />
            2) Rulon/bo&apos;lak: tovar yoki eski 1C kodini skanerlang → o&apos;lchamini kiriting → QR stiker darhol chiqadi, uni yopishtiring.
            <br />
            3) Donali tovar: har skanerda +1.
            <br />
            Hammasi serverda qoralama sifatida saqlanadi.
          </Sf>
        </>
      )}
    </>
  );
  return <Split wide={p.wide} left={left} right={right} />;
}

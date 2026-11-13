// Qabul (faqat ko'rinish): yo'ldagi kirimlar ro'yxati, skaner bilan sanash (kutilgan / keldi), natija (farqlar).
import type { ReactNode } from "react";

import { d8, num, un } from "@/erp/kit/fmt";
import { C, Empty, Icon, List, Row, Sf, Sh } from "@/erp/kit/ui";
import { Btns, Done, Split } from "@/erp/warehouse/common";
import type { AccDiff, Incoming } from "@/erp/warehouse/lib";

export type AccResult = { number: string; diff: (AccDiff & { name: string })[] };
type It = Incoming["items"][number];

export function AccListView({ rs, onOpen }: { rs: Incoming[]; onOpen: (r: Incoming) => void }) {
  if (!rs.length)
    return (
      <Empty icon="truck" title="Yo'lda tovar yo'q">
        Ta&apos;minotchi jo&apos;natgan tovarlar shu yerda ko&apos;rinadi
      </Empty>
    );
  return (
    <>
      <Sh t="Yo'ldagi tovarlar" r={rs.length} />
      <List>
        {rs.map((r) => (
          <Row
            key={r.id}
            icon="truck"
            color="teal"
            t={r.supplier ?? "Ta'minotchi"}
            s={
              <>
                <span className="code">{r.number}</span> · {[`${r.items.length} pozitsiya`, r.expected && `kutilgan ${d8(r.expected)}`].filter(Boolean).join(" · ")}
              </>
            }
            chev
            onClick={() => onOpen(r)}
          />
        ))}
      </List>
    </>
  );
}

export function AccCountView({
  wide,
  r,
  bar,
  to,
  partial,
  counted,
  onTo,
  onPartial,
  onBack,
  onLine,
}: {
  wide: boolean;
  r: Incoming;
  bar: ReactNode;
  to: string;
  partial: boolean;
  counted: (x: It) => number;
  onTo: () => void;
  onPartial: (v: boolean) => void;
  onBack: () => void;
  onLine: (x: It) => void;
}) {
  const left = (
    <>
      {bar}
      <List>
        <Row icon="truck" color="teal" t={r.supplier ?? "Ta'minotchi"} s={<span className="code">{r.number}</span>} />
        <Row icon="pin" color="red" t="Qayerga" val={to} chev onClick={onTo} />
        <label className="item wh-sw">
          <span className="sq" style={{ background: C.orange }} aria-hidden="true">
            <Icon n="clock" />
          </span>
          <div className="main">
            <div className="t">Qisman qabul</div>
            <div className="s">Qolgani yo&apos;lda kutadi, kamomad yozilmaydi</div>
          </div>
          <input type="checkbox" className="switch" checked={partial} onChange={(e) => onPartial(e.target.checked)} />
        </label>
      </List>
      <Sf>Tovar shtrixkodi — har skanerda +1, birlik QR — butun birlik. Miqdorni qo&apos;lda tuzatish uchun qatorni bosing.</Sf>
      <Btns>
        <button className="btn plain" onClick={onBack}>
          Boshqa kirimni tanlash
        </button>
      </Btns>
    </>
  );
  const right = (
    <>
      <Sh t="Tovarlar" r="kutilgan / keldi" />
      <List>
        {r.items.map((x) => {
          const c = counted(x);
          const d = c - Number(x.qty);
          return (
            <Row
              key={`${x.item_id}:${x.char_id ?? ""}`}
              t={x.name}
              tcls="wrap2"
              s={[x.char, `kutilgan ${num(x.qty, 3)} ${un(x.unit)}`].filter(Boolean).join(" · ")}
              val={<span className={`num ${d < 0 ? "bad-t" : d > 0 ? "warn-t" : "ok-t"}`}>{num(c, 3)}</span>}
              valSmall={d ? `${d > 0 ? "+" : ""}${num(d, 3)}` : "✓"}
              chev
              onClick={() => onLine(x)}
            />
          );
        })}
      </List>
    </>
  );
  return <Split wide={wide} left={left} right={right} />;
}

export const AccDoneView = ({ r, onBack }: { r: AccResult; onBack: () => void }) => (
  <>
    <Done ok={!r.diff.length} title={r.number}>
      {r.diff.length ? `Farq dalolatnomasi: ${r.diff.length} pozitsiya` : "Farq yo'q"}
      <br />
      Stikerlar chop etish navbatida. Birliklar — Joylashtirish › joylash navbatida.
    </Done>
    {r.diff.length ? (
      <List>
        {r.diff.map((x, i) => (
          <Row
            key={i}
            t={x.name}
            s={`kutilgan ${num(x.expected, 3)} → keldi ${num(x.counted, 3)}`}
            val={<span className={`num ${Number(x.diff) < 0 ? "bad-t" : "warn-t"}`}>{`${Number(x.diff) > 0 ? "+" : ""}${num(x.diff, 3)}`}</span>}
          />
        ))}
      </List>
    ) : null}
    <Btns>
      <button className="btn sec" onClick={onBack}>
        Yo&apos;ldagi tovarlar
      </button>
    </Btns>
  </>
);

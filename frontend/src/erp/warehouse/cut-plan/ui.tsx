// Kesish rejasi (faqat ko'rinish): chapda tovar, ombor, o'lchamlar; o'ngda reja — har birlik: kesiladigan bo'laklar,
// qoldiq/chiqindi, "Shu birlikni kesish". Sig'maganlar — qizil xabar.
import type { ReactNode } from "react";

import { num, un } from "@/erp/kit/fmt";
import { Empty, List, Row, Sf, Sh } from "@/erp/kit/ui";
import { Btns, Pane, Split } from "@/erp/warehouse/common";
import { cutText, dimsHint, KINDN, size, type CutPlan, type Dims } from "@/erp/warehouse/lib";
import { ScanMsg } from "@/erp/warehouse/scan-bar";

export type PlanItem = { item_id: number; name: string; unit: string; dims: Exclude<Dims, null> };

export function CutPlanView({
  wide,
  bar,
  it,
  wh,
  txt,
  plan: pl,
  done,
  canCut,
  onWh,
  onTxt,
  onCalc,
  onPdf,
  onCut,
}: {
  wide: boolean;
  bar: ReactNode;
  it: PlanItem | null;
  wh: string;
  txt: string;
  plan: CutPlan | null;
  done: Record<number, { number: string; ids: number[] }>;
  canCut: boolean;
  onWh: () => void;
  onTxt: (v: string) => void;
  onCalc: () => void;
  onPdf: () => void;
  onCut: (i: number) => void;
}) {
  const left = (
    <>
      {bar}
      <List>
        <Row icon="package" color="orange" t={it ? it.name : "Tovarni skanerlang yoki yozing"} tcls="wrap2" s={it ? dimsHint(it.dims, it.unit) : undefined} />
        <Row icon="store" color="gray" t="Ombor" val={wh} chev onClick={onWh} />
      </List>
      {it ? (
        <>
          <div className="list">
            <div className="field col">
              <label htmlFor="cp-needs">Kerakli bo&apos;laklar — {it.dims === "wl" ? "eni × uzunligi × soni" : "o'lcham × soni"}, vergul yoki yangi qatorda</label>
              <textarea
                id="cp-needs"
                className="code"
                rows={3}
                value={txt}
                placeholder={it.dims === "wl" ? "500x1200x2, 800x3000" : "300x3, 150"}
                onChange={(e) => onTxt(e.target.value)}
              />
            </div>
          </div>
          <Btns>
            <button className="btn" onClick={onCalc}>
              Rejani hisoblash
            </button>
          </Btns>
        </>
      ) : null}
    </>
  );
  const right = pl && it ? (
    <>
      <Sh t="Reja" r={`${pl.pieces} bo'lak · ${pl.units.length} birlik`} />
      <Sf>
        Kerak: {num(pl.need_qty, 3)} {un(pl.unit)}
        {Number(pl.scrap_qty) ? ` · chiqindi ${num(pl.scrap_qty, 3)}` : ""}
        {pl.opened ? ` · yangi rulon ochiladi: ${pl.opened}` : " · faqat qoldiqlardan"}
      </Sf>
      {pl.missing.length ? (
        <ScanMsg msg={{ ok: false, title: `Sig'maydi: ${pl.missing.length} bo'lak`, sub: `${pl.missing.map((m) => cutText(it.dims, m)).join(", ")} — omborda mos birlik yo'q` }} />
      ) : null}
      {pl.units.map((u, i) => (
        <div key={u.batch_id}>
          <Sh
            t={
              <>
                <span className="code">{u.code}</span> · {KINDN[u.kind] ?? u.kind}
              </>
            }
            r={[size(u) || `${num(u.qty, 3)} ${un(pl.unit)}`, u.loc && "@" + u.loc, u.firm].filter(Boolean).join(" · ")}
          />
          <List>
            {u.cuts.map((c, k) => (
              <Row key={`c${k}`} icon="scissors" color="purple" t={<span className="code">{cutText(it.dims, c)}</span>} val={<span className="num">{num(c.qty, 3)}</span>} valSmall={un(pl.unit)} />
            ))}
            {u.rests.map((r, k) => (
              <Row
                key={`r${k}`}
                icon={r.scrap ? "trash" : "layers"}
                color={r.scrap ? "red" : "gray"}
                t={
                  <>
                    {r.scrap ? "Chiqindi " : "Qoldiq "}
                    <span className="code">{cutText(it.dims, r)}</span>
                  </>
                }
                val={<span className="num">{num(r.qty, 3)}</span>}
                valSmall={un(pl.unit)}
              />
            ))}
            {canCut ? (
              done[i] ? (
                <Row icon="check" color="green" t={<>Kesildi: <span className="code">{done[i].number}</span></>} />
              ) : (
                <Row icon="scissors" color="green" t="Shu birlikni kesish" onClick={() => onCut(i)} />
              )
            ) : null}
          </List>
        </div>
      ))}
      {Object.keys(done).length ? (
        <Btns>
          <button className="btn sec" onClick={onPdf}>
            Yangi stikerlar PDF
          </button>
        </Btns>
      ) : null}
    </>
  ) : wide ? (
    <Pane>
      <Empty icon="scissors" title="Reja shu yerda">
        Tovarni tanlang, o&apos;lchamlarni yozing — qaysi rulondan qanday kesish ko&apos;rsatiladi
      </Empty>
    </Pane>
  ) : null;
  return <Split wide={wide} left={left} right={right} />;
}

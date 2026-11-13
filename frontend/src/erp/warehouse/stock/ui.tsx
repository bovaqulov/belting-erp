// Qoldiq (faqat ko'rinish): filtr qatori; kompyuterda jadval + o'ngda tafsilot, telefonda ro'yxat yoki tanlangan tovar.
import type { ReactNode } from "react";

import { num, short } from "@/erp/kit/fmt";
import { Tbl } from "@/erp/kit/table";
import { Empty, Icon, List, Loaded, Row } from "@/erp/kit/ui";
import { Btns, Pane, Qty, Tags } from "@/erp/warehouse/common";
import type { StockRow, StockTable, Warehouse } from "@/erp/warehouse/lib";

export type Filt = { q: string; wh: string; kind: "" | "measured" | "piece"; low: boolean };

type St = { data: StockTable | undefined; err: string; net: boolean; reload: () => Promise<void> };

const lowCls = (r: StockRow) => (r.min_qty > 0 && Number(r.qty) < Number(r.min_qty) ? "bad-t" : "");

export function StockView({
  wide,
  st,
  f,
  q,
  stores,
  sel,
  detail,
  onQ,
  onF,
  onSel,
  onCsv,
}: {
  wide: boolean;
  st: St;
  f: Filt;
  q: string;
  stores: Warehouse[];
  sel: number | null;
  detail: ReactNode;
  onQ: (v: string) => void;
  onF: (p: Partial<Filt>) => void;
  onSel: (r: StockRow | null) => void;
  onCsv: () => void;
}) {
  if (!wide && detail)
    return (
      <>
        <Btns>
          <button className="btn plain" onClick={() => onSel(null)}>
            <Icon n="back" /> Qoldiq ro&apos;yxati
          </button>
        </Btns>
        {detail}
      </>
    );
  const filters = (
    <div className="wh-filt">
      <div className="search">
        <Icon n="search" />
        <input value={q} onChange={(e) => onQ(e.target.value)} placeholder="Nom, artikul yoki remen belgisi" aria-label="Qidirish" autoComplete="off" />
      </div>
      <select className="sel" value={f.wh} onChange={(e) => onF({ wh: e.target.value })} aria-label="Ombor">
        <option value="">Barcha omborlar</option>
        {stores.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      <select className="sel" value={f.kind} onChange={(e) => onF({ kind: e.target.value as Filt["kind"] })} aria-label="Tovar turi">
        <option value="">Barcha tovarlar</option>
        <option value="measured">Rulon, bo&apos;lak, rukav</option>
        <option value="piece">Donali</option>
      </select>
      <label className="b wh-chk">
        <input type="checkbox" checked={f.low} onChange={(e) => onF({ low: e.target.checked })} /> Kam qolgan
      </label>
      {wide ? (
        <button type="button" className="b" onClick={onCsv}>
          <Icon n="download" /> CSV
        </button>
      ) : null}
    </div>
  );
  const empty = (
    <Empty icon="layers" title="Qoldiq yo'q">
      {f.q || f.kind || f.low ? "Filtr bo'yicha tovar topilmadi" : "Inventarizatsiya yoki kirimdan keyin bu yerda ko'rinadi"}
    </Empty>
  );
  return (
    <>
      {filters}
      <Loaded st={st}>
        {(d) => {
          const t = d.total;
          const head = (
            <p className="wh-sub">
              {num(t.items, 0)} tovar · {num(t.units, 0)} birlik · rulon {num(t.rolls, 0)} · bo&apos;lak {num(t.pieces, 0)}
              {t.cost !== undefined && d.see_cost ? ` · tannarx ${short(t.cost)} so'm` : ""}
            </p>
          );
          if (!wide)
            return (
              <>
                {head}
                {d.rows.length ? (
                  <List>
                    {d.rows.map((r) => (
                      <Row
                        key={r.item_id}
                        icon={r.dims ? "layers" : "package"}
                        color={r.dims ? "orange" : "blue"}
                        t={r.name}
                        tcls="wrap2"
                        s={[r.sku, r.locs.slice(0, 3).join(", "), r.dims ? `${r.rolls} rulon · ${r.pieces} bo'lak` : null].filter(Boolean).join(" · ")}
                        val={<Qty v={r.qty} u={r.unit} cls={lowCls(r)} />}
                        chev
                        onClick={() => onSel(r)}
                      />
                    ))}
                  </List>
                ) : (
                  empty
                )}
              </>
            );
          return (
            <>
              {head}
              <div className="wh-cols r">
                <div>
                  {d.rows.length ? (
                    <Tbl
                      label="Qoldiq"
                      rows={d.rows}
                      rowKey={(r) => String(r.item_id)}
                      sel={sel === null ? undefined : String(sel)}
                      onRow={onSel}
                      cols={[
                        { h: "Tovar", f: (r) => (<>{r.name}{r.sku ? <div className="t2">{r.sku}</div> : null}</>) },
                        { h: "Qoldiq", n: true, f: (r) => <Qty v={r.qty} u={r.unit} cls={lowCls(r)} /> },
                        { h: "Birlik", n: true, f: (r) => (r.dims ? (<>{r.rolls} / {r.pieces}<div className="t2">rulon / bo&apos;lak</div></>) : num(r.units, 0)) },
                        { h: "Joy", f: (r) => <Tags xs={r.locs} code /> },
                        { h: "Firma", f: (r) => <Tags xs={r.firms} /> },
                        ...(f.wh ? [] : [{ h: "Ombor", f: (r: StockRow) => <Tags xs={r.whs} n={2} /> }]),
                        ...(d.see_cost ? [{ h: "Tannarx", n: true, f: (r: StockRow) => num(r.cost, 0) }] : []),
                      ]}
                    />
                  ) : (
                    empty
                  )}
                </div>
                <div className="wh-sticky">
                  {detail ?? (
                    <Pane>
                      <Empty icon="package" title="Tovarni tanlang">
                        Birliklar, o&apos;lchamlar va stikerlar shu yerda
                      </Empty>
                    </Pane>
                  )}
                </div>
              </div>
            </>
          );
        }}
      </Loaded>
    </>
  );
}

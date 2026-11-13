// Buyurtmalar (har kanal alohida, to'liq hayot sikli). WB — o'z tartibi (postavkalar, wb/); Ozon va Uzum — bosqichlar
// taxtasi: "Harakat kerak" (yangi + yig'ishda), muddat bo'yicha saralangan; buyurtma → yig'ish oynasi.
import { useState } from "react";

import { dt } from "@/erp/kit/fmt";
import { Empty, List, Loaded, Row, useLoad } from "@/erp/kit/ui";
import { api, P } from "@/erp/marketplace/api";
import { useMk } from "@/erp/marketplace/context";
import { CHN, leftText, STG, STG_COLOR, STG_ST, type Board, type BoardStage, type Order, type OrderCh } from "@/erp/marketplace/lib";
import { OrderSheet } from "@/erp/marketplace/order";
import { Tbl } from "@/erp/kit/table";
import { WbOrders } from "@/erp/marketplace/wb";

import { SyncRow } from "./sync";

export function Orders({ ch }: { ch: OrderCh }) {
  return ch === "wb" ? <WbOrders /> : <ChannelBoard ch={ch} />;
}

export const Lines = ({ o }: { o: Order }) => (
  <>
    {o.lines.map((l, i) => (
      <div key={i} className="ln">
        {l.title || l.key || o.article} <span className="code mut">× {l.qty}</span>
      </div>
    ))}
  </>
);

const Left = ({ o }: { o: Order }) =>
  o.left_min === null ? null : <span className={o.left_min < 0 ? "bad-t" : o.left_min < 180 ? "warn-t" : undefined}>{leftText(o.left_min)}</span>;

const Picked = ({ o }: { o: Order }) =>
  o.need ? <span className={`code ${o.assembled_at ? "ok-t" : ""}`}>{o.assembled_at ? "✓" : `${o.picked.length}/${o.need}`}</span> : null;

function ChannelBoard({ ch }: { ch: Exclude<OrderCh, "wb"> }) {
  const { wide } = useMk();
  const [stage, setStage] = useState<BoardStage>("active");
  const [open, setOpen] = useState<Order | null>(null);
  const st = useLoad(() => api<Board>(`${P}/orders/${ch}/board?stage=${stage}`), [ch, stage]);
  const cnt = st.data?.counts ?? {};
  const label = (k: BoardStage) => {
    const n = k === "active" ? (cnt.new ?? 0) + (cnt.assembly ?? 0) : (cnt[k] ?? 0);
    return n ? `${STG[k]} · ${n}` : STG[k];
  };
  return (
    <>
      <div className="chips" role="group" aria-label="Bosqich">
        {(Object.keys(STG) as BoardStage[]).map((k) => (
          <button key={k} type="button" className={`chip ${stage === k ? "on" : ""}`} aria-pressed={stage === k} onClick={() => setStage(k)}>
            {label(k)}
          </button>
        ))}
      </div>
      <div style={{ height: 10 }} />
      <SyncRow ch={ch} onDone={() => void st.reload()} />
      <div style={{ height: 14 }} />
      <Loaded st={st}>
        {(b) =>
          !b.orders.length ? (
            <Empty icon="cart" title="Bu bosqichda buyurtma yo'q">
              {stage === "active" ? "Yangi buyurtmalar kelganda shu yerda ko'rinadi." : null}
            </Empty>
          ) : wide ? (
            <Tbl
              label={`${CHN[ch]} buyurtmalari`}
              rows={b.orders}
              rowKey={(o) => o.ext_id}
              onRow={setOpen}
              cols={[
                {
                  h: "Buyurtma",
                  f: (o) => (
                    <>
                      <span className="code">{o.ext_id}</span>
                      <div className="t2">
                        {dt(o.ordered)}
                        {o.number ? ` · ${o.number}` : ""}
                      </div>
                    </>
                  ),
                },
                { h: "Tovarlar", f: (o) => <Lines o={o} /> },
                {
                  h: "Bosqich",
                  f: (o) => (
                    <>
                      <span className={`st ${STG_ST[o.stage]}`}>{STG[o.stage]}</span>
                      <div className="t2">{o.ext_status}</div>
                    </>
                  ),
                },
                { h: "Muddat", f: (o) => <Left o={o} />, n: true },
                { h: "Yig'ildi", f: (o) => <Picked o={o} />, n: true },
              ]}
            />
          ) : (
            <List>
              {b.orders.map((o) => (
                <Row
                  key={o.ext_id}
                  icon="cart"
                  color={STG_COLOR[o.stage]}
                  t={<span className="code">{o.ext_id}</span>}
                  s={
                    <>
                      <Lines o={o} />
                      {STG[o.stage]} · {o.ext_status}
                    </>
                  }
                  scls="ml"
                  val={<Picked o={o} />}
                  valSmall={<Left o={o} />}
                  chev
                  onClick={() => setOpen(o)}
                />
              ))}
            </List>
          )
        }
      </Loaded>
      {open ? <OrderSheet o={open} onClose={() => setOpen(null)} onChanged={() => void st.reload()} /> : null}
    </>
  );
}

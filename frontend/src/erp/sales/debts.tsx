// Mijozlar qarzi (1C «Взаиморасчеты»): o'tkazilgan yuk xatlari − to'lovlar; musbat — qarz, manfiy — avans.
// Mijoz → uning hujjatlari (jurnal, mijoz filtri bilan).
import { useEffect, useState } from "react";

import { api } from "@/erp/kit/env";
import { Tbl } from "@/erp/kit/table";
import { Empty, Icon, List, Loaded, Row, useLoad } from "@/erp/kit/ui";

import { sum, when, type Debt } from "./lib";

const tone = (b: string) => (Number(b) > 0 ? "text-st-bad" : Number(b) < 0 ? "text-st-done" : "");
const label = (b: string) => (Number(b) > 0 ? "qarz" : Number(b) < 0 ? "avans" : "hisob yopiq");

export function Debts({ wide, onCustomer }: { wide: boolean; onCustomer: (id: number) => void }) {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const st = useLoad(() => api<Debt[]>(`/app/api/erp/sales/debts?q=${encodeURIComponent(dq)}`), [dq]);
  return (
    <>
      <div className="mx-4 mt-2">
        <label className="search !m-0 !h-10 coarse:!h-11">
          <Icon n="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mijoz nomi yoki STIR" aria-label="Mijoz qidirish" />
        </label>
      </div>
      <Loaded st={st}>
        {(rs) => {
          const total = rs.reduce((a, r) => a + Math.max(Number(r.balance), 0), 0);
          return !rs.length ? (
            <Empty icon="wallet" title="Hisob-kitob yo'q">
              O&apos;tkazilgan yuk xati yoki to&apos;lov bo&apos;lganda mijoz shu yerda chiqadi.
            </Empty>
          ) : (
            <>
              <div className="sf !pt-2.5 pb-1.5">
                Jami qarz: <b className="num text-st-bad">{sum(total)}</b> so&apos;m · {rs.length} ta mijoz
              </div>
              {wide ? (
                <Tbl
                  label="Mijozlar qarzi"
                  rows={rs}
                  rowKey={(r) => String(r.customer_id)}
                  onRow={(r) => onCustomer(r.customer_id)}
                  cols={[
                    { h: "Mijoz", f: (r) => <>{r.customer}{r.inn ? <div className="t2">STIR {r.inn}</div> : null}</> },
                    { h: "Jo'natilgan", f: (r) => <span className="num">{sum(r.shipped)}</span>, n: true },
                    { h: "To'langan", f: (r) => <span className="num">{sum(r.paid)}</span>, n: true },
                    { h: "Saldo", f: (r) => <><span className={`num font-semibold ${tone(r.balance)}`}>{sum(Math.abs(Number(r.balance)))}</span><div className="t2">{label(r.balance)}</div></>, n: true },
                    { h: "Oxirgi harakat", f: (r) => <span className="num">{when(r.last)}</span> },
                  ]}
                />
              ) : (
                <List>
                  {rs.map((r) => (
                    <Row
                      key={r.customer_id}
                      icon="users"
                      color={Number(r.balance) > 0 ? "red" : "green"}
                      t={r.customer}
                      s={`jo'natilgan ${sum(r.shipped)} · to'langan ${sum(r.paid)}`}
                      val={<span className={`num ${tone(r.balance)}`}>{sum(Math.abs(Number(r.balance)))}</span>}
                      valSmall={label(r.balance)}
                      chev
                      onClick={() => onCustomer(r.customer_id)}
                    />
                  ))}
                </List>
              )}
            </>
          );
        }}
      </Loaded>
    </>
  );
}

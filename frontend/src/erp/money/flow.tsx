// Pul oqimi (1C «Движение денежных средств»): davr; hisoblar bo'yicha boshi / kirim / chiqim / oxiri; moddalar
// bo'yicha kirim va chiqim (so'm hisoblari). Davr — joriy oy (o'zgartiriladi).
import { useState } from "react";

import { api } from "@/erp/kit/env";
import { Tbl } from "@/erp/kit/table";
import { List, Loaded, Row, Sh, useLoad } from "@/erp/kit/ui";

import { cur, sum, type Flow as FlowT } from "./lib";

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

export function Flow({ wide }: { wide: boolean }) {
  const now = new Date();
  const [d1, setD1] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [d2, setD2] = useState(iso(now));
  const st = useLoad(() => api<FlowT>(`/app/api/erp/money/flow?from=${d1}&to=${d2}`), [d1, d2]);
  return (
    <div className="mx-auto max-w-[1000px] pb-6">
      <div className="mx-4 mt-2 flex flex-wrap items-center gap-2 text-[13px] text-hint">
        Davr:
        <input type="date" className="sel !h-10 coarse:!h-11" value={d1} onChange={(e) => setD1(e.target.value)} aria-label="Davr boshi" />
        —
        <input type="date" className="sel !h-10 coarse:!h-11" value={d2} onChange={(e) => setD2(e.target.value)} aria-label="Davr oxiri" />
      </div>
      <Loaded st={st}>
        {(f) => (
          <>
            <Sh t="Hisoblar" />
            {wide ? (
              <Tbl
                label="Hisoblar bo'yicha"
                rows={f.accounts}
                rowKey={(r) => String(r.id)}
                cols={[
                  { h: "Hisob", f: (r) => <>{r.name}<div className="t2">{r.firm} · {cur(r.currency)}</div></> },
                  { h: "Davr boshi", f: (r) => <span className="num">{sum(r.start)}</span>, n: true },
                  { h: "Kirim", f: (r) => <span className="num text-st-done">{sum(r.in)}</span>, n: true },
                  { h: "Chiqim", f: (r) => <span className="num text-st-bad">{sum(r.out)}</span>, n: true },
                  { h: "Davr oxiri", f: (r) => <span className="num font-semibold">{sum(r.end)}</span>, n: true },
                ]}
              />
            ) : (
              <List>
                {f.accounts.map((r) => (
                  <Row key={r.id} icon="bank" color="blue" t={r.name} s={`+${sum(r.in)} · −${sum(r.out)} · boshi ${sum(r.start)}`} val={<span className="num">{sum(r.end)}</span>} valSmall={cur(r.currency)} />
                ))}
              </List>
            )}
            {(["in", "out"] as const).map((dir) => {
              const xs = f.items.filter((x) => x.direction === dir);
              const tot = xs.reduce((a, x) => a + Number(x.amount), 0);
              return (
                <div key={dir}>
                  <Sh t={dir === "in" ? "Kirim moddalari" : "Chiqim moddalari"} r={<span className="num">{sum(tot)}</span>} />
                  {xs.length ? (
                    <List>
                      {xs.map((x) => (
                        <Row key={x.item} t={x.item} val={<span className={`num ${dir === "in" ? "text-st-done" : "text-st-bad"}`}>{sum(x.amount)}</span>} />
                      ))}
                    </List>
                  ) : (
                    <p className="sf">Davrda {dir === "in" ? "kirim" : "chiqim"} yo&apos;q.</p>
                  )}
                </div>
              );
            })}
          </>
        )}
      </Loaded>
    </div>
  );
}

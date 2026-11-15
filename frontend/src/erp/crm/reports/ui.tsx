// CRM hisoboti (faqat ko'rinish): davr, asosiy raqamlar, Savdo voronkasi (bitta qatorli ustunlar, qiymat yonida),
// sotuvchilar jadvali, yo'qotish sabablari, lid manbalari. Rang — bitta (link), matn — matn tokenlarida.
import type { ReactNode } from "react";

import { short } from "@/erp/kit/fmt";
import { Loaded } from "@/erp/kit/ui";
import { LSRC, type Report, type Stage } from "@/erp/crm/lib";
import { PANE, RT, SMALL, SP, SUM, TB_IN, TTL } from "@/erp/crm/tw";

export const PERIODS: [string, string][] = [
  ["month", "Bu oy"],
  ["prev", "O'tgan oy"],
  ["30", "30 kun"],
];

/** Javob vaqti: 45 daq · 2 soat 10 daq · 3 kun */
export function minutes(m: number | null): string {
  if (m === null) return "—";
  if (m < 60) return `${m} daq`;
  if (m < 1440) return `${Math.floor(m / 60)} soat${m % 60 ? ` ${m % 60} daq` : ""}`;
  return `${Math.round(m / 1440)} kun`;
}
const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
const dshort = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

const Box = ({ title, children, wide = false }: { title: string; children: ReactNode; wide?: boolean }) => (
  <section className={`min-w-0 rounded-xl bg-sec p-4 shadow-1 ${wide ? "col-span-2 max-[1100px]:col-span-1" : ""}`}>
    <h3 className="m-0 mb-3 text-[13px] font-semibold tracking-wide text-hint uppercase">{title}</h3>
    {children}
  </section>
);

const Tile = ({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) => (
  <div className="min-w-0 rounded-xl bg-sec px-4 py-3 shadow-1">
    <div className={SMALL}>{label}</div>
    <div className="mt-0.5 truncate text-[22px] leading-tight font-semibold tabular-nums">{value}</div>
    {sub ? <div className={`${SMALL} mt-0.5 truncate`}>{sub}</div> : null}
  </div>
);

/** Gorizontal ustun: nom · ustun (eng kattasiga nisbatan) · qiymat; hover — to'liq qiymat */
function Bar({ label, value, max, right, hint }: { label: string; value: number; max: number; right: ReactNode; hint: string }) {
  const w = max ? Math.max(value ? 2 : 0, (value / max) * 100) : 0;
  return (
    <div className="grid grid-cols-[minmax(110px,180px)_1fr_8.5rem] items-center gap-3 py-1.5 max-md:grid-cols-[1fr_auto] max-md:gap-x-2 max-md:gap-y-1" title={hint}>
      <span className="truncate text-[13px]">{label}</span>
      <span className="h-3 overflow-hidden rounded-full bg-fill max-md:order-3 max-md:col-span-2">
        <span className="block h-full rounded-full bg-link transition-[width] duration-300" style={{ width: `${w}%` }} />
      </span>
      {/* qat'iy kenglik — barcha qatorlarda ustun izi bir xil uzunlikda (taqqoslash to'g'ri bo'lsin) */}
      <span className="truncate text-right text-[13px] whitespace-nowrap tabular-nums">{right}</span>
    </div>
  );
}

export function ReportsView({
  st,
  per,
  stg,
  onPer,
}: {
  st: { data: Report | undefined; err: string; net?: boolean; reload?: () => Promise<void> };
  per: string;
  stg: Record<string, Stage>;
  onPer: (v: string) => void;
}) {
  return (
    <div className={PANE}>
      <div className={TB_IN}>
        <div className="grp" role="group" aria-label="Davr">
          {PERIODS.map(([k, t]) => (
            <button key={k} type="button" className={`b ${per === k ? "on" : ""}`} aria-pressed={per === k} onClick={() => onPer(k)}>
              {t}
            </button>
          ))}
        </div>
        {st.data ? (
          <span className={SUM}>
            {dshort(st.data.from)} — {dshort(st.data.to)}
            {st.data.head ? " · barcha sotuvchilar" : " · faqat siz"}
          </span>
        ) : null}
        <span className={SP} />
      </div>
      <Loaded st={st}>
        {(r) => {
          const k = r.kpi;
          const top = r.funnel[0]?.count ?? 0;
          const maxReason = Math.max(0, ...r.reasons.map((x) => x.count));
          return (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-6 gap-3 max-[1200px]:grid-cols-3 max-md:grid-cols-2">
                <Tile label="Yangi lidlar" value={k.leads} sub={k.unassigned ? `${k.unassigned} tasi taqsimlanmagan` : "hammasi taqsimlangan"} />
                <Tile label="Lidga javob (mediana)" value={minutes(k.response_min)} sub="birinchi javobgacha" />
                <Tile label="Lid → bitim" value={pct(k.lead_conv)} />
                <Tile label="Ochilgan bitimlar" value={k.deals} />
                <Tile label="Sotuv" value={short(k.won_sum)} sub={`${k.won} ta · yutish ${pct(k.win_rate)}`} />
                <Tile label="Ochiq voronka" value={short(k.open_sum)} sub="hozirgi holat" />
              </div>
              <div className="grid grid-cols-2 gap-3 max-[1100px]:grid-cols-1">
                <Box title="Savdo voronkasi — davrda ochilgan bitimlar">
                  {top ? (
                    r.funnel.map((f, i) => {
                      const prev = i ? r.funnel[i - 1].count : 0;
                      const step = i && prev ? Math.round((f.count / prev) * 100) : null;
                      return (
                        <Bar
                          key={f.stage}
                          label={stg[f.stage]?.name ?? f.stage}
                          value={f.count}
                          max={top}
                          hint={`${stg[f.stage]?.name ?? f.stage}: ${f.count} ta${step !== null ? ` (oldingi bosqichdan ${step}%)` : ""}`}
                          right={
                            <>
                              <b>{f.count}</b>
                              {step !== null ? <span className="text-hint"> · {step}%</span> : null}
                            </>
                          }
                        />
                      );
                    })
                  ) : (
                    <div className={SUM}>Bu davrda bitim ochilmagan.</div>
                  )}
                </Box>
                <Box title="Yo'qotish sabablari">
                  {r.reasons.length ? (
                    r.reasons.map((x) => (
                      <Bar key={x.reason} label={x.reason} value={x.count} max={maxReason} hint={`${x.reason}: ${x.count} ta, ${short(x.sum)}`} right={<>{x.count} ta · <span className="text-hint">{short(x.sum)}</span></>} />
                    ))
                  ) : (
                    <div className={SUM}>Bu davrda yo&apos;qotilgan bitim yo&apos;q.</div>
                  )}
                </Box>
              </div>
              <Box title="Sotuvchilar" wide>
                <div className="overflow-x-auto">
                  <table className={RT}>
                    <thead>
                      <tr>
                        <th>Sotuvchi</th>
                        <th>Lidlar</th>
                        <th>Javob</th>
                        <th>Lid → bitim</th>
                        <th>Bitimlar</th>
                        <th>Sotuv</th>
                        <th>Yo&apos;qotildi</th>
                        <th>Ochiq voronka</th>
                        <th>Muddati o&apos;tgan vazifa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.sellers.map((s) => (
                        <tr key={s.tg_id}>
                          <td className={TTL}>
                            <b>{s.name}</b>
                          </td>
                          <td data-l="Lidlar" className="tabular-nums">
                            {s.leads}
                          </td>
                          <td data-l="Javob" className={`tabular-nums ${s.response_min !== null && s.response_min > 30 ? "font-semibold text-danger" : ""}`}>
                            {minutes(s.response_min)}
                          </td>
                          <td data-l="Lid → bitim" className="tabular-nums">
                            {pct(s.lead_conv)}
                          </td>
                          <td data-l="Bitimlar" className="tabular-nums">
                            {s.deals}
                          </td>
                          <td data-l="Sotuv" className="tabular-nums">
                            {s.won ? `${s.won} ta · ${short(s.won_sum)}` : "—"}
                          </td>
                          <td data-l="Yo'qotildi" className="tabular-nums">
                            {s.lost || "—"}
                          </td>
                          <td data-l="Ochiq voronka" className="tabular-nums">
                            {Number(s.open_sum) ? short(s.open_sum) : "—"}
                          </td>
                          <td data-l="Muddati o'tgan vazifa" className={`tabular-nums ${s.overdue_tasks ? "font-semibold text-danger" : ""}`}>
                            {s.overdue_tasks || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={`${SMALL} mt-2`}>Javob — lid kelganidan birinchi javobgacha (mediana); 30 daqiqadan ko&apos;pi qizil.</div>
              </Box>
              <Box title="Lid manbalari">
                {r.sources.length ? (
                  <table className={RT}>
                    <thead>
                      <tr>
                        <th>Manba</th>
                        <th>Lidlar</th>
                        <th>Bitimga</th>
                        <th>Konversiya</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.sources.map((x) => (
                        <tr key={x.source}>
                          <td className={TTL}>{LSRC[x.source] ?? x.source}</td>
                          <td data-l="Lidlar" className="tabular-nums">
                            {x.leads}
                          </td>
                          <td data-l="Bitimga" className="tabular-nums">
                            {x.converted}
                          </td>
                          <td data-l="Konversiya" className="tabular-nums">
                            {x.leads ? `${Math.round((x.converted / x.leads) * 100)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className={SUM}>Bu davrda lid kelmagan.</div>
                )}
              </Box>
            </div>
          );
        }}
      </Loaded>
    </div>
  );
}

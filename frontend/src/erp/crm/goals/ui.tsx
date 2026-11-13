// Oylik reja (faqat ko'rinish): oy tanlash, sur'at, sotuvchilar jadvali (reja — ROP kiritadi, fakt, bajarilish, qoldiq), jami.
import { num, short } from "@/erp/kit/fmt";
import { Empty } from "@/erp/kit/ui";
import { AvaView } from "@/erp/crm/badges";
import { goalTotals, paceCls, type Goals } from "@/erp/crm/lib";

const Bar = ({ pct, pace }: { pct: number; pace: number }) => (
  <div className="bar3" role="img" aria-label={`${Math.round(pct)}%`}>
    <i className={paceCls(pct, pace)} style={{ width: `${Math.min(100, pct || 0)}%` }} />
  </div>
);

export function GoalsView({ g, gm, onGm, onSave }: { g: Goals; gm: string; onGm: (m: string) => void; onSave: (tg: number, v: string) => void }) {
  const pace = g.days ? g.passed / g.days : 0;
  const tot = goalTotals(g.rows);
  return (
    <>
      <div className="tb in">
        <input type="month" className="inp" aria-label="Oy" value={gm} onChange={(e) => e.target.value && onGm(e.target.value)} />
        <span className="sum">
          {g.passed} / {g.days} kun o&apos;tdi · kutilgan sur&apos;at {Math.round(pace * 100)}%
        </span>
        <span className="sp" />
        {g.can_edit ? <span className="sum">Rejani ROP belgilaydi — summani yozib Enter bosing</span> : null}
      </div>
      {g.rows.length ? (
        <table className="t rt">
          <thead>
            <tr>
              <th>Sotuvchi</th>
              <th className="n">Reja, so&apos;m</th>
              <th className="n">Sotuv (fakt)</th>
              <th>Bajarilishi</th>
              <th className="n">%</th>
              <th className="n">Yopilgan bitimlar</th>
              <th className="n">Qoldi</th>
            </tr>
          </thead>
          <tbody>
            {g.rows.map((r) => {
              const plan = Number(r.plan || 0);
              const sales = Number(r.sales || 0);
              const pv = plan ? num(plan, 0) : "";
              return (
                <tr key={r.tg_id}>
                  <td className="ttl">
                    <span className="who">
                      <AvaView name={r.name} /> {r.name}
                    </span>
                  </td>
                  <td className="n" data-l="Reja, so'm">
                    {g.can_edit ? (
                      <input
                        key={pv}
                        className="inp num-in"
                        defaultValue={pv}
                        placeholder="0"
                        inputMode="numeric"
                        aria-label={`${r.name} rejasi`}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        onBlur={(e) => e.target.value !== pv && onSave(r.tg_id, e.target.value)}
                      />
                    ) : plan ? (
                      num(plan, 0)
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="n num" data-l="Sotuv (fakt)">
                    <b>{num(sales, 0)}</b>
                  </td>
                  <td data-l="Bajarilishi">{plan ? <Bar pct={r.pct ?? 0} pace={pace} /> : ""}</td>
                  <td className="n num" data-l="%">
                    {r.pct != null ? r.pct + "%" : "—"}
                  </td>
                  <td className="n num" data-l="Yopilgan bitimlar">
                    {r.won_deals}
                    {Number(r.won_amount) ? <div className="sum">{short(r.won_amount)}</div> : null}
                  </td>
                  <td className="n num" data-l="Qoldi">
                    {plan > sales ? num(plan - sales, 0) : plan ? "✓" : ""}
                  </td>
                </tr>
              );
            })}
            <tr className="totr">
              <td className="ttl">
                <b>Jami</b>
              </td>
              <td className="n num" data-l="Reja">
                <b>{num(tot.plan, 0)}</b>
              </td>
              <td className="n num" data-l="Sotuv">
                <b>{num(tot.sales, 0)}</b>
              </td>
              <td data-l="Bajarilishi">{tot.plan ? <Bar pct={(tot.sales / tot.plan) * 100} pace={pace} /> : ""}</td>
              <td className="n num" data-l="%">
                {tot.plan ? Math.round((tot.sales / tot.plan) * 1000) / 10 + "%" : ""}
              </td>
              <td className="n num" data-l="Yopilgan bitimlar">
                {tot.won}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      ) : (
        <Empty icon="chart" title="Sotuvchilar yo'q">
          Bu oy uchun reja qatorlari topilmadi.
        </Empty>
      )}
      <p className="sum note">
        Sotuv (fakt) — ERP&apos;dagi jo&apos;natishlar summasi (QQS bilan). Yopilgan bitimlar — oy davomida to&apos;lov/jo&apos;natish bosqichiga o&apos;tgan bitimlar.
      </p>
    </>
  );
}

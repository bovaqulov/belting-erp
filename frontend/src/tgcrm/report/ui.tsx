import type { Account, CrmReport } from "@/tgcrm/api";
import { Empty, Notice, Skel, Top } from "@/tgcrm/kit";
import { displayName, fmtMinutes, stageOf } from "@/tgcrm/lib";

const mins = (v: number | null) => (v === null ? "—" : v < 1 ? "<1 daq" : fmtMinutes(Math.round(v)));
const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

function Tile({ label, value, bad, ok }: { label: string; value: string | number; bad?: boolean; ok?: boolean }) {
  return (
    <div className={`tile ${bad ? "bad" : ok ? "ok" : ""}`}>
      <div className="l">{label}</div>
      <div className="v">{value}</div>
    </div>
  );
}

export function ReportView(p: {
  account: Account;
  days: number;
  data: CrmReport | null;
  err: string;
  onDays: (d: number) => void;
  onBack: () => void;
  onOpenChat: (peer: number) => void;
  onSla: (m: number) => void;
}) {
  const d = p.data;
  const maxFunnel = Math.max(1, ...(d?.funnel.map((f) => f.count) ?? [1]));
  return (
    <>
      <Top
        title="Hisobot"
        sub={displayName(p.account)}
        onBack={p.onBack}
        right={
          <div className="grp" role="radiogroup" aria-label="Davr">
            {[7, 30].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={p.days === n} className={`b ${p.days === n ? "on" : ""}`} onClick={() => p.onDays(n)}>
                {n} kun
              </button>
            ))}
          </div>
        }
      />
      {p.err ? (
        <Notice kind="bad" icon="circle-alert">
          {p.err}
        </Notice>
      ) : null}
      {!d ? (
        <Skel rows={6} />
      ) : (
        <>
          <h2 className="sh m-0">
            <span>Javob tezligi</span>
            <span className="r">SLA: {d.sla_minutes} daq</span>
          </h2>
          <div className="tiles">
            <Tile label="Mijoz xabarlari" value={d.incoming} />
            <Tile label="Javoblar" value={d.replies} />
            <Tile label="Javob vaqti (mediana)" value={mins(d.median_min)} />
            <Tile label="SLA ichida" value={pct(d.sla_pct)} ok={(d.sla_pct ?? 0) >= 90} bad={d.sla_pct !== null && d.sla_pct < 70} />
            <Tile label="Hozir javobsiz" value={d.waiting_now} bad={d.waiting_now > 0} />
            <Tile label="Muddati o'tgan vazifa" value={d.tasks_overdue} bad={d.tasks_overdue > 0} />
          </div>
          {d.can_edit_sla ? (
            <form
              className="mx-4 mt-2 flex items-center gap-2 text-[14px]"
              onSubmit={(e) => {
                e.preventDefault();
                const v = Number(new FormData(e.currentTarget).get("sla"));
                if (v >= 1) p.onSla(v);
              }}
            >
              <label className="flex items-center gap-2">
                Javob muddati (daqiqa):
                <input name="sla" type="number" min={1} max={1440} defaultValue={d.sla_minutes} key={d.sla_minutes} className="inp w-20" />
              </label>
              <button type="submit" className="b">
                Saqlash
              </button>
            </form>
          ) : null}

          <h2 className="sh m-0">
            <span>Xodimlar</span>
          </h2>
          {d.staff.length ? (
            <div className="mx-4 overflow-x-auto rounded-xl bg-sec">
              <table className="w-full min-w-[520px] border-collapse text-[14px]">
                <thead>
                  <tr className="text-left text-[12.5px] text-hint">
                    <th className="px-3 py-2 font-medium">Xodim</th>
                    <th className="px-2 py-2 text-right font-medium">Chatlar</th>
                    <th className="px-2 py-2 text-right font-medium">Javoblar</th>
                    <th className="px-2 py-2 text-right font-medium">Mediana</th>
                    <th className="px-2 py-2 text-right font-medium">SLA</th>
                    <th className="px-3 py-2 text-right font-medium">Javobsiz</th>
                  </tr>
                </thead>
                <tbody>
                  {d.staff.map((s) => (
                    <tr key={s.tg_id ?? 0} className="border-t border-sep">
                      <td className="px-3 py-2">{s.name || "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{s.assigned}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{s.replies}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{mins(s.median_min)}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${s.sla_pct !== null && s.sla_pct < 70 ? "text-danger" : ""}`}>{pct(s.sla_pct)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${s.waiting ? "font-semibold text-danger" : ""}`}>{s.waiting}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="sf m-0">Bu davrda javob yo&apos;q.</p>
          )}
          <p className="sf m-0">
            Javob vaqti — mijozning birinchi xabaridan keyingi javobgacha. Telefondan yozilgani — chat mas&apos;uliga yoziladi (mas&apos;ul bo&apos;lmasa —
            «Telegram ilovasidan»).
          </p>

          <h2 className="sh m-0">
            <span>Javob kutayotganlar</span>
          </h2>
          {d.waiting.length ? (
            <div className="list plain">
              {d.waiting.map((w) => (
                <button
                  key={w.peer_id}
                  type="button"
                  className="item tap w-full border-0 bg-transparent text-left text-fg"
                  style={{ font: "inherit" }}
                  onClick={() => p.onOpenChat(w.peer_id)}
                >
                  <span className="main">
                    <span className="t block">{w.title || `#${w.peer_id}`}</span>
                    <span className="s block">{w.assignee ? `Mas'ul: ${w.assignee}` : "Biriktirilmagan"}</span>
                  </span>
                  <span className={`val ${w.minutes > d.sla_minutes ? "!text-danger strong" : ""}`}>{fmtMinutes(w.minutes)}</span>
                </button>
              ))}
            </div>
          ) : (
            <Empty icon="check" title="Hamma mijozga javob berilgan" />
          )}

          <h2 className="sh m-0">
            <span>Voronka</span>
          </h2>
          <div className="list plain">
            {d.funnel.map((f) => {
              const s = stageOf(f.stage);
              return (
                <div key={f.stage} className="item">
                  <span className={`st ${s.tone} w-[150px] flex-none`}>{f.label}</span>
                  <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-fill" aria-hidden>
                    <span className="block h-full rounded-full bg-link/60" style={{ width: `${(f.count / maxFunnel) * 100}%` }} />
                  </span>
                  <span className="val strong w-10">{f.count}</span>
                </div>
              );
            })}
          </div>
          <p className="sf m-0 pb-6">Voronka — shu akkaunt bilan yozishgan mijozlar kartalari bo&apos;yicha.</p>
        </>
      )}
    </>
  );
}

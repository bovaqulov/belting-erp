// Kunlik hisobot (faqat ko'rinish): Lenta/xarita havolalari, yuklanmoqda / xato / saqlandi holatlari, forma maydonlari
// (matn, son, pul — so'mda ko'rinishi bilan), xato va "Yuborish".
import type { FormEvent } from "react";

import { isoToDmy, money, normNumber } from "./format.lib";
import type { ReportData } from "./report.lib";
import s from "./styles";

export type State =
  | { kind: "loading" }
  | { kind: "error"; msg: string }
  | { kind: "form"; data: ReportData; dept: string }
  | { kind: "done" };

export function ReportView({
  state,
  vals,
  links,
  busy,
  err,
  onEdit,
  onSubmit,
  onRetry,
}: {
  state: State;
  vals: Record<string, string>;
  links: { lenta: boolean; geo: boolean };
  busy: boolean;
  err: string;
  onEdit: (key: string, v: string) => void;
  onSubmit: (e: FormEvent, data: ReportData, dept: string) => void;
  onRetry: () => void;
}) {
  return (
    <main className={s.main}>
      {(links.lenta || links.geo) && (
        <nav className={s.nav}>
          {links.lenta && <a href="/app/lenta">Lenta chizma</a>}
          {links.geo && <a href="/app/geo">Mijozlar xaritasi</a>}
        </nav>
      )}
      {state.kind === "loading" && <div className={s.msg}>Yuklanmoqda…</div>}
      {state.kind === "error" && (
        <div className={`${s.msg} ${s.err}`} role="alert">
          {state.msg || "Forma yuklanmadi."}
          <button type="button" className={s.retry} onClick={onRetry}>
            Qayta urinish
          </button>
        </div>
      )}
      {state.kind === "done" && (
        <div className={s.msg} role="status">
          ✅ Hisobot saqlandi. Rahmat!
        </div>
      )}
      {state.kind === "form" && (
        <>
          <h1 className={s.h1}>
            {state.data.template.title} — {isoToDmy(state.data.date)}
          </h1>
          <div className={s.hint}>{state.data.user}</div>
          <form onSubmit={(e) => onSubmit(e, state.data, state.dept)}>
            {state.data.template.fields.map((f) => (
              <div key={f.key}>
                <label className={s.label} htmlFor={f.key}>
                  {f.label}
                </label>
                {f.type === "text" ? (
                  <textarea
                    id={f.key}
                    className={s.input}
                    value={vals[f.key] ?? ""}
                    onChange={(e) => onEdit(f.key, e.target.value)}
                  />
                ) : (
                  <>
                    <input
                      id={f.key}
                      className={s.input}
                      inputMode={f.type === "money" ? "numeric" : "decimal"}
                      placeholder="0"
                      autoComplete="off"
                      enterKeyHint="next"
                      value={vals[f.key] ?? ""}
                      onChange={(e) => onEdit(f.key, e.target.value)}
                    />
                    {f.type === "money" && <div className={s.money}>{money(normNumber(vals[f.key] ?? ""))}</div>}
                  </>
                )}
              </div>
            ))}
            {err && (
              <div className={s.ferr} role="alert">
                {err}
              </div>
            )}
            <button type="submit" className={s.button} disabled={busy}>
              {busy ? "Yuborilmoqda…" : "Yuborish"}
            </button>
          </form>
        </>
      )}
    </main>
  );
}

// Oylik hisob: oy tanlash (‹ Noyabr 2026 ›), jami (hisoblangan, avans, to'lanadi, to'landi), qatorlar. Oqim:
// hisoblanmagan → "Oyni hisoblash" → qoralama (qatorni bosib bonus/ushlanma/avans) → "Tasdiqlash" (qulf) → to'lov.
import { useState } from "react";

import { confirm, toast } from "@/erp/kit/env";
import { dt, num } from "@/erp/kit/fmt";
import { Tbl } from "@/erp/kit/table";
import { Empty, Icon, List, Loaded, Row, Sf, Sh, Sheet, useLoad } from "@/erp/kit/ui";
import { api, post } from "@/erp/finance/api";
import { useAcc } from "@/erp/finance/context";
import { addMonth, monthLabel, monthOf, MSTATE, MSTATE_ST, rowDue, rowTotal, totals, type Month as M, type PayRow } from "@/erp/finance/lib";

const sum = (v: number) => num(v, 0);

export function Month() {
  const { admin, wide } = useAcc();
  const [month, setMonth] = useState(() => monthOf(new Date().toISOString()));
  const [edit, setEdit] = useState<PayRow | null>(null);
  const st = useLoad(() => api<M>(`/app/api/erp/payroll/${month}`), [month]);
  if (!admin) return <Empty icon="alert" title="Ruxsat yo'q">Maoshlarni faqat rahbariyat ko&apos;radi.</Empty>;
  const P = `/app/api/erp/payroll/${month}`;
  const run = (fn: () => Promise<void>) => async () => {
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  const calc = run(async () => {
    await post(`${P}/calc`);
    toast("Hisoblandi");
    void st.reload();
  });
  const approve = run(async () => {
    if (!(await confirm(`${monthLabel(month)} tasdiqlansinmi? Tasdiqdan keyin qatorlar tahrirlanmaydi.`))) return;
    await post(`${P}/approve`);
    toast("Tasdiqlandi");
    void st.reload();
  });
  const unapprove = run(async () => {
    await post(`${P}/unapprove`);
    toast("Qoralamaga qaytarildi");
    void st.reload();
  });
  const pay = (ids?: number[]) =>
    run(async () => {
      if (!ids && !(await confirm(`${monthLabel(month)}: qolgan hamma xodimga maosh to'landi deb belgilansinmi?`))) return;
      await post(`${P}/pay`, ids ? { ids } : {});
      toast("To'landi deb belgilandi");
      void st.reload();
    });

  return (
    <>
      <div className="mx-4 mt-3 flex flex-wrap items-center gap-2.5 [&_b]:min-w-[132px] [&_b]:text-center [&_b]:text-lg [&_b]:tabular-nums">
        <button type="button" className="b ic" aria-label="Oldingi oy" onClick={() => setMonth((m) => addMonth(m, -1))}>
          <Icon n="back" />
        </button>
        <b>{monthLabel(month)}</b>
        <button type="button" className="b ic [&_svg.i]:-scale-x-100" aria-label="Keyingi oy" onClick={() => setMonth((m) => addMonth(m, 1))}>
          <Icon n="back" />
        </button>
        {st.data ? <span className={`st ${MSTATE_ST[st.data.state]}`}>{MSTATE[st.data.state]}</span> : null}
      </div>
      <Loaded st={st}>
        {(m) => {
          if (m.state === "none")
            return (
              <Empty icon="calendar" title={`${monthLabel(month)} hali hisoblanmagan`}>
                Faol xodimlarning okladi bo&apos;yicha qatorlar tuziladi; keyin bonus, ushlanma va avansni kiritasiz.
                <div className="btns">
                  <button className="btn" onClick={calc}>
                    Oyni hisoblash
                  </button>
                </div>
              </Empty>
            );
          const t = totals(m.rows);
          const draft = m.state === "draft";
          return (
            <>
              <div className="tiles mt-3 [&>.tile:first-child:nth-last-child(3)]:col-span-full [.mod-wide_&]:grid-cols-4 [.mod-wide_&]:has-[>.tile:nth-child(3):last-child]:grid-cols-3 [.mod-wide_&>.tile:first-child:nth-last-child(3)]:col-auto">
                <div className="tile">
                  <div className="l">Hisoblangan</div>
                  <div className="v num">{sum(t.total)}</div>
                  <div className="l">{t.n} xodim</div>
                </div>
                <div className="tile">
                  <div className="l">Avans berilgan</div>
                  <div className="v num">{sum(t.advance)}</div>
                </div>
                <div className="tile">
                  <div className="l">To&apos;lanadi</div>
                  <div className="v num">{sum(t.due)}</div>
                </div>
                {draft ? null : (
                <div className={`tile ${t.left ? "" : "ok"}`}>
                  <div className="l">{t.left ? "To'lanmagan" : "Hammasi to'langan"}</div>
                  <div className="v num">{sum(t.left || t.paid)}</div>
                  <div className="l">
                    {t.n_paid}/{t.n} to&apos;landi
                  </div>
                </div>
                )}
              </div>
              <div className="btns flex-wrap [.mod-wide_&]:!max-w-[640px]">
                {draft ? (
                  <>
                    <button className="btn" onClick={approve}>
                      <Icon n="check" /> Tasdiqlash
                    </button>
                    <button className="btn sec" onClick={calc}>
                      <Icon n="refresh" /> Qayta hisoblash
                    </button>
                  </>
                ) : m.state === "approved" ? (
                  <>
                    <button className="btn" onClick={pay()}>
                      <Icon n="wallet" /> Qolganini to&apos;landi deb belgilash
                    </button>
                    {t.n_paid ? null : (
                      <button className="btn sec" onClick={unapprove}>
                        Tasdiqni bekor qilish
                      </button>
                    )}
                  </>
                ) : null}
              </div>
              <Sf>
                {draft
                  ? "Qatorni bosib bonus, ushlanma va avansni kiriting. «Qayta hisoblash» — oklad o'zgargan va yangi xodimlarni qo'shadi, kiritilganlar saqlanadi."
                  : m.approved_at
                    ? `Tasdiqlangan: ${dt(m.approved_at)}. Qatorlar endi o'zgarmaydi.`
                    : ""}
              </Sf>
              <Sh t={`Xodimlar · ${m.rows.length}`} r="so'm" />
              {wide ? (
                <Tbl
                  label="Oylik hisob"
                  rows={m.rows}
                  rowKey={(r) => String(r.employee_id)}
                  onRow={draft ? setEdit : undefined}
                  cols={[
                    {
                      h: "Xodim",
                      f: (r) => (
                        <>
                          {r.name}
                          <div className="t2">
                            {r.position} · {r.dept}
                          </div>
                          {r.note ? <div className="t2">{r.note}</div> : null}
                        </>
                      ),
                    },
                    { h: "Oklad", f: (r) => sum(r.base), n: true },
                    { h: "Bonus", f: (r) => (r.bonus ? <span className="text-ok">+{sum(r.bonus)}</span> : "—"), n: true },
                    { h: "Ushlanma", f: (r) => (r.penalty ? <span className="text-danger">−{sum(r.penalty)}</span> : "—"), n: true },
                    { h: "Hisoblangan", f: (r) => sum(rowTotal(r)), n: true },
                    { h: "Avans", f: (r) => (r.advance ? sum(r.advance) : "—"), n: true },
                    { h: "To'lanadi", f: (r) => <b>{sum(rowDue(r))}</b>, n: true },
                    {
                      h: "",
                      f: (r) =>
                        r.paid_at ? (
                          <span className="text-ok">✓ to&apos;landi</span>
                        ) : m.state === "approved" ? (
                          <button
                            type="button"
                            className="b"
                            onClick={(e) => {
                              e.stopPropagation();
                              void pay([r.employee_id])();
                            }}
                          >
                            To&apos;landi
                          </button>
                        ) : null,
                      n: true,
                    },
                  ]}
                />
              ) : (
                <List>
                  {m.rows.map((r) => (
                    <Row
                      key={r.employee_id}
                      icon={r.paid_at ? "check" : "user"}
                      color={r.paid_at ? "green" : "orange"}
                      t={r.name}
                      s={[r.position, r.bonus ? `+${sum(r.bonus)}` : "", r.penalty ? `−${sum(r.penalty)}` : "", r.advance ? `avans ${sum(r.advance)}` : ""].filter(Boolean).join(" · ")}
                      val={<span className="num">{sum(rowDue(r))}</span>}
                      valSmall={r.paid_at ? "to'landi" : m.state === "approved" ? "to'lanmagan" : ""}
                      chev={draft || (m.state === "approved" && !r.paid_at)}
                      onClick={draft ? () => setEdit(r) : m.state === "approved" && !r.paid_at ? () => void pay([r.employee_id])() : undefined}
                    />
                  ))}
                </List>
              )}
              {!wide && m.state === "approved" ? <Sf>Qatorni bosing — shu xodimga to&apos;landi deb belgilanadi.</Sf> : null}
            </>
          );
        }}
      </Loaded>
      {edit ? (
        <RowForm
          month={month}
          r={edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            void st.reload();
          }}
        />
      ) : null}
    </>
  );
}

function RowForm({ month, r, onClose, onSaved }: { month: string; r: PayRow; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ bonus: r.bonus ? String(r.bonus) : "", penalty: r.penalty ? String(r.penalty) : "", advance: r.advance ? String(r.advance) : "", note: r.note ?? "" });
  const n = (v: string) => Number(v.replace(/\s/g, "").replace(",", ".")) || 0;
  const preview = { base: r.base, bonus: n(f.bonus), penalty: n(f.penalty), advance: n(f.advance) };
  const field = (k: "bonus" | "penalty" | "advance", label: string) => (
    <div className="field">
      <label htmlFor={`acc-p${k}`}>{label}</label>
      <input id={`acc-p${k}`} inputMode="decimal" value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} placeholder="0" />
    </div>
  );
  return (
    <Sheet
      title={r.name}
      done="Saqlash"
      onClose={onClose}
      onDone={async () => {
        await post(`/app/api/erp/payroll/${month}/rows/${r.employee_id}`, f);
        toast("Saqlandi");
        onSaved();
        return false;
      }}
    >
      <List>
        <Row t="Oklad" val={<span className="num">{sum(r.base)}</span>} valSmall={`${r.position} · ${r.dept}`} />
        {field("bonus", "Bonus")}
        {field("penalty", "Ushlanma")}
        {field("advance", "Avans (berilgan)")}
        <div className="field col">
          <label htmlFor="acc-pnote">Izoh</label>
          <input id="acc-pnote" value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} placeholder="masalan: reja bajarildi" />
        </div>
      </List>
      <List style={{ marginTop: 14 }}>
        <Row t="Hisoblangan" val={<span className="num">{sum(rowTotal(preview))}</span>} />
        <Row t="To'lanadi" strong val={<span className={`num ${rowDue(preview) < 0 ? "text-danger" : ""}`}>{sum(rowDue(preview))}</span>} />
      </List>
      <Sf>Hisoblangan = oklad + bonus − ushlanma; to&apos;lanadi = hisoblangan − avans.</Sf>
    </Sheet>
  );
}

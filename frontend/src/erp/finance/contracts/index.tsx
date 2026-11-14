// Shartnomalar: qidiruv (raqam, kontragent, INN), tur va holat filtri ("E'tibor" — imzosiz, muddati tugayotgan va o'tgan),
// ro'yxat / jadval; shartnoma → oyna (tafsilot, tahrirlash, yopish / qayta ochish), "Yangi shartnoma" → forma.
import { useEffect, useState } from "react";

import { confirm, toast } from "@/erp/kit/env";
import { d8, num } from "@/erp/kit/fmt";
import { Tbl } from "@/erp/kit/table";
import { Empty, Icon, List, Loaded, Row, Sf, Sheet, useLoad } from "@/erp/kit/ui";
import { CNT, FILT } from "@/erp/finance/tw";
import { api, post } from "@/erp/finance/api";
import { useAcc } from "@/erp/finance/context";
import { CKIND, CSTATE, CSTATE_ST, leftLabel, type CKind, type CState, type Contract } from "@/erp/finance/lib";

import { ContractForm } from "./form";

type StateF = "" | "attention" | CState;
const STATES: [StateF, string][] = [
  ["", "Hammasi"],
  ["attention", "E'tibor"],
  ["active", "Amalda"],
  ["draft", "Imzolanmagan"],
  ["closed", "Yopilgan"],
];
const KCOLOR: Record<CKind, string> = { sale: "blue", purchase: "purple", service: "teal" };

const money = (c: Pick<Contract, "amount" | "currency">) => (c.amount === null ? "—" : `${num(c.amount, 0)} ${c.currency === "UZS" ? "so'm" : c.currency}`);
const St = ({ c }: { c: Contract }) => <span className={`st ${CSTATE_ST[c.state]}`}>{CSTATE[c.state]}</span>;

export function Contracts() {
  const { wide } = useAcc();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [kind, setKind] = useState<"" | CKind>("");
  const [state, setState] = useState<StateF>("");
  const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Contract> | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const st = useLoad(() => {
    const p = new URLSearchParams({ q: dq });
    if (kind) p.set("kind", kind);
    if (state) p.set("state", state);
    return api<Contract[]>(`/app/api/erp/contracts?${p}`);
  }, [dq, kind, state]);
  return (
    <>
      <div className={FILT}>
        <label className="search">
          <Icon n="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Raqam, kontragent yoki INN" aria-label="Qidiruv" enterKeyHint="search" />
        </label>
        <select className="sel" value={kind} onChange={(e) => setKind(e.target.value as CKind | "")} aria-label="Turi">
          <option value="">Hamma turi</option>
          {(Object.keys(CKIND) as CKind[]).map((k) => (
            <option key={k} value={k}>
              {CKIND[k]}
            </option>
          ))}
        </select>
        <button type="button" className="b pri" onClick={() => setForm({})}>
          <Icon n="plus" /> Yangi shartnoma
        </button>
      </div>
      <div className="chips" role="group" aria-label="Holat">
        {STATES.map(([k, t]) => (
          <button key={k} type="button" className={`chip ${state === k ? "on" : ""}`} aria-pressed={state === k} onClick={() => setState(k)}>
            {t}
          </button>
        ))}
      </div>
      <Loaded st={st}>
        {(rs) =>
          !rs.length ? (
            <Empty icon="file" title={dq || kind || state ? "Topilmadi" : "Shartnoma yo'q"}>
              {state === "attention" ? "Hamma shartnoma imzolangan va muddati yetarli." : "«Yangi shartnoma» bilan qo'shing."}
            </Empty>
          ) : (
            <>
              <div className={CNT}>{rs.length} shartnoma</div>
              {wide ? (
                <Tbl
                  label="Shartnomalar"
                  rows={rs}
                  rowKey={(c) => String(c.id)}
                  onRow={(c) => setOpen(c.id)}
                  cols={[
                    {
                      h: "Raqam",
                      f: (c) => (
                        <>
                          <span className="code">{c.number}</span>
                          <div className="t2">{d8(c.date)}</div>
                        </>
                      ),
                    },
                    {
                      h: "Kontragent",
                      f: (c) => (
                        <>
                          {c.counterparty}
                          <div className="t2">{[c.inn && `INN ${c.inn}`, c.firm].filter(Boolean).join(" · ")}</div>
                        </>
                      ),
                    },
                    { h: "Turi", f: (c) => CKIND[c.kind] },
                    { h: "Summa", f: money, n: true },
                    { h: "To'lov", f: (c) => (c.pay_days === null ? "—" : c.pay_days ? `${c.pay_days} kun` : "oldindan"), n: true },
                    {
                      h: "Amal qiladi",
                      f: (c) => (
                        <>
                          {c.valid_until ? d8(c.valid_until) : "—"}
                          {c.active && c.days_left !== null ? <div className={`t2 ${c.days_left < 0 ? "text-danger" : c.days_left <= 30 ? "text-warn" : ""}`}>{leftLabel(c.days_left)}</div> : null}
                        </>
                      ),
                      n: true,
                    },
                    { h: "Holat", f: (c) => <St c={c} /> },
                  ]}
                />
              ) : (
                <List>
                  {rs.map((c) => (
                    <Row
                      key={c.id}
                      icon="file"
                      color={c.active ? KCOLOR[c.kind] : "gray"}
                      t={c.counterparty}
                      tcls="wrap2"
                      s={
                        <>
                          <span className="code mut">{c.number}</span> · {CKIND[c.kind]}
                          <br />
                          <St c={c} />
                        </>
                      }
                      scls="ml"
                      val={c.amount === null ? "" : num(c.amount, 0)}
                      valSmall={c.amount === null ? "" : c.currency === "UZS" ? "so'm" : c.currency}
                      chev
                      onClick={() => setOpen(c.id)}
                    />
                  ))}
                </List>
              )}
            </>
          )
        }
      </Loaded>
      {open !== null ? <ContractView key={open} id={open} onClose={() => setOpen(null)} onEdit={(c) => setForm(c)} onChanged={() => void st.reload()} /> : null}
      {form ? (
        <ContractForm
          c={form}
          onClose={() => setForm(null)}
          onSaved={(c) => {
            setForm(null);
            void st.reload();
            setOpen(c.id);
          }}
        />
      ) : null}
    </>
  );
}

function ContractView({ id, onClose, onEdit, onChanged }: { id: number; onClose: () => void; onEdit: (c: Contract) => void; onChanged: () => void }) {
  const st = useLoad(() => api<Contract>(`/app/api/erp/contracts/${id}`), [id]);
  const act = (path: "close" | "reopen", msg: string) => async () => {
    if (path === "close" && !(await confirm("Shartnoma yopilsinmi? Yangi hujjatlar unga bog'lanmaydi."))) return;
    try {
      await post(`/app/api/erp/contracts/${id}/${path}`);
      toast(msg);
      onChanged();
      void st.reload();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  return (
    <Sheet title={st.data?.number ?? "Shartnoma"} onClose={onClose}>
      <Loaded st={st}>
        {(c) => (
          <>
            <List>
              <Row icon="briefcase" color={KCOLOR[c.kind]} t={c.counterparty} tcls="wrap2" s={[c.inn && `INN ${c.inn}`, `${CKIND[c.kind]} shartnomasi`].filter(Boolean).join(" · ")} />
              <Row t="Holat" val={<St c={c} />} />
              <Row t="Raqami" val={<span className="code">{c.number}</span>} />
              <Row t="Firma" val={c.firm} />
              <Row t="Sanasi" val={d8(c.date)} />
              <Row t="Amal qiladi" val={c.valid_until ? d8(c.valid_until) : "muddatsiz"} valSmall={c.active && c.valid_until ? leftLabel(c.days_left) : ""} />
            </List>
            <List style={{ marginTop: 14 }}>
              <Row t="Summa" val={<span className="num">{money(c)}</span>} />
              <Row t="To'lov muddati" val={c.pay_days === null ? "—" : c.pay_days ? `${c.pay_days} kun` : "100% oldindan"} />
              <Row t="Kredit limiti" val={c.credit_limit === null ? "cheksiz" : <span className="num">{money({ amount: c.credit_limit, currency: c.currency })}</span>} />
              <Row t="Imzo (Didox)" val={c.signed ? "imzolangan" : "imzolanmagan"} />
            </List>
            {c.note ? <Sf>{c.note}</Sf> : null}
            <div className="btns">
              {c.active ? (
                <>
                  <button className="btn sec" onClick={() => onEdit(c)}>
                    <Icon n="pencil" /> Tahrirlash
                  </button>
                  <button className="btn danger" onClick={act("close", "Shartnoma yopildi")}>
                    Yopish
                  </button>
                </>
              ) : (
                <button className="btn sec" onClick={act("reopen", "Qayta ochildi")}>
                  <Icon n="refresh" /> Qayta ochish
                </button>
              )}
            </div>
          </>
        )}
      </Loaded>
    </Sheet>
  );
}

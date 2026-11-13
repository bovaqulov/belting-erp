// Shartnoma formasi: firma, turi, kontragent (tanlagich), raqam (bo'sh — avtomatik BR-2026/012), sana, amal qilish muddati,
// valyuta, summa, to'lov muddati (kun), kredit limiti, Didox imzosi, izoh.
import { useState, type ReactNode } from "react";

import { toast } from "@/erp/kit/env";
import { List, Row, Sf, Sh, Sheet, useLoad } from "@/erp/kit/ui";
import { api, post } from "@/erp/finance/api";
import { CKIND, CURRENCIES, type CKind, type Contract, type Counterparty, type Firm } from "@/erp/finance/lib";

import { CpPicker } from "./cp";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const today = () => new Date().toISOString().slice(0, 10);
const plusYear = (d: string) => `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;

function F({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="field col">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

export function ContractForm({ c, onClose, onSaved }: { c: Partial<Contract>; onClose: () => void; onSaved: (c: Contract) => void }) {
  const firms = useLoad(() => api<Firm[]>("/app/api/erp/firms"), []);
  const [cp, setCp] = useState<Pick<Counterparty, "id" | "name" | "inn"> | null>(c.counterparty_id ? { id: c.counterparty_id, name: s(c.counterparty), inn: c.inn ?? null } : null);
  const [pick, setPick] = useState(false);
  const d0 = c.date ?? today();
  const [f, setF] = useState({
    firm_id: s(c.firm_id ?? 1),
    kind: (c.kind ?? "sale") as CKind,
    number: s(c.number),
    date: d0,
    valid_until: c.id ? s(c.valid_until) : plusYear(d0),
    currency: c.currency ?? "UZS",
    amount: s(c.amount),
    pay_days: c.id ? s(c.pay_days) : "30",
    credit_limit: s(c.credit_limit),
    signed: c.signed ?? false,
    note: s(c.note),
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <>
      <Sheet
        title={c.id ? "Shartnomani tahrirlash" : "Yangi shartnoma"}
        done="Saqlash"
        onClose={onClose}
        onDone={async () => {
          if (!cp) {
            toast("Kontragentni tanlang", "bad");
            return false;
          }
          const r = await post<Contract>("/app/api/erp/contracts", { id: c.id, ...f, counterparty_id: cp.id });
          toast(`Saqlandi: ${r.number}`);
          onSaved(r);
          return false;
        }}
      >
        <List>
          <Row icon="briefcase" color={cp ? "blue" : "gray"} t={cp ? cp.name : "Kontragentni tanlang"} tcls={cp ? "wrap2" : "link"} s={cp?.inn ? `INN ${cp.inn}` : "mijoz yoki yetkazib beruvchi"} chev onClick={() => setPick(true)} />
        </List>
        <Sh t="Asosiy" />
        <List>
          <div className="field">
            <label htmlFor="acc-cf">Firma</label>
            <select id="acc-cf" value={f.firm_id} onChange={(e) => set("firm_id", e.target.value)}>
              {(firms.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} — {x.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="acc-ck">Turi</label>
            <select id="acc-ck" value={f.kind} onChange={(e) => set("kind", e.target.value as CKind)}>
              {(Object.keys(CKIND) as CKind[]).map((k) => (
                <option key={k} value={k}>
                  {CKIND[k]}
                </option>
              ))}
            </select>
          </div>
        </List>
        <List cls="acc-two" style={{ marginTop: 8 }}>
          <F id="acc-cn" label="Raqami">
            <input id="acc-cn" value={f.number} onChange={(e) => set("number", e.target.value)} placeholder="avtomatik" />
          </F>
          <F id="acc-cd" label="Sanasi">
            <input id="acc-cd" type="date" value={f.date} onChange={(e) => set("date", e.target.value)} />
          </F>
          <F id="acc-cv" label="Amal qiladi (gacha)">
            <input id="acc-cv" type="date" value={f.valid_until} onChange={(e) => set("valid_until", e.target.value)} />
          </F>
          <F id="acc-cc" label="Valyuta">
            <select id="acc-cc" value={f.currency} onChange={(e) => set("currency", e.target.value)}>
              {CURRENCIES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </F>
        </List>
        <Sh t="Pul shartlari" />
        <List cls="acc-two">
          <F id="acc-ca" label={`Summa, ${f.currency}`}>
            <input id="acc-ca" inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="ixtiyoriy" />
          </F>
          <F id="acc-cp" label="To'lov muddati, kun">
            <input id="acc-cp" inputMode="numeric" value={f.pay_days} onChange={(e) => set("pay_days", e.target.value)} placeholder="0 — oldindan" />
          </F>
          <F id="acc-cl" label={`Kredit limiti, ${f.currency}`}>
            <input id="acc-cl" inputMode="decimal" value={f.credit_limit} onChange={(e) => set("credit_limit", e.target.value)} placeholder="cheksiz" />
          </F>
          <div className="field">
            <label htmlFor="acc-cs">Imzolangan</label>
            <input id="acc-cs" type="checkbox" className="switch" checked={f.signed} onChange={(e) => set("signed", e.target.checked)} />
          </div>
        </List>
        <List style={{ marginTop: 8 }}>
          <F id="acc-cno" label="Izoh">
            <textarea id="acc-cno" rows={2} value={f.note} onChange={(e) => set("note", e.target.value)} />
          </F>
        </List>
        <Sf>Imzolanmagan shartnoma «Imzolanmagan» holatida turadi (Didox&apos;da imzolangach belgilang). Muddati 30 kundan kam qolsa — ogohlantiriladi.</Sf>
      </Sheet>
      {pick ? (
        <CpPicker
          onClose={() => setPick(false)}
          onPick={(x) => {
            setCp(x);
            setPick(false);
          }}
        />
      ) : null}
    </>
  );
}

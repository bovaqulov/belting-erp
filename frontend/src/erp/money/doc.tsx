// Pul hujjati (1C «Поступление / Расход / Перемещение денег»): hisob (va o'tkazishda qabul qiluvchi), sana, summa
// (valyuta har xil bo'lsa — qabul qilinadigan summa), operatsiya, pul oqimi moddasi, kontragent (mijoz — CRM,
// yetkazib beruvchi — moliya, xodim — maosh ro'yxati, boshqa — matn), to'lov maqsadi, izoh. Amallar: o'tkazish va
// yopish, saqlash, o'tkazish / qaytarish, bekor. Sotuv to'lovi ko'zgusi — faqat o'qish (sotuv hujjatiga havola).
import { useEffect, useState } from "react";

import { api, confirm, toast } from "@/erp/kit/env";
import { Empty, Icon, List, Loaded, Row, Sf, Sheet, useLoad } from "@/erp/kit/ui";

import { cur, KIND, STATUS, sum, when, type Account, type Doc, type FlowItem, type Kind, type Party, type Refs } from "./lib";

const U = "/app/api/erp/money/docs";
const INP = "h-10 w-full min-w-0 rounded-lg border border-sep bg-page px-2 text-[15px] text-fg outline-none focus:border-link coarse:h-11";
const FLD = "flex min-w-0 flex-col gap-1 text-[13px] text-hint [&_select]:h-10 [&_select]:rounded-lg [&_select]:border [&_select]:border-sep [&_select]:bg-page [&_select]:px-2 [&_select]:text-[15px] [&_select]:text-fg coarse:[&_select]:h-11";
const BTN = "b h-10 coarse:h-11";
const VAL = "text-[15px] text-fg";
const PARTY_T: Record<string, string> = { customer: "Mijoz", supplier: "Yetkazib beruvchi", employee: "Xodim" };

type F = {
  account_id: string;
  account_to_id: string;
  date: string;
  dateSet: boolean;
  amount: string;
  amount_to: string;
  op: string;
  item_id: string;
  party: { kind: string; id: number | null; name: string } | null;
  party_name: string;
  purpose: string;
  comment: string;
};

function PartyPicker({ kind, onPick, onClose }: { kind: string; onPick: (p: Party) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const st = useLoad(() => api<Party[]>(`/app/api/erp/money/parties?kind=${kind}&q=${encodeURIComponent(dq)}`), [kind, dq]);
  return (
    <Sheet title={PARTY_T[kind] ?? "Kontragent"} onClose={onClose}>
      <List>
        <div className="field">
          <input type="search" className="!text-left" value={q} placeholder="Nom yoki STIR" aria-label="Qidirish" onChange={(e) => setQ(e.target.value)} />
        </div>
      </List>
      <Loaded st={st}>
        {(rs) =>
          rs.length ? (
            <List cls="mt-2">
              {rs.map((p) => (
                <Row
                  key={p.id}
                  icon="users"
                  color="blue"
                  t={p.name}
                  s={[p.inn ? `STIR ${p.inn}` : null, p.sub].filter(Boolean).join(" · ") || undefined}
                  chev
                  onClick={() => {
                    onPick(p);
                    onClose();
                  }}
                />
              ))}
            </List>
          ) : (
            <Empty icon="users" title="Topilmadi">
              {kind === "supplier" ? "Yetkazib beruvchi Accounting › Shartnomalar kontragentlarida qo'shiladi." : "Boshqa so'z bilan qidiring."}
            </Empty>
          )
        }
      </Loaded>
    </Sheet>
  );
}

export function DocView({ id, kind, refs, wide, onOpen, onClose }: { id: number | null; kind: Kind | null; refs: Refs; wide: boolean; onOpen: (id: number) => void; onClose: () => void }) {
  const st = useLoad(async () => {
    const [accs, items, doc] = await Promise.all([
      api<Account[]>("/app/api/erp/money/accounts"),
      api<FlowItem[]>("/app/api/erp/money/items"),
      id ? api<Doc>(`${U}/${id}`) : Promise.resolve(null),
    ]);
    return { accs, items, doc };
  }, [id]);
  return (
    <Loaded st={st}>
      {(d) => (
        <Form
          key={d.doc ? `${d.doc.id}-${d.doc.status}` : `new-${kind}`}
          doc={d.doc}
          kind={(d.doc?.kind ?? kind) as Kind}
          accs={d.accs}
          items={d.items}
          refs={refs}
          wide={wide}
          reload={st.reload}
          onOpen={onOpen}
          onClose={onClose}
        />
      )}
    </Loaded>
  );
}

function Form({ doc, kind, accs, items, refs, wide, reload, onOpen, onClose }: { doc: Doc | null; kind: Kind; accs: Account[]; items: FlowItem[]; refs: Refs; wide: boolean; reload: () => Promise<void>; onOpen: (id: number) => void; onClose: () => void }) {
  const ops = kind === "in" ? refs.ops_in : refs.ops_out;
  const [f, setF] = useState<F>(() => ({
    account_id: doc ? String(doc.account_id) : String(accs[0]?.id ?? ""),
    account_to_id: doc?.account_to_id ? String(doc.account_to_id) : "",
    date: doc ? doc.date.slice(0, 16) : new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16),
    dateSet: false,
    amount: doc ? doc.amount : "",
    amount_to: doc?.amount_to ?? "",
    op: doc?.op ?? (kind === "transfer" ? "transfer" : (ops[0]?.key ?? "other")),
    item_id: doc?.item_id ? String(doc.item_id) : "",
    party: doc?.party_id && doc.party_kind ? { kind: doc.party_kind, id: doc.party_id, name: doc.party ?? "" } : null,
    party_name: doc && !doc.party_id ? (doc.party ?? "") : "",
    purpose: doc?.purpose ?? "",
    comment: doc?.comment ?? "",
  }));
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const edit = !doc || doc.can.edit;
  const set = <K extends keyof F>(k: K, v: F[K]) => setF((x) => ({ ...x, [k]: v }));
  const acc = accs.find((a) => String(a.id) === f.account_id);
  const accTo = accs.find((a) => String(a.id) === f.account_to_id);
  const partyKind = refs.party_of[f.op] ?? "";
  const dir = kind === "in" ? "in" : "out";

  const body = (post = false) => ({
    ...(doc ? {} : { kind }),
    account_id: f.account_id,
    ...(kind === "transfer" ? { account_to_id: f.account_to_id, amount_to: accTo && acc && accTo.currency !== acc.currency ? f.amount_to : "" } : { op: f.op, item_id: f.item_id || null }),
    ...(f.dateSet ? { date: f.date } : {}),
    amount: f.amount,
    ...(kind !== "transfer" ? (f.party && f.party.kind === partyKind ? { party_kind: f.party.kind, party_id: f.party.id } : { party_kind: "other", party_id: null, party_name: f.party_name }) : {}),
    purpose: f.purpose,
    comment: f.comment,
    ...(post && !doc ? { post: true } : {}),
  });
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const save = (then: "stay" | "post" | "close") =>
    run(async () => {
      if (!doc) {
        const r = await api<Doc>(U, body(then !== "stay"));
        toast(then === "stay" ? `Saqlandi: ${r.number}` : `O'tkazildi: ${r.number}`);
        if (then === "close") onClose();
        else onOpen(r.id);
        return;
      }
      await api<Doc>(`${U}/${doc.id}`, body());
      if (then !== "stay") await api<Doc>(`${U}/${doc.id}/post`, {});
      toast(then === "stay" ? "Saqlandi" : "O'tkazildi");
      if (then === "close") onClose();
      else await reload();
    });
  const act = (path: string, msg: string, ask: string) =>
    run(async () => {
      if (!doc || !(await confirm(ask))) return;
      await api<Doc>(`${U}/${doc.id}/${path}`, {});
      toast(msg);
      await reload();
    });
  const accOpt = (a: Account) => `${a.name} · ${sum(a.balance)} ${cur(a.currency)}`;

  return (
    <div className="mx-auto max-w-[900px] pb-8">
      <div className="mx-4 mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className={`${BTN} !px-2`} onClick={onClose} aria-label="Ro'yxatga qaytish" title="Ro'yxatga qaytish">
          <Icon n="back" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[19px] font-semibold">
            {KIND[kind].t} {doc ? <span className="code">{doc.number}</span> : <span className="text-hint">(yangi)</span>}
          </div>
          <div className="text-[13px] text-hint">{doc ? <span className={`st ${STATUS[doc.status].st}`}>{STATUS[doc.status].t}</span> : "Saqlanganda raqam beriladi"}</div>
        </div>
      </div>
      <div className="mx-4 mt-2.5 flex flex-wrap gap-2">
        {edit ? (
          <>
            <button type="button" className={`${BTN} pri`} disabled={busy} onClick={() => void save("close")}>
              O&apos;tkazish va yopish
            </button>
            <button type="button" className={BTN} disabled={busy} onClick={() => void save("stay")}>
              Saqlash
            </button>
            <button type="button" className={BTN} disabled={busy} onClick={() => void save("post")}>
              O&apos;tkazish
            </button>
          </>
        ) : null}
        {doc?.can.unpost ? (
          <button type="button" className={BTN} disabled={busy} onClick={() => void act("unpost", "Qaytarildi", "Hujjat o'tkazilmagan holatga qaytarilsinmi?")}>
            <Icon n="undo-2" /> Qaytarish
          </button>
        ) : null}
        {doc?.can.cancel ? (
          <button type="button" className={`${BTN} danger`} disabled={busy} onClick={() => void act("cancel", "Bekor qilindi", "Qoralama bekor qilinsinmi?")}>
            Bekor qilish
          </button>
        ) : null}
      </div>
      {doc?.source ? (
        <Sf>
          Sotuv to&apos;lovi ({doc.source_label}) — sotuv bo&apos;limida o&apos;zgartiriladi.{" "}
          {doc.source.startsWith("sales:") ? (
            <a className="text-link" href={`/app/erp/savdo/?doc=${doc.source.slice(6)}`}>
              Sotuv hujjatini ochish
            </a>
          ) : null}
        </Sf>
      ) : null}
      <div className={`mx-4 mt-3 grid gap-3 rounded-xl bg-sec p-3 ${wide ? "grid-cols-2" : "grid-cols-1"}`}>
        <label className={FLD}>
          {kind === "transfer" ? "Qaysi hisobdan" : kind === "in" ? "Qaysi hisobga" : "Qaysi hisobdan"}
          {edit ? (
            <select value={f.account_id} onChange={(e) => set("account_id", e.target.value)}>
              {accs.map((a) => (
                <option key={a.id} value={a.id}>
                  {accOpt(a)}
                </option>
              ))}
            </select>
          ) : (
            <span className={VAL}>{doc?.account}</span>
          )}
        </label>
        {kind === "transfer" ? (
          <label className={FLD}>
            Qaysi hisobga
            {edit ? (
              <select value={f.account_to_id} onChange={(e) => set("account_to_id", e.target.value)}>
                <option value="">— tanlang —</option>
                {accs
                  .filter((a) => String(a.id) !== f.account_id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {accOpt(a)}
                    </option>
                  ))}
              </select>
            ) : (
              <span className={VAL}>{doc?.account_to}</span>
            )}
          </label>
        ) : (
          <label className={FLD}>
            Operatsiya
            {edit ? (
              <select value={f.op} onChange={(e) => setF((x) => ({ ...x, op: e.target.value, party: null }))}>
                {ops.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className={VAL}>{doc?.op_name}</span>
            )}
          </label>
        )}
        <label className={FLD}>
          Summa{acc ? `, ${cur(acc.currency)}` : ""}
          {edit ? <input className={`${INP} text-right tabular-nums`} inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" /> : <span className={`${VAL} num`}>{sum(doc?.amount)} {cur(doc?.currency ?? "UZS")}</span>}
        </label>
        {kind === "transfer" && acc && accTo && acc.currency !== accTo.currency ? (
          <label className={FLD}>
            Qabul qilinadi, {cur(accTo.currency)}
            {edit ? <input className={`${INP} text-right tabular-nums`} inputMode="decimal" value={f.amount_to} onChange={(e) => set("amount_to", e.target.value)} /> : <span className={`${VAL} num`}>{sum(doc?.amount_to)}</span>}
          </label>
        ) : null}
        <label className={FLD}>
          Sana
          {edit ? (
            <input type="datetime-local" className={INP} value={f.date} onChange={(e) => setF((x) => ({ ...x, date: e.target.value, dateSet: true }))} />
          ) : (
            <span className={`${VAL} num`}>{doc ? when(doc.date) : ""}</span>
          )}
        </label>
        {kind !== "transfer" ? (
          <>
            <label className={FLD}>
              Pul oqimi moddasi
              {edit ? (
                <select value={f.item_id} onChange={(e) => set("item_id", e.target.value)}>
                  <option value="">— operatsiya bo&apos;yicha —</option>
                  {items
                    .filter((i) => i.direction === dir && i.active)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                </select>
              ) : (
                <span className={VAL}>{doc?.item ?? "—"}</span>
              )}
            </label>
            <div className={FLD}>
              {PARTY_T[partyKind] ?? "Kimdan / kimga"}
              {edit ? (
                partyKind ? (
                  <button type="button" className={`${INP} flex items-center justify-between gap-2 text-left`} onClick={() => setPick(true)}>
                    <span className={`truncate ${f.party ? "" : "text-hint"}`}>{f.party?.name ?? "Tanlang"}</span>
                    <Icon n="chevron-down" />
                  </button>
                ) : (
                  <input className={INP} value={f.party_name} onChange={(e) => set("party_name", e.target.value)} placeholder="Nomi (ixtiyoriy)" />
                )
              ) : (
                <span className={VAL}>{doc?.party ?? "—"}</span>
              )}
            </div>
          </>
        ) : null}
        <label className={`${FLD} ${wide ? "col-span-2" : ""}`}>
          To&apos;lov maqsadi
          {edit ? <input className={INP} value={f.purpose} onChange={(e) => set("purpose", e.target.value)} placeholder="masalan: 834-shartnoma bo'yicha to'lov" /> : <span className={VAL}>{doc?.purpose || "—"}</span>}
        </label>
        <label className={`${FLD} ${wide ? "col-span-2" : ""}`}>
          Izoh
          {edit ? <input className={INP} value={f.comment} onChange={(e) => set("comment", e.target.value)} /> : <span className={VAL}>{doc?.comment || "—"}</span>}
        </label>
      </div>
      {edit && acc && kind !== "in" ? <Sf>«{acc.name}» qoldig&apos;i: {sum(acc.balance)} {cur(acc.currency)} — undan ko&apos;p chiqim o&apos;tkazilmaydi.</Sf> : null}
      {pick && partyKind ? <PartyPicker kind={partyKind} onPick={(p) => set("party", { kind: partyKind, id: p.id, name: p.name })} onClose={() => setPick(false)} /> : null}
    </div>
  );
}

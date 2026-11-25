// Hujjat formasi (1C «Расходная накладная» kabi): sarlavha (mijoz, shartnoma, firma, ombor, sana), tovarlar (miqdor,
// narx QQS bilan, chegirma — narx siyosati chegarasi, summa), jami va QQS; to'lov — summa va usul. Amallar: «O'tkazish
// va yopish», «Saqlash», «O'tkazish» / «Qaytarish», «Asosida yaratish», chop etish (PDF), bekor qilish. Yonda — mijoz
// kontaktlari, to'langan/qolgan, asos va shu hujjat asosidagilar. O'tkazilgan hujjat — faqat o'qish.
import { useEffect, useState } from "react";

import { api, confirm, toast } from "@/erp/kit/env";
import { Icon, List, Loaded, Row, Sf, Sh, useLoad } from "@/erp/kit/ui";
import { apiBlob, openBlob } from "@/shared/api/client";

import { CreateMenu, StatusTag } from "./journal";
import { KIND, lineCalc, PAY, STATUS, sum, totals, when, hitLine, type Contact, type Doc, type Kind, type Line, type PayMethod, type Refs } from "./lib";
import { CustomerPicker, ItemPicker } from "./pickers";

type F = {
  customer: Pick<Contact, "id" | "name" | "inn"> | null;
  contract_id: string;
  firm: string;
  warehouse_id: string;
  date: string;
  vat_pct: string;
  comment: string;
  lines: Line[];
  amount: string;
  pay_method: PayMethod;
};
const U = "/app/api/erp/sales/docs";
const INP = "h-10 w-full min-w-0 rounded-lg border border-sep bg-page px-2 text-right text-[15px] text-fg tabular-nums outline-none focus:border-link coarse:h-11";
const FLD = "flex min-w-0 flex-col gap-1 text-[13px] text-hint [&_select]:h-10 [&_select]:rounded-lg [&_select]:border [&_select]:border-sep [&_select]:bg-page [&_select]:px-2 [&_select]:text-[15px] [&_select]:text-fg coarse:[&_select]:h-11 [&_input]:text-[15px] [&_input]:text-fg";
const BTN = "b h-10 coarse:h-11";
const local = (iso: string) => iso.slice(0, 16);
const nowLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
};

function blank(kind: Kind, refs: Refs): F {
  return {
    customer: null,
    contract_id: "",
    firm: refs.firms[0]?.code ?? "",
    warehouse_id: kind === "shipment" || kind === "order" ? String(refs.warehouses[0]?.id ?? "") : "",
    date: nowLocal(),
    vat_pct: "12",
    comment: "",
    lines: [],
    amount: "",
    pay_method: "bank",
  };
}

function fromDoc(d: Doc): F {
  return {
    customer: d.customer_id ? { id: d.customer_id, name: d.customer ?? "", inn: d.customer_inn } : null,
    contract_id: d.contract_id ? String(d.contract_id) : "",
    firm: d.firm,
    warehouse_id: d.warehouse_id ? String(d.warehouse_id) : "",
    date: local(d.date),
    vat_pct: d.vat_pct,
    comment: d.comment,
    lines: d.lines.map((l) => ({ ...l })),
    amount: d.kind === "receipt" ? d.total : "",
    pay_method: d.pay_method ?? "bank",
  };
}

export function DocView({ id, kind, refs, wide, onOpen, onClose }: { id: number | null; kind: Kind | null; refs: Refs; wide: boolean; onOpen: (id: number) => void; onClose: () => void }) {
  const st = useLoad(() => (id ? api<Doc>(`${U}/${id}`) : Promise.resolve(null)), [id]);
  return <Loaded st={st}>{(d) => <Form key={d ? `${d.id}-${d.status}-${d.total}` : `new-${kind}`} doc={d} kind={(d?.kind ?? kind) as Kind} refs={refs} wide={wide} reload={st.reload} onOpen={onOpen} onClose={onClose} />}</Loaded>;
}

function Form({ doc, kind, refs, wide, reload, onOpen, onClose }: { doc: Doc | null; kind: Kind; refs: Refs; wide: boolean; reload: () => Promise<void>; onOpen: (id: number) => void; onClose: () => void }) {
  const [f, setF] = useState<F>(() => (doc ? fromDoc(doc) : blank(kind, refs)));
  const [pick, setPick] = useState<"customer" | "item" | null>(null);
  const [busy, setBusy] = useState(false);
  const [dateSet, setDateSet] = useState(false); // sana qo'lda o'zgartirilmasa — server vaqti (brauzer soati boshqa bo'lishi mumkin)
  const [contracts, setContracts] = useState(refs.contracts);
  const edit = !doc || doc.can.edit;
  const set = <K extends keyof F>(k: K, v: F[K]) => setF((x) => ({ ...x, [k]: v }));
  const vat = Number(f.vat_pct) || 0;
  const tot = kind === "receipt" ? { total: Number(f.amount.replace(/\s/g, "").replace(",", ".")) || 0, vat: 0 } : totals(f.lines, vat);
  const withLines = kind !== "receipt";

  useEffect(() => {
    const inn = f.customer?.inn;
    if (!inn) return;
    api<Refs>(`/app/api/erp/sales/refs?inn=${encodeURIComponent(inn)}&firm=${encodeURIComponent(f.firm)}`).then((r) => setContracts(r.contracts), () => undefined);
  }, [f.customer?.inn, f.firm]);

  const body = (post = false) => ({
    ...(doc ? {} : { kind }),
    customer_id: f.customer?.id ?? null,
    contract_id: f.contract_id || null,
    firm: f.firm,
    warehouse_id: f.warehouse_id || null,
    ...(dateSet ? { date: f.date } : {}),
    vat_pct: f.vat_pct,
    comment: f.comment,
    ...(withLines ? { lines: f.lines } : { amount: f.amount, pay_method: f.pay_method }),
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
  const act = (path: string, msg: string, ask?: string) =>
    run(async () => {
      if (!doc || (ask && !(await confirm(ask)))) return;
      await api<Doc>(`${U}/${doc.id}/${path}`, {});
      toast(msg);
      await reload();
    });
  const createFrom = (k: Kind) =>
    run(async () => {
      if (!doc) return;
      const r = await api<Doc>(`${U}/${doc.id}/create`, { kind: k });
      toast(`${KIND[k].t} yaratildi: ${r.number}`);
      onOpen(r.id);
    });
  const pdf = () =>
    run(async () => {
      if (doc) openBlob(await apiBlob(`${U}/${doc.id}/pdf`), `${doc.number}.pdf`);
    });
  const setLine = (i: number, patch: Partial<Line>) => set("lines", f.lines.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  const head = (
    <div className="mx-4 mt-2 flex flex-wrap items-center gap-2">
      <button type="button" className={`${BTN} !px-2`} onClick={onClose} aria-label="Ro'yxatga qaytish" title="Ro'yxatga qaytish">
        <Icon n="back" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[19px] font-semibold">
          {KIND[kind].t} {doc ? <span className="code">{doc.number}</span> : <span className="text-hint">(yangi)</span>}
        </div>
        <div className="text-[13px] text-hint">{doc ? <StatusTag r={doc} /> : "Saqlanganda raqam beriladi"}</div>
      </div>
    </div>
  );
  const actions = (
    <div className="mx-4 mt-2.5 flex flex-wrap items-center gap-2">
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
      ) : doc?.can.unpost ? (
        <button type="button" className={BTN} disabled={busy} onClick={() => void act("unpost", "Qaytarildi — endi tahrirlash mumkin", "Hujjat o'tkazilmagan holatga qaytarilsinmi?")}>
          <Icon n="undo-2" /> Qaytarish
        </button>
      ) : null}
      {doc && doc.can.create.length ? <CreateMenu kinds={doc.can.create} onCreate={(k) => void createFrom(k)} /> : null}
      {doc ? (
        <button type="button" className={BTN} disabled={busy} onClick={() => void pdf()} aria-label="Chop etish (PDF)" title="Chop etish (PDF)">
          <Icon n="printer" />
        </button>
      ) : null}
      {doc?.can.cancel ? (
        <button type="button" className={`${BTN} danger`} disabled={busy} onClick={() => void act("cancel", "Bekor qilindi", "Qoralama bekor qilinsinmi?")}>
          Bekor qilish
        </button>
      ) : null}
    </div>
  );

  const header = (
    <div className="mx-4 mt-3 grid grid-cols-1 gap-3 rounded-xl bg-sec p-3 min-[700px]:grid-cols-2">
      <div className={FLD}>
        Mijoz
        {edit ? (
          <button type="button" className="flex h-10 items-center justify-between gap-2 rounded-lg border border-sep bg-page px-2 text-left text-[15px] text-fg coarse:h-11" onClick={() => setPick("customer")}>
            <span className={`truncate ${f.customer ? "" : "text-hint"}`}>{f.customer?.name ?? "Tanlang"}</span>
            <Icon n="chevron-down" />
          </button>
        ) : (
          <span className="text-[15px] text-fg">{f.customer?.name ?? "—"}</span>
        )}
      </div>
      <label className={FLD}>
        Shartnoma
        {edit ? (
          <select value={f.contract_id} onChange={(e) => set("contract_id", e.target.value)} disabled={!f.customer}>
            <option value="">{f.customer ? (contracts.length ? "— shartnomasiz —" : "shartnoma yo'q") : "avval mijoz"}</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[15px] text-fg">{doc?.contract ?? "—"}</span>
        )}
      </label>
      <label className={FLD}>
        Firma
        {edit ? (
          <select value={f.firm} onChange={(e) => set("firm", e.target.value)}>
            {refs.firms.map((x) => (
              <option key={x.code} value={x.code}>
                {x.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[15px] text-fg">{refs.firms.find((x) => x.code === f.firm)?.name ?? f.firm}</span>
        )}
      </label>
      <label className={FLD}>
        Sana
        {edit ? <input type="datetime-local" className={`${INP} !text-left`} value={f.date} onChange={(e) => (set("date", e.target.value), setDateSet(true))} /> : <span className="num text-[15px] text-fg">{doc ? when(doc.date) : ""}</span>}
      </label>
      {kind === "order" || kind === "shipment" ? (
        <label className={FLD}>
          Ombor
          {edit ? (
            <select value={f.warehouse_id} onChange={(e) => set("warehouse_id", e.target.value)}>
              <option value="">—</option>
              {refs.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[15px] text-fg">{doc?.warehouse ?? "—"}</span>
          )}
        </label>
      ) : null}
      {kind === "receipt" ? (
        <>
          <label className={FLD}>
            To&apos;lov usuli
            {edit ? (
              <select value={f.pay_method} onChange={(e) => set("pay_method", e.target.value as PayMethod)}>
                {(Object.keys(PAY) as PayMethod[]).map((k) => (
                  <option key={k} value={k}>
                    {PAY[k]}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[15px] text-fg">{PAY[f.pay_method]}</span>
            )}
          </label>
          <label className={FLD}>
            Summa, so&apos;m
            {edit ? <input className={INP} inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" /> : <span className="num text-[15px] text-fg">{sum(f.amount)}</span>}
          </label>
        </>
      ) : (
        <label className={FLD}>
          QQS, %
          {edit ? <input className={INP} inputMode="decimal" value={f.vat_pct} onChange={(e) => set("vat_pct", e.target.value)} /> : <span className="num text-[15px] text-fg">{f.vat_pct}%</span>}
        </label>
      )}
    </div>
  );

  const lines = withLines ? (
    <>
      <Sh
        t={`Tovarlar (${f.lines.length})`}
        r={
          edit ? (
            <button type="button" className="mini pri" onClick={() => setPick("item")}>
              <Icon n="plus" /> Qo&apos;shish
            </button>
          ) : null
        }
      />
      {f.lines.length ? (
        <div className="mx-4 overflow-hidden rounded-xl bg-sec">
          {wide ? (
            <div className="grid grid-cols-[32px_minmax(0,1fr)_96px_56px_130px_80px_130px_40px] gap-2 border-b border-sep px-3 py-2 text-xs font-semibold text-hint">
              <span>№</span>
              <span>Tovar</span>
              <span className="text-right">Miqdor</span>
              <span>Birl.</span>
              <span className="text-right">Narx (QQS bilan)</span>
              <span className="text-right">Chegirma %</span>
              <span className="text-right">Summa</span>
              <span />
            </div>
          ) : null}
          {f.lines.map((l, i) => {
            const c = lineCalc(l, vat);
            const name = (
              <span className="min-w-0">
                <span className="block truncate">{l.name}</span>
                {l.char ? <span className="code text-xs text-hint">{l.char}</span> : null}
              </span>
            );
            return wide ? (
              <div key={i} className="grid grid-cols-[32px_minmax(0,1fr)_96px_56px_130px_80px_130px_40px] items-center gap-2 border-b border-sep px-3 py-1.5 last:border-b-0">
                <span className="text-hint tabular-nums">{i + 1}</span>
                {name}
                {edit ? <input className={INP} inputMode="decimal" aria-label="Miqdor" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} /> : <span className="num text-right">{sum(l.qty)}</span>}
                <span className="text-hint">{l.unit}</span>
                {edit ? <input className={INP} inputMode="decimal" aria-label="Narx" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} /> : <span className="num text-right">{sum(l.price)}</span>}
                {edit ? <input className={INP} inputMode="decimal" aria-label="Chegirma" value={l.discount} onChange={(e) => setLine(i, { discount: e.target.value })} /> : <span className="num text-right">{Number(l.discount) ? `${l.discount}%` : ""}</span>}
                <span className="num text-right font-medium">{sum(c.amount)}</span>
                {edit ? (
                  <button type="button" className="grid size-9 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-danger hover:bg-fill" aria-label="Qatorni o'chirish" onClick={() => set("lines", f.lines.filter((_, n) => n !== i))}>
                    <Icon n="trash-2" />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ) : (
              <div key={i} className="border-b border-sep px-3 py-2.5 last:border-b-0">
                <div className="flex items-start gap-2">
                  <span className="pt-0.5 text-hint tabular-nums">{i + 1}.</span>
                  <div className="min-w-0 flex-1">{name}</div>
                  <span className="num font-semibold">{sum(c.amount)}</span>
                  {edit ? (
                    <button type="button" className="grid size-11 flex-none cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-danger" aria-label="Qatorni o'chirish" onClick={() => set("lines", f.lines.filter((_, n) => n !== i))}>
                      <Icon n="trash-2" />
                    </button>
                  ) : null}
                </div>
                {edit ? (
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-hint">
                    <label className="flex flex-col gap-1">
                      Miqdor, {l.unit}
                      <input className={INP} inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
                    </label>
                    <label className="flex flex-col gap-1">
                      Narx
                      <input className={INP} inputMode="decimal" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} />
                    </label>
                    <label className="flex flex-col gap-1">
                      Chegirma %
                      <input className={INP} inputMode="decimal" value={l.discount} onChange={(e) => setLine(i, { discount: e.target.value })} />
                    </label>
                  </div>
                ) : (
                  <div className="mt-1 text-[13px] text-hint tabular-nums">
                    {sum(l.qty)} {l.unit} × {sum(l.price)}
                    {Number(l.discount) ? ` − ${l.discount}%` : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <Sf>{edit ? "Tovar qo'shing — «Qo'shish» (katalogdan, narx siyosati bo'yicha)." : "Tovar yo'q."}</Sf>
      )}
      {edit && Number(refs.disc_max) < 100 ? <Sf>Chegirma: sizga {sum(refs.disc_max)}% gacha ruxsat (narx siyosati).</Sf> : null}
    </>
  ) : null;

  const footer = (
    <div className="mx-4 mt-3 flex flex-wrap items-end gap-3">
      <label className={`${FLD} min-w-[220px] flex-1`}>
        Izoh
        {edit ? <input className={`${INP} !text-left`} value={f.comment} onChange={(e) => set("comment", e.target.value)} placeholder="Izoh" /> : <span className="text-[15px] text-fg">{f.comment || "—"}</span>}
      </label>
      <div className="ml-auto min-w-[220px] rounded-xl bg-sec px-4 py-2.5 text-right">
        {withLines ? (
          <div className="text-[13px] text-hint">
            QQS {f.vat_pct}%: <span className="num">{sum(tot.vat)}</span>
          </div>
        ) : null}
        <div className="text-[20px] font-bold tabular-nums">{sum(tot.total)} so&apos;m</div>
      </div>
    </div>
  );

  const side = doc ? (
    <>
      {doc.due !== null ? (
        <>
          <Sh t="To'lov" />
          <List>
            <Row t="To'langan" val={<span className="num">{sum(doc.paid ?? 0)}</span>} />
            <Row t="Qolgan" val={<span className={`num ${Number(doc.due) > 0 ? "text-st-bad" : "text-st-done"}`}>{sum(doc.due)}</span>} />
          </List>
        </>
      ) : null}
      {doc.base || doc.children.length ? (
        <>
          <Sh t="Hujjatlar zanjiri" />
          <List>
            {doc.base ? <Row icon={KIND[doc.base.kind].icon} color="gray" t={`Asos: ${KIND[doc.base.kind].t}`} s={doc.base.number} chev onClick={() => onOpen(doc.base!.id)} /> : null}
            {doc.children.map((k) => (
              <Row key={k.id} icon={KIND[k.kind].icon} color={k.status === "posted" ? KIND[k.kind].color : "gray"} t={KIND[k.kind].t} s={`${k.number} · ${STATUS[k.status].t}`} val={<span className="num">{sum(k.total)}</span>} chev onClick={() => onOpen(k.id)} />
            ))}
          </List>
        </>
      ) : null}
      {doc.contact ? (
        <>
          <Sh t="Kontakt ma'lumoti" />
          <List>
            {doc.contact.phones.map((p) => (
              <Row key={p} icon="phone" color="green" t={`+${p}`} chev onClick={() => location.assign(`tel:+${p}`)} />
            ))}
            {doc.contact.address ? <Row icon="pin" color="red" t={doc.contact.address} tcls="wrap2" /> : null}
            {doc.contact.contacts.map((x, i) => (
              <Row key={i} icon="user" color="blue" t={x.name ?? "Kontakt"} s={[x.role, x.phone ? `+${x.phone}` : null].filter(Boolean).join(" · ")} />
            ))}
            {doc.customer_inn ? <Row t="STIR" val={<span className="code">{doc.customer_inn}</span>} /> : null}
          </List>
        </>
      ) : null}
      {doc.deal_id ? <Sf>CRM bitimi #{doc.deal_id} bilan bog&apos;langan — jo&apos;natish bitim orqali (ombor navbati takrorlanmaydi).</Sf> : null}
    </>
  ) : null;

  return (
    <div className="pb-8">
      {head}
      {actions}
      <div className={wide && side ? "grid grid-cols-[minmax(0,1fr)_320px] items-start gap-2" : ""}>
        <div className="min-w-0">
          {header}
          {lines}
          {footer}
        </div>
        {side ? <div className="min-w-0">{side}</div> : null}
      </div>
      {pick === "customer" ? (
        <CustomerPicker
          onPick={(c) => setF((x) => ({ ...x, customer: { id: c.id, name: c.name, inn: c.inn }, contract_id: "" }))}
          onClose={() => setPick(null)}
        />
      ) : null}
      {pick === "item" ? (
        <ItemPicker
          vat={f.vat_pct}
          onPick={(h) => {
            set("lines", [...f.lines, hitLine(h)]);
            toast(h.price_vat ? `Qo'shildi: ${h.name}` : `Qo'shildi: ${h.name} — narxi yo'q, qo'lda kiriting`, h.price_vat ? "ok" : "info");
          }}
          onClose={() => setPick(null)}
        />
      ) : null}
    </div>
  );
}

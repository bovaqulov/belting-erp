// Yangi bitim oynasi (faqat ko'rinish): mijoz — faqat ro'yxatdan tanlash (yonida «+ Yangi» — joyida yaratish formasi),
// nom, tovarlar (ko'p tanlov; miqdor/narx), narxlash (chegirma / ustama / logistika) yoki qo'lda summa, joylashuv.
import { useState, type ReactNode } from "react";

import { dnum, num } from "@/erp/kit/fmt";
import { Modal } from "@/erp/kit/modal";
import { Icon } from "@/erp/kit/ui";
import { ItemSearch, itemKey } from "@/erp/crm/deal/items/search";
import { PriceBox, type PriceField } from "@/erp/crm/deal/items";
import { CUST_KINDS, custKind, custSub, innRequired, itemAmount, POSITIONS, type Customer, type CustKind, type DealItem } from "@/erp/crm/lib";
import { chOf, type TgChat } from "@/erp/crm/telegram/tg.lib";
import { stk } from "@/erp/crm/tw";

export type DealForm = { amount: string; discount: string; markup: string; logistics: string; location: string };
/** yangi mijoz formasi (oyna ichida) */
export type NewCust = { kind: CustKind; name: string; phone: string; inn: string; address: string; position: string; company: string; company_inn: string };
export const emptyCust = (name = "", kind: CustKind = "company"): NewCust => ({ kind, name, phone: "", inn: "", address: "", position: "", company: "", company_inn: "" });
/** oynadagi tovar qatori: miqdor/narx — kiritilgan matn (bo'sh joy, vergul bilan) */
export type NdRow = DealItem & { qty: string; price: string };
export const rowAmount = (r: NdRow): number => itemAmount({ ...r, qty: dnum(r.qty), price: dnum(r.price) });

const SIDE = "b h-10 flex-none gap-1 px-3 text-[13.5px] coarse:h-11";

export function NewDealView({
  cq,
  cp,
  shown,
  v,
  users,
  set,
  onPrice,
  rows,
  onAddRow,
  onRemoveKey,
  onEditRow,
  onRemoveRow,
  nc,
  ncBusy,
  onNc,
  onNcOpen,
  onNcClose,
  onNcSave,
  tgChat,
  tgHits,
  onPickTg,
  onClearTg,
  onCq,
  onPick,
  onClearCp,
  onClose,
  onOk,
}: {
  cq: string;
  cp: Customer | null;
  /** qidiruv natijalari (mijoz tanlanmagan bo'lsa) */
  shown: Customer[] | null;
  v: DealForm;
  users: Record<number, string>;
  set: (k: keyof DealForm) => (e: { target: { value: string } }) => void;
  onPrice: (f: PriceField, v: string) => void;
  rows: NdRow[];
  onAddRow: (r: DealItem) => void;
  onRemoveKey: (k: string) => void;
  onEditRow: (i: number, f: "qty" | "price", v: string) => void;
  onRemoveRow: (i: number) => void;
  /** yangi mijoz formasi (ochiq bo'lsa) */
  nc: NewCust | null;
  ncBusy: boolean;
  onNc: (k: keyof NewCust, v: string) => void;
  onNcOpen: () => void;
  onNcClose: () => void;
  onNcSave: () => void;
  /** tanlangan Telegram chati (bitim mijoziga biriktiriladi) */
  tgChat: TgChat | null;
  /** mijoz maydoni bo'yicha o'z chatlari */
  tgHits: TgChat[];
  onPickTg: (c: TgChat) => void;
  onClearTg: () => void;
  onCq: (v: string) => void;
  onPick: (c: Customer) => void;
  onClearCp: () => void;
  onClose: () => void;
  onOk: () => Promise<boolean | void>;
}) {
  const sub = rows.reduce((a, r) => a + rowAmount(r), 0);
  return (
    <Modal title="Yangi bitim" ok="Yaratish" size="xl" onClose={onClose} onOk={onOk}>
      <div className="grid gap-3.5 py-0.5 min-[900px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] [&_.inp]:h-10 [&_.inp]:rounded-[10px]">
      <div className="flex min-w-0 flex-col gap-3.5">
      <Sec icon="user" title="Mijoz" aside={cp ? null : "faqat ro'yxatdan"}>
      <label className="sr-only" htmlFor="nd-c">
        Mijoz
      </label>
      <div className="flex items-stretch gap-2">
        {cp ? (
          <div className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-ok/50 bg-ok/8 px-3 py-2">
            <span className="grid size-9 flex-none place-items-center rounded-full bg-ok/15 text-ok [&_svg.i]:size-[18px]" aria-hidden="true">
              <Icon n="check" />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block truncate">{cp.name}</b>
              <span className="block truncate text-xs text-hint">
                {[custSub(cp), cp.address].filter(Boolean).join(" · ") || "tanlandi"}
              </span>
            </span>
            <button type="button" className="b h-8 flex-none px-2 text-xs coarse:h-11" onClick={onClearCp}>
              O&apos;zgartirish
            </button>
          </div>
        ) : nc ? null : (
          <input
            id="nd-c"
            className="inp min-w-0 flex-1"
            value={cq}
            placeholder="Ro'yxatdan tanlang: nom, STIR yoki telefon"
            autoComplete="off"
            onChange={(e) => onCq(e.target.value)}
          />
        )}
        {cp || nc ? null : (
          <button type="button" className={SIDE} onClick={onNcOpen} title="Ro'yxatda yo'q bo'lsa — yangi mijoz qo'shish">
            <Icon n="plus" /> Yangi
          </button>
        )}
      </div>
      {!cp && !nc && shown ? (
        <div className="dd">
          {shown.map((c) => (
            <button key={c.id} type="button" className="opt" onClick={() => onPick(c)}>
              <span>
                <span>{c.name}</span>
                <span className="s" style={{ display: "block" }}>
                  {[custSub(c), c.owner_tg != null && users[c.owner_tg]].filter(Boolean).join(" · ")}
                </span>
              </span>
            </button>
          ))}
          {!shown.length ? (
            <button type="button" className="opt" onClick={onNcOpen}>
              <span className="s">Topilmadi — «{cq.trim()}» ni yangi mijoz sifatida qo&apos;shish</span>
            </button>
          ) : null}
        </div>
      ) : null}
      {!cp && !nc && tgHits.length ? (
        <div className="dd">
          <div className="opt s pointer-events-none">Chatlardan (Telegram / WhatsApp / Instagram)</div>
          {tgHits.map((c) => (
            <button key={c.id} type="button" className="opt" onClick={() => onPickTg(c)}>
              <span>
                <span className="flex items-center gap-1.5 [&_svg.i]:size-4">
                  <span className="contents" style={{ color: chOf(c.channel).color }}>
                    <Icon n={chOf(c.channel).icon} />
                  </span>
                  {c.title}
                </span>
                <span className="s" style={{ display: "block" }}>
                  {[c.username && "@" + c.username, c.customer ? `mijoz: ${c.customer.name}` : "mijoz biriktirilmagan — yangi mijoz qo'shasiz"].filter(Boolean).join(" · ")}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {nc ? (
        <fieldset className="m-0 min-w-0 rounded-xl border border-link/35 bg-link/5 p-0" aria-label="Yangi mijoz">
          <div className="flex items-center gap-2.5 border-b border-link/20 px-3.5 py-2.5">
            <span className="grid size-8 flex-none place-items-center rounded-full bg-link text-btn-fg [&_svg.i]:size-4" aria-hidden="true">
              <Icon n="user-plus" />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <b className="block text-[14px]">Yangi mijoz</b>
              <span className="block truncate text-xs text-hint">Ro&apos;yxatda yo&apos;q bo&apos;lsa — shu yerda qo&apos;shing</span>
            </span>
            <button type="button" className="grid size-8 flex-none cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-hint hover:bg-fill hover:text-fg coarse:size-11" aria-label="Yangi mijoz formasini yopish" title="Yopish" onClick={onNcClose}>
              <Icon n="x" />
            </button>
          </div>
          <div className="px-3.5 pt-3 pb-3.5">
            <NewCustFields nc={nc} onNc={onNc} />
            <div className="mt-4 flex gap-2 [&_.b]:h-10 coarse:[&_.b]:h-11">
              <button type="button" className="b flex-none px-4" onClick={onNcClose}>
                Bekor
              </button>
              <button
                type="button"
                className="b pri flex-1 justify-center gap-1.5"
                disabled={ncBusy || !nc.name.trim() || !nc.phone.trim() || (custKind(nc.kind).employee && !nc.company.trim()) || (innRequired(nc.kind) && !nc.inn.trim())}
                onClick={onNcSave}
              >
                <Icon n="check" /> Qo&apos;shish va tanlash
              </button>
            </div>
          </div>
        </fieldset>
      ) : null}
      {tgChat ? (
        <div className="sf flex items-start gap-2">
          <span className="min-w-0 flex-1 leading-[1.4]">
            {chOf(tgChat.channel).name}: <b>{tgChat.title}</b>
            {tgChat.username ? ` (@${tgChat.username})` : ""} — chat bitim mijoziga biriktiriladi.
          </span>
          <button type="button" className="b h-7 flex-none px-2 text-xs" onClick={onClearTg}>
            Olib tashlash
          </button>
        </div>
      ) : null}
      <label className="l" htmlFor="nd-l">
        Yetkazish manzili
      </label>
      <input id="nd-l" className="inp w-full" value={v.location} placeholder="Mijoz tanlansa — uning manzili" onChange={set("location")} />
      </Sec>
      </div>
      <Sec icon="package" title="Tovarlar va narx" aside={rows.length ? `${rows.length} ta tovar` : "bir nechtasini tanlash mumkin"}>
      <label className="sr-only" htmlFor="nd-i">
        Tovar qidirish
      </label>
      <ItemSearch id="nd-i" onAdd={onAddRow} picked={new Set(rows.map(itemKey))} onRemove={onRemoveKey} />
      {rows.length ? (
        <ul className="mt-2 flex list-none flex-col gap-1.5 p-0">
          {rows.map((r, i) => (
            <li key={itemKey(r) + i} className="rounded-lg border border-sep px-2.5 py-2">
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1 text-[13.5px] leading-snug break-words">
                  {r.name}
                  {r.item_id ? null : <span className={`${stk(null)} block text-hint`}>katalogdan tashqari — hujjatga kirmaydi</span>}
                </span>
                <button
                  type="button"
                  className="-mt-1 -mr-1 grid min-h-8 min-w-8 flex-none cursor-pointer place-items-center border-0 bg-transparent p-1 text-hint hover:text-danger coarse:min-h-11 coarse:min-w-11"
                  aria-label={`${r.name} — olib tashlash`}
                  title="Olib tashlash"
                  onClick={() => onRemoveRow(i)}
                >
                  <Icon n="x" />
                </button>
              </div>
              <div className="mt-1.5 grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)_auto] items-end gap-2">
                <label className="flex min-w-0 flex-col gap-0.5 text-xs text-hint">
                  Miqdor{r.unit ? `, ${r.unit}` : ""}
                  <input className="inp w-full text-right tabular-nums" inputMode="decimal" value={r.qty} onChange={(e) => onEditRow(i, "qty", e.target.value)} />
                </label>
                <label className="flex min-w-0 flex-col gap-0.5 text-xs text-hint">
                  Narx, so&apos;m
                  <input className="inp w-full text-right tabular-nums" inputMode="decimal" value={r.price} onChange={(e) => onEditRow(i, "price", e.target.value)} />
                </label>
                <b className="min-w-[72px] pb-2.5 text-right text-[13.5px] whitespace-nowrap tabular-nums">{num(rowAmount(r), 0)}</b>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 mb-0 text-[13px] text-hint">Tovar tanlansa summa o&apos;zi hisoblanadi.</p>
      )}
      {rows.length ? (
        <div className="mt-2.5 rounded-xl border border-sep bg-page px-3 py-2">
          <PriceBox sub={sub} pr={{ discount: dnum(v.discount), markup: dnum(v.markup), logistics: dnum(v.logistics) }} onPrice={onPrice} />
        </div>
      ) : (
        <>
          <label className="l" htmlFor="nd-a">
            Summa (tovarsiz, qo&apos;lda), so&apos;m
          </label>
          <input id="nd-a" className="inp w-full text-right tabular-nums" value={v.amount} inputMode="decimal" placeholder="0" onChange={set("amount")} />
        </>
      )}
      </Sec>
      </div>
    </Modal>
  );
}

/** Yangi mijoz maydonlari: turi (ikonkali plitkalar) va shu turga xos maydonlar (CUST_KINDS); xodim — firma
 *  ma'lumotlari alohida guruhda */
function NewCustFields({ nc, onNc }: { nc: NewCust; onNc: (k: keyof NewCust, v: string) => void }) {
  const k = custKind(nc.kind);
  const f = (key: keyof NewCust, label: string, o: { ph?: string; mode?: "tel" | "numeric"; req?: boolean; full?: boolean; code?: boolean } = {}) => (
    <div className={`min-w-0 ${o.full ? "col-span-full" : ""}`}>
      <label className="mb-1 block text-[12.5px] text-hint" htmlFor={`nc-${key}`}>
        {label}
        {o.req ? <span className="text-danger"> *</span> : null}
      </label>
      <input
        id={`nc-${key}`}
        className={`inp w-full ${o.code ? "tabular-nums" : ""}`}
        value={nc[key]}
        inputMode={o.mode}
        placeholder={o.ph}
        required={o.req}
        onChange={(e) => onNc(key, e.target.value)}
      />
    </div>
  );
  return (
    <>
      <div className="mb-1.5 text-[12.5px] text-hint" id="nc-kind-l">
        Turi
      </div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="nc-kind-l">
        {CUST_KINDS.map((x) => {
          const on = x.k === nc.kind;
          return (
            <button
              key={x.k}
              type="button"
              role="radio"
              aria-checked={on}
              title={x.name}
              onClick={() => onNc("kind", x.k)}
              className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] coarse:h-11 focus-visible:outline-2 focus-visible:outline-focus [&_svg.i]:size-4 ${on ? "border-link bg-link/12 font-semibold text-fg" : "border-sep bg-sec text-sub hover:border-link/50 hover:text-fg"}`}
            >
              <Icon n={x.icon} />
              {x.short}
            </button>
          );
        })}
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-x-2.5 gap-y-3 max-[599px]:grid-cols-1">
        {f("name", k.nameLabel, { req: true, full: true, ph: k.employee || k.k === "trader" || k.k === "person" ? "Ism familiya" : "Masalan: Chinoz Un MChJ" })}
        {k.employee ? <PositionPick v={nc.position} onV={(x) => onNc("position", x)} /> : null}
        {f("phone", "Telefon", { mode: "tel", ph: "90 123 45 67", req: true, code: true })}
        {k.inn ? f("inn", k.inn.label, { mode: "numeric", ph: k.inn.ph, req: innRequired(nc.kind), code: true }) : null}
        {k.employee ? (
          <div className="col-span-full mt-0.5 grid grid-cols-2 gap-x-2.5 gap-y-3 rounded-xl border border-sep bg-page/60 p-3 max-[599px]:grid-cols-1">
            <div className="col-span-full -mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-sub [&_svg.i]:size-[15px]">
              <Icon n="building" /> Firma ma&apos;lumotlari
            </div>
            {f("company", "Firma nomi", { req: true, ph: "Qaysi firmadan" })}
            {f("company_inn", "Firma STIRi", { mode: "numeric", ph: "9 raqam", code: true })}
          </div>
        ) : null}
        {f("address", k.address, { full: true, ph: k.k === "trader" ? "Masalan: Abu Saxiy, 3-qator" : "Viloyat, tuman, ko'cha" })}
      </div>
    </>
  );
}

/** Lavozim: tayyor ro'yxatdan chip bilan tanlash; «Boshqa…» — qo'lda yozish (ro'yxatda yo'q qiymat ham shu yerda) */
function PositionPick({ v, onV }: { v: string; onV: (v: string) => void }) {
  const custom = !!v && !POSITIONS.includes(v);
  const [other, setOther] = useState(custom);
  const chip = (on: boolean) =>
    `h-8 cursor-pointer rounded-full border px-3 text-[12.5px] coarse:h-11 focus-visible:outline-2 focus-visible:outline-focus ${on ? "border-link bg-link/15 font-semibold text-fg" : "border-sep bg-sec text-sub hover:border-link/50 hover:text-fg"}`;
  return (
    <div className="col-span-full min-w-0">
      <div className="mb-1 text-[12.5px] text-hint" id="nc-pos-l">
        Lavozimi
      </div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="nc-pos-l">
        {POSITIONS.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={v === p}
            className={chip(v === p)}
            onClick={() => {
              setOther(false);
              onV(v === p ? "" : p);
            }}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={other}
          className={chip(other)}
          onClick={() => {
            setOther(true);
            if (!custom) onV("");
          }}
        >
          Boshqa…
        </button>
      </div>
      {other ? (
        <input className="inp mt-2 w-full" value={v} placeholder="Lavozimni yozing" aria-label="Lavozim (qo'lda)" autoFocus onChange={(e) => onV(e.target.value)} />
      ) : null}
    </div>
  );
}

/** Forma bo'limi: ikonka + sarlavha (o'ngda — qisqa izoh), ostida maydonlar */
function Sec({ icon, title, aside, children }: { icon: string; title: string; aside?: string | null; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border border-sep bg-sec p-4 max-[599px]:p-3">
      <h3 className="m-0 mb-3 flex items-center gap-2.5 text-[15px] font-semibold">
        <span className="grid size-8 flex-none place-items-center rounded-[10px] bg-link/12 text-link [&_svg.i]:size-[17px]" aria-hidden="true">
          <Icon n={icon} />
        </span>
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {aside ? <span className="flex-none text-xs font-normal text-hint max-[599px]:hidden">{aside}</span> : null}
      </h3>
      {children}
    </section>
  );
}

// Bitimdagi tovarlar (faqat ko'rinish): qidiruv (ItemSearch), tovarlar jadvali (miqdor/narx/chegirma), jami,
// taklif (PDF) / buyurtma tugmalari.
import { num } from "@/erp/kit/fmt";
import { Icon } from "@/erp/kit/ui";
import { itemAmount, priced, type DealItem, type Num } from "@/erp/crm/lib";
import { BOX, BOX_H, BTNROW, DLR, SMALL } from "@/erp/crm/tw";

import { ItemSearch, itemKey } from "./search";

export type ItemField = "name" | "qty" | "price" | "discount";
export type PriceField = "discount" | "markup" | "logistics";
type Pr = { discount?: Num; markup?: Num; logistics?: Num };

/** Narxlash: tovarlar → chegirma % → ustama % → + logistika = jami (yangi bitim oynasi va kartochka uchun umumiy) */
export function PriceBox({ sub, pr, disabled, onPrice }: { sub: number; pr: Pr; disabled?: boolean; onPrice: (f: PriceField, v: string) => void }) {
  const p = priced(sub, pr);
  const row = "grid grid-cols-[minmax(0,1fr)_76px_minmax(80px,auto)] items-center gap-2 py-0.5";
  const val = "text-right tabular-nums whitespace-nowrap";
  return (
    <div className="text-[13px] [&_input]:h-7 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-sep [&_input]:bg-page [&_input]:px-2 [&_input]:py-0 [&_input]:text-right [&_input]:text-fg [&_input]:tabular-nums [&_input]:outline-none [&_input]:[font:inherit] [&_input:focus]:border-link coarse:[&_input]:min-h-11">
      <div className={row}>
        <span className="text-hint">Tovarlar</span>
        <span />
        <span className={val}>{num(p.sub, 0)}</span>
      </div>
      <details className="[&[open]>summary_svg.i]:rotate-180" open={!!(Number(pr.discount) || Number(pr.markup) || Number(pr.logistics))}>
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1 text-hint select-none hover:text-fg coarse:min-h-11 [&::-webkit-details-marker]:hidden [&_svg.i]:size-4 [&_svg.i]:transition-transform">
          Chegirma, ustama, logistika
          <Icon n="chevron-down" />
        </summary>
        <label className={row}>
          <span className="text-hint">Chegirma, %</span>
          <NumIn v={Number(pr.discount) ? num(pr.discount, 2) : ""} ph="0" label="Chegirma, %" disabled={disabled} onSet={(v) => onPrice("discount", v)} />
          <span className={`${val} text-danger`}>{p.disc ? `−${num(p.disc, 0)}` : "—"}</span>
        </label>
        <label className={row}>
          <span className="text-hint">Ustama, %</span>
          <NumIn v={Number(pr.markup) ? num(pr.markup, 2) : ""} ph="0" label="Ustama, %" disabled={disabled} onSet={(v) => onPrice("markup", v)} />
          <span className={`${val} text-ok`}>{p.mark ? `+${num(p.mark, 0)}` : "—"}</span>
        </label>
        <label className={row}>
          <span className="text-hint">Logistika, so&apos;m</span>
          <NumIn v={Number(pr.logistics) ? num(pr.logistics, 0) : ""} ph="0" label="Logistika, so'm" disabled={disabled} onSet={(v) => onPrice("logistics", v)} />
          <span className={val}>{p.log ? `+${num(p.log, 0)}` : "—"}</span>
        </label>
      </details>
      <div className={`${row} mt-1 border-t border-sep pt-2`}>
        <span className="font-semibold">Jami</span>
        <span />
        <b className={`${val} text-[14.5px]`}>{num(p.total, 0)} so&apos;m</b>
      </div>
    </div>
  );
}


export function ItemsView({
  rows,
  closed,
  tot,
  pr,
  onPrice,
  busy,
  onAdd,
  onEdit,
  onRemove,
  onDoc,
  onSales,
}: {
  rows: DealItem[];
  closed: boolean;
  tot: number;
  pr: Pr;
  onPrice: (f: PriceField, v: string) => void;
  busy: boolean;
  onAdd: (r: DealItem) => void;
  onEdit: (i: number, f: ItemField, v: string) => void;
  onRemove: (i: number) => void;
  onDoc: (kind: "quote" | "order") => void;
  /** savdo moduli: bitimdan buyurtma (1C kabi hujjatlar zanjiri) — /app/erp/savdo */
  onSales?: () => void;
}) {
  return (
    <div className={BOX}>
      <h4 className={BOX_H}>
        Tovarlar <span>{rows.length || ""}</span>
      </h4>
      {closed ? null : (
        <ItemSearch
          className="mx-3 mt-2 mb-1"
          onAdd={onAdd}
          picked={new Set(rows.map(itemKey))}
          onRemove={(k) => {
            const i = rows.findIndex((r) => itemKey(r) === k);
            if (i >= 0) onRemove(i);
          }}
        />
      )}
      {rows.length ? (
        <>
          <ul className="m-0 mt-1 list-none p-0 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-sep [&_input]:bg-page [&_input]:h-8 [&_input]:px-2.5 [&_input]:py-0 [&_input]:text-right [&_input]:text-fg [&_input]:tabular-nums [&_input]:outline-none [&_input]:[font:inherit] [&_input:focus]:border-link [&_input:disabled]:border-transparent [&_input:disabled]:bg-transparent coarse:[&_input]:min-h-11">
            {rows.map((r, i) => (
              <li key={`${i}-${r.item_id ?? r.name}`} className="border-t border-sep px-3.5 py-2.5">
                <div className="flex items-start gap-2.5">
                  <span className={`mt-0.5 grid size-8 flex-none place-items-center rounded-lg [&_svg.i]:size-4 ${r.item_id ? "bg-link/12 text-link" : "bg-fill text-hint"}`} aria-hidden="true">
                    <Icon n="package" />
                  </span>
                  <div className="min-w-0 flex-1">
                    {r.item_id ? (
                      <div className="text-[14px] leading-snug font-medium break-words">{r.name}</div>
                    ) : (
                      <input className="!text-left !font-medium" defaultValue={r.name} aria-label="Nomi" disabled={closed} onBlur={(e) => e.target.value !== r.name && onEdit(i, "name", e.target.value)} />
                    )}
                    {r.item_id ? null : <div className="mt-0.5 text-xs text-warn">katalogdan tashqari — hujjatga kirmaydi</div>}
                  </div>
                  <b className="flex-none pt-0.5 text-[15px] whitespace-nowrap tabular-nums">{num(itemAmount(r), 0)}</b>
                  {closed ? null : (
                    <button type="button" className="-mt-0.5 -mr-1.5 grid min-h-8 min-w-8 flex-none cursor-pointer place-items-center rounded-lg border-0 bg-transparent p-1 text-hint hover:bg-fill hover:text-danger coarse:min-h-11 coarse:min-w-11" title="Olib tashlash" aria-label={`${r.name} — olib tashlash`} onClick={() => onRemove(i)}>
                      <Icon n="x" />
                    </button>
                  )}
                </div>
                <div className="mt-1.5 grid grid-cols-[minmax(0,4fr)_minmax(0,5fr)_minmax(0,3fr)] gap-2 pl-[42px] max-md:pl-0">
                  <label className="flex min-w-0 flex-col gap-1 text-[11.5px] text-hint">
                    Miqdor{r.unit ? `, ${r.unit}` : ""}
                    <NumIn v={num(r.qty, 3)} label="Miqdor" disabled={closed} onSet={(v) => onEdit(i, "qty", v)} />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1 text-[11.5px] text-hint">
                    Narx, so&apos;m
                    <NumIn v={num(r.price, 0)} label="Narx" disabled={closed} onSet={(v) => onEdit(i, "price", v)} />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1 text-[11.5px] text-hint">
                    Chegirma, %
                    <NumIn v={Number(r.discount) ? num(r.discount, 2) : ""} label="Chegirma" ph="0" disabled={closed} onSet={(v) => onEdit(i, "discount", v)} />
                  </label>
                </div>
              </li>
            ))}
          </ul>
          <div className="mx-3.5 mb-1 rounded-xl border border-sep bg-page/50 px-3 py-1.5 min-[700px]:ml-auto min-[700px]:max-w-[360px]">
            <PriceBox sub={tot} pr={pr} disabled={closed} onPrice={onPrice} />
          </div>
          {closed ? null : (
            <div className={`${BTNROW} justify-end max-md:[&_.b]:flex-[1_1_auto]`}>
              <button type="button" className="b" disabled={busy} onClick={() => onDoc("quote")}>
                <Icon n="file" /> Tijorat taklifi (PDF)
              </button>
              <button type="button" className="b pri" disabled={busy} onClick={() => onDoc("order")}>
                <Icon n="cart" /> Buyurtma tuzish
              </button>
              {onSales ? (
                <button type="button" className="b" disabled={busy} onClick={onSales}>
                  <Icon n="file-text" /> Savdo hujjati
                </button>
              ) : null}
            </div>
          )}
        </>
      ) : (
        <div className={DLR}>
          <span className={SMALL}>Tovar qo&apos;shilmagan. Tovar qo&apos;shilsa — bitim summasi avtomatik hisoblanadi va bir bosishda taklif yoki buyurtma tuziladi.</span>
        </div>
      )}
    </div>
  );
}

/** Son kiritish: o'zgarsa (blur/Enter) saqlanadi */
function NumIn({ v, label, ph, disabled, onSet }: { v: string; label: string; ph?: string; disabled?: boolean; onSet: (v: string) => void }) {
  return (
    <input
      key={v}
      defaultValue={v}
      placeholder={ph}
      aria-label={label}
      inputMode="decimal"
      disabled={disabled}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      onBlur={(e) => e.target.value !== v && onSet(e.target.value)}
    />
  );
}

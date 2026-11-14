// Bitimdagi tovarlar (faqat ko'rinish): qidiruv va natijalar ro'yxati, tovarlar jadvali (miqdor/narx/chegirma), jami,
// taklif (PDF) / buyurtma tugmalari.
import { num } from "@/erp/kit/fmt";
import { Icon } from "@/erp/kit/ui";
import { itemAmount, type DealItem, type ItemHit } from "@/erp/crm/lib";
import { BOX, BOX_H, BTNROW, DLR, SMALL, stk } from "@/erp/crm/tw";

export type ItemField = "name" | "qty" | "price" | "discount";

const TDN = "!text-right whitespace-nowrap tabular-nums";

export function ItemsView({
  rows,
  closed,
  q,
  shown,
  tot,
  busy,
  onQ,
  onAdd,
  onEdit,
  onRemove,
  onDoc,
}: {
  rows: DealItem[];
  closed: boolean;
  q: string;
  /** qidiruv natijalari (joriy so'rov uchun) */
  shown: { q: string; rs: ItemHit[] } | null;
  tot: number;
  busy: boolean;
  onQ: (v: string) => void;
  onAdd: (r: DealItem) => void;
  onEdit: (i: number, f: ItemField, v: string) => void;
  onRemove: (i: number) => void;
  onDoc: (kind: "quote" | "order") => void;
}) {
  return (
    <div className={BOX}>
      <h4 className={BOX_H}>
        Tovarlar <span>{rows.length || ""}</span>
      </h4>
      {closed ? null : (
        <div className="relative px-3 pt-2 pb-1 [&_.dd]:absolute [&_.dd]:inset-x-3 [&_.dd]:z-5 [&_.dd]:shadow-2 [&_.inp]:w-full">
          <input
            className="inp"
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder="Tovar qo'shish: nom, artikul, remen belgisi (masalan SPB 1650)"
            aria-label="Tovar qidirish"
            autoComplete="off"
          />
          {shown ? (
            <div className="dd">
              {shown.rs.map((x, i) => (
                <button
                  key={i}
                  type="button"
                  className="opt"
                  onClick={() =>
                    onAdd({
                      item_id: x.item_id,
                      char_id: x.char_id || null,
                      name: x.name + (x.char ? ` (${x.char})` : ""),
                      unit: x.unit,
                      qty: 1,
                      price: x.price || 0,
                      discount: 0,
                    })
                  }
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span>
                      {x.name}
                      {x.char ? <span className="s"> {x.char}</span> : null}
                    </span>
                    <span className="s" style={{ display: "block" }}>
                      {x.price != null ? num(x.price, 0) + " so'm" : "narx yo'q"} ·{" "}
                      <span className={stk(Number(x.free) > 0)}>
                        {Number(x.free) > 0 ? `erkin ${num(x.free, 3)} ${x.unit || ""}` : "omborda yo'q"}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
              {!shown.rs.length ? (
                <button type="button" className="opt" onClick={() => onAdd({ name: shown.q, qty: 1, price: 0, discount: 0 })}>
                  <span className="s">Katalogda topilmadi — «{shown.q}» ni katalogdan tashqari qator sifatida qo&apos;shish</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      {rows.length ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[13.5px] [&_th]:border-b [&_th]:border-sep [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:text-hint [&_td]:border-b [&_td]:border-sep [&_td]:px-1.5 [&_td]:py-1 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-transparent [&_input]:bg-transparent [&_input]:px-1.5 [&_input]:py-1 [&_input]:text-right [&_input]:text-fg [&_input]:tabular-nums [&_input]:outline-none [&_input]:[font:inherit] [&_input:hover]:border-sep [&_input:focus]:border-link [&_input:focus]:bg-page coarse:[&_input]:min-h-10">
              <thead>
                <tr>
                  <th>Tovar</th>
                  <th className={TDN}>Miqdor</th>
                  <th className={TDN}>Narx</th>
                  <th className={TDN}>Chegirma %</th>
                  <th className={TDN}>Summa</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${i}-${r.item_id ?? r.name}`}>
                    <td>
                      {r.item_id ? (
                        r.name
                      ) : (
                        <input className="!text-left" defaultValue={r.name} aria-label="Nomi" disabled={closed} onBlur={(e) => e.target.value !== r.name && onEdit(i, "name", e.target.value)} />
                      )}
                      {r.item_id ? null : <div className={stk(null)}>katalogdan tashqari — hujjatga kirmaydi</div>}
                    </td>
                    <td className={TDN} style={{ width: 110 }}>
                      <NumIn v={num(r.qty, 3)} label="Miqdor" disabled={closed} onSet={(v) => onEdit(i, "qty", v)} />
                      <div className={stk(null)}>{r.unit || ""}</div>
                    </td>
                    <td className={TDN} style={{ width: 130 }}>
                      <NumIn v={num(r.price, 0)} label="Narx" disabled={closed} onSet={(v) => onEdit(i, "price", v)} />
                    </td>
                    <td className={TDN} style={{ width: 90 }}>
                      <NumIn v={Number(r.discount) ? num(r.discount, 2) : ""} label="Chegirma" ph="0" disabled={closed} onSet={(v) => onEdit(i, "discount", v)} />
                    </td>
                    <td className={TDN} style={{ width: 120 }}>
                      <b>{num(itemAmount(r), 0)}</b>
                    </td>
                    <td style={{ width: 36 }}>
                      {closed ? null : (
                        <button type="button" className="grid min-h-8 min-w-8 cursor-pointer place-items-center border-0 bg-transparent p-1 text-hint hover:text-danger coarse:min-h-11 coarse:min-w-11" title="Olib tashlash" aria-label="Olib tashlash" onClick={() => onRemove(i)}>
                          <Icon n="x" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-baseline justify-end gap-[18px] px-3.5 py-2 text-[13px] text-hint max-md:justify-between [&_b]:text-[15px] [&_b]:text-fg">
            Jami (QQS bilan): <b className="num">{num(tot, 0)} so&apos;m</b>
          </div>
          {closed ? null : (
            <div className={`${BTNROW} justify-end max-md:[&_.b]:flex-[1_1_auto]`}>
              <button type="button" className="b" disabled={busy} onClick={() => onDoc("quote")}>
                <Icon n="file" /> Tijorat taklifi (PDF)
              </button>
              <button type="button" className="b pri" disabled={busy} onClick={() => onDoc("order")}>
                <Icon n="cart" /> Buyurtma tuzish
              </button>
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

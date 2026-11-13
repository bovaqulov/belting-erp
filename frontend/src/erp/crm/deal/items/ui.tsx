// Bitimdagi tovarlar (faqat ko'rinish): qidiruv va natijalar ro'yxati, tovarlar jadvali (miqdor/narx/chegirma), jami,
// taklif (PDF) / buyurtma tugmalari.
import { num } from "@/erp/kit/fmt";
import { Icon } from "@/erp/kit/ui";
import { itemAmount, type DealItem, type ItemHit } from "@/erp/crm/lib";

export type ItemField = "name" | "qty" | "price" | "discount";

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
    <div className="box">
      <h4>
        Tovarlar <span>{rows.length || ""}</span>
      </h4>
      {closed ? null : (
        <div className="isr">
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
                      <span className={`stk ${Number(x.free) > 0 ? "ok" : "no"}`}>
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
          <div className="itw">
            <table className="itb">
              <thead>
                <tr>
                  <th>Tovar</th>
                  <th className="n">Miqdor</th>
                  <th className="n">Narx</th>
                  <th className="n">Chegirma %</th>
                  <th className="n">Summa</th>
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
                        <input className="nm" defaultValue={r.name} aria-label="Nomi" disabled={closed} onBlur={(e) => e.target.value !== r.name && onEdit(i, "name", e.target.value)} />
                      )}
                      {r.item_id ? null : <div className="stk">katalogdan tashqari — hujjatga kirmaydi</div>}
                    </td>
                    <td className="n" style={{ width: 110 }}>
                      <NumIn v={num(r.qty, 3)} label="Miqdor" disabled={closed} onSet={(v) => onEdit(i, "qty", v)} />
                      <div className="stk">{r.unit || ""}</div>
                    </td>
                    <td className="n" style={{ width: 130 }}>
                      <NumIn v={num(r.price, 0)} label="Narx" disabled={closed} onSet={(v) => onEdit(i, "price", v)} />
                    </td>
                    <td className="n" style={{ width: 90 }}>
                      <NumIn v={Number(r.discount) ? num(r.discount, 2) : ""} label="Chegirma" ph="0" disabled={closed} onSet={(v) => onEdit(i, "discount", v)} />
                    </td>
                    <td className="n num" style={{ width: 120 }}>
                      <b>{num(itemAmount(r), 0)}</b>
                    </td>
                    <td style={{ width: 36 }}>
                      {closed ? null : (
                        <button type="button" className="del" title="Olib tashlash" aria-label="Olib tashlash" onClick={() => onRemove(i)}>
                          <Icon n="x" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="itot">
            Jami (QQS bilan): <b className="num">{num(tot, 0)} so&apos;m</b>
          </div>
          {closed ? null : (
            <div className="btnrow end">
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
        <div className="dlr static">
          <span className="s">Tovar qo&apos;shilmagan. Tovar qo&apos;shilsa — bitim summasi avtomatik hisoblanadi va bir bosishda taklif yoki buyurtma tuziladi.</span>
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

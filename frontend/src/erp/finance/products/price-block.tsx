// Tovar oynasidagi narx bloki (narx siyosati): manba — AppSheet (bog'langan qator: belgi, kelib chiqishi, yangilangan
// vaqt) yoki qo'lda; narxlar QQSsiz va QQS bilan (variant / eni bo'yicha); rukav — ixtiyoriy eni uchun hisob (formula
// ko'rinmaydi); rahbariyatga — tannarx, marja, birlik tannarxi. Qo'lda narx — PriceForm (price.tsx).
import { useState } from "react";

import { toast } from "@/erp/kit/env";
import { dt, num } from "@/erp/kit/fmt";
import { LINK_BTN } from "@/erp/kit/layout";
import { List, Row, Sf, Sh } from "@/erp/kit/ui";
import { api, post } from "@/erp/finance/api";
import { emptyPrice, priceFor, priceLabel, type Item } from "@/erp/finance/lib";

const so = (v: number) => num(v, 0);
type Q = { price: number; price_vat: number };

function Quote({ id, def }: { id: number; def: number }) {
  const [w, setW] = useState("");
  const [r, setR] = useState<Q | null>(null);
  const go = async () => {
    try {
      const x = await api<Q | null>(`/app/api/erp/cat/items/${id}/quote?width=${encodeURIComponent(w)}`);
      if (!x) toast("Bu eni uchun narx hisoblanmadi", "bad");
      setR(x);
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  return (
    <div className="field">
      <label htmlFor="pq-w">Boshqa eni, mm</label>
      <input
        id="pq-w"
        inputMode="decimal"
        value={w}
        placeholder={String(def)}
        onChange={(e) => {
          setW(e.target.value);
          setR(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void go();
        }}
      />
      {r ? (
        <span className="num flex-none text-right">
          {so(r.price)}
          <small className="block text-xs text-hint">QQS bilan {so(r.price_vat)}</small>
        </span>
      ) : (
        <button type="button" className={`${LINK_BTN} flex-none`} disabled={!w} onClick={() => void go()}>
          Hisoblash
        </button>
      )}
    </div>
  );
}

export function PriceBlock({ it, onManual, onChanged }: { it: Item; onManual: () => void; onChanged: () => void }) {
  const pr = it.pricing;
  const ln = pr?.linked ?? null;
  const toAppsheet = async () => {
    try {
      await post(`/app/api/erp/cat/items/${it.id}/price`, { ...(it.price ?? emptyPrice()), source: "appsheet" });
      toast("Narx — AppSheet'dan");
      onChanged();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  const head = (
    <Sh
      t="Narx"
      r={
        <button type="button" className={LINK_BTN} onClick={onManual}>
          Qo&apos;lda belgilash
        </button>
      }
    />
  );
  if (pr && ln && pr.source === "appsheet")
    return (
      <>
        {head}
        <List>
          <Row
            icon="coins"
            color="green"
            t={
              <>
                AppSheet: <span className="code">{ln.mark}</span>
              </>
            }
            s={[ln.name, ln.origin, `yangilangan ${dt(ln.synced)}`].filter(Boolean).join(" · ")}
          />
          {pr.rows.map((r) => (
            <Row
              key={r.label}
              t={r.width !== null ? <span className="code">{r.label}</span> : r.label}
              val={<span className="num">{so(r.price)}</span>}
              valSmall={`QQS bilan ${so(r.price_vat)}`}
            />
          ))}
          {ln.mode === "width" && !ln.note ? <Quote id={it.id} def={pr.rows[0]?.width ?? 10} /> : null}
          {ln.lens ? (
            <Row
              t="Uzunliklar (AppSheet)"
              val={Object.entries(ln.lens)
                .map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)} ${num(v, 0)}`)
                .join(" · ")}
            />
          ) : null}
        </List>
        {ln.note ? (
          <Sf>
            <span className="text-st-work">{ln.note}</span>
          </Sf>
        ) : null}
        {!pr.rows.length && !ln.note ? (
          <Sf>{ln.mode === "ribs" ? "Qovurg'a soni kiritilmagan — «Tahrirlash»da qo'shing." : "Eni noma'lum — variant (kenglik) qo'shing yoki «Boshqa eni» bilan hisoblang."}</Sf>
        ) : null}
        {ln.cost ? (
          <>
            <Sh t="Tannarx (faqat rahbariyat)" />
            <List>
              {ln.cost.net ? (
                <Row t="Tannarx" val={<span className="num">{so(ln.cost.net)}</span>} valSmall={ln.mode === "fixed" ? "so'm" : "so'm (AppSheet namunasi)"} />
              ) : null}
              <Row t="Marja" val={`${num(ln.cost.margin, 2)}%`} />
              {ln.cost.cost_unit ? (
                <Row t={`Tannarx, ${ln.cost.unit ?? ""}`} val={`$${num(ln.cost.cost_unit, 4)}`} valSmall={`kurs ${so(ln.cost.rate)} · +${so(ln.cost.fixed)}`} />
              ) : null}
            </List>
          </>
        ) : null}
        <Sf>Narxlar QQSsiz, QQS {num(pr.vat_pct, 0)}%. Qo&apos;lda narx qo&apos;yilsa — u ishlatiladi (AppSheet&apos;ga qaytarish mumkin).</Sf>
      </>
    );
  return (
    <>
      {head}
      <List>
        <Row
          icon="coins"
          color={it.price?.price != null || Object.keys(it.price?.overrides ?? {}).length ? "green" : "gray"}
          t={priceLabel(it.price, (x) => num(x, 0), it.unit)}
          s={pr?.source === "manual" ? "qo'lda" : undefined}
          tap
          onClick={onManual}
          chev
        />
        {it.chars.map((c) => {
          const v = priceFor(it.price, c.width_mm);
          const manual = c.width_mm !== null && it.price?.overrides[String(c.width_mm)] !== undefined;
          return (
            <Row
              key={c.id}
              t={<span className="code">{c.name}</span>}
              val={v === null ? "—" : <span className="num">{so(v)}</span>}
              valSmall={v === null ? "" : manual ? "so'm · qo'lda" : "so'm"}
            />
          );
        })}
      </List>
      {ln ? (
        <Sf>
          AppSheet&apos;da narxi bor (<span className="code">{ln.mark}</span>
          {ln.price ? ` — ${so(ln.price)} so'm` : ""}), hozir qo&apos;lda narx ishlatilyapti.{" "}
          <button type="button" className={LINK_BTN} onClick={() => void toAppsheet()}>
            AppSheet narxiga qaytish
          </button>
        </Sf>
      ) : it.chars.length ? null : (
        <Sf>Kengligi (varianti) yo&apos;q tovar — bitta narx. AppSheet&apos;da shu belgi va brend topilmadi.</Sf>
      )}
    </>
  );
}

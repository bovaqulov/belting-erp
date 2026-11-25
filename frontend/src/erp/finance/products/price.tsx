// Narx formasi: turi (dona / 1 mm), narx, qadam (mm — kenglik yuqoriga yaxlitlanadi: qadam 5 → 6–10 mm bir xil narx),
// kengliklar ro'yxati: hisoblangan narx ko'rinadi, qo'lda narx kiritish mumkin; bir nechtasini tanlab bitta narx qo'yish.
// Dastlabki versiya (egasi: "yozib ket, keyin optimallashtiramiz").
import { useState } from "react";

import { toast } from "@/erp/kit/env";
import { num } from "@/erp/kit/fmt";
import { Check, List, Row, Sf, Sh, Sheet } from "@/erp/kit/ui";
import { post } from "@/erp/finance/api";
import { emptyPrice, PRICE_MODE, priceFor, type Item, type Price, type PriceMode } from "@/erp/finance/lib";

const n = (v: string): number | null => {
  const s = v.replace(/\s/g, "").replace(",", ".");
  return s === "" || !Number.isFinite(Number(s)) ? null : Number(s);
};

export function PriceForm({ it, onClose, onSaved }: { it: Item; onClose: () => void; onSaved: () => void }) {
  const p0 = it.price ?? emptyPrice();
  const widths = it.chars.map((c) => c.width_mm).filter((w): w is number => w !== null);
  const [mode, setMode] = useState<PriceMode>(p0.mode);
  const [price, setPrice] = useState(p0.price === null ? "" : String(p0.price));
  const [step, setStep] = useState(p0.step_mm === null ? "" : String(p0.step_mm));
  const [ov, setOv] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(p0.overrides).map(([w, v]) => [w, String(v)])));
  const [sel, setSel] = useState<number[]>([]);
  const [bulk, setBulk] = useState("");

  const calc: Price = { mode, price: n(price), step_mm: mode === "mm" ? n(step) : null, overrides: {} };
  const applyBulk = () => {
    if (!sel.length) return toast("Kenglik tanlanmagan", "bad");
    if (n(bulk) === null) return toast("Narx kiriting", "bad");
    setOv((o) => ({ ...o, ...Object.fromEntries(sel.map((w) => [String(w), bulk])) }));
    setSel([]);
    setBulk("");
  };

  return (
    <Sheet
      title="Narx"
      done="Saqlash"
      onClose={onClose}
      onDone={async () => {
        // qo'lda saqlangan narx — AppSheet narxidan ustun (oynada «AppSheet narxiga qaytish»)
        await post(`/app/api/erp/cat/items/${it.id}/price`, { mode, price, step_mm: step, overrides: ov, source: "manual" });
        toast("Narx saqlandi");
        onSaved();
        return false;
      }}
    >
      <List>
        <Row t={it.name} tcls="wrap2" s={widths.length ? `${widths.length} ta kenglik` : "kengliksiz"} />
        <div className="field">
          <label htmlFor="acc-pm">Turi</label>
          <select id="acc-pm" value={mode} onChange={(e) => setMode(e.target.value as PriceMode)}>
            {(Object.keys(PRICE_MODE) as PriceMode[]).map((k) => (
              <option key={k} value={k}>
                {PRICE_MODE[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="acc-pp">{mode === "mm" ? "1 mm narxi, so'm" : "Narx, so'm"}</label>
          <input id="acc-pp" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
        </div>
        {mode === "mm" ? (
          <div className="field">
            <label htmlFor="acc-ps">Qadam, mm</label>
            <input id="acc-ps" inputMode="decimal" value={step} onChange={(e) => setStep(e.target.value)} placeholder="yo'q" />
          </div>
        ) : null}
      </List>
      <Sf>
        {mode === "mm"
          ? "Narx = 1 mm narxi × kenglik. Qadam berilsa kenglik yuqoriga yaxlitlanadi: qadam 5 → 6–10 mm hammasi 10 mm narxida."
          : "Hamma kenglik bir xil narxda (qo'lda kiritilganlaridan tashqari)."}
      </Sf>
      {widths.length ? (
        <>
          <Sh t="Kengliklar" r="bo'sh — hisob bo'yicha" />
          <List>
            {widths.map((w) => {
              const auto = priceFor(calc, w);
              const on = sel.includes(w);
              return (
                <div key={w} className="field [&_input]:!text-right [&_label]:!min-w-[70px]">
                  <button type="button" className="grid size-8 flex-none cursor-pointer place-items-center border-0 bg-transparent p-0 coarse:size-11" role="checkbox" aria-checked={on} aria-label={`${w} mm tanlash`} onClick={() => setSel((s) => (on ? s.filter((x) => x !== w) : [...s, w]))}>
                    <Check on={on} />
                  </button>
                  <label htmlFor={`acc-pw${w}`} className="code">
                    {num(w)} mm
                  </label>
                  <input
                    id={`acc-pw${w}`}
                    inputMode="decimal"
                    value={ov[String(w)] ?? ""}
                    onChange={(e) => setOv((o) => ({ ...o, [String(w)]: e.target.value }))}
                    placeholder={auto === null ? "—" : num(auto, 0)}
                  />
                </div>
              );
            })}
          </List>
          <List style={{ marginTop: 8 }}>
            <div className="field">
              <label htmlFor="acc-pb">Tanlanganlarga ({sel.length})</label>
              <input id="acc-pb" inputMode="decimal" value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="bir xil narx" />
            </div>
            <Row t="Bir xil narx qo'yish" tcls="link" tap onClick={applyBulk} />
          </List>
          <Sf>Kenglikni belgilab, bir xil narx qo&apos;ying (masalan 10 va 15 mm). Kiritilgan narx hisobdan ustun turadi; o&apos;chirsangiz — yana hisob bo&apos;yicha.</Sf>
        </>
      ) : null}
    </Sheet>
  );
}

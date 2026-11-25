"use client";
// Tovar qidiruvi (katalog, 250ms kechikish; eski javob yangisining ustiga yozilmaydi) — bitim kartochkasi va yangi bitim
// oynasi uchun umumiy. Ko'p tanlov: ro'yxat ochiq qoladi, har bosish ✓ qo'shadi / olib tashlaydi; «Tayyor» yoki Esc — yopish.
// Tanlanganda — DealItem (miqdor 1, katalog narxi); topilmasa — katalogdan tashqari qator.
import { useEffect, useRef, useState } from "react";

import { num } from "@/erp/kit/fmt";
import { api } from "@/erp/crm/api";
import type { DealItem, ItemHit } from "@/erp/crm/lib";
import { stk } from "@/erp/crm/tw";

/** qator kaliti: katalog — tovar + xususiyat, katalogdan tashqari — nom */
export const itemKey = (r: Pick<DealItem, "item_id" | "char_id" | "name">): string => (r.item_id ? `${r.item_id}:${r.char_id || 0}` : `n:${r.name.trim().toLowerCase()}`);

const toItem = (x: ItemHit): DealItem => ({
  item_id: x.item_id,
  char_id: x.char_id || null,
  name: x.name + (x.char ? ` (${x.char})` : ""),
  unit: x.unit,
  qty: 1,
  price: x.price || 0,
  discount: 0,
});

export function ItemSearch({
  onAdd,
  onRemove,
  picked,
  id,
  className = "",
}: {
  onAdd: (r: DealItem) => void;
  /** ko'p tanlov: belgilangani qayta bosilsa — olib tashlash */
  onRemove?: (key: string) => void;
  /** allaqachon qo'shilgan qatorlar kalitlari (itemKey) */
  picked?: Set<string>;
  id?: string;
  className?: string;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ q: string; rs: ItemHit[] } | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const v = q.trim();
    if (v.length < 2) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const rs = await api<ItemHit[]>(`/app/api/erp/crm/items?q=${encodeURIComponent(v)}`).catch(() => [] as ItemHit[]);
      if (n === seq.current) setHits({ q: v, rs: Array.isArray(rs) ? rs : [] });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const shown = q.trim().length >= 2 && hits?.q === q.trim() ? hits : null;
  const close = () => {
    setQ("");
    setHits(null);
  };
  const toggle = (r: DealItem) => {
    const k = itemKey(r);
    if (picked?.has(k)) onRemove?.(k);
    else onAdd(r);
  };
  const n = shown ? shown.rs.filter((x) => picked?.has(itemKey(toItem(x)))).length : 0;

  return (
    <div
      className={`relative [&_.dd]:absolute [&_.dd]:inset-x-0 [&_.dd]:z-5 [&_.dd]:shadow-2 [&_.inp]:w-full ${className}`}
      onKeyDown={(e) => {
        // Escape — tavsiyalar yopiladi (fokus maydonda ham, ro'yxat tugmasida ham), oyna emas
        if (e.key === "Escape" && (q || shown)) {
          e.stopPropagation();
          e.preventDefault();
          close();
        }
      }}
    >
      <input
        id={id}
        className="inp"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Tovar qo'shish: nom, artikul, remen belgisi (masalan SPB 1650)"
        aria-label={id ? undefined : "Tovar qidirish"}
        autoComplete="off"
      />
      {shown ? (
        <div className="dd">
          {shown.rs.map((x, i) => {
            const on = !!picked?.has(itemKey(toItem(x)));
            return (
            <button key={i} type="button" className="opt" aria-pressed={on} onClick={() => toggle(toItem(x))}>
              <span
                aria-hidden="true"
                className={`grid size-5 flex-none place-items-center rounded-md border text-[12px] leading-none font-bold ${on ? "border-btn bg-btn text-btn-fg" : "border-sep text-transparent"}`}
              >
                ✓
              </span>
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
            );
          })}
          {!shown.rs.length ? (
            <button
              type="button"
              className="opt"
              onClick={() => {
                toggle({ name: shown.q, qty: 1, price: 0, discount: 0 });
                close();
              }}
            >
              <span className="s">Katalogda topilmadi — «{shown.q}» ni katalogdan tashqari qator sifatida qo&apos;shish</span>
            </button>
          ) : null}
          {shown.rs.length ? (
            <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-sep bg-sec px-3 py-1.5 text-xs text-hint">
              <span>{n ? `${n} ta belgilandi — yana tanlang yoki qidiring` : "Bir nechtasini belgilash mumkin"}</span>
              <button type="button" className="b pri h-8 px-3 text-[13px] coarse:h-11" onClick={close}>
                Tayyor
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

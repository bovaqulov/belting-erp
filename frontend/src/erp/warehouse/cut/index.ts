// Birlikdan bo'lak kesish: o'lcham so'raladi, kesish hujjati yaratiladi va o'tkaziladi. Natija: hujjat raqami,
// birinchi bo'lak, uning miqdori, yangi stikerlar (bo'laklar + qoldiqlar), chiqindi. Bekor — null; API xatosi — throw.
import { useCallback } from "react";

import { beep } from "@/erp/kit/env";
import { num, un } from "@/erp/kit/fmt";
import { post } from "@/erp/warehouse/api";
import { useWh, type SizePre } from "@/erp/warehouse/context";
import { size, type CutRes, type Doc, type ScanUnit } from "@/erp/warehouse/lib";

export type Cut = { number: string; piece: number; qty: number; ids: number[]; scrap: number };

export function useCutUnit(): (u: ScanUnit, pre?: SizePre) => Promise<Cut | null> {
  const { askSize } = useWh();
  return useCallback(
    async (u, pre = {}) => {
      const st = u.stock[0];
      if (!st || !u.dims) throw new Error("Birlik omborda emas");
      const total = u.stock.reduce((a, s) => a + Number(s.qty), 0);
      const r = await askSize(`Kesish · ${u.code}`, u.dims, u.unit, {
        ...pre,
        done: "Kesish",
        hint:
          u.dims === "wl"
            ? `Rulon: ${size(u)}. Avval eni bo'yicha, keyin uzunlik bo'yicha kesiladi; qolgan qismlar yangi stiker oladi.`
            : `Bor: ${num(total, 3)} ${un(u.unit)}`,
      });
      if (!r) return null;
      const line = u.dims === "wl" ? { batch_id: u.id, item_id: u.item_id, qty: "0", data: { width_mm: r.w, length_mm: r.l } } : { batch_id: u.id, item_id: u.item_id, qty: String(r.q) };
      const d = await post<Doc>("/app/api/erp/docs", { kind: "cut", firm: st.firm, header: { warehouse_id: st.warehouse_id }, lines: [line] });
      const p = await post<Doc>(`/app/api/erp/docs/${d.id}/post`, { version: d.version });
      const res = p.lines[0].data as unknown as CutRes;
      beep(true);
      return { number: p.number ?? "", piece: res.pieces[0], qty: Number(p.lines[0].qty), ids: [...res.pieces, ...(res.rests ?? [])], scrap: res.scrap ?? 0 };
    },
    [askSize],
  );
}

"use client";
// Bitimdagi tovarlar: katalogdan qidirish (search.tsx), qo'shish/tahrirlash/olib tashlash — saqlash butun ro'yxat
// bilan (POST .../items); bir bosishda tijorat taklifi (PDF) yoki buyurtma qoralamasi.
import { useRouter } from "next/navigation";
import { useState } from "react";

import { post as realPost, toast } from "@/erp/kit/env";
import { dnum } from "@/erp/kit/fmt";
import { post } from "@/erp/crm/api";
import { itemAmount, type DealDetail, type DealItem } from "@/erp/crm/lib";
import { canModule, useErpModules } from "@/shared/auth/erp-access";

import { ItemsView, type ItemField, type PriceField } from "./ui";

export { PriceBox, type PriceField } from "./ui";

export function Items({
  d,
  closed,
  onSaved,
  onDoc,
}: {
  d: DealDetail;
  closed: boolean;
  onSaved: (amount?: string) => void;
  /** yaratilgan hujjatni ochish */
  onDoc: (id: number) => void;
}) {
  const [rows, setRows] = useState<DealItem[]>(() => (d.items || []).map((x) => ({ ...x })));
  const [busy, setBusy] = useState(false);
  const save = async (next: DealItem[]) => {
    setRows(next);
    try {
      const r = await post<{ items: DealItem[]; amount: string }>(`/app/api/erp/crm/deals/${d.id}/items`, {
        items: next.map((x) => ({
          item_id: x.item_id,
          char_id: x.char_id,
          name: x.name,
          unit: x.unit,
          qty: dnum(String(x.qty ?? "")),
          price: dnum(String(x.price ?? "")),
          discount: dnum(String(x.discount || 0)),
        })),
      });
      setRows(r.items.map((x) => ({ ...x })));
      onSaved(r.amount);
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  const edit = (i: number, f: ItemField, v: string) => {
    const next = rows.map((r, j) => (j === i ? { ...r, [f]: f === "name" ? v : dnum(v) || 0 } : r));
    void save(next);
  };
  const add = (r: DealItem) => void save([...rows, r]);
  // narxlash (chegirma %, ustama %, logistika) — bitim maydoni; summa backend'da qayta hisoblanadi
  const price = async (f: PriceField, v: string) => {
    try {
      const r = await post<{ amount: string }>(`/app/api/erp/crm/deals/${d.id}`, { [f]: dnum(v) || 0 });
      onSaved(r.amount);
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  const router = useRouter();
  const mods = useErpModules();
  const canSales = mods !== null && canModule(mods, "sales");
  const mk = async (kind: "quote" | "order") => {
    setBusy(true);
    try {
      const doc = await post<{ id: number; number?: string }>(`/app/api/erp/crm/deals/${d.id}/doc`, { kind });
      toast(kind === "quote" ? `Taklif ${doc.number ?? ""} tayyor` : "Buyurtma qoralamasi tuzildi — tekshirib tasdiqlang");
      onDoc(doc.id);
      onSaved();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };

  // Savdo moduli: bitim tovarlari va mijozi bilan buyurtma (narx QQS bilan) → hujjat formasida ochiladi
  const toSales = async () => {
    setBusy(true);
    try {
      const doc = await realPost<{ id: number; number: string }>("/app/api/erp/sales/from-deal", { deal_id: d.id });
      toast(`Buyurtma ${doc.number} yaratildi`);
      router.push(`/erp/savdo/?doc=${doc.id}`); // basePath /app — Next o'zi qo'shadi
    } catch (e) {
      toast((e as Error).message, "bad");
      setBusy(false);
    }
  };

  return (
    <ItemsView
      rows={rows}
      closed={closed}
      tot={rows.reduce((a, r) => a + itemAmount(r), 0)}
      pr={{ discount: d.discount, markup: d.markup, logistics: d.logistics }}
      onPrice={(f, v) => void price(f, v)}
      busy={busy}
      onAdd={add}
      onEdit={edit}
      onRemove={(i) => void save(rows.filter((_, j) => j !== i))}
      onDoc={(k) => void mk(k)}
      onSales={canSales ? () => void toSales() : undefined}
    />
  );
}

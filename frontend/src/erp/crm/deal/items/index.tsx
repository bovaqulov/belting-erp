"use client";
// Bitimdagi tovarlar: katalogdan qidirish (250ms kechikish), qo'shish/tahrirlash/olib tashlash — saqlash butun ro'yxat
// bilan (POST .../items); bir bosishda tijorat taklifi (PDF) yoki buyurtma qoralamasi.
import { useEffect, useRef, useState } from "react";

import { toast } from "@/erp/kit/env";
import { dnum } from "@/erp/kit/fmt";
import { openBlob } from "@/shared/api/client";
import { api, blob, post } from "@/erp/crm/api";
import { itemAmount, type DealDetail, type DealItem, type ItemHit } from "@/erp/crm/lib";

import { ItemsView, type ItemField } from "./ui";

export async function openPdf(docId: number): Promise<void> {
  try {
    openBlob(await blob(`/app/api/erp/crm/docs/${docId}/pdf`), `hujjat_${docId}.pdf`);
  } catch (e) {
    toast((e as Error).message, "bad");
  }
}

export function Items({ d, closed, onSaved }: { d: DealDetail; closed: boolean; onSaved: (amount?: string) => void }) {
  const [rows, setRows] = useState<DealItem[]>(() => (d.items || []).map((x) => ({ ...x })));
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ q: string; rs: ItemHit[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  // qidiruv (debounce 250ms); eski javob yangisining ustiga yozilmaydi
  useEffect(() => {
    const v = q.trim();
    if (v.length < 2) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const rs = await api<ItemHit[]>(`/app/api/erp/crm/items?q=${encodeURIComponent(v)}`).catch(() => [] as ItemHit[]);
      if (id === seq.current) setHits({ q: v, rs: Array.isArray(rs) ? rs : [] });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const shown = q.trim().length >= 2 && hits?.q === q.trim() ? hits : null;

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
  const add = (r: DealItem) => {
    setQ("");
    setHits(null);
    void save([...rows, r]);
  };
  const mk = async (kind: "quote" | "order") => {
    setBusy(true);
    try {
      const doc = await post<{ id: number; number?: string }>(`/app/api/erp/crm/deals/${d.id}/doc`, { kind });
      if (kind === "quote") {
        toast(`Taklif ${doc.number ?? ""} tayyor`);
        void openPdf(doc.id);
      } else {
        toast("Buyurtma qoralamasi tuzildi — tekshirib tasdiqlang");
        window.open(`/app/erp/savdo?mobile=1&deal=${d.id}&doc=${doc.id}`, "_blank");
      }
      onSaved();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ItemsView
      rows={rows}
      closed={closed}
      q={q}
      shown={shown}
      tot={rows.reduce((a, r) => a + itemAmount(r), 0)}
      busy={busy}
      onQ={setQ}
      onAdd={add}
      onEdit={edit}
      onRemove={(i) => void save(rows.filter((_, j) => j !== i))}
      onDoc={(k) => void mk(k)}
    />
  );
}

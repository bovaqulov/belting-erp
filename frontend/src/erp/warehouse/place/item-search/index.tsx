"use client";
// Katalogdan tovar qidirish oynasi: nom yoki belgi (1040 8M, SPB 1650), 250 ms kechikish bilan; tanlansa — onPick(id).
import { useEffect, useState } from "react";

import { useLoad } from "@/erp/kit/ui";
import { api } from "@/erp/warehouse/api";
import type { CatHit } from "@/erp/warehouse/lib";

import { ItemSearchView } from "./ui";

export function ItemSearch({ q0, onPick, onClose }: { q0: string; onPick: (id: number) => void; onClose: () => void }) {
  const [q, setQ] = useState(q0);
  const [dq, setDq] = useState(q0.trim());
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const st = useLoad(() => api<CatHit[]>(`/app/api/erp/cat/items?q=${encodeURIComponent(dq)}`), [dq]);
  return <ItemSearchView q={q} dq={dq} st={st} onQ={setQ} onPick={onPick} onClose={onClose} />;
}

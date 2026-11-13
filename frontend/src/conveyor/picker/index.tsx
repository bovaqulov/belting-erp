"use client";
// Tanlash oynasi (qidiruvli): katalog/enum ro'yxati (ochilgandagi), tanlansa — maydonga yoziladi va oyna yopiladi.
// Telegram'dan tashqarida qidiruvga fokus.
import { useEffect, useRef, useState } from "react";

import { filterItems, itemsFor } from "@/conveyor/lib/logic";
import type { LentaState } from "@/conveyor/lib/types";
import { useLenta, type Lenta } from "@/conveyor/model";
import { initData } from "@/shared/telegram/telegram";

import { PickerView } from "./ui";

function Picker({ k }: { k: string }) {
  const L = useLenta();
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const [items] = useState(() => itemsFor(k, L.CAT!, L.EN!));
  useEffect(() => {
    if (!initData()) ref.current?.focus();
  }, []);
  return (
    <PickerView
      t={L.t}
      q={q}
      qRef={ref}
      items={filterItems(items, q)}
      cur={(L.S as LentaState)[k]}
      onQ={setQ}
      onPick={(name) => {
        L.onField(k, name);
        L.closeSheet();
      }}
    />
  );
}

export const openPicker = (L: Lenta, k: string) => L.openSheet(() => <Picker k={k} />);

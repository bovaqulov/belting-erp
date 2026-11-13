// Kanaldan yangilash qatori — Ozon/Uzum taxtasi va WB uchun umumiy.
import { useState } from "react";

import { toast } from "@/erp/kit/env";
import { List, Row } from "@/erp/kit/ui";
import { P, post } from "@/erp/marketplace/api";
import { useMk } from "@/erp/marketplace/context";
import { CHN, type OrderCh } from "@/erp/marketplace/lib";

/** Kanaldan yangilash qatori (oxirgi 30 kun; serverda avtomatik — har 10 daqiqada) */
export function SyncRow({ ch, onDone }: { ch: OrderCh; onDone: () => void }) {
  const { touched } = useMk();
  const [busy, setBusy] = useState(false);
  return (
    <List>
      <Row
        icon="refresh"
        color="blue"
        t={busy ? "Yangilanmoqda…" : `${CHN[ch]}'dan yangilash`}
        s="Oxirgi 30 kun; avtomatik — har 10 daqiqada"
        tap
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          try {
            const r = await post<{ new: number; updated: number; imported: number }>(`${P}/orders/${ch}/sync`);
            toast(`Yangi ${r.new}, yangilandi ${r.updated}, ERP'ga ${r.imported}`);
            touched();
            onDone();
          } catch (e) {
            toast((e as Error).message, "bad");
          } finally {
            setBusy(false);
          }
        }}
      />
    </List>
  );
}


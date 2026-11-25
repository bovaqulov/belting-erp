// /app/erp/pul — Pul (kassa, bank, kirim/chiqim, pul oqimi). Mantiq: src/erp/money/.
import type { Metadata } from "next";

import { ModuleGate } from "@/erp/kit/gate";
import MoneyApp from "@/erp/money";

export const metadata: Metadata = { title: "Pul" };

export default function MoneyPage() {
  return (
    <ModuleGate module="money">
      <MoneyApp />
    </ModuleGate>
  );
}

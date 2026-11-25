// /app/erp/savdo — Savdo hujjatlari (buyurtma, hisob, yuk xati, schyot-faktura, to'lov). Mantiq: src/erp/sales/.
import type { Metadata } from "next";

import { ModuleGate } from "@/erp/kit/gate";
import SalesApp from "@/erp/sales";

export const metadata: Metadata = { title: "Savdo" };

export default function SalesPage() {
  return (
    <ModuleGate module="sales">
      <SalesApp />
    </ModuleGate>
  );
}

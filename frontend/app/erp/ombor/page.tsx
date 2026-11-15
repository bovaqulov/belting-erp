// /app/erp/ombor — Ombor (Warehouse): qoldiq, skaner, joylashtirish, sanash, yig'ish, qabul. Mantiq: src/erp/warehouse/.
import type { Metadata } from "next";

import WarehouseApp from "@/erp/warehouse";
import { ModuleGate } from "@/erp/kit/gate";

export const metadata: Metadata = { title: "Ombor" };

export default function WarehousePage() {
  return (
    <ModuleGate module="warehouse">
      <WarehouseApp />
    </ModuleGate>
  );
}

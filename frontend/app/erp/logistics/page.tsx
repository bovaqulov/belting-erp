// /app/erp/logistics — Logistika: jo'natmalar (EMU, Yandex Go, Bito, Fargo). Mantiq: src/erp/logistics/.
import type { Metadata } from "next";

import LogisticsApp from "@/erp/logistics";
import { ModuleGate } from "@/erp/kit/gate";

export const metadata: Metadata = { title: "Logistika" };

export default function LogisticsPage() {
  return (
    <ModuleGate module="logistics">
      <LogisticsApp />
    </ModuleGate>
  );
}

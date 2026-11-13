// /app/erp/logistics — Logistika: yetkazib berish xizmatlari (EMU, Yandex Go, Bito, Fargo). Mantiq: src/erp/logistics/.
import type { Metadata } from "next";

import LogisticsApp from "@/erp/logistics";

export const metadata: Metadata = { title: "Logistika" };

export default function LogisticsPage() {
  return <LogisticsApp />;
}

// /app/analytics — Analitika. Mantiq: src/analytics/.
import type { Metadata } from "next";

import AnalyticsApp from "@/analytics";

export const metadata: Metadata = { title: "Analitika" };

export default function AnalyticsPage() {
  return <AnalyticsApp />;
}

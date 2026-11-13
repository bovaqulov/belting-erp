// /app/erp/marketplace — Marketplace (WB, Ozon, Uzum, remen.uz) — ERP moduli. Mantiq: src/erp/marketplace/.
import type { Metadata } from "next";

import MarketplaceApp from "@/erp/marketplace";

export const metadata: Metadata = { title: "Marketplace" };

export default function MarketplacePage() {
  return <MarketplaceApp />;
}

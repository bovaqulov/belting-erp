// /app/erp/moliya — Accounting: Tovarlar (katalog boshqaruvi), Kategoriyalar; To'lovlar, Qarzlar, Kassa — keyingi bosqich.
// Mantiq: src/erp/finance/.
import type { Metadata } from "next";

import AccountingApp from "@/erp/finance";
import { ModuleGate } from "@/erp/kit/gate";

export const metadata: Metadata = { title: "Accounting" };

export default function AccountingPage() {
  return (
    <ModuleGate module="accounting">
      <AccountingApp />
    </ModuleGate>
  );
}

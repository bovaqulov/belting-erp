import type { Metadata } from "next";

export const metadata: Metadata = { title: "ERP" };

// ERP sahifalari: umumiy uslub — public/erp/ui.css (jarvis erp_ui.css nusxasi), shriftlar (Barlow SC) — public/erp/fonts/.
// Ikkalasi /app/erp/... manzilida statik beriladi; ERP sahifalari to'liq ko'chgach — src/erp/kit/ ga o'tadi.
export default function ErpLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-css-tags -- public/ dagi umumiy fayl, build'ga kirmaydi */}
      <link rel="stylesheet" href="/app/erp/ui.css" precedence="high" />
      {children}
    </>
  );
}

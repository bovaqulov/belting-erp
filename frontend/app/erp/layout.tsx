import type { Metadata } from "next";

export const metadata: Metadata = { title: "ERP" };

// ERP sahifalari: `data-tg-ui` — Telegram UI tokenlari (Telegram sozlamalari uslubi, yorug' rejim) shu sahifada yoqiladi
// (src/shared/styles/base.css, :root:has([data-tg-ui])). Uslub — Tailwind; Barlow SC shriftlari — public/erp/fonts/.
export default function ErpLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div data-tg-ui="" className="contents">
      {children}
    </div>
  );
}

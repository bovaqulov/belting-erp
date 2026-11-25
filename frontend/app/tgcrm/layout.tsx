import type { Metadata } from "next";

export const metadata: Metadata = { title: "TG CRM" };

// TelegramCRM (/app/tgcrm) — alohida tizim (Telethon). `data-tg-ui` — Telegram sozlamalari uslubidagi tokenlar (base.css).
export default function TgCrmLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div data-tg-ui="" className="contents">
      {children}
    </div>
  );
}

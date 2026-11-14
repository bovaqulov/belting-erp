import type { Metadata } from "next";

import { CATCHER } from "@/conveyor/catcher";

export const metadata: Metadata = { title: "Lenta chizmasi" };

export default function LentaLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-tg-ui — Telegram UI tokenlari, data-lenta — lenta o'lchamlari va qo'shimcha qoidalar (shared/styles/base.css)
    <div data-tg-ui="" data-lenta="" className="contents">
      <script dangerouslySetInnerHTML={{ __html: CATCHER }} />
      {children}
    </div>
  );
}

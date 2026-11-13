import type { Metadata } from "next";

import { CATCHER } from "@/conveyor/catcher";

export const metadata: Metadata = { title: "Lenta chizmasi" };

export default function LentaLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: CATCHER }} />
      {children}
    </>
  );
}

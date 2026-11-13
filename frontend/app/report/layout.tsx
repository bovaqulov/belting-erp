import type { Metadata } from "next";

export const metadata: Metadata = { title: "Kunlik hisobot" };

export default function ReportLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}

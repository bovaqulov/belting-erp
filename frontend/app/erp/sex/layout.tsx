import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sex" };

export default function SexLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}

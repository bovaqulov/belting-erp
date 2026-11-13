// /app/templates — hisobot shablonlari (tahrir, tasdiqlash). Mantiq: src/ai/templates/.
import type { Metadata } from "next";

import Shell from "@/ai/shell";

export const metadata: Metadata = { title: "Shablonlar" };

export default function TemplatesPage() {
  return <Shell area="templates" />;
}

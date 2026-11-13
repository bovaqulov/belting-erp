// /app/jarvis — faqat AI: chat, bo'lim agentlari, xotira, bilimlar. Mantiq va komponentlar: src/ai/.
import type { Metadata } from "next";

import Shell from "@/ai/shell";

export const metadata: Metadata = { title: "Jarvis" };

export default function JarvisPage() {
  return <Shell area="jarvis" />;
}

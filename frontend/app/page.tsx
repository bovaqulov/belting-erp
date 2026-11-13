// /app — bo'lim tanlash (ERP, LentaCUD, Jarvis, Development). Jarvis paneli — /app/jarvis, texnik qism — /app/dev.
import type { Metadata } from "next";

import Launcher from "@/home";

export const metadata: Metadata = { title: "Belting Agent" };

export default function HomePage() {
  return <Launcher />;
}

// /app/dev — Development: audit, tizim holati va loglar.
import type { Metadata } from "next";

import Shell from "@/ai/shell";

export const metadata: Metadata = { title: "Development" };

export default function DevPage() {
  return <Shell area="dev" />;
}

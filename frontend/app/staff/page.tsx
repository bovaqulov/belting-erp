// /app/staff — xodimlar: ro'yxat, tuzilma (org chart), rollar, tasdiqlash. Mantiq: src/ai/users/.
import type { Metadata } from "next";

import Shell from "@/ai/shell";

export const metadata: Metadata = { title: "Xodimlar" };

export default function StaffPage() {
  return <Shell area="staff" />;
}

"use client";
// Bitim belgilari: Ava — mas'ul ismini CRM kontekstidan oladi; TaskBadge, Tags — sof ko'rinish.
import { useCrm } from "@/erp/crm/context";

import { AvaView } from "./ui";

export { AvaView, Tags, TaskBadge } from "./ui";

/** Mas'ul avatari (tg_id → ism kontekstdan) */
export function Ava({ tg }: { tg?: number | null }) {
  const { users } = useCrm();
  return <AvaView name={(tg != null && users[tg]) || "—"} />;
}

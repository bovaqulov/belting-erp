// Topshiriq formasi tekshiruvi (sof).
import type { AgentTask } from "@/ai/agents/model";

/** Xatolar ro'yxati (bo'sh — to'g'ri) */
export function validateTask(t: AgentTask): string[] {
  const out: string[] = [];
  if (!t.title.trim()) out.push("Topshiriq nomini yozing.");
  if (t.instruction.trim().length < 10) out.push("Ko'rsatma juda qisqa — nima qilish va natija qanday bo'lishini yozing.");
  return out;
}

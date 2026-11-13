// Jarvis chat — sof mantiq: SSE oqimini bo'laklash, xabarlar holati, standart agent.
// API kelishuvi (backend 2-bosqich): ../../../../docs/api/chat.md
//   POST /app/api/chat {agent, message, session_id?} → text/event-stream:
//     data: {"type":"text","delta":"..."}   data: {"type":"tool","name":"crm"}
//     data: {"type":"done","session_id":"..."}   data: {"type":"error","detail":"..."}
//   (yoki oddiy JSON {reply, session_id} — oqimsiz zaxira)
import { ApiError } from "@/shared/api/client";

export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string }
  | { type: "done"; session_id?: string }
  | { type: "error"; detail: string };

export interface ChatMsg {
  id: string;
  role: "user" | "agent";
  agent: string;
  text: string;
  tools: string[];
  /** javob hali kelmoqda */
  pending?: boolean;
  error?: string;
}

/** buferdan to'liq SSE hodisalarini ajratadi (bo'sh qator bilan tugaganlari); qolgan qism — keyingi bo'lak bilan */
export function splitEvents(buf: string): { events: ChatEvent[]; rest: string } {
  const norm = buf.replace(/\r\n/g, "\n");
  const blocks = norm.split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: ChatEvent[] = [];
  for (const b of blocks) {
    const data = b
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) continue;
    try {
      const ev = JSON.parse(data) as ChatEvent;
      if (ev && typeof ev === "object" && "type" in ev) events.push(ev);
    } catch {
      events.push({ type: "text", delta: data }); // JSON emas — xom matn
    }
  }
  return { events, rest };
}

/** hodisani agent xabariga qo'llaydi (o'zgarmas yangilash) */
export function applyEvent(msgs: readonly ChatMsg[], id: string, ev: ChatEvent): ChatMsg[] {
  return msgs.map((m) => {
    if (m.id !== id) return m;
    switch (ev.type) {
      case "text":
        return { ...m, text: m.text + ev.delta };
      case "tool":
        return m.tools.includes(ev.name) ? m : { ...m, tools: [...m.tools, ev.name] };
      case "done":
        return { ...m, pending: false };
      case "error":
        return { ...m, pending: false, error: ev.detail };
    }
  });
}

/** suhbat uchun standart agent: xodimning o'z bo'limi agenti → sees_all (Rahbariyat) → birinchisi */
export function defaultAgent(
  depts: readonly { key: string; sees_all?: boolean }[],
  mine: readonly string[] | undefined,
): string | null {
  const keys = new Set(depts.map((d) => d.key));
  const own = (mine ?? []).find((k) => keys.has(k));
  return own ?? depts.find((d) => d.sees_all)?.key ?? depts[0]?.key ?? null;
}

let seq = 0;
export const msgId = (): string => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

/** API hali yo'q (404/405) — tushunarli matn */
export function chatError(e: unknown): string {
  if (e instanceof ApiError && (e.status === 404 || e.status === 405))
    return "Javob olinmadi: serverda veb chat API'si hali yo'q (backend 2-bosqichda qo'shiladi). Hozircha agent bilan Telegram botda yozishing.";
  if ((e as Error)?.name === "AbortError") return "To'xtatildi.";
  return (e as Error)?.message || "Javob olinmadi.";
}

export const SUGGESTIONS = [
  "Bugungi savdo qanday?",
  "Ombordagi qoldiq kam tovarlar",
  "Shu haftadagi kechikkan zakazlar",
  "Ertangi eslatmalarim",
];

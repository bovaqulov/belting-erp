// POST /app/api/chat — SSE oqimini o'qish (EventSource POST va X-Init-Data sarlavhasini qo'llamaydi — fetch + ReadableStream).
import { ApiError, authHeaders } from "@/shared/api/client";

import { splitEvents, type ChatEvent } from "./chat.lib";

export interface ChatRequest {
  /** agent kaliti (bo'lim agenti uchun — bo'lim kaliti) */
  agent: string;
  message: string;
  session_id?: string;
}

export async function streamChat(req: ChatRequest, onEvent: (ev: ChatEvent) => void, signal: AbortSignal): Promise<void> {
  const r = await fetch("/app/api/chat", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...authHeaders() },
    body: JSON.stringify(req),
    signal,
  });
  if (!r.ok) {
    const detail = ((await r.json().catch(() => ({}))) as { detail?: unknown }).detail;
    throw new ApiError(typeof detail === "string" && detail ? detail : r.statusText || `Xato ${r.status}`, r.status, detail);
  }
  // oqimsiz zaxira: {reply, session_id}
  if (!(r.headers.get("content-type") || "").includes("text/event-stream") || !r.body) {
    const j = (await r.json().catch(() => ({}))) as { reply?: string; session_id?: string };
    if (j.reply) onEvent({ type: "text", delta: j.reply });
    onEvent({ type: "done", session_id: j.session_id });
    return;
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let done = false;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buf += dec.decode(value, { stream: true });
    const { events, rest } = splitEvents(buf);
    buf = rest;
    for (const ev of events) {
      if (ev.type === "done") done = true;
      onEvent(ev);
    }
  }
  const { events } = splitEvents(buf + "\n\n");
  events.forEach(onEvent);
  if (!done && !events.some((e) => e.type === "done")) onEvent({ type: "done" });
}

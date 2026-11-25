// Real vaqt: /app/api/tgcrm/ws/ (docs/api/tgcrm.md). Uzilsa — 1→2→5→10→30 s dan keyin qayta ulanadi; sahifa yashirin
// bo'lsa ham ulanish turadi (o'qilmaganlar soni yangilanib tursin). Telegram ichida — init_data so'rov qatorida.
import { useEffect, useRef, useState } from "react";

import { initData } from "@/shared/telegram/telegram";

export type LiveEvent = {
  type: "account" | "dialogs" | "folders" | "dialog" | "msg" | "read" | "typing" | "status" | "history" | "lock" | "ping";
  account?: number;
  peer?: number;
  op?: "new" | "edit" | "delete";
  msg_id?: number;
  ids?: number[];
  out?: boolean;
  outbox?: boolean;
  max_id?: number;
  online?: boolean;
  user?: number;
  action?: string;
};

const BACKOFF = [1000, 2000, 5000, 10000, 30000];

/** onEvent — har hodisa; natija — ulanganmi (sarlavhada "Ulanmoqda…" uchun) */
export function useLive(onEvent: (e: LiveEvent) => void): boolean {
  const cb = useRef(onEvent);
  useEffect(() => {
    cb.current = onEvent;
  });
  const [up, setUp] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let tries = 0;
    let timer = 0;
    let closed = false;
    const open = () => {
      const id = initData();
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/app/api/tgcrm/ws/${id ? `?init_data=${encodeURIComponent(id)}` : ""}`);
      ws.onopen = () => {
        tries = 0;
        setUp(true);
      };
      ws.onmessage = (m) => {
        try {
          const e = JSON.parse(String(m.data)) as LiveEvent;
          if (e.type !== "ping") cb.current(e);
        } catch {
          /* buzuq xabar — e'tiborsiz */
        }
      };
      ws.onclose = (e) => {
        setUp(false);
        if (closed || e.code === 4403) return; // huquq yo'q — qayta urinmaymiz
        timer = window.setTimeout(open, BACKOFF[Math.min(tries++, BACKOFF.length - 1)]);
      };
    };
    open();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      ws?.close();
    };
  }, []);
  return up;
}

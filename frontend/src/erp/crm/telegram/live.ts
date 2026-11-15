// CRM Telegram — real vaqt: WebSocket /app/api/erp/crm/tg/ws/ (backend erp/crm/live.py). Hodisa — `{type: "tg", chat}`
// ("shu chat yangilandi"); ma'lumotni komponent odatdagi API'dan qayta oladi. Uzilsa — 1→2→4…30 s kutib qayta ulanadi.
// Demo rejimda ulanmaydi. Telegram Mini App ichida kirish — `?init_data=` (WebSocket'ga sarlavha qo'yib bo'lmaydi).
import { useEffect, useRef, useState } from "react";

import { tgLive } from "@/erp/crm/api";
import { initData } from "@/shared/telegram/telegram";

export type TgEvent = { type: "tg"; chat: number };

export function wsUrl(loc: Pick<Location, "protocol" | "host">, init: string): string {
  const base = `${loc.protocol === "https:" ? "wss" : "ws"}://${loc.host}/app/api/erp/crm/tg/ws/`;
  return init ? `${base}?init_data=${encodeURIComponent(init)}` : base;
}

/** Hodisalarni tinglaydi; qaytaradi — ulanganmi (ulangan bo'lsa zaxira so'rov siyraklashtiriladi) */
export function useTgLive(onEvent: (e: TgEvent) => void): boolean {
  const [on, setOn] = useState(false);
  const cb = useRef(onEvent);
  useEffect(() => {
    cb.current = onEvent;
  });
  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wait = 1000;
    let stop = false;
    const open = () => {
      if (stop) return;
      ws = new WebSocket(wsUrl(location, initData()));
      ws.onopen = () => {
        wait = 1000;
        setOn(true);
      };
      ws.onmessage = (m) => {
        try {
          const e = JSON.parse(String(m.data)) as { type?: string; chat?: number };
          if (e.type === "tg" && typeof e.chat === "number") cb.current({ type: "tg", chat: e.chat });
        } catch {
          /* noto'g'ri xabar — e'tiborsiz */
        }
      };
      ws.onclose = (e) => {
        setOn(false);
        if (stop || e.code === 4403) return; // huquq yo'q — qayta urinmaymiz
        timer = setTimeout(open, wait);
        wait = Math.min(wait * 2, 30_000);
      };
    };
    void tgLive().then((real) => real && open());
    return () => {
      stop = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, []);
  return on;
}

// Chatlar ro'yxati: oxiriga yaqinlashganda keyingi sahifa (IntersectionObserver).
import { useCallback, useEffect, useRef, useState } from "react";

import type { Chat, GlobalHit } from "@/tgcrm/api";

import type { Typing } from "@/tgcrm/inbox";
import { ChatListView } from "./ui";

export default function ChatList(p: {
  acc: number;
  me: number;
  sla: number;
  dialogs: Chat[] | null;
  err: string;
  hasMore: boolean;
  loadingMore: boolean;
  open: number | null;
  typing: Typing;
  searching: boolean;
  hits: GlobalHit[] | null;
  onHit: (h: GlobalHit) => void;
  archive: boolean;
  onOpen: (peer: number) => void;
  onMore: () => void;
  onRetry: () => void;
}) {
  const more = useRef(p.onMore);
  useEffect(() => {
    more.current = p.onMore;
  });
  // React 19: ref callback tozalash qaytaradi — StrictMode'da ham kuzatuvchi yo'qolmaydi
  const sentinel = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !p.hasMore) return;
      const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && more.current(), { rootMargin: "600px 0px" });
      io.observe(el);
      return () => io.disconnect();
    },
    [p.hasMore],
  );
  // vaqt yozuvlari (14:05 → "Du") daqiqada bir yangilanadi
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return <ChatListView {...p} sentinel={sentinel} now={now} />;
}

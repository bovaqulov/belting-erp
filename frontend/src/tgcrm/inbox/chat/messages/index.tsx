// Xabarlar lentasi: aylantirish boshqaruvi.
// - birinchi ochilish — pastda; eski sahifa tepaga qo'shilganda ko'rinayotgan joy siljimaydi;
// - yangi xabar: pastda bo'lsa — ergashadi, aks holda "↓ N" tugmasi;
// - pastda va sahifa ko'rinib tursa — oxirgi kiruvchi xabargacha "o'qildi" (onSeen).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Chat, Msg, MsgPeer } from "@/tgcrm/api";
import { layoutRows, sameDay } from "@/tgcrm/lib";

import { MessagesView, type Acts } from "./ui";

export type { Acts };

const NEAR_BOTTOM = 96;
const NEAR_TOP = 400;

export default function Messages(p: {
  acc: number;
  peer: number;
  msgs: Msg[] | null;
  err: string;
  chat: Chat | null;
  peers: Record<string, MsgPeer>;
  staff: Record<string, string>;
  hasMore: boolean;
  loadingOlder: boolean;
  onOlder: () => void;
  onSeen: (maxId: number) => void;
  acts: Acts;
  /** tashqaridan "shu xabarga o'tish" (qidiruv, qadalgan xabar) — seq har bosishda yangi */
  target: { id: number; seq: number } | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [below, setBelow] = useState(0);
  const [showDown, setShowDown] = useState(false);
  const rows = useMemo(() => (p.msgs ? layoutRows(p.msgs, sameDay) : []), [p.msgs]);
  const snap = useRef({ first: 0, last: 0, count: 0, height: 0, top: 0 });

  const maxIncoming = useMemo(() => {
    let max = 0;
    for (const m of p.msgs ?? []) if (!m.out && !m.pending && m.id > max) max = m.id;
    return max;
  }, [p.msgs]);

  const seen = useRef(p.onSeen);
  useEffect(() => {
    seen.current = p.onSeen;
  });
  const markIfBottom = useCallback(() => {
    if (atBottom.current && document.visibilityState === "visible" && maxIncoming) seen.current(maxIncoming);
  }, [maxIncoming]);

  // ro'yxat o'zgarganda aylantirish joyini to'g'rilash (chizilgandan keyin, bo'yashdan oldin)
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !p.msgs) return;
    const real = p.msgs.filter((m) => !m.pending);
    const first = real[0]?.id ?? 0;
    const lastMsg = p.msgs[p.msgs.length - 1];
    const last = lastMsg?.id ?? 0;
    const s = snap.current;
    if (s.count === 0) {
      el.scrollTop = el.scrollHeight; // birinchi ochilish
    } else if (first && s.first && first < s.first) {
      el.scrollTop = s.top + (el.scrollHeight - s.height); // tepaga qo'shildi — joy saqlanadi
    } else if (last !== s.last) {
      if (atBottom.current || lastMsg?.pending === "sending") {
        el.scrollTop = el.scrollHeight;
      } else {
        const added = p.msgs.filter((m) => m.id > s.last && !m.out).length;
        if (added) setBelow((n) => n + added);
      }
    }
    snap.current = {
      first,
      last,
      count: p.msgs.length,
      height: el.scrollHeight,
      top: el.scrollTop,
    };
  }, [p.msgs]);

  useEffect(() => {
    markIfBottom();
    const onVis = () => markIfBottom();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [markIfBottom]);

  const older = useRef(p.onOlder);
  useEffect(() => {
    older.current = p.onOlder;
  });
  const onScroll = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    atBottom.current = bottom;
    snap.current.top = el.scrollTop;
    snap.current.height = el.scrollHeight;
    setShowDown(!bottom);
    if (bottom) {
      setBelow(0);
      markIfBottom();
    }
    if (el.scrollTop < NEAR_TOP) older.current();
  }, [markIfBottom]);

  // xabarlar ekranni to'ldirmasa — darhol eski sahifani so'raymiz
  useEffect(() => {
    const el = box.current;
    if (el && p.msgs?.length && p.hasMore && !p.loadingOlder && el.scrollHeight <= el.clientHeight + NEAR_TOP) older.current();
  }, [p.msgs, p.hasMore, p.loadingOlder]);

  const toBottom = () => {
    const el = box.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
    setBelow(0);
  };

  const jumpTo = (id: number) => {
    const el = box.current?.querySelector<HTMLElement>(`[data-mid="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.animate?.([{ opacity: 0.4 }, { opacity: 1 }], { duration: 600 });
  };

  // tashqi maqsad — faqat DOM (aylantirish), holat o'zgarmaydi
  const tgt = p.target;
  useEffect(() => {
    if (tgt) jumpTo(tgt.id);
  }, [tgt]);

  // tahrirlash muddati (48 soat) uchun joriy vaqt — daqiqada bir
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <MessagesView
      now={now}
      box={box}
      acc={p.acc}
      peer={p.peer}
      rows={rows}
      msgs={p.msgs}
      err={p.err}
      chat={p.chat}
      peers={p.peers}
      staff={p.staff}
      hasMore={p.hasMore}
      loadingOlder={p.loadingOlder}
      showDown={showDown}
      below={below}
      onScroll={onScroll}
      onDown={toBottom}
      onJump={jumpTo}
      acts={p.acts}
    />
  );
}

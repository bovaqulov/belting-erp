// Fonda yangilash: kanallardan buyurtmalarni server o'zi oladi (Celery, har 5 daqiqada) — sahifa esa ma'lumotni
// jimgina qayta o'qiydi (yuklanish ko'rinmaydi). Tab yashirin bo'lsa — kutadi, qaytganda darhol yangilaydi.
import { useEffect, useRef } from "react";

export const POLL_MS = 60_000;

export function usePoll(fn: () => void, ms = POLL_MS) {
  const f = useRef(fn);
  useEffect(() => {
    f.current = fn;
  });
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") f.current();
    };
    const id = setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ms]);
}

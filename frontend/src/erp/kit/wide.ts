// Kompyuter ko'rinishi (ERP kit): keng ekran (≥1000px) va Telegram'dan tashqari — chap menyu, jadvallar, ikki ustun.
// Telegram Mini App ichida har doim telefon ko'rinishi (ro'yxatlar).
import { useSyncExternalStore } from "react";

import { etg } from "./env";

const Q = "(min-width: 1000px)";
const sub = (cb: () => void) => {
  const m = window.matchMedia(Q);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

export const useWide = (): boolean =>
  useSyncExternalStore(
    sub,
    () => window.matchMedia(Q).matches && !etg(),
    () => false,
  );

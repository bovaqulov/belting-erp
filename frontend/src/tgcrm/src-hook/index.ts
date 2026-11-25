// Himoyalangan fayl URL'i → <img>/<video> manbasi. Brauzerda — URL o'zi (cookie); Telegram Mini App ichida — sarlavha
// bilan fetch → blob (img/video sarlavha yubora olmaydi). url=null — hech narsa yuklanmaydi.
import { useCallback, useEffect, useState } from "react";

import { apiBlob } from "@/shared/api/client";
import { initData } from "@/shared/telegram/telegram";

export function useSrc(url: string | null): { src: string | null; failed: boolean } {
  const [blob, setBlob] = useState<{ url: string; src: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const viaBlob = !!url && !!initData();
  useEffect(() => {
    if (!url || !viaBlob) return;
    let alive = true;
    let made = "";
    apiBlob(url).then(
      (b) => {
        if (!alive) return;
        made = URL.createObjectURL(b);
        setBlob({ url, src: made });
      },
      () => alive && setFailed(url),
    );
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [url, viaBlob]);
  if (!url) return { src: null, failed: false };
  if (!viaBlob) return { src: url, failed: false };
  return { src: blob?.url === url ? blob.src : null, failed: failed === url };
}

/** Element ekranga yaqinlashganda bir marta `true` (React 19 ref callback tozalash bilan) */
export function useNear(margin = "300px 0px"): [boolean, (el: Element | null) => (() => void) | undefined] {
  const [near, setNear] = useState(false);
  const watch = useCallback(
    (el: Element | null) => {
      if (!el || near) return;
      const io = new IntersectionObserver(
        (es) => {
          if (es.some((e) => e.isIntersecting)) {
            setNear(true);
            io.disconnect();
          }
        },
        { rootMargin: margin },
      );
      io.observe(el);
      return () => io.disconnect();
    },
    [near, margin],
  );
  return [near, watch];
}

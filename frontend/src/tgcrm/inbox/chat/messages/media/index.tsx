// Xabar mediasi: xira eskiz (darhol) → kichik rasm (ekranga yaqinlashganda) → to'liq fayl (bosilganda).
// Brauzerda — URL to'g'ridan-to'g'ri (cookie); Telegram Mini App ichida — sarlavha bilan fetch → blob (img/video
// sarlavha yubora olmaydi). Yuborilayotgan xabar (id < 0) — mahalliy ko'rinish va foiz.
import { useCallback, useState } from "react";

import { apiBlob } from "@/shared/api/client";
import { initData } from "@/shared/telegram/telegram";
import { mediaUrl, type Media, type Msg } from "@/tgcrm/api";
import { useSrc } from "@/tgcrm/src-hook";

import { MediaView } from "./ui";

export default function MessageMedia({ acc, peer, m, media }: { acc: number; peer: number; m: Msg; media: Media }) {
  const local = typeof media.local === "string" ? media.local : null; // yuborilayotgan fayl (object URL)
  const real = m.id > 0 && !m.pending;
  const [near, setNear] = useState(false);
  const [active, setActive] = useState(media.kind === "sticker" && !media.animated);
  const [viewer, setViewer] = useState(false);
  // React 19: ref callback tozalash funksiyasini qaytaradi (StrictMode'da ham kuzatuvchi to'g'ri qayta yaratiladi)
  const watch = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const thumb = useSrc(real && near && media.thumb ? mediaUrl(acc, peer, m.id, { thumb: true }) : null);
  const full = useSrc(real && (active || viewer) ? mediaUrl(acc, peer, m.id) : null);

  const download = async () => {
    if (!real) return;
    const url = mediaUrl(acc, peer, m.id, { download: true });
    const name = typeof media.name === "string" && media.name ? media.name : `fayl_${m.id}`;
    if (!initData()) {
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      return;
    }
    const b = await apiBlob(url).catch(() => null);
    if (!b) return;
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 60_000);
  };

  return (
    <MediaView
      watch={watch}
      media={media}
      local={local}
      progress={typeof media.progress === "number" ? media.progress : null}
      thumb={thumb.src}
      full={full.src}
      fullFailed={full.failed}
      active={active}
      viewer={viewer}
      onActivate={() => real && setActive(true)}
      onOpen={() => real && setViewer(true)}
      onClose={() => setViewer(false)}
      onDownload={() => void download()}
    />
  );
}

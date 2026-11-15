// Tovar rasmi (kanal kartochkasidan, buyurtma qatorida `photo`): kichik kvadrat (Thumb) yoki katta (Photo — buyurtma oynasi);
// rasm yo'q yoki ochilmasa — quti belgisi.
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/erp/kit/ui";
import type { Order } from "@/erp/marketplace/lib";

export function Thumb({ o, size = 40 }: { o: Pick<Order, "lines">; size?: number }) {
  const src = o.lines.find((l) => l.photo)?.photo;
  const [bad, setBad] = useState(false);
  const box = { width: size, height: size };
  if (!src || bad)
    return (
      <span className="grid flex-none place-items-center rounded-md bg-fill text-hint" style={box} aria-hidden>
        <Icon n="package" cls="size-4" />
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- statik eksport, tashqi CDN rasmi
    <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="flex-none rounded-md bg-fill object-cover" style={box} onError={() => setBad(true)} />
  );
}

/** Katta variant manzili: WB square → c516x688, Uzum 80_low → 540_high (Ozon — asl rasm) */
export const bigPhoto = (u: string): string =>
  u.replace("/images/square/", "/images/c516x688/").replace("/images/tm/", "/images/c516x688/").replace("t_product_80_low", "t_product_540_high");
/** Eng katta (to'liq ekran uchun): WB → big */
export const fullPhoto = (u: string): string => bigPhoto(u).replace("/images/c516x688/", "/images/big/");

/** To'liq ekranda rasm: fon/× bosilsa yoki Esc — yopiladi (ostidagi oyna yopilmaydi) */
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[100] grid cursor-zoom-out place-items-center bg-black/85 p-4" role="dialog" aria-modal="true" aria-label="Tovar rasmi" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element -- statik eksport, tashqi CDN rasmi */}
      <img src={fullPhoto(src)} alt="" referrerPolicy="no-referrer" className="max-h-[calc(100dvh-32px)] max-w-[calc(100vw-32px)] rounded-lg bg-white object-contain" />
      <button type="button" className="icon-btn absolute top-3 right-3 !size-11 bg-black/50 !text-white" aria-label="Yopish" onClick={onClose}>
        <Icon n="x" />
      </button>
    </div>,
    document.body,
  );
}

/** Katta rasm: ota kengligini to'ldiradi, kvadrat, oq fonda; bosilsa — to'liq ekranda */
export function Photo({ src }: { src?: string | null }) {
  const [bad, setBad] = useState(false);
  const [zoom, setZoom] = useState(false);
  const close = useCallback(() => setZoom(false), []);
  if (!src || bad)
    return (
      <span className="grid aspect-square w-full place-items-center rounded-xl bg-fill text-hint" aria-hidden>
        <Icon n="package" cls="size-10" />
      </span>
    );
  return (
    <>
      <button type="button" className="block w-full cursor-zoom-in rounded-xl border-0 bg-transparent p-0" aria-label="Rasmni kattalashtirish" onClick={() => setZoom(true)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- statik eksport, tashqi CDN rasmi */}
        <img src={bigPhoto(src)} alt="" decoding="async" referrerPolicy="no-referrer" className="aspect-square w-full rounded-xl bg-white object-contain" onError={() => setBad(true)} />
      </button>
      {zoom ? <Lightbox src={src} onClose={close} /> : null}
    </>
  );
}

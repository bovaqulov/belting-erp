"use client";

import { useEffect } from "react";

import { fullscreen, tg } from "./telegram";

/** Ildiz layout'da: to'liq ekran holati sahifadan sahifaga saqlanadi (Telegram'da), html.tg-fs esa yangi yuklangan
 *  sahifada yo'q — initTelegram() chaqirmaydigan sahifalarda ham belgilansin (aks holda kontent tugmalar ostida). */
export function TgFullscreen(): null {
  useEffect(() => {
    const t = tg();
    if (t) fullscreen(t);
  }, []);
  return null;
}

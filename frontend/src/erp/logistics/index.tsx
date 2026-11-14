"use client";
// Logistika: yetkazib berish xizmatlari — EMU, Yandex Go, Bito, Fargo (faqat shu to'rttasi bilan ishlaymiz).
// Hozircha ro'yxat (sof ko'rinish); jo'natma yaratish, narx va kuzatuv — har xizmat API'si backend'ga ulangach.
import { useEffect } from "react";

import { disableZoom, initTelegram } from "@/shared/telegram/telegram";

import { CARRIERS, LogisticsView } from "./ui";

export default function LogisticsApp() {
  useEffect(() => {
    initTelegram();
    return disableZoom();
  }, []);
  return <LogisticsView carriers={CARRIERS} />;
}

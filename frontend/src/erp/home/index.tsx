"use client";
// /app/erp — ERP bosh sahifasi: faqat ruxsat etilgan modullar (/app/api/erp/me `modules` — bo'lim bo'yicha). Modul sahifasi
// ham o'zi tekshiradi (erp/kit/gate); bu yerga bosh sahifadagi ERP kartochkasidan kelinadi.
import { useEffect } from "react";

import { canModule, useErpModules } from "@/shared/auth/erp-access";
import { disableZoom, initTelegram } from "@/shared/telegram/telegram";

import { ErpHomeView, MODULES } from "./ui";

export default function ErpHome() {
  useEffect(() => {
    initTelegram();
    return disableZoom();
  }, []);
  const m = useErpModules();
  return <ErpHomeView modules={m === null ? [] : MODULES.filter((x) => canModule(m, x.key))} loading={m === null} />;
}

"use client";
// /app/erp — ERP bosh sahifasi: modullar (CRM, Warehouse, Manufacturing, Accounting). Ruxsat har modul sahifasining
// o'zida tekshiriladi; bu yerga bosh sahifadagi ERP kartochkasidan kelinadi.
import { useEffect } from "react";

import { disableZoom, initTelegram } from "@/shared/telegram/telegram";

import { ErpHomeView, MODULES } from "./ui";

export default function ErpHome() {
  useEffect(() => {
    initTelegram();
    return disableZoom();
  }, []);
  return <ErpHomeView modules={MODULES} />;
}

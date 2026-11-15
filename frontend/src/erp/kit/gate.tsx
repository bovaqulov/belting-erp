"use client";
// Modul sahifasi qo'riqchisi: /app/api/erp/me `modules` da shu modul bo'lmasa — "ruxsat yo'q" (havola orqali to'g'ridan-to'g'ri
// kirilganda ham). Backend API'lari o'zi ham tekshiradi (CRM, Marketplace); demo modullar uchun bu yagona to'siq.
import type { ReactNode } from "react";

import { canModule, useErpModules } from "@/shared/auth/erp-access";

import { Empty } from "./ui";

export function ModuleGate({ module, children }: { module: string; children: ReactNode }) {
  const m = useErpModules();
  if (m === null) return null;
  if (canModule(m, module)) return <>{children}</>;
  return (
    <div className="mx-auto max-w-[480px] px-4 pt-[18vh]">
      <Empty icon="shield-check" title="Bu bo'limga ruxsatingiz yo'q">
        Kirish bo&apos;limingizga qarab beriladi. Kerak bo&apos;lsa — administratorga murojaat qiling.
        <div className="btns">
          <a className="btn sec" href="/app/erp">
            ERP bo&apos;limlariga
          </a>
        </div>
      </Empty>
    </div>
  );
}

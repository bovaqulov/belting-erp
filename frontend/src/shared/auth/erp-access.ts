// ERP'ga kirish huquqi: /app/api/erp/me → `modules` (backend staff.MODULE_DEPTS: bo'lim bo'yicha; ega/admin va
// Rahbariyat — hammasi). Bir sahifa yuklanishida bitta so'rov (natija modulda keshlanadi).
// Backend yo'q (404/5xx/tarmoq — demo rejim) — cheklov yo'q ("all"); 401 — kirish oqimini modul o'zi ko'rsatadi.
import { useEffect, useState } from "react";

import { api, ApiError } from "@/shared/api/client";

/** null — yuklanmoqda; "all" — demo/kirmagan (modul o'zi hal qiladi); ro'yxat — ruxsat etilgan modullar */
export type ErpModules = "all" | string[];

let probe: Promise<ErpModules> | null = null;

export function erpModules(): Promise<ErpModules> {
  probe ??= api<{ modules?: string[] }>("/app/api/erp/me").then(
    (m) => (Array.isArray(m.modules) ? m.modules : "all"),
    (e: unknown) => (e instanceof ApiError && e.status === 403 ? [] : "all"),
  );
  return probe;
}

export const canModule = (m: ErpModules | null, key: string): boolean => m === "all" || (!!m && m.includes(key));

/** Bosh panel: ERP kartochkasi — kamida bitta modulga ruxsat bo'lsa (backend javob bergan bo'lsa) */
export function erpAccess(): Promise<boolean> {
  return api<{ modules?: string[] }>("/app/api/erp/me").then(
    (m) => !Array.isArray(m.modules) || m.modules.length > 0,
    () => false,
  );
}

export function useErpModules(): ErpModules | null {
  const [m, setM] = useState<ErpModules | null>(null);
  useEffect(() => {
    let alive = true;
    erpModules().then((v) => alive && setM(v));
    return () => {
      alive = false;
    };
  }, []);
  return m;
}

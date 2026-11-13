// ERP'ga kirish huquqi: /app/api/erp/me javob bersa — bosh panelda ERP va CRM havolalari ko'rinadi.
// Bir sahifa yuklanishida bitta so'rov (natija modulda keshlanadi).
import { useEffect, useState } from "react";

import { api } from "@/shared/api/client";

let probe: Promise<boolean> | null = null;

export function erpAccess(): Promise<boolean> {
  probe ??= api("/app/api/erp/me").then(
    () => true,
    () => false,
  );
  return probe;
}

export function useErpAccess(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let alive = true;
    erpAccess().then((v) => alive && setOk(v));
    return () => {
      alive = false;
    };
  }, []);
  return ok;
}

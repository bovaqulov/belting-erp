"use client";
// Skaner: QR stiker (klaviatura-skaner yoki Telegram kamerasi) → birlik (/erp/scan) → qoldiq tekshiruvi → sarf oynasi.
import { useEffect, useRef } from "react";

import { api, beep, etg, scanQR, toast } from "@/erp/kit/env";
import type { Plan, Take, Unit } from "@/erp/workshop/lib";

import { ScanView } from "./ui";

export function Scan({ plan, hint, onUnit }: { plan: Plan[]; hint: string; onUnit: (t: Take) => void }) {
  const inp = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!etg()) setTimeout(() => inp.current?.focus(), 50);
  }, []);
  const onCode = async (code: string) => {
    try {
      const r = await api<Unit>(
        `/app/api/erp/scan?code=${encodeURIComponent(code)}`,
      );
      if (r.type !== "unit")
        throw new Error(
          r.type === "unknown"
            ? "Kod topilmadi"
            : "Rukav/lenta birligining QR stikerini skanerlang",
        );
      const have = (r.stock || []).reduce((a, s) => a + Number(s.qty), 0);
      if (!have) throw new Error(`${r.code}: omborda qoldig'i yo'q`);
      beep(true);
      onUnit({ u: r, have, p: plan.find((x) => x.item_id === r.item_id) });
    } catch (e) {
      beep(false);
      toast((e as Error).message, "bad");
    }
  };
  return <ScanView inpRef={inp} hint={hint} onCode={(v) => void onCode(v)} onCamera={() => scanQR((v) => void onCode(v))} />;
}

"use client";
// Ko'rsatkichlar: filtrlangan mijozlar xulosasi (GeoApp) + 1C bo'yicha umumiy ko'rsatkichlar (/totals — faqat rahbariyat/admin).
import { useEffect, useState } from "react";

import { api } from "@/geomap/lib/api";
import type { Summary } from "@/geomap/lib/stats";

import { WidgetsView, type Totals } from "./ui";

export default function WidgetsPanel({ s, regionName, full, onPickRegion, onPickOwner }: {
  s: Summary; regionName: (id: string) => string; full: boolean; onPickRegion: (id: string) => void; onPickOwner: (name: string) => void;
}) {
  const [tot, setTot] = useState<Totals | null>(null);
  useEffect(() => {
    if (!full) return;
    let live = true;
    api<Totals>("/totals").then((t) => live && setTot(t)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [full]);
  return <WidgetsView s={s} tot={tot} regionName={regionName} full={full} onPickRegion={onPickRegion} onPickOwner={onPickOwner} />;
}

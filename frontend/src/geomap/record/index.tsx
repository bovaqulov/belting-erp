"use client";
// Mijoz kartasi: yozuvni yuklash (/records/{id}), tashrif qayd etish (geolokatsiya bilan; internet yo'q bo'lsa — navbatga).
import { useCallback, useEffect, useState } from "react";

import { addCheckin, api } from "@/geomap/lib/api";
import { localIso } from "@/geomap/lib/fields";
import { haptic } from "@/geomap/lib/tg";
import type { RecDetail } from "@/geomap/lib/types";

import { RecordView } from "./ui";

export default function RecordCard({ id, onClose, onRoute, inRoute, onNearby, onMove, onToast, regionName, districtName, full }: {
  id: string; onClose: () => void; onRoute: () => void; inRoute: boolean; onNearby: () => void; onMove: () => void;
  onToast: (s: string, err?: boolean) => void; regionName: (id: string) => string; districtName: (id: string) => string; full: boolean;
}) {
  const [r, setR] = useState<RecDetail | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<RecDetail>(`/records/${encodeURIComponent(id)}`).then((x) => { setR(x); setErr(""); }).catch((e) => setErr(String(e.message || e) || "Mijoz ma'lumotini yuklab bo'lmadi"));
  }, [id]);
  useEffect(load, [load]);   // id o'zgarsa — komponent key bilan qayta yaratiladi

  const checkin = async () => {
    if (busy) return;
    setBusy(true);
    const send = (lat?: number, lng?: number) =>
      addCheckin({ record_id: id, note: note.trim(), lat, lng, ts: localIso(new Date()) })   // mahalliy vaqt: backend ham zonasiz mahalliy vaqt saqlaydi (UTC yuborilsa 5 soat orqada ko'rinadi)
        .then((sent) => {
          haptic("success");
          onToast(sent ? "Tashrif yozildi" : "Internet yo'q — tashrif saqlab qo'yildi, keyin yuboriladi");
          setNote("");
          if (sent) load();
        })
        .catch((e) => onToast(String(e.message || e), true))
        .finally(() => setBusy(false));
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((p) => send(p.coords.latitude, p.coords.longitude), () => send(), { timeout: 6000 });
    } else send();
  };

  return (
    <RecordView
      r={r}
      err={err}
      note={note}
      busy={busy}
      inRoute={inRoute}
      full={full}
      regionName={regionName}
      districtName={districtName}
      onClose={onClose}
      onRetry={() => {
        setErr("");
        load();
      }}
      onRoute={onRoute}
      onNearby={onNearby}
      onMove={onMove}
      onNote={setNote}
      onCheckin={() => void checkin()}
    />
  );
}

"use client";
// Marshrut: to'xtash joylari, boshlanish (geolokatsiya yoki xaritadan), eng qisqa tartib (/route/optimize — OSRM, bo'lmasa
// to'g'ri chiziq), Yandex / Google havolalari, CSV, saqlash / o'chirish (/routes). prompt() Telegram'da ishlamaydi — nom maydonda.
import { useEffect, useState } from "react";

import { api } from "@/geomap/lib/api";
import { confirmDo, inTelegram, openExternal } from "@/geomap/lib/tg";

import { csv, type RouteResult, type Saved, type Stop } from "./route.lib";
import { RouteView } from "./ui";

export { MAX_STOPS, toStop, type RouteResult, type Stop } from "./route.lib";

function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function RoutePanel({ stops, setStops, start, setStart, pickStart, picking, result, setResult, onRecord, onToast, addFiltered, filteredCount, selectionCount, addSelection }: {
  stops: Stop[]; setStops: (s: Stop[]) => void;
  start: [number, number] | null; setStart: (s: [number, number] | null) => void; pickStart: () => void; picking: boolean;
  result: RouteResult | null; setResult: (r: RouteResult | null) => void;
  onRecord: (id: string) => void; onToast: (s: string, err?: boolean) => void;
  addFiltered: () => void; filteredCount: number; selectionCount: number; addSelection: () => void;
}) {
  const [roundtrip, setRoundtrip] = useState(true);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saved, setSaved] = useState<Saved[] | null>(null); // null — hali yuklanmagan
  const [saveName, setSaveName] = useState<string | null>(null); // null — nom formasi yopiq
  const [saving, setSaving] = useState(false);
  const [tgApp] = useState(inTelegram);

  const loadSaved = () => api<Saved[]>("/routes").then(setSaved).catch(() => setSaved((s) => s ?? []));
  useEffect(() => {
    loadSaved();
  }, []);

  const optimize = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api<RouteResult>("/route/optimize", { body: { stops, start: start ? { lng: start[0], lat: start[1] } : null, roundtrip } });
      setResult(r);
      setStops(r.stops);
      if (r.engine !== "osrm") onToast("Yo'l xizmati javob bermadi — masofa taxminiy (to'g'ri chiziq)", true);
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };
  const myLocation = () => {
    if (!navigator.geolocation) return onToast("Brauzer joylashuvni bermaydi", true);
    if (locating) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setStart([pos.coords.longitude, pos.coords.latitude]);
        setResult(null);
      },
      (e) => {
        setLocating(false);
        onToast(e.code === e.PERMISSION_DENIED ? "Joylashuvga ruxsat berilmadi" : "Joylashuvni aniqlab bo'lmadi — «Xaritadan» orqali ko'rsating", true);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };
  const seq = (): [number, number][] => [...(start ? [[start[1], start[0]] as [number, number]] : []), ...stops.map((s) => [s.lat, s.lng] as [number, number])];
  const yandex = () => openExternal(`https://yandex.uz/maps/?rtext=${seq().map(([a, b]) => `${a},${b}`).join("~")}&rtt=auto`);
  const google = () => {
    const pts = seq().slice(0, 10); // Google havolasi ko'pi bilan ~10 nuqta
    openExternal(`https://www.google.com/maps/dir/${pts.map(([a, b]) => `${a},${b}`).join("/")}`);
    if (seq().length > 10) onToast("Google havolasida faqat birinchi 10 nuqta — to'liq marshrut uchun Yandex yoki CSV", true);
  };
  // prompt() Telegram ichida ishlamaydi — nom shu yerdagi maydonda so'raladi
  const save = async () => {
    if (saveName === null || saving) return;
    setSaving(true);
    try {
      await api("/routes", { body: { name: saveName.trim() || undefined, stops, geometry: result?.geometry, distance_m: result?.distance_m, duration_s: result?.duration_s } });
      setSaveName(null);
      loadSaved();
      onToast("Marshrut saqlandi");
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setSaving(false);
    }
  };
  const removeSaved = async (r: Saved) => {
    if (!(await confirmDo(`"${r.name}" marshruti o'chirilsinmi?`))) return;
    try {
      await api(`/routes/${r.id}`, { method: "DELETE" });
      loadSaved();
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e), true);
    }
  };
  const clearStops = async () => {
    if (stops.length > 3 && !(await confirmDo(`${stops.length} ta to'xtash joyi ro'yxatdan olib tashlansinmi?`))) return;
    setStops([]);
    setResult(null);
  };

  return (
    <RouteView
      stops={stops}
      start={start}
      picking={picking}
      result={result}
      roundtrip={roundtrip}
      busy={busy}
      locating={locating}
      saved={saved}
      saveName={saveName}
      saving={saving}
      tgApp={tgApp}
      filteredCount={filteredCount}
      selectionCount={selectionCount}
      addFiltered={addFiltered}
      addSelection={addSelection}
      pickStart={pickStart}
      onRecord={onRecord}
      onClear={() => void clearStops()}
      onMyLocation={myLocation}
      onClearStart={() => {
        setStart(null);
        setResult(null);
      }}
      onRoundtrip={setRoundtrip}
      onRemoveStop={(id) => {
        setStops(stops.filter((x) => x.id !== id));
        setResult(null);
      }}
      onOptimize={() => void optimize()}
      onYandex={yandex}
      onGoogle={google}
      onCsv={() => download("marshrut.csv", csv(stops))}
      onSaveName={setSaveName}
      onSave={() => void save()}
      onLoadSaved={(r) => {
        setStops(r.stops);
        setResult(r.geometry ? { stops: r.stops, geometry: r.geometry, distance_m: r.distance_m, duration_s: r.duration_s, engine: "osrm" } : null);
      }}
      onRemoveSaved={(r) => void removeSaved(r)}
    />
  );
}

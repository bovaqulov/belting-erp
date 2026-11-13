"use client";
// /app/geo/share?t=<token> — ochiq (jonli) xarita: havola tekshiriladi, parol bo'lsa — so'raladi; faqat nom, holat, manzil
// (savdo/qarz/INN yo'q). Ko'rinish — ./ui.
import { useEffect, useMemo, useState } from "react";

import { STATUS_COLOR, STATUS_LABEL } from "@/geomap/lib/fields";
import type { Layers, Style } from "@/geomap/lib/types";
import MapView, { type MapData } from "@/geomap/map";

import { ShareLockView, ShareMapView, type PubRec } from "./ui";

const STYLE: Style = { colorBy: "status", sizeBy: "none", cluster: true, labels: false, basemap: "liberty" };
const LAYERS: Layers = {
  points: true, heatmap: { on: false, metric: "count" }, hex: { on: false, res: 6, metric: "count", agg: "sum" },
  choropleth: { on: false, level: "region", metric: "count", agg: "sum" }, center: { on: false, metric: "count" },
  territories: false, boundaries: false, tiles: { on: false, url: "", opacity: 0.6 },
};
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const NONE: string[] = [];

async function post<T>(token: string, body: unknown): Promise<T> {
  const r = await fetch(`/app/api/geo/public/${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.detail || `Xato ${r.status}`);
  return j as T;
}

export default function ShareApp() {
  const [token] = useState(() => (typeof window === "undefined" ? "" : new URLSearchParams(location.search).get("t") ?? ""));
  const [meta, setMeta] = useState<{ name: string; protected: boolean } | null>(null);
  const [recs, setRecs] = useState<PubRec[] | null>(null);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [card, setCard] = useState<PubRec | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = token;
    fetch(`/app/api/geo/public/${encodeURIComponent(t || "-")}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Havola topilmadi yoki muddati tugagan" : `Xato ${r.status}`);
        const m = await r.json();
        setMeta(m);
        if (!m.protected) setRecs((await post<{ records: PubRec[] }>(t, {})).records);
      })
      .catch((e) => setErr(String(e.message || e)));
  }, [token]);

  const unlock = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      setRecs((await post<{ records: PubRec[] }>(token, { password: pw })).records);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const data = useMemo<MapData>(() => ({
    points: {
      type: "FeatureCollection",
      features: (recs ?? []).map((r) => ({ type: "Feature", geometry: { type: "Point", coordinates: [r.lng, r.lat] }, properties: { id: r.id, name: r.name, color: STATUS_COLOR[r.status] ?? "#3a8dff", size: 7, approx: false, sales: 0, w: 1 } })),
    },
    hex: null, choro: null, boundaries: null, territories: EMPTY, route: EMPTY, iso: EMPTY, prospects: EMPTY, center: EMPTY, draft: EMPTY, selected: NONE, active: card?.id ?? null,
  }), [recs, card]);
  const legend = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recs ?? []) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return [...m.entries()].map(([k, n]) => ({ label: STATUS_LABEL[k] ?? k, color: STATUS_COLOR[k] ?? "#3a8dff", n }));
  }, [recs]);

  if (!recs) return <ShareLockView meta={meta} pw={pw} busy={busy} err={err} onPw={setPw} onUnlock={() => void unlock()} />;

  return (
    <ShareMapView
      name={meta?.name}
      count={recs.length}
      map={<MapView data={data} style={STYLE} layers={LAYERS} mode="select" onRecord={(id) => setCard(recs.find((r) => r.id === id) ?? null)} onClick={() => setCard(null)} onDblClick={() => {}} />}
      legend={legend}
      card={card}
      onCloseCard={() => setCard(null)}
    />
  );
}

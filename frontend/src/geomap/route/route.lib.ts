// Marshrut: turlar va sof yordamchilar (CSV, yozuv → to'xtash joyi).
import type { Rec } from "@/geomap/lib/types";

export interface Stop { id: string; name: string; lat: number; lng: number }
export interface RouteResult { stops: Stop[]; geometry: GeoJSON.LineString; distance_m: number; duration_s: number; engine: string }
export interface Saved { id: number; name: string; stops: Stop[]; geometry: GeoJSON.LineString | null; distance_m: number; duration_s: number; ts: string }

export const MAX_STOPS = 100;

export function csv(stops: Stop[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return ["Tartib,Nomi,Kenglik,Uzunlik", ...stops.map((s, i) => [i + 1, esc(s.name), s.lat.toFixed(6), s.lng.toFixed(6)].join(","))].join("\n");
}

export function toStop(r: Rec): Stop | null {
  return r.lat !== null && r.lng !== null ? { id: r.id, name: r.name, lat: r.lat, lng: r.lng } : null;
}

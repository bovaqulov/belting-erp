import type { Metadata } from "next";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/geomap/styles/geo.css";

export const metadata: Metadata = { title: "Mijozlar xaritasi" };

// GeoMap (/app/geo) — Lenta kabi Jarvis ichidagi Mini App. API: /app/api/geo/* (backend web/geomap_api.py).
export default function GeoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}

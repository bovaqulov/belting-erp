// Vizualizatsiya hisoblari: olti burchaklar (H3), viloyat/tuman bo'yash, og'irlikli markaz, rang shkalalari, vidjetlar.
import { cellToBoundary, latLngToCell } from "h3-js";

import { QUALITY_COLOR, STATUS_COLOR } from "./fields";
import type { Agg, ColorBy, Metric, Rec } from "./types";

export const PALETTE = ["#3a8dff", "#e5484d", "#30a46c", "#f5a524", "#8e4ec6", "#12a594", "#e54666", "#978365",
  "#0090ff", "#ff801f", "#5bb98c", "#d6409f", "#6e56cf", "#ffc53d", "#29a383", "#ad7f58"];
// ketma-ket shkala (kam -> ko'p): ochiq ko'kdan to'q binafshagacha — ikkala mavzuda ham o'qiladi
export const SEQ = ["#d4e8ff", "#9cc8ff", "#5fa3f7", "#3a7be0", "#4f55c4", "#5b2f9e"];

export function metricOf(r: Rec, m: Metric): number {
  return m === "count" ? 1 : m === "sales" ? r.sales || 0 : m === "debt" ? r.debt || 0 : r.deals || 0;
}

export function located(rs: Rec[]): (Rec & { lat: number; lng: number })[] {
  return rs.filter((r): r is Rec & { lat: number; lng: number } => r.lat !== null && r.lng !== null);
}

/** Qiymatlar -> kvantil chegaralari (n sinf). */
export function breaks(values: number[], n = SEQ.length): number[] {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return [];
  const out: number[] = [];
  for (let i = 1; i < n; i++) out.push(v[Math.min(v.length - 1, Math.floor((i * v.length) / n))]);
  return [...new Set(out)];
}

export function classOf(x: number, br: number[]): number {
  let i = 0;
  while (i < br.length && x > br[i]) i++;
  return i;
}

// ---------------- olti burchaklar ----------------
export interface HexCell {
  cell: string;
  value: number;
  n: number;
}

export function hexagons(rs: Rec[], res: number, metric: Metric, agg: Agg): { fc: GeoJSON.FeatureCollection; br: number[] } {
  const m = new Map<string, { sum: number; n: number }>();
  for (const r of located(rs)) {
    if (r.q === "region" || r.q === "none") continue; // viloyat markazidagi taxminiy nuqta katakni buzadi
    const c = latLngToCell(r.lat, r.lng, res);
    const e = m.get(c) ?? { sum: 0, n: 0 };
    e.sum += metricOf(r, metric);
    e.n += 1;
    m.set(c, e);
  }
  const cells = [...m.entries()].map(([cell, e]) => ({ cell, n: e.n, value: agg === "avg" && metric !== "count" ? e.sum / e.n : e.sum }));
  const br = breaks(cells.map((c) => c.value));
  const fc: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: cells.map((c) => ({
      type: "Feature",
      properties: { cell: c.cell, value: c.value, n: c.n, cls: classOf(c.value, br) },
      geometry: { type: "Polygon", coordinates: [cellToBoundary(c.cell, true)] },
    })),
  };
  return { fc, br };
}

// ---------------- viloyat/tuman bo'yash ----------------
export function choropleth(rs: Rec[], level: "region" | "district", metric: Metric, agg: Agg): { values: Map<string, { value: number; n: number }>; br: number[] } {
  const m = new Map<string, { sum: number; n: number }>();
  for (const r of rs) {
    const k = level === "region" ? r.region : r.district;
    if (!k) continue;
    const e = m.get(k) ?? { sum: 0, n: 0 };
    e.sum += metricOf(r, metric);
    e.n += 1;
    m.set(k, e);
  }
  const values = new Map([...m.entries()].map(([k, e]) => [k, { n: e.n, value: agg === "avg" && metric !== "count" ? e.sum / e.n : e.sum }]));
  return { values, br: breaks([...values.values()].map((v) => v.value)) };
}

// ---------------- og'irlikli geografik markaz ----------------
export function weightedCenter(rs: Rec[], metric: Metric): { lat: number; lng: number; weight: number } | null {
  // sferada: birlik vektorlar o'rtachasi (katta masofada ham to'g'ri)
  let x = 0, y = 0, z = 0, w = 0;
  for (const r of located(rs)) {
    const k = metricOf(r, metric);
    if (k <= 0) continue;
    const la = (r.lat * Math.PI) / 180, lo = (r.lng * Math.PI) / 180;
    x += Math.cos(la) * Math.cos(lo) * k;
    y += Math.cos(la) * Math.sin(lo) * k;
    z += Math.sin(la) * k;
    w += k;
  }
  if (!w) return null;
  const lng = Math.atan2(y, x), hyp = Math.sqrt(x * x + y * y), lat = Math.atan2(z, hyp);
  return { lat: (lat * 180) / Math.PI, lng: (lng * 180) / Math.PI, weight: w };
}

// ---------------- nuqta ranglari ----------------
export function categoryValue(r: Rec, by: ColorBy): string {
  switch (by) {
    case "status": return r.status;
    case "region": return r.region ?? "—";
    case "owner": return r.owner ?? "—";
    case "q": return r.q;
    case "territory": return r.territory ? String(r.territory) : "—";
    case "tag": return r.tag ?? "—";
    case "type": return r.type ?? "—";
    default: return "—";
  }
}

export function colorScale(rs: Rec[], by: ColorBy, territoryColors: Map<string, string>): { color: (r: Rec) => string; legend: { label: string; color: string; n: number }[]; breaks?: number[] } {
  if (by === "none") return { color: () => "#3a8dff", legend: [] };
  if (by === "sales" || by === "debt") {
    const br = breaks(rs.map((r) => (by === "sales" ? r.sales : r.debt)));
    const color = (r: Rec) => {
      const v = by === "sales" ? r.sales : r.debt;
      return v > 0 ? SEQ[classOf(v, br)] : "#8a94a8";
    };
    return { color, legend: [], breaks: br };
  }
  const counts = new Map<string, number>();
  for (const r of rs) counts.set(categoryValue(r, by), (counts.get(categoryValue(r, by)) ?? 0) + 1);
  const keys = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  const fixed: Record<string, string> =
    by === "status" ? STATUS_COLOR : by === "q" ? (QUALITY_COLOR as Record<string, string>) : by === "territory" ? Object.fromEntries(territoryColors) : {};
  const map = new Map<string, string>();
  let i = 0;
  for (const k of keys) {
    if (k === "—") map.set(k, "#8a94a8");
    else map.set(k, fixed[k] ?? PALETTE[i++ % PALETTE.length]);
  }
  return {
    color: (r) => map.get(categoryValue(r, by)) ?? "#8a94a8",
    legend: keys.map((k) => ({ label: k, color: map.get(k) ?? "#8a94a8", n: counts.get(k) ?? 0 })),
  };
}

// ---------------- vidjetlar ----------------
export interface Summary {
  n: number;
  located: number;
  approx: number;
  sales: number;
  debt: number;
  overdue: number;
  deals: number;
  byStatus: [string, number][];
  byRegion: [string, number, number][];
  byOwner: [string, number, number][];
}

export function summarize(rs: Rec[]): Summary {
  const st = new Map<string, number>();
  const reg = new Map<string, [number, number]>();
  const own = new Map<string, [number, number]>();
  let sales = 0, debt = 0, overdue = 0, deals = 0, loc = 0, approx = 0;
  for (const r of rs) {
    sales += r.sales || 0;
    debt += r.debt || 0;
    deals += r.deals || 0;
    if (r.overdue > 0) overdue++;
    if (r.lat !== null) loc++;
    if (r.q === "region" || r.q === "district") approx++;
    st.set(r.status, (st.get(r.status) ?? 0) + 1);
    const rk = r.region ?? "—";
    const e = reg.get(rk) ?? [0, 0];
    reg.set(rk, [e[0] + 1, e[1] + (r.sales || 0)]);
    const ok = r.ownerName ?? "—";
    const o = own.get(ok) ?? [0, 0];
    own.set(ok, [o[0] + 1, o[1] + (r.sales || 0)]);
  }
  const top = (m: Map<string, [number, number]>) => [...m.entries()].map(([k, [n, s]]) => [k, n, s] as [string, number, number]).sort((a, b) => b[2] - a[2] || b[1] - a[1]);
  return {
    n: rs.length, located: loc, approx, sales, debt, overdue, deals,
    byStatus: [...st.entries()].sort((a, b) => b[1] - a[1]),
    byRegion: top(reg),
    byOwner: top(own),
  };
}

// ---------------- geometriya ----------------
/** Nuqta poligon ichidami (ray casting; [lng, lat] halqa). */
export function inRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inGeometry(lng: number, lat: number, g: GeoJSON.Geometry): boolean {
  if (g.type === "Polygon") return inRing(lng, lat, g.coordinates[0]) && !g.coordinates.slice(1).some((h) => inRing(lng, lat, h));
  if (g.type === "MultiPolygon") return g.coordinates.some((p) => inRing(lng, lat, p[0]) && !p.slice(1).some((h) => inRing(lng, lat, h)));
  return false;
}

export function circle(lat: number, lng: number, radiusM: number, n = 64): GeoJSON.Polygon {
  const pts: number[][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (2 * Math.PI * i) / n;
    pts.push([lng + (radiusM * Math.sin(a)) / (111_320 * Math.cos((lat * Math.PI) / 180)), lat + (radiusM * Math.cos(a)) / 111_320]);
  }
  return { type: "Polygon", coordinates: [pts] };
}

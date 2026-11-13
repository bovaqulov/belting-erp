// Hududlar: turlar (asbob, yangi mijoz, yaqin mijoz, avto-hudud) va fayl → GeoJSON (GeoJSON / KML / GPX / Shapefile .zip).
export type Tool =
  | { kind: "draw" } | { kind: "lasso" } | { kind: "radius"; center?: [number, number] }
  | { kind: "iso" } | { kind: "prospects" } | { kind: "nearby" } | { kind: "route-start" } | { kind: "move"; id: string };

export interface Prospect { osm: string; name: string; lat: number; lng: number; kind: string; phone?: string; website?: string; address?: string; known: boolean }
export interface Nearby { id: string; name: string; dist: number; status: string }

export interface AutoT { name: string; color: string; total: number; pct: number; geometry: GeoJSON.Geometry; districts?: string[]; cells?: string[]; owner?: string }

export async function fileToGeoJSON(f: File): Promise<GeoJSON.FeatureCollection> {
  const name = f.name.toLowerCase();
  if (name.endsWith(".geojson") || name.endsWith(".json")) return JSON.parse(await f.text());
  if (name.endsWith(".kml") || name.endsWith(".gpx")) {
    const tj = await import("@tmcw/togeojson");
    const dom = new DOMParser().parseFromString(await f.text(), "text/xml");
    return (name.endsWith(".kml") ? tj.kml(dom) : tj.gpx(dom)) as GeoJSON.FeatureCollection;
  }
  if (name.endsWith(".zip")) {
    const shp = (await import("shpjs")).default;
    const res = await shp(await f.arrayBuffer());
    const list = Array.isArray(res) ? res : [res];
    return { type: "FeatureCollection", features: list.flatMap((x) => (x as GeoJSON.FeatureCollection).features) };
  }
  throw new Error("Qo'llab-quvvatlanadigan fayllar: .geojson, .kml, .gpx, .zip (Shapefile)");
}


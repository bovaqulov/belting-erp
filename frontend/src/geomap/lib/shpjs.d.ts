// shpjs (Shapefile .zip -> GeoJSON) — kutubxonada tip yo'q; ishlatiladigan qismi.
declare module "shpjs" {
  const shp: (data: ArrayBuffer | string) => Promise<GeoJSON.FeatureCollection | GeoJSON.FeatureCollection[]>;
  export default shp;
}

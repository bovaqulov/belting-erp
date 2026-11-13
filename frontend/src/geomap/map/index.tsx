"use client";
// MapLibre o'ramasi. Xarita bir marta yaratiladi; props o'zgarsa — faqat manbalar ma'lumoti (setData) va ko'rinish
// yangilanadi. Uslub (basemap) almashsa — maxsus qatlamlar 'style.load' da qayta qo'shiladi. Konteyner — ./ui.
import type { Map as MLMap, MapMouseEvent, GeoJSONSource, StyleSpecification } from "maplibre-gl";
import { useEffect, useRef } from "react";

import { SEQ } from "@/geomap/lib/stats";
import type { Layers, Style } from "@/geomap/lib/types";

import { MapCanvas } from "./ui";

export type Mode = "select" | "draw" | "lasso" | "radius" | "pick";

export interface MapData {
  points: GeoJSON.FeatureCollection; // {id, name, color, size, approx}
  hex: GeoJSON.FeatureCollection | null; // {cls, value, n}
  choro: GeoJSON.FeatureCollection | null; // {cls, value, name}
  boundaries: GeoJSON.FeatureCollection | null; // viloyat chegaralari (kontur)
  territories: GeoJSON.FeatureCollection; // {id, name, color}
  route: GeoJSON.FeatureCollection; // LineString + Point{n}
  iso: GeoJSON.FeatureCollection;
  prospects: GeoJSON.FeatureCollection; // {name, known}
  center: GeoJSON.FeatureCollection;
  draft: GeoJSON.FeatureCollection;
  selected: string[];
  active?: string | null; // ochiq kartaning mijozi — xaritada ham ajratiladi
}

interface Props {
  data: MapData;
  style: Style;
  layers: Layers;
  mode: Mode;
  /** keepZoom — faqat suriladi (xaritadagi nuqta bosilganda zoom sakramasin); card — telefonda nuqta karta ostida qolmasin */
  focus?: { lng: number; lat: number; zoom?: number; keepZoom?: boolean; card?: boolean; seq: number } | null;
  fit?: { bounds: [number, number, number, number]; seq: number } | null;
  onRecord: (id: string) => void;
  onClick: (lng: number, lat: number) => void;
  onDblClick: () => void;
  onMove?: (center: [number, number], zoom: number) => void;
}

const FONT = ["Noto Sans Regular"];
const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

function styleUrl(b: Style["basemap"]): string | StyleSpecification {
  if (b === "satellite") {
    return {
      version: 8,
      glyphs: GLYPHS,
      sources: {
        sat: {
          type: "raster",
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
          maxzoom: 19,
          attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics",
        },
      },
      layers: [{ id: "sat", type: "raster", source: "sat" }],
    };
  }
  return `https://tiles.openfreemap.org/styles/${b}`;
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const SOURCES = ["raw", "clu", "hex", "choro", "bnd", "terr", "route", "iso", "pros", "center", "draft"] as const;
const seqColor = ["match", ["get", "cls"], ...SEQ.flatMap((c, i) => [i, c]), "#8a94a8"] as unknown as string;
const PHONE = "(max-width: 760px)"; // geo.css dagi pastki varaq chegarasi bilan bir xil

/** Oxirgi yuborilgan ma'lumot: har renderda 11 manbaga setData qilinmasin (4300 nuqta qayta klasterlanadi) —
 *  faqat havolasi o'zgargan manba yangilanadi. Uslub almashsa (style.load) kesh tozalanadi. */
interface Pushed {
  src: Record<string, GeoJSON.FeatureCollection | undefined>;
  pts?: { points: GeoJSON.FeatureCollection; selected: string[]; active: string | null; out: GeoJSON.FeatureCollection };
  selColor?: string;
}

export default function MapView(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const props = useRef(p);
  const basemap = useRef(p.style.basemap);
  const pushed = useRef<Pushed>({ src: {} });
  useEffect(() => {
    props.current = p;
  });

  // ---------------- yaratish ----------------
  useEffect(() => {
    let disposed = false;
    (async () => {
      const ml = (await import("maplibre-gl")).default;
      if (disposed || !el.current) return;
      const m = new ml.Map({
        container: el.current,
        style: styleUrl(props.current.style.basemap),
        center: [64.6, 41.4],
        zoom: 5.2,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
      m.touchZoomRotate.disableRotation();
      m.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");
      m.addControl(new ml.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), "bottom-right");
      m.addControl(new ml.ScaleControl({ unit: "metric" }), "bottom-left");
      map.current = m;
      m.on("style.load", () => {
        addLayers(m);
        ready.current = true;
        pushed.current = { src: {} }; // yangi uslub — manbalar bo'sh
        push(m, props.current, pushed.current);
      });
      // ---- hodisalar ----
      m.on("click", (e: MapMouseEvent) => {
        const cur = props.current;
        if (cur.mode !== "select") {
          cur.onClick(e.lngLat.lng, e.lngLat.lat);
          return;
        }
        const f = m.queryRenderedFeatures(e.point, { layers: ["clu-c", "pt", "clu-p", "pros"].filter((l) => m.getLayer(l)) });
        const hit = f[0];
        if (!hit) {
          cur.onClick(e.lngLat.lng, e.lngLat.lat);
          return;
        }
        if (hit.layer.id === "clu-c") {
          const src = m.getSource("clu") as GeoJSONSource;
          src.getClusterExpansionZoom(hit.properties.cluster_id).then((z) => {
            m.easeTo({ center: (hit.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z + 0.3 });
          });
          return;
        }
        if (hit.layer.id === "pt" || hit.layer.id === "clu-p") cur.onRecord(String(hit.properties.id));
        else cur.onClick(e.lngLat.lng, e.lngLat.lat);
      });
      m.on("dblclick", (e) => {
        if (props.current.mode === "draw" || props.current.mode === "lasso") {
          e.preventDefault();
          props.current.onDblClick();
        }
      });
      for (const l of ["pt", "clu-p", "clu-c", "pros"]) {
        m.on("mouseenter", l, () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", l, () => (m.getCanvas().style.cursor = props.current.mode === "select" ? "" : "crosshair"));
      }
      m.on("moveend", () => {
        const c = m.getCenter();
        props.current.onMove?.([c.lng, c.lat], m.getZoom());
      });
      // tooltip — faqat sichqoncha bor qurilmada: sensorli ekranda "mouseleave" kelmaydi, yozuv xaritada osilib qoladi
      const pop = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: "gm-tip" });
      for (const l of window.matchMedia("(hover: hover)").matches ? ["pt", "clu-p", "pros"] : []) {
        m.on("mousemove", l, (e) => {
          const f = e.features?.[0];
          if (!f) return;
          pop.setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number]).setText(String(f.properties.name)).addTo(m);
        });
        m.on("mouseleave", l, () => pop.remove());
      }
    })();
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      ready.current = false;
    };
  }, []);

  // ---------------- yangilash ----------------
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (basemap.current !== p.style.basemap) {
      basemap.current = p.style.basemap;
      ready.current = false;
      m.setStyle(styleUrl(p.style.basemap), { diff: false }); // style.load -> addLayers + push
      return;
    }
    if (!ready.current) return;
    push(m, p, pushed.current);
  });

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    m.getCanvas().style.cursor = p.mode === "select" ? "" : "crosshair";
    if (p.mode === "draw" || p.mode === "lasso") m.doubleClickZoom.disable();
    else m.doubleClickZoom.enable();
  }, [p.mode]);

  useEffect(() => {
    const m = map.current;
    if (!p.focus || !m) return;
    const phone = window.matchMedia(PHONE).matches;
    // telefonda karta pastdan ekranning yarmini yopadi — nuqta yuqoridagi ochiq qismga tushsin
    const offset: [number, number] = phone && p.focus.card ? [0, -Math.round(m.getContainer().clientHeight * 0.3)] : [0, 0];
    const center: [number, number] = [p.focus.lng, p.focus.lat];
    if (p.focus.keepZoom) m.easeTo({ center, offset, duration: 350 });
    else m.flyTo({ center, offset, zoom: p.focus.zoom ?? Math.max(m.getZoom(), 13), speed: 1.6 });
  }, [p.focus]);

  useEffect(() => {
    if (p.fit && map.current) {
      const [a, b, c, d] = p.fit.bounds;
      // yuqorida qidiruv paneli, telefonda pastda yig'ilgan varaq va o'ngda boshqaruv tugmalari turadi
      const padding = window.matchMedia(PHONE).matches ? { top: 70, bottom: 150, left: 30, right: 60 } : { top: 70, bottom: 60, left: 60, right: 60 };
      map.current.fitBounds([[a, b], [c, d]], { padding, maxZoom: 14, duration: 700 });
    }
  }, [p.fit]);

  return <MapCanvas elRef={el} />;
}

// ---------------- qatlamlar ----------------
function addLayers(m: MLMap) {
  const add = (id: string, opts: Record<string, unknown> = {}) => {
    if (!m.getSource(id)) m.addSource(id, { type: "geojson", data: EMPTY, ...opts } as never);
  };
  for (const s of SOURCES) {
    if (s === "clu") add(s, { cluster: true, clusterRadius: 46, clusterMaxZoom: 13, clusterProperties: { sales: ["+", ["get", "sales"]] } });
    else add(s);
  }
  if (!m.getSource("tiles")) m.addSource("tiles", { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256 });

  const L = (spec: Record<string, unknown>) => {
    if (!m.getLayer(spec.id as string)) m.addLayer(spec as never);
  };
  L({ id: "tiles", type: "raster", source: "tiles", layout: { visibility: "none" }, paint: { "raster-opacity": 0.6 } });
  L({ id: "choro", type: "fill", source: "choro", paint: { "fill-color": seqColor, "fill-opacity": 0.55 } });
  L({ id: "choro-l", type: "line", source: "choro", paint: { "line-color": "#fff", "line-width": 0.6, "line-opacity": 0.7 } });
  L({ id: "bnd", type: "line", source: "bnd", paint: { "line-color": "#6b7a99", "line-width": 1.2, "line-dasharray": [2, 1.5] } });
  L({ id: "terr", type: "fill", source: "terr", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.16 } });
  L({ id: "terr-l", type: "line", source: "terr", paint: { "line-color": ["get", "color"], "line-width": 2 } });
  L({ id: "terr-t", type: "symbol", source: "terr", layout: { "text-field": ["get", "name"], "text-font": FONT, "text-size": 12, "symbol-placement": "point" }, paint: { "text-color": ["get", "color"], "text-halo-color": "#fff", "text-halo-width": 1.6 } });
  L({ id: "iso", type: "fill", source: "iso", paint: { "fill-color": ["coalesce", ["get", "fillColor"], "#8e4ec6"], "fill-opacity": 0.22 } });
  L({ id: "iso-l", type: "line", source: "iso", paint: { "line-color": ["coalesce", ["get", "color"], "#8e4ec6"], "line-width": 1.5 } });
  L({ id: "hex", type: "fill", source: "hex", paint: { "fill-color": seqColor, "fill-opacity": 0.7, "fill-outline-color": "rgba(255,255,255,0.6)" } });
  L({ id: "heat", type: "heatmap", source: "raw", maxzoom: 15, paint: {
    "heatmap-weight": ["get", "w"],
    "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 4, 0.8, 12, 2.5],
    "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 4, 12, 9, 22, 13, 38],
    "heatmap-opacity": 0.8,
    "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(58,141,255,0)", 0.15, "#5fa3f7", 0.35, "#30a46c", 0.55, "#f5a524", 0.8, "#ff801f", 1, "#e5484d"],
  } });
  L({ id: "route", type: "line", source: "route", filter: ["==", ["geometry-type"], "LineString"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#3a8dff", "line-width": 5, "line-opacity": 0.85 } });
  // nuqtalar: klasterlanmagan ('raw') yoki klasterlangan ('clu') manba
  L({ id: "clu-c", type: "circle", source: "clu", filter: ["has", "point_count"], paint: {
    "circle-color": ["step", ["get", "point_count"], "#5fa3f7", 20, "#3a7be0", 100, "#4f55c4", 400, "#5b2f9e"],
    "circle-radius": ["step", ["get", "point_count"], 15, 20, 19, 100, 24, 400, 30],
    "circle-stroke-color": "#fff", "circle-stroke-width": 2, "circle-opacity": 0.92,
  } });
  L({ id: "clu-t", type: "symbol", source: "clu", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": FONT, "text-size": 12, "text-allow-overlap": true }, paint: { "text-color": "#fff" } });
  L({ id: "pt", type: "circle", source: "raw", paint: {
    "circle-color": ["get", "color"],
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, ["*", 0.6, ["get", "size"]], 12, ["get", "size"], 16, ["*", 1.4, ["get", "size"]]],
    "circle-stroke-color": ["case", ["boolean", ["get", "sel"], false], "#111", "#fff"],
    "circle-stroke-width": ["case", ["boolean", ["get", "sel"], false], 3.5, 1.4],
    "circle-opacity": ["case", ["get", "approx"], 0.55, 0.95],
  } });
  L({ id: "clu-p", type: "circle", source: "clu", filter: ["!", ["has", "point_count"]], paint: {
    "circle-color": ["get", "color"],
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, ["*", 0.6, ["get", "size"]], 12, ["get", "size"], 16, ["*", 1.4, ["get", "size"]]],
    "circle-stroke-color": ["case", ["boolean", ["get", "sel"], false], "#111", "#fff"],
    "circle-stroke-width": ["case", ["boolean", ["get", "sel"], false], 3.5, 1.4],
    "circle-opacity": ["case", ["get", "approx"], 0.55, 0.95],
  } });
  L({ id: "pt-t", type: "symbol", source: "raw", minzoom: 10, layout: { "text-field": ["get", "name"], "text-font": FONT, "text-size": 11, "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true, visibility: "none" }, paint: { "text-color": "#1b2333", "text-halo-color": "#fff", "text-halo-width": 1.5 } });
  L({ id: "route-n", type: "circle", source: "route", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": "#3a8dff", "circle-radius": 10, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
  L({ id: "route-t", type: "symbol", source: "route", filter: ["==", ["geometry-type"], "Point"], layout: { "text-field": ["to-string", ["get", "n"]], "text-font": FONT, "text-size": 11, "text-allow-overlap": true }, paint: { "text-color": "#fff" } });
  L({ id: "pros", type: "circle", source: "pros", paint: { "circle-color": ["case", ["get", "known"], "#8a94a8", "#ff801f"], "circle-radius": 7, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
  L({ id: "pros-t", type: "symbol", source: "pros", minzoom: 11, layout: { "text-field": ["get", "name"], "text-font": FONT, "text-size": 11, "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true }, paint: { "text-color": "#a3470c", "text-halo-color": "#fff", "text-halo-width": 1.5 } });
  L({ id: "center", type: "circle", source: "center", paint: { "circle-color": "#e5484d", "circle-radius": 11, "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
  L({ id: "center-t", type: "symbol", source: "center", layout: { "text-field": "Markaz", "text-font": FONT, "text-size": 12, "text-offset": [0, 1.4], "text-anchor": "top" }, paint: { "text-color": "#e5484d", "text-halo-color": "#fff", "text-halo-width": 1.6 } });
  L({ id: "draft", type: "fill", source: "draft", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#3a8dff", "fill-opacity": 0.15 } });
  L({ id: "draft-l", type: "line", source: "draft", paint: { "line-color": "#3a8dff", "line-width": 2, "line-dasharray": [2, 1] } });
  L({ id: "draft-p", type: "circle", source: "draft", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": "#fff", "circle-radius": 5, "circle-stroke-color": "#3a8dff", "circle-stroke-width": 2 } });
}

function setData(m: MLMap, id: string, d: GeoJSON.FeatureCollection | null) {
  const s = m.getSource(id) as GeoJSONSource | undefined;
  s?.setData(d ?? EMPTY);
}

function vis(m: MLMap, ids: string[], on: boolean) {
  for (const id of ids) if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
}

/** Tanlangan/ochiq nuqtalarga `sel` belgisi; natija (points, selected, active) havolalari o'zgarmaguncha keshdan. */
function withSel(data: MapData, c: Pushed): GeoJSON.FeatureCollection {
  const active = data.active ?? null;
  if (!data.selected.length && !active) return data.points;
  const k = c.pts;
  if (k && k.points === data.points && k.selected === data.selected && k.active === active) return k.out;
  const sel = new Set(data.selected);
  if (active) sel.add(active);
  const out: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: data.points.features.map((f) => (sel.has(String(f.properties?.id)) ? { ...f, properties: { ...f.properties, sel: true } } : f)),
  };
  c.pts = { points: data.points, selected: data.selected, active, out };
  return out;
}

function push(m: MLMap, p: Props, c: Pushed) {
  const { data, style, layers } = p;
  const put = (id: string, d: GeoJSON.FeatureCollection | null) => {
    const v = d ?? EMPTY;
    if (c.src[id] === v) return;
    c.src[id] = v;
    setData(m, id, v);
  };
  const pts = withSel(data, c);
  put("raw", pts);
  put("clu", style.cluster ? pts : EMPTY);
  put("hex", layers.hex.on ? data.hex : null);
  put("choro", layers.choropleth.on ? data.choro : null);
  put("bnd", layers.boundaries ? data.boundaries : null);
  put("terr", layers.territories ? data.territories : null);
  put("route", data.route);
  put("iso", data.iso);
  put("pros", data.prospects);
  put("center", layers.center.on ? data.center : null);
  put("draft", data.draft);

  // tanlov halqasi: qorong'i xarita va sun'iy yo'ldoshda qora chiziq ko'rinmaydi
  const selColor = style.basemap === "dark" || style.basemap === "satellite" ? "#ffd60a" : "#111";
  if (c.selColor !== selColor) {
    c.selColor = selColor;
    for (const id of ["pt", "clu-p"]) if (m.getLayer(id)) m.setPaintProperty(id, "circle-stroke-color", ["case", ["boolean", ["get", "sel"], false], selColor, "#fff"]);
  }

  vis(m, ["pt"], layers.points && !style.cluster);
  vis(m, ["clu-c", "clu-t", "clu-p"], layers.points && style.cluster);
  vis(m, ["pt-t"], layers.points && style.labels);
  // klaster rejimida nomlar faqat klasterlar tarqalgandan keyin (clusterMaxZoom 13)
  if (m.getLayer("pt-t")) m.setLayerZoomRange("pt-t", style.cluster ? 14 : 10, 24);
  vis(m, ["heat"], layers.heatmap.on);
  vis(m, ["tiles"], layers.tiles.on && !!layers.tiles.url);
  if (layers.tiles.on && layers.tiles.url) {
    const src = m.getSource("tiles") as unknown as { tiles?: string[]; setTiles?: (t: string[]) => void };
    if (src?.setTiles && src.tiles?.[0] !== layers.tiles.url) src.setTiles([layers.tiles.url]);
    if (m.getLayer("tiles")) m.setPaintProperty("tiles", "raster-opacity", layers.tiles.opacity);
  }
}

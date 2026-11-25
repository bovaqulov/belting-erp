"use client";
// GeoMap — mijozlar xaritasi (CRM mijozlari va xaridlari): holat, yuklash (sessiya / Telegram), filtr, uslub, qatlamlar, hududlar,
// marshrut, ulashish, xarita asboblari (chizish, lasso, radius, izoxron, OSM, joyini to'g'rilash), ommaviy amallar. Ko'rinish — ./ui.
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { api, ApiError, flushCheckins, pendingCheckins } from "@/geomap/lib/api";
import { countRules, EMPTY_FILTER, FIELDS, haversine, localIso, matchFilter, num, QUALITY_LABEL, STATUS_LABEL } from "@/geomap/lib/fields";
import { choropleth, circle, classOf, colorScale, hexagons, inGeometry, located, summarize, weightedCenter } from "@/geomap/lib/stats";
import { backOff, backShow, confirmDo, haptic, initData, initTelegram } from "@/geomap/lib/tg";
import type { FieldKey, Filter, Layers, Me, Meta, Owner, Rec, Rule, Style, Territory, ViewState } from "@/geomap/lib/types";

import FilterPanel from "@/geomap/filter";
import Login from "@/geomap/login";
import MapView, { type MapData, type Mode } from "@/geomap/map";
import RecordCard from "@/geomap/record";
import RoutePanel, { MAX_STOPS, toStop, type RouteResult, type Stop } from "@/geomap/route";
import SharePanel from "@/geomap/share-panel";
import StylePanel from "@/geomap/style";
import TerritoryPanel, { type Nearby, type Prospect, type Tool } from "@/geomap/territory";
import WidgetsPanel from "@/geomap/widgets";

import { GeoError, GeoSplash, GeoView, type Tab } from "./ui";

const DEFAULT_STYLE: Style = { colorBy: "status", sizeBy: "sales", cluster: true, labels: false, basemap: "liberty" };
const DEFAULT_LAYERS: Layers = {
  points: true,
  heatmap: { on: false, metric: "count" },
  hex: { on: false, res: 6, metric: "count", agg: "sum" },
  choropleth: { on: false, level: "region", metric: "sales", agg: "sum" },
  center: { on: false, metric: "sales" },
  territories: true,
  boundaries: false,
  tiles: { on: false, url: "", opacity: 0.6 },
};
const STORE = "geomap.state.v1";
const PHONE = "(max-width: 760px)"; // geo.css dagi pastki varaq chegarasi
const BULK_CHUNK = 500; // backend /bulk bitta so'rovda shuncha yozuv oladi (ortig'ini jim tashlab yuboradi)
const ENUM_FIELDS = FIELDS.filter((f) => f.type === "enum").map((f) => f.key);
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function loadState(): Partial<ViewState> {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "{}");
  } catch {
    return {};
  }
}

function bbox(coords: [number, number][]): [number, number, number, number] | null {
  if (!coords.length) return null;
  let a = 180, b = 90, c = -180, d = -90;
  for (const [x, y] of coords) {
    a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y);
  }
  return [a, b, c, d];
}

function geomCoords(g: GeoJSON.Geometry): [number, number][] {
  if (g.type === "Polygon") return g.coordinates.flat() as [number, number][];
  if (g.type === "MultiPolygon") return g.coordinates.flat(2) as [number, number][];
  if (g.type === "LineString") return g.coordinates as [number, number][];
  return [];
}

export default function GeoApp() {
  const [phase, setPhase] = useState<"loading" | "login" | "ok" | "error">("loading");
  const [fatal, setFatal] = useState("");
  const [me, setMe] = useState<Me | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [records, setRecords] = useState<Rec[]>([]);
  const [synced, setSynced] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [boundaries, setBoundaries] = useState<{ region?: GeoJSON.FeatureCollection; district?: GeoJSON.FeatureCollection }>({});

  const [filter, setFilter] = useState<Filter>(() => loadState().filter ?? EMPTY_FILTER);
  const [style, setStyle] = useState<Style>(() => ({ ...DEFAULT_STYLE, ...loadState().style }));
  const [layers, setLayers] = useState<Layers>(() => ({ ...DEFAULT_LAYERS, ...loadState().layers }));
  const [now] = useState(() => Date.now());   // "oxirgi N kun" filtrlari uchun (render toza bo'lsin)
  const camera = useRef<{ center: [number, number]; zoom: number } | undefined>(undefined);

  const [tab, setTab] = useState<Tab>("filter");
  // ochilgan panellar yopilmaydi (yashiriladi): forma, oldindan ko'rish, ochiq bo'limlar va scroll tab almashganda yo'qolmasin
  const [seen, setSeen] = useState<Tab[]>(["filter"]);
  const [sheet, setSheet] = useState(false);
  const [cardId, setCardId] = useState<string | null>(null);
  const [cardRev, setCardRev] = useState(0); // joyi o'zgargach karta qayta yuklanadi
  const [work, setWork] = useState<string | null>(null); // uzoq so'rov (vaqt zonasi, OSM qidiruvi) ketmoqda
  const [bulkUi, setBulkUi] = useState<{ action: "tag" | "owner"; value: string } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool | null>(null);
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [drawn, setDrawn] = useState<GeoJSON.Polygon | null>(null);
  const [radiusKm, setRadiusKm] = useState(10);
  const [preview, setPreview] = useState<GeoJSON.FeatureCollection | null>(null);
  const [iso, setIso] = useState<GeoJSON.FeatureCollection>(EMPTY);
  const [isoMinutes, setIsoMinutes] = useState<number[]>([15, 30]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [prosRadius, setProsRadius] = useState(5);
  const [nearby, setNearby] = useState<Nearby[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [start, setStart] = useState<[number, number] | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [focus, setFocus] = useState<{ lng: number; lat: number; zoom?: number; keepZoom?: boolean; card?: boolean; seq: number } | null>(null);
  const [fit, setFit] = useState<{ bounds: [number, number, number, number]; seq: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);
  const [pending, setPending] = useState(0);
  const bndBusy = useRef(new Set<string>());

  const go = useCallback((t: Tab) => {
    setTab(t);
    setSeen((s) => (s.includes(t) ? s : [...s, t]));
    setSheet(true);
  }, []);

  const say = useCallback((text: string, err?: boolean) => {
    setToast({ text, err });
    haptic(err ? "error" : "success");
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 3500);
  }, []);

  // ---------------- yuklash ----------------
  const loadRecords = useCallback(async () => {
    const r = await api<{ records: Rec[]; synced: string | null; note: string | null }>("/records");
    setRecords(r.records);
    setSynced(r.synced);
    setNote(r.note);
  }, []);
  const loadTerritories = useCallback(async (withRecords = true) => {
    setTerritories(await api<Territory[]>("/territories"));
    if (withRecords) await loadRecords(); // hudud a'zoligi (territory) yangilanadi; rang/mas'ul o'zgarsa kerak emas
  }, [loadRecords]);

  const boot = useCallback(async () => {
    try {
      const m = await api<Me>("/me");
      setMe(m);
      const [mt, , ts, ow] = await Promise.all([api<Meta>("/meta"), loadRecords(), api<Territory[]>("/territories"), api<Owner[]>("/owners").catch(() => [])]);
      setMeta(mt);
      setTerritories(ts);
      setOwners(ow);
      setPhase("ok");
      flushCheckins().then((n) => n && say(`${n} ta saqlangan tashrif yuborildi`));
      setPending(pendingCheckins());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && !initData()) {
        setPhase("login");
        return;
      }
      setFatal(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [loadRecords, say]);

  useEffect(() => {
    initTelegram();
    // boot asinxron: setState faqat `await api("/me")` dan keyin (sinxron kaskad yo'q) — admin/Shell.tsx'dagidek
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void boot();
    const online = () => flushCheckins().then((n) => { setPending(pendingCheckins()); if (n) say(`${n} ta saqlangan tashrif yuborildi`); });
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [boot, say]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ filter, style, layers }));
    } catch {
      /* saqlash yopiq */
    }
  }, [filter, style, layers]);

  // chegaralar faqat kerak bo'lganda yuklanadi (bo'yash / kontur)
  useEffect(() => {
    if (phase !== "ok") return;
    const need: ("region" | "district")[] = [];
    if ((layers.choropleth.on && layers.choropleth.level === "region") || layers.boundaries) need.push("region");
    if (layers.choropleth.on && layers.choropleth.level === "district") need.push("district");
    for (const lv of need) {
      if (boundaries[lv] || bndBusy.current.has(lv)) continue; // yuklangan yoki so'rov yo'lda
      bndBusy.current.add(lv);
      api<GeoJSON.FeatureCollection>(`/boundaries/${lv}`)
        .then((fc) => setBoundaries((b) => ({ ...b, [lv]: fc })))
        .catch(() => say("Chegaralarni yuklab bo'lmadi — qatlamni o'chirib, qayta yoqing", true))
        .finally(() => bndBusy.current.delete(lv));
    }
  }, [phase, layers.choropleth.on, layers.choropleth.level, layers.boundaries, boundaries, say]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTool(null);
        setDraft([]);
      }
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  // Telegram "orqaga" tugmasi: asbob -> (telefonda) ochiq varaq -> karta. Brauzerda ta'siri yo'q.
  useEffect(() => {
    if (phase !== "ok") return;
    const sheetUp = sheet && window.matchMedia(PHONE).matches;
    if (!tool && !sheetUp && !cardId) return;
    const back = () => {
      if (tool) {
        setTool(null);
        setDraft([]);
      } else if (sheetUp) setSheet(false);
      else setCardId(null);
    };
    backShow(back);
    return () => backOff(back);
  }, [phase, tool, sheet, cardId]);

  // ---------------- hosilalar ----------------
  const regionName = useCallback((id: string) => meta?.regions.find((r) => r.id === id)?.name ?? (id.startsWith("xorij:") ? `Xorij (${id.slice(6).toUpperCase()})` : id), [meta]);
  const districtMap = useMemo(() => new Map(meta?.districts.map((d) => [d.id, d.name]) ?? []), [meta]);
  const districtName = useCallback((id: string) => districtMap.get(id) ?? id, [districtMap]);

  // qidiruvga yozish silliq qolsin: 4300 yozuvni filtrlash va xaritani yangilash kechiktirilgan qiymat bilan
  const liveFilter = useDeferredValue(filter);
  const filtered = useMemo(() => records.filter((r) => matchFilter(r, liveFilter, now)), [records, liveFilter, now]);
  const filteredIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const terrColors = useMemo(() => new Map(territories.map((t) => [String(t.id), t.color])), [territories]);
  const scale = useMemo(() => colorScale(filtered, style.colorBy, terrColors), [filtered, style.colorBy, terrColors]);
  const legend = useMemo(() => {
    const label = (k: string) => {
      switch (style.colorBy) {
        case "status": return STATUS_LABEL[k] ?? k;
        case "region": return k === "—" ? "Noma'lum" : regionName(k);
        case "owner": return k === "—" ? "Biriktirilmagan" : owners.find((o) => o.id === k)?.name ?? k;
        case "q": return QUALITY_LABEL[k as keyof typeof QUALITY_LABEL] ?? k;
        case "territory": return k === "—" ? "Hududsiz" : territories.find((t) => String(t.id) === k)?.name ?? k;
        default: return k === "—" ? "Yo'q" : k;
      }
    };
    return scale.legend.map((l) => ({ ...l, label: label(l.label) }));
  }, [scale, style.colorBy, regionName, owners, territories]);

  const points = useMemo<GeoJSON.FeatureCollection>(() => {
    const vals = style.sizeBy === "none" ? [] : located(filtered).map((r) => (style.sizeBy === "sales" ? r.sales : style.sizeBy === "debt" ? r.debt : r.deals));
    const max = Math.max(1, ...vals);
    const size = (r: Rec) => {
      if (style.sizeBy === "none") return 7;
      const v = style.sizeBy === "sales" ? r.sales : style.sizeBy === "debt" ? r.debt : r.deals;
      return 5 + 13 * Math.sqrt(Math.max(0, v) / max);
    };
    const hm = layers.heatmap.metric;
    const hmax = hm === "count" ? 1 : Math.max(1, ...filtered.map((r) => (hm === "sales" ? r.sales : hm === "debt" ? r.debt : r.deals)));
    return {
      type: "FeatureCollection",
      features: located(filtered).map((r) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.lng, r.lat] },
        properties: {
          id: r.id, name: r.name, color: scale.color(r), size: size(r), approx: r.q === "region" || r.q === "district", sales: r.sales,
          w: hm === "count" ? 1 : Math.sqrt((hm === "sales" ? r.sales : hm === "debt" ? r.debt : r.deals) / hmax),
        },
      })),
    };
  }, [filtered, scale, style.sizeBy, layers.heatmap.metric]);

  const hex = useMemo(() => (layers.hex.on ? hexagons(filtered, layers.hex.res, layers.hex.metric, layers.hex.agg) : null), [filtered, layers.hex]);
  const choro = useMemo(() => {
    if (!layers.choropleth.on) return null;
    const fc = boundaries[layers.choropleth.level];
    if (!fc) return null;
    const { values, br } = choropleth(filtered, layers.choropleth.level, layers.choropleth.metric, layers.choropleth.agg);
    const cls = (x: number) => classOf(x, br);
    return {
      br,
      fc: {
        type: "FeatureCollection",
        features: fc.features.filter((f) => values.has(String(f.properties?.id))).map((f) => {
          const v = values.get(String(f.properties?.id))!;
          return { ...f, properties: { ...f.properties, value: v.value, n: v.n, cls: cls(v.value) } };
        }),
      } as GeoJSON.FeatureCollection,
    };
  }, [filtered, layers.choropleth, boundaries]);
  const center = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!layers.center.on) return EMPTY;
    const c = weightedCenter(filtered, layers.center.metric);
    return c ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [c.lng, c.lat] } }] } : EMPTY;
  }, [filtered, layers.center]);
  const terrFc = useMemo<GeoJSON.FeatureCollection>(() => preview ?? {
    type: "FeatureCollection",
    features: territories.map((t) => ({ type: "Feature", properties: { id: t.id, name: t.name, color: t.color }, geometry: t.geometry })),
  }, [territories, preview]);
  const routeFc = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: [
      ...(route ? [{ type: "Feature", properties: {}, geometry: route.geometry } as GeoJSON.Feature] : []),
      ...(start ? [{ type: "Feature", properties: { n: "S" }, geometry: { type: "Point", coordinates: start } } as GeoJSON.Feature] : []),
      ...stops.map((s, i) => ({ type: "Feature", properties: { n: i + 1 }, geometry: { type: "Point", coordinates: [s.lng, s.lat] } }) as GeoJSON.Feature),
    ],
  }), [route, stops, start]);
  const draftFc = useMemo<GeoJSON.FeatureCollection>(() => {
    const f: GeoJSON.Feature[] = [];
    const ring = drawn?.coordinates[0] ?? draft;
    if (ring.length >= 3) f.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] } });
    else if (ring.length === 2) f.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: ring } });
    for (const p of draft) f.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: p } });
    if (tool?.kind === "radius" && tool.center) f.push({ type: "Feature", properties: {}, geometry: circle(tool.center[1], tool.center[0], radiusKm * 1000) });
    return { type: "FeatureCollection", features: f };
  }, [draft, drawn, tool, radiusKm]);
  const prosFc = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: prospects.map((p) => ({ type: "Feature", properties: { name: p.name, known: p.known }, geometry: { type: "Point", coordinates: [p.lng, p.lat] } })),
  }), [prospects]);

  const mapData: MapData = {
    points, hex: hex?.fc ?? null, choro: choro?.fc ?? null, boundaries: boundaries.region ?? null, territories: terrFc,
    route: routeFc, iso, prospects: prosFc, center, draft: draftFc, selected: selection, active: cardId,
  };
  const summary = useMemo(() => summarize(filtered), [filtered]);

  // ---------------- xarita hodisalari ----------------
  const finishPolygon = useCallback((fromDblClick = false) => {
    // ikki marta bosish avval ikkita "click" yuboradi — oxirgi nuqta takror, olib tashlanadi
    const pts = fromDblClick && draft.length > 1 ? draft.slice(0, -1) : draft;
    if (pts.length < 3) {
      setDraft(pts);
      return say("Kamida 3 ta nuqta kerak", true);
    }
    const ring = [...pts, pts[0]];
    const poly: GeoJSON.Polygon = { type: "Polygon", coordinates: [ring] };
    if (tool?.kind === "lasso") {
      const ids = located(filtered).filter((r) => inGeometry(r.lng, r.lat, poly)).map((r) => r.id);
      setSelection(ids);
      setBulkUi(null);
      say(ids.length ? `${num(ids.length)} ta mijoz tanlandi` : "Chizilgan soha ichida mijoz yo'q", !ids.length);
    } else {
      setDrawn(poly);
      go("terr");
    }
    setDraft([]);
    setTool(null);
  }, [draft, tool, filtered, say, go]);

  const onMapClick = useCallback(async (lng: number, lat: number) => {
    if (!tool || work) return;
    try {
      switch (tool.kind) {
        case "draw":
        case "lasso":
          setDraft((d) => [...d, [lng, lat]]);
          return;
        case "radius":
          setTool({ kind: "radius", center: [lng, lat] });
          return;
        case "route-start":
          setStart([lng, lat]);
          setTool(null);
          return;
        case "iso": {
          setTool(null);
          if (!isoMinutes.length) return say("Kamida bitta vaqtni tanlang (Hududlar → Asboblar)", true);
          setWork("Vaqt zonasi hisoblanmoqda…");
          const r = await api<GeoJSON.FeatureCollection>("/isochrone", { body: { lat, lng, minutes: isoMinutes } });
          if (!r.features?.length) return say("Bu nuqta uchun zona hisoblanmadi — yo'lga yaqinroq joyni bosing", true);
          setIso(r);
          const b = bbox(r.features.flatMap((f) => geomCoords(f.geometry)));
          if (b) setFit({ bounds: b, seq: Date.now() });
          const inside = located(filtered).filter((x) => r.features.some((f) => inGeometry(x.lng, x.lat, f.geometry))).length;
          say(`Zona ichida ${num(inside)} ta mijoz`);
          return;
        }
        case "prospects": {
          setTool(null);
          setWork("OpenStreetMap'dan qidirilmoqda…");
          const r = await api<{ prospects: Prospect[] }>("/prospects", { body: { lat, lng, radius: prosRadius * 1000 } });
          setProspects(r.prospects);
          if (!r.prospects.length) say(`${prosRadius} km ichida korxona topilmadi`, true);
          else say(`${r.prospects.filter((p) => !p.known).length} ta yangi, ${r.prospects.filter((p) => p.known).length} tasi bazada bor`);
          return;
        }
        case "nearby": {
          setTool(null);
          const list = located(filtered).map((r) => ({ id: r.id, name: r.name, status: r.status, dist: haversine([lat, lng], [r.lat, r.lng]) }))
            .sort((a, b) => a.dist - b.dist).slice(0, 20);
          setNearby(list);
          go("terr");
          return;
        }
        case "move": {
          const id = tool.id;
          setTool(null);
          setWork("Joylashuv saqlanmoqda…");
          await api(`/records/${encodeURIComponent(id)}/location`, { body: { lat, lng } });
          await loadRecords();
          setCardRev((v) => v + 1); // kartadagi manzil aniqligi va hudud yangilansin
          say("Joylashuv saqlandi");
          return;
        }
      }
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), true);
    } finally {
      setWork(null);
    }
  }, [tool, work, isoMinutes, prosRadius, filtered, say, loadRecords, go]);

  const mode: Mode = !tool ? "select" : tool.kind === "draw" ? "draw" : tool.kind === "lasso" ? "lasso" : tool.kind === "radius" ? "radius" : "pick";

  /** fromMap — xaritadagi nuqta bosildi: zoom o'zgarmaydi. Ro'yxatdan ochilsa — nuqtaga yaqinlashadi.
   *  Telefonda varaq yig'iladi (ochiq varaq kartani yopib turadi). */
  const openRecord = useCallback((id: string, fromMap = false) => {
    setCardId(id);
    setSheet(false);
    const r = records.find((x) => x.id === id);
    if (r?.lat != null && r.lng != null) setFocus({ lng: r.lng, lat: r.lat, keepZoom: fromMap, card: true, seq: Date.now() });
  }, [records]);

  const addStops = (rs: Rec[]) => {
    const have = new Set(stops.map((s) => s.id));
    const add = rs.map(toStop).filter((s): s is Stop => !!s && !have.has(s.id));
    const next = [...stops, ...add].slice(0, MAX_STOPS);
    if (stops.length + add.length > MAX_STOPS) say(`Ko'pi bilan ${MAX_STOPS} ta to'xtash joyi`, true);
    setStops(next);
    setRoute(null);
  };

  const fitTo = (coords: [number, number][]) => {
    const b = bbox(coords);
    if (b) setFit({ bounds: b, seq: Date.now() });
  };

  // prompt()/confirm() Telegram ichida ishlamaydi — qiymat tanlov panelining o'zida kiritiladi, tasdiq confirmDo orqali
  const applyBulk = async () => {
    if (!bulkUi || bulkBusy) return;
    const n = selection.length;
    let value: string;
    if (bulkUi.action === "tag") {
      value = bulkUi.value.trim();
      if (!value && !(await confirmDo(`${n} ta mijozdan teg olib tashlansinmi?`))) return;
    } else {
      const o = owners.find((x) => x.id === bulkUi.value);
      if (!o) return;
      if (!(await confirmDo(`CRM'da ${n} ta mijozning mas'uli "${o.name}" ga o'zgaradi. Davom etasizmi?`))) return;
      value = o.id;
    }
    setBulkBusy(true);
    let updated = 0, failed = 0;
    try {
      for (let i = 0; i < selection.length; i += BULK_CHUNK) {
        const r = await api<{ updated: number; failed?: unknown[] }>("/bulk", { body: { ids: selection.slice(i, i + BULK_CHUNK), action: bulkUi.action, value } });
        updated += r.updated;
        failed += r.failed?.length ?? 0;
      }
      setBulkUi(null);
      say(`${num(updated)} ta yangilandi${failed ? `, ${num(failed)} ta xato` : ""}`, failed > 0);
    } catch (e) {
      say(`${e instanceof Error ? e.message : String(e)}${updated ? ` (${num(updated)} tasi yangilandi)` : ""}`, true);
    } finally {
      setBulkBusy(false);
      if (updated) loadRecords().catch(() => {});
    }
  };

  // enum maydonlar bo'yicha sonlar — bir marta (har shart har renderda 4300 yozuvni qayta sanamasin)
  const enumCounts = useMemo(() => {
    const out = new Map<FieldKey, Map<string, number>>(ENUM_FIELDS.map((f) => [f, new Map<string, number>()]));
    for (const r of records) {
      for (const f of ENUM_FIELDS) {
        const v = (r as unknown as Record<string, unknown>)[f];
        if (v === null || v === undefined || v === "") continue;
        const m = out.get(f)!;
        m.set(String(v), (m.get(String(v)) ?? 0) + 1);
      }
    }
    return out;
  }, [records]);

  const enumOptions = useCallback((f: FieldKey) => {
    const counts = enumCounts.get(f) ?? new Map<string, number>();
    const byCount = (a: { n?: number }, b: { n?: number }) => (b.n ?? 0) - (a.n ?? 0);
    switch (f) {
      case "status": return Object.keys(STATUS_LABEL).map((k) => ({ v: k, label: STATUS_LABEL[k], n: counts.get(k) ?? 0 }));
      case "q": return Object.entries(QUALITY_LABEL).map(([k, l]) => ({ v: k, label: l, n: counts.get(k) ?? 0 }));
      case "region": return [...counts.keys()].map((k) => ({ v: k, label: regionName(k), n: counts.get(k) })).sort(byCount);
      case "district": return [...counts.keys()].map((k) => ({ v: k, label: districtName(k), n: counts.get(k) })).sort(byCount);
      case "owner": return [...counts.keys()].map((k) => ({ v: k, label: owners.find((o) => o.id === k)?.name ?? `#${k}`, n: counts.get(k) })).sort(byCount);
      case "territory": return territories.map((t) => ({ v: String(t.id), label: t.name, n: counts.get(String(t.id)) ?? 0, color: t.color }));
      default: return [...counts.keys()].map((k) => ({ v: k, label: k, n: counts.get(k) })).sort(byCount);
    }
  }, [enumCounts, regionName, districtName, owners, territories]);

  // "Ko'rsatkich"dagi viloyat bosilsa: mavjud viloyat sharti almashtiriladi (ustiga qo'shilsa VA bilan natija bo'sh chiqardi)
  const pickRegion = (id: string) => {
    setFilter((f) => {
      const cond: Rule = { kind: "cond", field: "region", op: "in", value: [id] };
      const i = f.rules.findIndex((r) => r.kind === "cond" && r.field === "region" && r.op === "in");
      return { ...f, rules: i >= 0 ? f.rules.map((r, j) => (j === i ? cond : r)) : [...f.rules, cond] };
    });
    say(`Filtr: ${regionName(id)}`);
  };

  // ---------------- ko'rinish ----------------
  if (phase === "login") return <Login onDone={() => { setPhase("loading"); boot(); }} />;
  if (phase === "loading") return <GeoSplash />;
  if (phase === "error") return <GeoError msg={fatal} onRetry={() => { setPhase("loading"); boot(); }} />;

  const full = !!me?.full;
  const toolHint: Record<string, string> = {
    draw: "Hudud chegarasini nuqtama-nuqta bosing; tugatish — «Tugatish» yoki ikki marta bosish",
    lasso: "Mijozlarni nuqtama-nuqta o'rab oling; tugatish — «Tugatish» yoki ikki marta bosish",
    radius: tool?.kind === "radius" && tool.center ? `Markaz tanlandi (${radiusKm} km) — boshqa joyni bosib o'zgartirsa bo'ladi` : "Radius markazini bosing",
    iso: "Vaqt zonasi uchun nuqtani bosing",
    prospects: "Yangi mijozlar qidiriladigan nuqtani bosing",
    nearby: "Nuqtani bosing — eng yaqin mijozlar chiqadi",
    "route-start": "Marshrut boshlanish nuqtasini bosing",
    move: "Mijozning to'g'ri joyini bosing",
  };

  const today = localIso(new Date(now)).slice(0, 10);
  const syncedLabel = !synced ? "" : synced.slice(0, 10) === today ? synced.slice(11, 16) : `${synced.slice(8, 10)}.${synced.slice(5, 7)} ${synced.slice(11, 16)}`;
  const selected = () => records.filter((r) => selection.includes(r.id));
  const noMatch = records.length > 0 && filtered.length === 0 && !tool && !work && selection.length === 0;
  const noData = records.length === 0 && !tool && !work;
  const barOn = !!tool || !!work || selection.length > 0 || noMatch || noData;
  const cls = ["gm-app", sheet && "sheet-open", tool && "tool-on", barOn && "bar-on"].filter(Boolean).join(" ");

  return (
    <GeoView
      cls={cls}
      total={records.length}
      shown={filtered.length}
      synced={synced}
      syncedLabel={syncedLabel}
      sheet={sheet}
      onSheetToggle={() => setSheet(!sheet)}
      tab={tab}
      onTab={(id) => (tab === id && sheet ? setSheet(false) : go(id))}
      filterRules={countRules(filter)}
      stopCount={stops.length}
      note={note}
      pending={pending}
      panes={{
        filter: <FilterPanel filter={filter} onChange={setFilter} enumOptions={enumOptions} ownerId={me?.ownerId ?? null} total={records.length} shown={filtered.length} />,
        style: seen.includes("style") ? <StylePanel style={style} layers={layers} onStyle={setStyle} onLayers={setLayers} legend={legend} legendBreaks={scale.breaks} full={full} /> : null,
        stats: seen.includes("stats") ? <WidgetsPanel s={summary} regionName={regionName} full={full} onPickRegion={pickRegion}
                onPickOwner={(name) => { setFilter({ ...filter, search: name }); say(`Qidiruv: ${name}`); }} /> : null,
        terr: seen.includes("terr") ? <TerritoryPanel full={full} territories={territories} owners={owners} meta={meta} filteredIds={filteredIds}
                tool={tool} setTool={(t) => { setTool(t); setDraft([]); if (t?.kind === "draw") setDrawn(null); if (t) setSheet(false); }}
                drawn={drawn} clearDrawn={() => setDrawn(null)} radiusKm={radiusKm} setRadiusKm={setRadiusKm}
                onPreview={setPreview} onReload={loadTerritories} onFocus={(g) => { fitTo(geomCoords(g)); setSheet(false); }} onToast={say}
                prospects={prospects} clearProspects={() => setProspects([])} nearby={nearby} clearNearby={() => setNearby([])} onRecord={openRecord}
                onFocusPoint={(lng, lat) => { setFocus({ lng, lat, zoom: 15, seq: Date.now() }); setSheet(false); }}
                isoMinutes={isoMinutes} setIsoMinutes={setIsoMinutes} clearIso={() => setIso(EMPTY)} hasIso={iso.features.length > 0}
                prosRadius={prosRadius} setProsRadius={setProsRadius} /> : null,
        route: seen.includes("route") ? <RoutePanel stops={stops} setStops={setStops} start={start} setStart={setStart}
                pickStart={() => { setTool({ kind: "route-start" }); setSheet(false); }} picking={tool?.kind === "route-start"}
                result={route} setResult={setRoute} onRecord={openRecord} onToast={say}
                addFiltered={() => addStops(filtered)} filteredCount={located(filtered).length} selectionCount={selection.length}
                addSelection={() => addStops(selected())} /> : null,
        share: seen.includes("share") && me ? <SharePanel ids={filteredIds} me={me.tgId} colorBy={style.colorBy}
                getState={() => ({ filter, style, layers, camera: camera.current })} onToast={say}
                onLoadView={(s) => {
                  setFilter(s.filter ?? EMPTY_FILTER);
                  setStyle({ ...DEFAULT_STYLE, ...s.style });
                  setLayers({ ...DEFAULT_LAYERS, ...s.layers });
                  if (s.camera) setFocus({ lng: s.camera.center[0], lat: s.camera.center[1], zoom: s.camera.zoom, seq: Date.now() });
                  setSheet(false);
                  say("Ko'rinish yuklandi");
                }} /> : null,
      }}
      map={<MapView data={mapData} style={style} layers={layers} mode={mode} focus={focus} fit={fit}
          onRecord={(id) => openRecord(id, true)} onClick={onMapClick} onDblClick={() => finishPolygon(true)}
          onMove={(c, z) => (camera.current = { center: c, zoom: z })} />}
      search={filter.search}
      onSearch={(v) => setFilter({ ...filter, search: v })}
      toolKind={tool?.kind ?? null}
      onLasso={() => { setTool(tool?.kind === "lasso" ? null : { kind: "lasso" }); setDraft([]); setSheet(false); }}
      onFitAll={() => { fitTo(located(filtered).map((r) => [r.lng, r.lat])); setSheet(false); }}
      noData={noData}
      onRefresh={() => { setWork("Yangilanmoqda…"); loadRecords().catch((e) => say(e instanceof Error ? e.message : String(e), true)).finally(() => setWork(null)); }}
      noMatch={noMatch}
      onClearFilter={() => setFilter(EMPTY_FILTER)}
      choroOn={layers.choropleth.on}
      choroRegion={layers.choropleth.level === "region"}
      choroCount={layers.choropleth.metric === "count"}
      choro={choro}
      hexOn={layers.hex.on}
      hexCount={layers.hex.metric === "count"}
      hex={hex}
      toolHint={tool ? toolHint[tool.kind] : ""}
      draftLen={draft.length}
      radiusCenter={tool?.kind === "radius" && !!tool.center}
      onFinish={() => finishPolygon()}
      onUndoPoint={() => setDraft(draft.slice(0, -1))}
      onContinueRadius={() => go("terr")}
      onCancelTool={() => { setTool(null); setDraft([]); }}
      work={work}
      selCount={selection.length}
      bulkUi={bulkUi}
      bulkBusy={bulkBusy}
      owners={owners}
      full={full}
      onBulkUi={setBulkUi}
      onBulkValue={(v) => bulkUi && setBulkUi({ ...bulkUi, value: v })}
      onApplyBulk={() => void applyBulk()}
      onSelRoute={() => { addStops(selected()); go("route"); }}
      onSelClear={() => { setSelection([]); setBulkUi(null); }}
      card={cardId ? (
        <RecordCard key={`${cardId}:${cardRev}`} id={cardId} full={full} onClose={() => setCardId(null)} regionName={regionName} districtName={districtName} onToast={say}
            inRoute={stops.some((s) => s.id === cardId)}
            onRoute={() => {
              const r = records.find((x) => x.id === cardId);
              if (!r) return;
              if (stops.some((s) => s.id === r.id)) {
                setStops(stops.filter((s) => s.id !== r.id));
                setRoute(null);
              } else addStops([r]);
            }}
            onNearby={() => {
              const r = records.find((x) => x.id === cardId);
              if (r?.lat != null && r.lng != null) {
                const list = located(filtered).filter((x) => x.id !== r.id).map((x) => ({ id: x.id, name: x.name, status: x.status, dist: haversine([r.lat!, r.lng!], [x.lat, x.lng]) }))
                  .sort((a, b) => a.dist - b.dist).slice(0, 20);
                setNearby(list);
                go("terr");
              }
            }}
            onMove={() => setTool({ kind: "move", id: cardId })} />
      ) : null}
      toast={toast}
    />
  );
}

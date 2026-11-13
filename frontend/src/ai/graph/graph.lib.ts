// Graf (eski vGraph, admin.html 732–874): API turlari va sof mantiq — rang, statistika, tugun/qirra ko'rinishi.

export interface GraphCommunity {
  id: number;
  label: string;
  size: number;
}

/** GET /app/api/graph?scope= */
export interface GraphSummary {
  nodes?: number;
  edges?: number;
  confidence?: Partial<Record<"EXTRACTED" | "INFERRED" | "AMBIGUOUS", number>>;
  communities?: GraphCommunity[];
  scopes?: string[];
  god_nodes?: { label: string; degree?: number | null }[];
  surprises?: { source: string; target: string; relation?: string | null; confidence?: string | null }[];
  questions?: { question?: string | null }[];
  report?: string | null;
}

/** Siqilgan tugun: id, label, d — daraja, c — jamoa, t — tur */
export interface GNode {
  id: string | number;
  label: string;
  d: number;
  c: number;
  t?: string | null;
}

/** Siqilgan qirra: i — id, a → b, k — ishonch (EXTRACTED …), r — munosabat yorlig'i */
export interface GLink {
  i: string | number;
  a: string | number;
  b: string | number;
  k?: string | null;
  r?: string | null;
}

/** GET /app/api/graph/data, POST /app/api/graph/chunk */
export interface GraphChunk {
  nodes?: GNode[];
  links?: GLink[];
  total?: number;
  more?: number;
}

export const GPAL = [
  "#5288c1", "#f5a623", "#ec3942", "#4fbcb7", "#34c759", "#f5d33f",
  "#af52de", "#ff7a59", "#64d2ff", "#ff2d55", "#a2845e", "#8e8e93",
];

/** Jamoa rangi (manfiy indeks ham to'g'ri aylanadi) */
export const commColor = (c: number): string => GPAL[((c % GPAL.length) + GPAL.length) % GPAL.length];

/** "aniq" foizi: EXTRACTED / (EXTRACTED + INFERRED + AMBIGUOUS) */
export function confPct(conf: GraphSummary["confidence"] = {}): number {
  const e = conf.EXTRACTED || 0;
  return Math.round((100 * e) / Math.max(1, e + (conf.INFERRED || 0) + (conf.AMBIGUOUS || 0)));
}

/** Ko'lam nomi: "all" → "Butun firma", bo'lim kaliti → nomi, bo'lmasa kalitning o'zi */
export function scopeName(k: string, depts: { key: string; name: string }[]): string {
  if (k === "all") return "Butun firma";
  return depts.find((d) => d.key === k)?.name || k;
}

/** Bitta tugunli jamoalar ko'rsatilmaydi */
export const bigCommunities = (g: GraphSummary): GraphCommunity[] => (g.communities || []).filter((c) => c.size > 1);

/** body fon rangi (rgb(...)) — RGB yig'indisi < 380 bo'lsa qorong'i */
export function isDarkBg(bg: string): boolean {
  const m = bg.match(/\d+/g);
  if (!m) return false;
  return m.slice(0, 3).reduce((a, b) => a + +b, 0) < 380;
}

/** Yorliq faqat yetarlicha bog'langan tugunlarda */
export const showLabel = (d: number, maxD: number): boolean => d >= Math.max(3, maxD * 0.12);

export interface VisNode {
  id: string | number;
  label: string;
  full: string;
  d: number;
  c: number;
  value: number;
  color: { background: string; border: string; highlight: { background: string; border: string } };
  font: { color: string; size: number; face: string; strokeWidth: number; strokeColor: string };
  shape: "square" | "dot";
  x?: number;
  y?: number;
  opacity?: number;
}

export function toVisNode(n: GNode, dark: boolean, maxD: number): VisNode {
  const c = commColor(n.c);
  return {
    id: n.id,
    label: showLabel(n.d, maxD) ? n.label : "",
    full: n.label,
    d: n.d,
    c: n.c,
    value: 1 + n.d,
    color: { background: c, border: c, highlight: { background: "#fff", border: c } },
    font: {
      color: dark ? "#e8ecf3" : "#1c1c1e",
      size: 14,
      face: "-apple-system, Segoe UI, Roboto, sans-serif",
      strokeWidth: 4,
      strokeColor: dark ? "#17212b" : "#fff",
    },
    shape: n.t === "Hujjat" ? "square" : "dot",
  };
}

export interface VisEdge {
  id: string | number;
  from: string | number;
  to: string | number;
  dashes: boolean;
  color: { color: string; highlight: string };
  width: number;
  rel?: string | null;
  title?: string;
  arrows: { to: { enabled: boolean; scaleFactor: number } };
}

export function toVisEdge(l: GLink, dark: boolean): VisEdge {
  return {
    id: l.i,
    from: l.a,
    to: l.b,
    dashes: l.k !== "EXTRACTED",
    color: { color: dark ? "rgba(255,255,255,.14)" : "rgba(0,0,0,.14)", highlight: "#8ea6ff" },
    width: 1,
    rel: l.r,
    title: l.r || undefined, // E3: o'zbekcha yorliq (hover)
    arrows: { to: { enabled: true, scaleFactor: 0.4 } },
  };
}

/** focus(ids): tanlanganlar to'liq yorliq bilan, qolganlari xira; bo'sh to'plam — hammasi odatiy */
export function focusUpdates(
  all: Pick<VisNode, "id" | "full" | "d">[],
  ids: (string | number)[],
  maxD: number,
): { id: string | number; opacity: number; label: string }[] {
  const set = new Set(ids);
  return all.map((n) => ({
    id: n.id,
    opacity: set.size && !set.has(n.id) ? 0.12 : 1,
    label: set.size && set.has(n.id) ? n.full : showLabel(n.d, maxD) ? n.full : "",
  }));
}

/** "N / total tugun ko'rsatilgan" */
export const countText = (have: number, total: number): string => `${have} / ${total} tugun ko'rsatilgan`;

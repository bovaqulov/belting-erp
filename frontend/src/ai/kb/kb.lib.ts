// Bilimlar bo'limi sof mantiqi — eski vKb (admin.html 875–950): bo'lim → path bo'laklari → hujjatlar daraxti.

export interface KbDoc {
  id: number | string;
  dept: string;
  path?: string | null;
  title: string;
  status?: string | null;
  source?: string | null;
  [k: string]: unknown;
}

export interface KbNode {
  kids: Record<string, KbNode>;
  docs: KbDoc[];
}

/** POST /app/api/knowledge/extract → result: {dept: {add?, update?, …}} */
export type ExtractResult = Record<string, { add?: number; update?: number; [k: string]: unknown }>;

/** `d.path.split("›").map(trim).filter(Boolean)` */
export function pathSegments(path: string | null | undefined): string[] {
  return (path || "")
    .split("›")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** pending / qolganlar (eski `status === "pending"` filtri) */
export function splitKb(docs: KbDoc[]): { pending: KbDoc[]; active: KbDoc[]; fromChat: number } {
  const pending = docs.filter((d) => d.status === "pending");
  const active = docs.filter((d) => d.status !== "pending");
  return { pending, active, fromChat: active.filter((d) => d.source === "chat").length };
}

/** root[dept] → kids[seg] … → docs (kiritish tartibi saqlanadi) */
export function buildKbTree(active: KbDoc[]): Record<string, KbNode> {
  const root: Record<string, KbNode> = {};
  const mk = (): KbNode => ({ kids: {}, docs: [] });
  for (const d of active) {
    let node = (root[d.dept] ||= mk());
    for (const seg of pathSegments(d.path)) node = node.kids[seg] ||= mk();
    node.docs.push(d);
  }
  return root;
}

export function countKb(n: KbNode): number {
  return n.docs.length + Object.values(n.kids).reduce((a, k) => a + countKb(k), 0);
}

/** Eski `Object.entries(o).sort()` — standart sort juftlikni satrga aylantiradi: `${k},[object Object]` (UTF-16 tartibi). */
export function sortedEntries<V>(o: Record<string, V>): [string, V][] {
  const key = (k: string) => `${k},[object Object]`;
  return Object.entries(o).sort(([a], [b]) => {
    const x = key(a);
    const y = key(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

/** Σ (add || 0) + (update || 0) */
export function extractedCount(result: ExtractResult | null | undefined): number {
  return Object.values(result || {}).reduce((a, r) => a + (r?.add || 0) + (r?.update || 0), 0);
}

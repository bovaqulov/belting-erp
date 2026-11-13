// Bo'limlar ierarxiyasi — BITTA manba: AI agentlar daraxti (Jarvis → Agentlar) va xodimlar daraxti (Xodimlar) shu
// funksiyalardan quriladi. Agentlar daraxti hamma bo'limni ko'rsatadi; xodimlar daraxti — xuddi shu tuzilma, lekin
// xodimi yo'q shoxlar kesiladi (prune). Shuning uchun AI daraxti xodimlar daraxtidan katta bo'lishi mumkin.
//
// parent: undefined — eski ma'lumot (backend hali bermaydi): oddiy bo'lim → birinchi sees_all bo'lim (Rahbariyat) ostida,
//         sees_all bo'lim → eng yuqorida (bugungi org chart bilan bir xil);
//         null — eng yuqorida (firma ostida); "key" — o'sha bo'lim ostida. Yo'q kalit yoki sikl — eng yuqoriga.

export interface DeptNodeLike {
  key: string;
  name?: string;
  parent?: string | null;
  sees_all?: boolean;
}

export interface DeptTree<T> {
  d: T;
  children: DeptTree<T>[];
}

/** har bo'limning amaldagi yuqori bo'limi (null — eng yuqori) */
export function parentMap<T extends DeptNodeLike>(depts: readonly T[]): Map<string, string | null> {
  const keys = new Set(depts.map((d) => d.key));
  const lead = depts.find((d) => d.sees_all)?.key ?? null;
  const p = new Map<string, string | null>();
  for (const d of depts) {
    let v: string | null;
    if (d.parent === undefined) v = d.sees_all ? null : lead;
    else v = d.parent;
    if (v === d.key || (v !== null && !keys.has(v))) v = null;
    p.set(d.key, v);
  }
  // sikl: yuqoriga yurib o'ziga qaytsa — uziladi
  for (const d of depts) {
    const seen = new Set([d.key]);
    let cur = p.get(d.key) ?? null;
    while (cur) {
      if (seen.has(cur)) {
        p.set(d.key, null);
        break;
      }
      seen.add(cur);
      cur = p.get(cur) ?? null;
    }
  }
  return p;
}

/** daraxt; aka-ukalar tartibi — kelgan tartib (backend/yaml tartibi) */
export function buildDeptTree<T extends DeptNodeLike>(depts: readonly T[]): DeptTree<T>[] {
  const p = parentMap(depts);
  const walk = (d: T): DeptTree<T> => ({ d, children: depts.filter((c) => p.get(c.key) === d.key).map(walk) });
  return depts.filter((d) => p.get(d.key) === null).map(walk);
}

/** keep(d) bo'lmagan va ichida keep bo'lgan avlodi yo'q tugunlarni olib tashlaydi (xodimlar daraxti) */
export function pruneTree<T>(tree: readonly DeptTree<T>[], keep: (d: T) => boolean): DeptTree<T>[] {
  const out: DeptTree<T>[] = [];
  for (const n of tree) {
    const children = pruneTree(n.children, keep);
    if (keep(n.d) || children.length) out.push({ d: n.d, children });
  }
  return out;
}

/** chuqurlik bo'yicha tekis ro'yxat (ro'yxat ko'rinishi, select) */
export function flatten<T>(tree: readonly DeptTree<T>[], depth = 0): { d: T; depth: number; path: T[] }[] {
  const out: { d: T; depth: number; path: T[] }[] = [];
  const go = (ns: readonly DeptTree<T>[], dep: number, path: T[]) => {
    for (const n of ns) {
      out.push({ d: n.d, depth: dep, path });
      go(n.children, dep + 1, [...path, n.d]);
    }
  };
  go(tree, depth, []);
  return out;
}

/** key ning barcha avlodlari (o'zi bilan) — yuqori bo'lim tanlovidan chiqariladi (sikl bo'lmasin) */
export function subtreeKeys<T extends DeptNodeLike>(depts: readonly T[], key: string): Set<string> {
  const p = parentMap(depts);
  const out = new Set([key]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of depts)
      if (!out.has(d.key) && out.has(p.get(d.key) ?? "")) {
        out.add(d.key);
        grew = true;
      }
  }
  return out;
}

/** "Yuqori bo'lim" tanlovi: daraxt tartibida, o'zi va avlodlarisiz; depth — chekinish uchun */
export function parentOptions<T extends DeptNodeLike>(depts: readonly T[], self: string | null): { d: T; depth: number }[] {
  const ban = self ? subtreeKeys(depts, self) : new Set<string>();
  return flatten(buildDeptTree(depts)).filter((x) => !ban.has(x.d.key));
}

/** yangi bo'lim uchun standart yuqori bo'lim — birinchi sees_all (Rahbariyat) */
export const defaultParent = <T extends DeptNodeLike>(depts: readonly T[]): string | null =>
  depts.find((d) => d.sees_all)?.key ?? null;

/** bevosita quyi bo'limlar soni (o'chirish ogohlantirishi) */
export function childCount<T extends DeptNodeLike>(depts: readonly T[], key: string): number {
  const p = parentMap(depts);
  return depts.filter((d) => p.get(d.key) === key).length;
}

// Lenta chizmasi — sof mantiq (eski lenta.html 350–486, 570–590, 669–683, 763–769). Funksiyalar so'zma-so'z ko'chirilgan;
// global S / LANG / CAT / EN / LAST o'rniga parametrlar.
import { fieldNum, fmtN, num } from "./format";
import type { Catalog, CatItem, Enums, Lang, LentaState, Sheet } from "./types";

/** t(uz, ru) — eski `const t = (uz, ru) => (LANG === "ru" ? ru : uz)` */
export const tr =
  (lang: Lang) =>
  (uz: string, ru: string): string =>
    lang === "ru" ? ru : uz;

// ---------------- holat ----------------

/** Bukilgan lentada teshiklar faqat "Bukilgan lenta" maydonlaridan: perforatsiya qiymatlari ko'chiriladi va o'chiriladi. */
export function normBent<T extends LentaState>(st: T): T {
  if (!(st.bendAngle > 0) || !st.perfOn) return st;
  const has = st.curveHoleCount > 0;
  return {
    ...st,
    perfOn: false,
    curveHoleCount: has ? st.curveHoleCount : st.perfQty || 0,
    curveHoleDia: has ? st.curveHoleDia : st.perfDia || st.curveHoleDia,
    curveHoleEdge: has ? st.curveHoleEdge : st.perfEdge > 0 ? st.perfEdge : st.curveHoleEdge,
    curveHoleRows: st.curveHoleRows > 0 ? st.curveHoleRows : 1,
  };
}

/** Undo/redo tarixi (eski pushHist/undo/redo): 450 ms ichidagi o'zgarishlar bitta qadam, 100 tagacha. */
export class History {
  past: string[] = [];
  future: string[] = [];
  lastPush = 0;
  push(s: LentaState, now: number): void {
    if (now - this.lastPush > 450) {
      this.past.push(JSON.stringify(s));
      if (this.past.length > 100) this.past.shift();
      this.future = [];
    }
    this.lastPush = now;
  }
  /** null — orqaga yo'q */
  undo(s: LentaState): LentaState | null {
    if (!this.past.length) return null;
    this.future.push(JSON.stringify(s));
    const r = JSON.parse(this.past.pop() as string) as LentaState;
    this.lastPush = 0;
    return r;
  }
  redo(s: LentaState): LentaState | null {
    if (!this.future.length) return null;
    this.past.push(JSON.stringify(s));
    const r = JSON.parse(this.future.pop() as string) as LentaState;
    this.lastPush = 0;
    return r;
  }
}

// ---------------- geometriya (asl SimpleApp) ----------------

/** Qadam bo'yicha markazlashtirilgan pozitsiyalar (0.1 mm). */
export function pitched(len: number, pitch: number, ft: number): number[] {
  if (len <= 0 || pitch <= 0) return [];
  const usable = len - Math.max(ft, pitch / 2);
  const n = Math.min(500, Math.max(1, Math.floor(usable / pitch) + 1));
  const first = (len - (n - 1) * pitch) / 2;
  return Array.from({ length: n }, (_, i) => Math.round((first + i * pitch) * 10) / 10);
}

/** Birinchisi `first` dan, qadam `pitch` bilan, oxirgi — len - ft/2 gacha. */
export function fromFirst(len: number, pitch: number, first: number, ft: number): number[] {
  if (len <= 0 || pitch <= 0) return [];
  const out: number[] = [];
  let x = Math.max(ft / 2, first);
  while (x <= len - ft / 2 + 1e-9 && out.length < 500) {
    out.push(Math.round(x * 10) / 10);
    x += pitch;
  }
  return out;
}

export const curPitch = (S: LentaState): number => {
  const xs = S.crossPos || [];
  return xs.length > 1 ? Math.round(((xs[xs.length - 1] - xs[0]) / (xs.length - 1)) * 10) / 10 : 300;
};

export const foot = (EN: Enums, name: string): number => num(EN.crossFoot[name]);

export const gofroNameFor = (CAT: Catalog, S: LentaState, h: number): string => {
  const g = CAT.gofroProfiles;
  if (!g.length) return S.gofroName;
  return g.reduce((a, b) => (Math.abs((b.height || 0) - h) < Math.abs((a.height || 0) - h) ? b : a)).name;
};

// ---------------- forma shartlari ----------------

export const COND = {
  bent: (S: LentaState) => S.bendAngle > 0,
  notBent: (S: LentaState) => !(S.bendAngle > 0),
  lockSel: (S: LentaState) => S.lockOn && S.joinMethod === "lock",
  install: (S: LentaState) => S.lockOn && S.joinMethod === "install",
  weld: (S: LentaState) => S.lockOn && S.joinMethod === "weld",
  toolRow: (S: LentaState) => S.lockOn && (S.joinMethod === "lock" || S.joinMethod === "install"),
  tool: (S: LentaState) => !!S.lockToolOn,
  gBot: (S: LentaState) => S.guideBottomOn,
  gTop: (S: LentaState) => S.guideTopOn,
  crossMan: (S: LentaState) => !S.crossLenAuto,
  parts: (S: LentaState) => S.crossParts > 1,
  gofro1: (S: LentaState) => S.gofroQty < 2,
  perfAuto: (S: LentaState) => !S.perfGrid,
  perfGrid: (S: LentaState) => !!S.perfGrid,
  guideOn: (S: LentaState) => !!S.guideOn,
  crossOn: (S: LentaState) => !!S.crossOn,
  gofroOn: (S: LentaState) => !!S.gofroOn,
  perfOn: (S: LentaState) => !!S.perfOn,
} satisfies Record<string, (S: LentaState) => boolean>;
export type CondKey = keyof typeof COND;

export const joinVal = (S: LentaState): string => (!S.lockOn || S.joinMethod === "meter" ? "open" : S.joinMethod);

export type OptKey = "guide" | "cross" | "gofro" | "perf" | "bend" | "tool";
export interface OptMeta {
  key: OptKey;
  flag?: string;
  xflag?: "bend";
  cond?: CondKey;
  title: [uz: string, ru: string];
}
/** Qo'shimcha bo'limlar (eski OPTS — tanasi komponentda) */
export const OPTS: OptMeta[] = [
  { key: "guide", flag: "guideOn", title: ["Yo'naltiruvchi profil", "Направляющий профиль"] },
  { key: "cross", flag: "crossOn", title: ["Ko'ndalang profil", "Поперечный профиль"] },
  { key: "gofro", flag: "gofroOn", title: ["Gofrobort", "Гофроборт"] },
  { key: "perf", flag: "perfOn", cond: "notBent", title: ["Perforatsiya (teshiklar)", "Перфорация"] },
  { key: "bend", xflag: "bend", title: ["Bukilgan lenta", "Гнутая лента"] },
  { key: "tool", flag: "lockToolOn", cond: "toolRow", title: ["Qulf asbobi", "Инструмент для замка"] },
];
export const optOn = (S: LentaState, o: OptMeta): boolean =>
  o.flag ? !!S[o.flag] : o.xflag === "bend" ? S.bendAngle > 0 : false;

/** "U13 (P 9...)" → "U13" */
export function short(n: unknown): string {
  return String(n || "").split("(")[0].trim() || (n as string);
}

export function joinText(S: LentaState, lang: Lang): string {
  const t = tr(lang);
  const pcs = t("ta", "шт");
  if (!S.lockOn || S.joinMethod === "meter") return t("ochiq (ulanmaydi)", "открытая");
  return (
    (
      {
        lock: `${t("qulf", "замок")} ${short(S.lockName)} · ${fmtN(S.lockQty)} ${pcs}`,
        install: t("joyida o'rnatish", "монтаж"),
        weld: t("payvand", "сварка") + " · " + S.weldType,
      } as Record<string, string>
    )[S.joinMethod] || ""
  );
}

export type SumKey = OptKey | "belt" | "cust" | "more";

export function secSummary(k: SumKey, S: LentaState, lang: Lang, hints: { perfQty?: number } | undefined): string {
  const t = tr(lang);
  const mm = t("mm", "мм"),
    pcs = t("ta", "шт");
  if (k === "belt")
    return `${short(S.beltName)} · ${S.width > 0 && S.length > 0 ? `${fmtN(S.width)} × ${fmtN(S.length)} ${mm}` : t("o'lcham kiriting", "введите размер")} · ${joinText(S, lang)}`;
  if (k === "guide")
    return S.guideOn
      ? `${short(S.guideName)} · ${[S.guideBottomOn ? `${t("ostidan", "снизу")} ${fmtN(S.guideBottomQty)}` : "", S.guideTopOn ? `${t("ustidan", "сверху")} ${fmtN(S.guideTopQty)}` : ""].filter(Boolean).join(", ")}`
      : "";
  if (k === "cross") return S.crossOn ? `${short(S.crossName)} · ${(S.crossPos || []).length} ${pcs} · ${t("qadam", "шаг")} ${fmtN(curPitch(S))}` : "";
  if (k === "gofro")
    return S.gofroOn ? `H ${fmtN(S.gofroHeight)} ${mm} · ${S.gofroQty >= 2 ? t("ikkala chet", "обе стороны") : t("bitta chet", "одна сторона")}` : "";
  if (k === "perf") return S.perfOn ? `Ø${fmtN(S.perfDia)} ${mm} · ${fmtN(hints?.perfQty || S.perfQty)} ${pcs}` : "";
  if (k === "bend")
    return S.bendAngle > 0
      ? `${fmtN(S.bendAngle)}°` +
          (S.curveHoleCount > 0
            ? ` · Ø${fmtN(S.curveHoleDia)} × ${fmtN(S.curveHoleCount * Math.max(1, S.curveHoleRows || 1))} ${pcs}`
            : ` · ${t("teshiksiz", "без отверстий")}`)
      : "";
  if (k === "tool") return S.lockToolOn ? short(S.lockToolName) : "";
  if (k === "cust") return S.projectName || "";
  if (k === "more") {
    const on = OPTS.filter((o) => (!o.cond || COND[o.cond](S)) && optOn(S, o)).map((o) => t(o.title[0], o.title[1]));
    return on.length ? on.join(", ") : t("profil, gofra, teshik va boshqalar", "профили, борт, отверстия и др.");
  }
  return "";
}

/** Pastki panel chiplari (eski drawBar) */
export function barChips(S: LentaState, lang: Lang, hints: { perfQty?: number } | undefined): string[] {
  const t = tr(lang);
  const mm = t("mm", "мм"),
    pcs = t("ta", "шт");
  return !sized(S)
    ? []
    : [
        short(S.beltName),
        `${fmtN(S.width)} × ${fmtN(S.length)} ${mm}`,
        joinText(S, lang),
        S.guideOn ? t("yo'naltiruvchi", "направляющая") : "",
        S.crossOn ? `${t("profil", "профиль")} ${(S.crossPos || []).length} ${pcs}` : "",
        S.gofroOn ? `${t("gofra", "борт")} H${fmtN(S.gofroHeight)}` : "",
        S.perfOn && !(S.bendAngle > 0) ? `Ø${fmtN(S.perfDia)} × ${fmtN(hints?.perfQty || S.perfQty)}` : "",
        S.bendAngle > 0 ? `${fmtN(S.bendAngle)}°` : "",
        S.bendAngle > 0 && S.curveHoleCount > 0 ? `Ø${fmtN(S.curveHoleDia)} × ${fmtN(S.curveHoleCount * Math.max(1, S.curveHoleRows || 1))}` : "",
      ].filter(Boolean);
}

// ---------------- maydon o'zgarishi → bog'liq maydonlar (asl simple/studio qoidalari) ----------------

export type Val = string | number | boolean;

/** eski onField(k, v): set() ga beriladigan patch */
export function fieldPatch(k: string, v: Val, S: LentaState, EN: Enums, CAT: Catalog): Partial<LentaState> {
  const p: Partial<LentaState> = { [k]: v };
  const ft = () => num(EN.crossFoot[(p.crossName as string | undefined) ?? S.crossName]);
  if (k === "length" && S.crossOn) p.crossPos = pitched(v as number, curPitch(S), ft());
  if (k === "crossName" && S.crossOn) p.crossPos = pitched(S.length, curPitch(S), ft());
  if (k === "crossOn" && v) Object.assign(p, { crossSegs: null, crossLenAuto: true, crossParts: 1, crossPos: pitched(S.length, 300, ft()) });
  if (k === "lockOn" && v && !S.joinMethod) p.joinMethod = "lock";
  if (k === "guideOn" && v)
    Object.assign(p, { guideBottomOn: S.guideBottomOn || !S.guideTopOn, guideBottomPos: null, guideBottomAt: null, guideTopPos: null, guideTopAt: null });
  if (k === "guideBottomQty") Object.assign(p, { guideBottomPos: null, guideBottomAt: null });
  if (k === "guideTopQty") Object.assign(p, { guideTopPos: null, guideTopAt: null });
  if (k === "gofroOn" && v)
    Object.assign(p, {
      gofroQty: 2,
      gofroInsetL: Math.max(10, S.gofroInsetL || 10),
      gofroInsetR: Math.max(10, S.gofroInsetR || 10),
      gofroHeight: S.gofroHeight >= EN.gofroMinHeight ? S.gofroHeight : 60,
    });
  if (k === "gofroHeight" && (v as number) >= EN.gofroMinHeight) p.gofroName = gofroNameFor(CAT, S, v as number);
  if (k === "perfOn" && v) Object.assign(p, { perfGrid: false, perfDia: S.perfDia || 8, perfQty: S.perfQty || 100 });
  return p;
}

/** eski onX(x, v): null — o'zgarish yo'q */
export function xPatch(x: string, v: number, S: LentaState, EN: Enums): Partial<LentaState> | null {
  if (x === "crossPitch" && v > 0) return { crossSegs: null, crossPos: pitched(S.length, v, foot(EN, S.crossName)) };
  if (x === "crossFirst") return { crossSegs: null, crossPos: fromFirst(S.length, curPitch(S), v, foot(EN, S.crossName)) };
  return null;
}

/** Forma maydonida ko'rinadigan qiymat (eski syncForm) */
export function fieldText(k: string, t: "num" | "str", S: LentaState): string {
  const v = S[k];
  if (t === "num") return v === 0 && ["width", "length"].includes(k) ? "" : fieldNum(v ?? 0);
  return (v ?? "") as string;
}
export function xText(x: string, S: LentaState): string {
  const xs = S.crossPos || [];
  return x === "crossPitch" ? fieldNum(curPitch(S)) : xs.length ? fieldNum(xs[0]) : "";
}
/** Segment tugmasining joriy qiymati (eski syncForm: gofroQty → 2 | 1) */
export const segValue = (k: string, S: LentaState): string => String(k === "gofroQty" ? (S.gofroQty >= 2 ? 2 : 1) : S[k]);
/** Segment bosilganda qiymat turi (eski: gofroQty → Number, perfGrid → bool) */
export const segParse = (k: string, v: string): Val => (k === "gofroQty" ? Number(v) : k === "perfGrid" ? v === "true" : v);

/** Ulanish segmenti → patch (eski data-join) */
export const joinPatch = (v: string): Partial<LentaState> => (v === "open" ? { lockOn: false } : { lockOn: true, joinMethod: v });

// ---------------- chizma ----------------

export const sized = (S: LentaState | null): boolean => !!S && S.width > 0 && S.length > 0 && !!S.beltName;

const TAB_NAME: Record<string, [string, string]> = {
  general: ["Umumiy", "Общий"],
  main: ["3D", "3D"],
  plan: ["Ustidan", "Сверху"],
  cross: ["Kesim", "Разрез"],
  side: ["Yon", "Сбоку"],
  perf: ["Perforatsiya", "Перфорация"],
  curve: ["Bukilgan", "Гнутая"],
  message: ["Xato", "Ошибка"],
};
export const tabName = (s: Sheet, lang: Lang): string => {
  const n = TAB_NAME[s.key];
  return n ? tr(lang)(n[0], n[1]) : s.title;
};

/** eng ko'p ma'lumot beradigan list: oddiy lenta — ustidan; profil/yo'naltiruvchi/gofra — umumiy; faqat teshik — perforatsiya */
export function recommendKey(sheets: Sheet[], S: LentaState): string {
  const has = (k: string) => sheets.some((s) => s.key === k);
  if (has("curve")) return "curve";
  if (S.crossOn || S.guideOn || S.gofroOn) return has("general") ? "general" : sheets[0].key;
  if (S.perfOn && has("perf")) return "perf";
  return has("plan") ? "plan" : sheets[0].key;
}
export const kindSig = (S: LentaState): string => [S.crossOn, S.guideOn, S.gofroOn, S.perfOn, S.bendAngle > 0].map(Number).join("");

// ---------------- tanlash oynasi ----------------

const PICK_KIND: Record<string, keyof Catalog> = {
  beltName: "belts",
  lockName: "locks",
  lockToolName: "tools",
  guideName: "guideProfiles",
  crossName: "crossProfiles",
  gofroName: "gofroProfiles",
};
export interface PickItem {
  name: string;
  note?: string;
}
export function itemsFor(k: string, CAT: Catalog, EN: Enums): PickItem[] {
  if (k === "lockName") return EN.lockNames.map((n) => ({ name: n, note: (CAT.locks.find((l) => l.name === n) || ({} as CatItem)).note }));
  if (k === "lockToolName") return EN.toolNames.map((n) => ({ name: n }));
  return (CAT[PICK_KIND[k]] as CatItem[]).map((x) => ({
    name: x.name,
    note: [x.note, x.thickness ? `${x.thickness} mm` : "", x.maker].filter(Boolean).join(" · "),
  }));
}
/** Qidiruv tokenlari: katta harf, kirill К → K, vergul → nuqta, raqam/harf/nuqta bo'yicha bo'lish */
export const tok = (s: unknown): string[] =>
  String(s || "")
    .toUpperCase()
    .replace(/[КК]/g, "K")
    .replace(/,/g, ".")
    .split(/[^0-9A-ZА-Я.]+/)
    .filter(Boolean);
/** Har bir so'rov tokeni nom+izoh tokenlaridan birining boshi bo'lsin; 120 tagacha */
export function filterItems(items: PickItem[], query: string): PickItem[] {
  const q = tok(query);
  return items.filter((x) => !q.length || q.every((w) => tok(x.name + " " + (x.note || "")).some((y) => y.startsWith(w)))).slice(0, 120);
}

// ---------------- ko'ruvchi geometriyasi ----------------

export const SHEET_RATIO = 1188 / 840;

/** eski layoutSheet: varaq kengligi (ZOOM=1 — sig'diradi) */
export function sheetWidth(boxW: number, boxH: number, desk: boolean, zoom: number): number {
  const pad = desk ? 24 : 16;
  const cw = boxW - pad,
    ch = desk ? boxH - pad : Infinity;
  return Math.max(200, Math.min(cw, ch * SHEET_RATIO)) * zoom;
}

export interface View {
  z: number;
  tx: number;
  ty: number;
}
/** eski openViewer.zoomAt (z===1 bo'lsa — fit chaqiriladi: null) */
export function zoomAt(v: View, nz: number, px: number, py: number): View | null {
  nz = Math.max(1, Math.min(12, nz));
  const tx = px - (px - v.tx) * (nz / v.z),
    ty = py - (py - v.ty) * (nz / v.z);
  return nz === 1 ? null : { z: nz, tx, ty };
}

// ---------------- xatolarni belgilash (eski markIssues) ----------------

const TAB_OPT: Record<string, OptKey> = { guide: "guide", cross: "cross", gofro: "gofro", perf: "perf" };
export interface IssueMarks {
  /** maydon kaliti → klasslar ("bad" | "warn"; ikkalasi ham bo'lishi mumkin — classList.add) */
  fields: Record<string, string[]>;
  /** bo'lim nuqtasi → klasslar ("err" | "warnd") */
  dots: Record<string, string[]>;
  /** "Tushunilgan parametrlar" nuqtasi: "err" | "warnd" | "" */
  pDot: string;
}
const addCls = (m: Record<string, string[]>, k: string, c: string) => {
  const l = (m[k] ||= []);
  if (!l.includes(c)) l.push(c);
};
export function issueMarks(issues: { level: string; field?: string; tab?: string }[] | undefined): IssueMarks {
  const r: IssueMarks = { fields: {}, dots: {}, pDot: "" };
  for (const i of issues || []) {
    const cls = i.level === "error" ? "bad" : "warn",
      dot = i.level === "error" ? "err" : "warnd";
    if (i.field !== undefined) addCls(r.fields, String(i.field), cls);
    const o = TAB_OPT[i.tab as string];
    if (o) addCls(r.dots, o, dot);
    if (r.pDot !== "err") r.pDot = dot;
  }
  return r;
}

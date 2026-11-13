/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DRAFT, draftValue, LANG_KEY, loadLang, loadMeta, LS, META_KEY, OPEN_KEY, restore } from "./draft";
import { fieldNum, fmtN, money, num } from "./format";
import {
  barChips,
  COND,
  curPitch,
  fieldPatch,
  fieldText,
  filterItems,
  fromFirst,
  History,
  issueMarks,
  itemsFor,
  joinPatch,
  joinText,
  joinVal,
  kindSig,
  normBent,
  pitched,
  recommendKey,
  secSummary,
  segParse,
  segValue,
  sheetWidth,
  short,
  sized,
  tabName,
  tok,
  xPatch,
  xText,
  zoomAt,
} from "./logic";
import type { Catalog, Enums, LentaState, Sheet } from "./types";

// ---------------- eski lenta.html funksiyalari — natijani taqqoslash uchun AYNAN nusxa ----------------
const L_num = (v: any) => {
  const n = parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return isFinite(n) ? n : 0;
};
const L_fmtN = (n: any) => {
  const v = Math.round(Number(n) * 10) / 10;
  return isFinite(v) ? v.toLocaleString("ru-RU").replace(/\u00a0/g, " ").replace(",", ",") : "";
};
function L_normBent(st: any) {
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
function L_pitched(len: number, pitch: number, ft: number) {
  if (len <= 0 || pitch <= 0) return [];
  const usable = len - Math.max(ft, pitch / 2);
  const n = Math.min(500, Math.max(1, Math.floor(usable / pitch) + 1));
  const first = (len - (n - 1) * pitch) / 2;
  return Array.from({ length: n }, (_, i) => Math.round((first + i * pitch) * 10) / 10);
}
function L_fromFirst(len: number, pitch: number, first: number, ft: number) {
  if (len <= 0 || pitch <= 0) return [];
  const out = [];
  let x = Math.max(ft / 2, first);
  while (x <= len - ft / 2 + 1e-9 && out.length < 500) {
    out.push(Math.round(x * 10) / 10);
    x += pitch;
  }
  return out;
}
const L_tok = (s: any) =>
  String(s || "")
    .toUpperCase()
    .replace(/[КК]/g, "K")
    .replace(/,/g, ".")
    .split(/[^0-9A-ZА-Я.]+/)
    .filter(Boolean);

// ---------------- test ma'lumotlari ----------------
const EN: Enums = {
  lockNames: ["KS - SE 90/10 пластик (Пластик замок FORBO)", "MR01 (металл)"],
  toolNames: ["Пресс A", "Пресс B"],
  crossFoot: { "Профиль L 50": 40, "Профиль T 30": "25", "Без ноги": 0 },
  gofroMinHeight: 40,
};
const CAT: Catalog = {
  belts: [
    { name: "U13/0A-B (P 9/A/BL blue - 1,3mm)", note: "ko'k", thickness: 1.3, maker: "Forbo" },
    { name: "F21 FDA (white 3mm)", thickness: 3 },
    { name: "Кордшнур К10" },
  ],
  locks: [{ name: "MR01 (металл)", note: "mexanik" }],
  guideProfiles: [{ name: "UDK8-W (TOOTHED) - Полиуретан" }, { name: "K10 (Полиуретан)" }],
  crossProfiles: [{ name: "Профиль L 50" }, { name: "Профиль T 30" }],
  gofroProfiles: [
    { name: "Гофроборт SW-30W - 50 ММ", height: 50 },
    { name: "Гофроборт SW-60 - 60 ММ", height: 60 },
    { name: "Гофроборт SW-80 - 80 ММ", height: 80 },
  ],
};
const BASE: LentaState = {
  beltName: "U13/0A-B (P 9/A/BL blue - 1,3mm)",
  width: 0,
  length: 0,
  bendAngle: 0,
  curveHoleCount: 0,
  curveHoleEdge: 15,
  curveHoleDia: 8,
  curveHoleRows: 1,
  lockOn: false,
  lockName: "KS - SE 90/10 пластик (Пластик замок FORBO)",
  lockQty: 2,
  lockToolOn: false,
  lockToolName: "Пресс A",
  lockToolQty: 1,
  joinMethod: "lock",
  installPrice: 0,
  weldType: "oddiy",
  guideOn: false,
  guideName: "UDK8-W (TOOTHED) - Полиуретан",
  guideBottomOn: true,
  guideBottomQty: 1,
  guideTopOn: false,
  guideTopQty: 2,
  crossOn: false,
  crossName: "Профиль L 50",
  crossLenAuto: false,
  crossPos: [],
  crossParts: 1,
  gofroOn: false,
  gofroName: "Гофроборт SW-30W - 50 ММ",
  gofroHeight: 50,
  gofroQty: 2,
  gofroInsetL: 10,
  gofroInsetR: 10,
  perfOn: false,
  perfDia: 30,
  perfQty: 156,
  perfEdge: 0,
  perfGrid: false,
  projectName: "",
  customerPhone: "",
};
const st = (o: Partial<LentaState> = {}): LentaState => ({ ...BASE, ...o });

describe("format — eski num/fmtN/money", () => {
  it("num: bo'shliq, vergul, son emas → 0", () => {
    for (const v of ["1 250,5", " 12 ", "abc", "", null, undefined, "1e3", "-3,25", "12,5,7", "Infinity", 7, "0x10"]) expect(num(v)).toBe(L_num(v));
    expect(num("1 250,5")).toBe(1250.5);
    expect(num("abc")).toBe(0);
    expect(num("Infinity")).toBe(0);
  });
  it("fmtN: 0.1 gacha, ru-RU, son emas → ''", () => {
    for (const v of [0, 1234.56, 1234567.04, -0.05, 0.04, "12,5", "abc", null, undefined, NaN, Infinity, 1e21])
      expect(fmtN(v)).toBe(L_fmtN(v));
    expect(fmtN(1234.56)).toBe("1 234,6");
    expect(fmtN("abc")).toBe("");
    expect(fmtN(null)).toBe("0");
  });
  it("fieldNum: maydonda bo'shliqsiz", () => {
    expect(fieldNum(1234.56)).toBe("1234,6");
    expect(num(fieldNum(1234.56))).toBe(1234.6);
  });
  it("money: butun so'm, til bo'yicha", () => {
    expect(money(1250000.4, "uz")).toBe("1 250 000 so'm");
    expect(money(1250000.5, "ru")).toBe("1 250 001 сум");
    expect(money(0, "uz")).toBe("0 so'm");
  });
});

describe("normBent — eskidagidek", () => {
  const cases: Partial<LentaState>[] = [
    {},
    { bendAngle: 90 },
    { bendAngle: 90, perfOn: true },
    { bendAngle: 90, perfOn: true, curveHoleCount: 4, curveHoleDia: 10 },
    { bendAngle: 90, perfOn: true, perfQty: 0, perfDia: 0, perfEdge: 12, curveHoleRows: 0 },
    { bendAngle: 45, perfOn: true, perfEdge: -1, curveHoleRows: 3 },
    { bendAngle: 0, perfOn: true },
    { bendAngle: -5, perfOn: true },
  ];
  it("eski funksiya bilan bir xil natija", () => {
    for (const c of cases) expect(normBent(st(c))).toEqual(L_normBent(st(c)));
  });
  it("perforatsiya bukilgan teshiklarga ko'chadi", () => {
    const r = normBent(st({ bendAngle: 90, perfOn: true, perfQty: 20, perfDia: 6, perfEdge: 12, curveHoleRows: 0 }));
    expect(r).toMatchObject({ perfOn: false, curveHoleCount: 20, curveHoleDia: 6, curveHoleEdge: 12, curveHoleRows: 1 });
  });
  it("o'zgarmasa — o'sha obyekt (kalitlar tartibi o'zgarmaydi)", () => {
    const s = st({ perfOn: true });
    expect(normBent(s)).toBe(s);
    expect(Object.keys(normBent(st({ bendAngle: 90, perfOn: true })))).toEqual(Object.keys(BASE));
  });
});

describe("pitched / fromFirst — eskidagidek", () => {
  it("tasodifiy kirishlar bo'yicha eski funksiya bilan bir xil", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 400; i++) {
      const len = Math.round(rnd() * 20000) - 500,
        pitch = Math.round(rnd() * 900) - 50,
        ft = Math.round(rnd() * 80),
        first = Math.round(rnd() * 600) - 50;
      expect(pitched(len, pitch, ft)).toEqual(L_pitched(len, pitch, ft));
      expect(fromFirst(len, pitch, first, ft)).toEqual(L_fromFirst(len, pitch, first, ft));
    }
  });
  it("chegaralar", () => {
    expect(pitched(0, 300, 40)).toEqual([]);
    expect(pitched(1000, 0, 40)).toEqual([]);
    expect(pitched(1000, 300, 40)).toEqual([200, 500, 800]);
    expect(pitched(100, 300, 40)).toEqual([50]); // kamida bitta
    expect(pitched(1e6, 1, 0)).toHaveLength(500); // 500 tagacha
    expect(fromFirst(1000, 300, 0, 40)).toEqual([20, 320, 620, 920]);
    expect(fromFirst(1000, 300, 100, 40)).toEqual([100, 400, 700]);
    expect(fromFirst(1e6, 1, 0, 0)).toHaveLength(500);
  });
  it("curPitch", () => {
    expect(curPitch(st({ crossPos: [] }))).toBe(300);
    expect(curPitch(st({ crossPos: [50] }))).toBe(300);
    expect(curPitch(st({ crossPos: [50, 350, 650] }))).toBe(300);
    expect(curPitch(st({ crossPos: [10, 20.33, 30.71] }))).toBe(10.4);
  });
});

describe("fieldPatch (eski onField) / xPatch (eski onX)", () => {
  it("length → crossPos qayta (profil yoqilgan bo'lsa)", () => {
    const S = st({ crossOn: true, length: 1000, crossPos: [200, 500, 800] });
    expect(fieldPatch("length", 1600, S, EN, CAT)).toEqual({ length: 1600, crossPos: pitched(1600, 300, 40) });
    expect(fieldPatch("length", 1600, st(), EN, CAT)).toEqual({ length: 1600 });
  });
  it("crossName → yangi profil oyog'i bilan", () => {
    const S = st({ crossOn: true, length: 1000, crossPos: [200, 500, 800] });
    expect(fieldPatch("crossName", "Профиль T 30", S, EN, CAT).crossPos).toEqual(pitched(1000, 300, 25));
  });
  it("crossOn → qadam 300, avtomatik uzunlik; kalitlar tartibi", () => {
    const p = fieldPatch("crossOn", true, st({ length: 1000 }), EN, CAT);
    expect(p).toEqual({ crossOn: true, crossSegs: null, crossLenAuto: true, crossParts: 1, crossPos: [200, 500, 800] });
    expect(Object.keys(p)).toEqual(["crossOn", "crossSegs", "crossLenAuto", "crossParts", "crossPos"]);
    expect(fieldPatch("crossOn", false, st({ length: 1000 }), EN, CAT)).toEqual({ crossOn: false });
  });
  it("lockOn, guide, gofro, perf qoidalari", () => {
    expect(fieldPatch("lockOn", true, st({ joinMethod: "" }), EN, CAT)).toEqual({ lockOn: true, joinMethod: "lock" });
    expect(fieldPatch("lockOn", true, st({ joinMethod: "weld" }), EN, CAT)).toEqual({ lockOn: true });
    expect(fieldPatch("guideOn", true, st({ guideBottomOn: false, guideTopOn: false }), EN, CAT)).toEqual({
      guideOn: true,
      guideBottomOn: true,
      guideBottomPos: null,
      guideBottomAt: null,
      guideTopPos: null,
      guideTopAt: null,
    });
    expect(fieldPatch("guideOn", true, st({ guideBottomOn: false, guideTopOn: true }), EN, CAT).guideBottomOn).toBe(false);
    expect(fieldPatch("guideTopQty", 3, st(), EN, CAT)).toEqual({ guideTopQty: 3, guideTopPos: null, guideTopAt: null });
    expect(fieldPatch("gofroOn", true, st({ gofroHeight: 20, gofroInsetL: 0, gofroInsetR: 25 }), EN, CAT)).toEqual({
      gofroOn: true,
      gofroQty: 2,
      gofroInsetL: 10,
      gofroInsetR: 25,
      gofroHeight: 60,
    });
    expect(fieldPatch("gofroHeight", 72, st(), EN, CAT)).toEqual({ gofroHeight: 72, gofroName: "Гофроборт SW-80 - 80 ММ" });
    expect(fieldPatch("gofroHeight", 55, st(), EN, CAT).gofroName).toBe("Гофроборт SW-30W - 50 ММ"); // teng masofa — birinchisi
    expect(fieldPatch("gofroHeight", 30, st(), EN, CAT)).toEqual({ gofroHeight: 30 });
    expect(fieldPatch("perfOn", true, st({ perfDia: 0, perfQty: 0 }), EN, CAT)).toEqual({ perfOn: true, perfGrid: false, perfDia: 8, perfQty: 100 });
  });
  it("xPatch: qadam va birinchisi", () => {
    const S = st({ length: 1000, crossPos: [200, 500, 800] });
    expect(xPatch("crossPitch", 200, S, EN)).toEqual({ crossSegs: null, crossPos: pitched(1000, 200, 40) });
    expect(xPatch("crossPitch", 0, S, EN)).toBeNull();
    expect(xPatch("crossFirst", 100, S, EN)).toEqual({ crossSegs: null, crossPos: [100, 400, 700] });
    expect(xPatch("other", 1, S, EN)).toBeNull();
  });
  it("joinPatch / joinVal / segment", () => {
    expect(joinPatch("open")).toEqual({ lockOn: false });
    expect(joinPatch("weld")).toEqual({ lockOn: true, joinMethod: "weld" });
    expect(joinVal(st({ lockOn: false, joinMethod: "weld" }))).toBe("open");
    expect(joinVal(st({ lockOn: true, joinMethod: "meter" }))).toBe("open");
    expect(joinVal(st({ lockOn: true, joinMethod: "install" }))).toBe("install");
    expect(segValue("gofroQty", st({ gofroQty: 5 }))).toBe("2");
    expect(segValue("gofroQty", st({ gofroQty: 0 }))).toBe("1");
    expect(segValue("perfGrid", st({ perfGrid: true }))).toBe("true");
    expect(segParse("gofroQty", "1")).toBe(1);
    expect(segParse("perfGrid", "false")).toBe(false);
    expect(segParse("weldType", "60")).toBe("60");
  });
  it("fieldText / xText (eski syncForm)", () => {
    expect(fieldText("width", "num", st({ width: 0 }))).toBe("");
    expect(fieldText("lockQty", "num", st({ lockQty: 0 }))).toBe("0");
    expect(fieldText("length", "num", st({ length: 12000.04 }))).toBe("12000");
    expect(fieldText("crossLen", "num", st())).toBe("0"); // yo'q kalit → 0
    expect(fieldText("projectName", "str", st({ projectName: "Megaplast" }))).toBe("Megaplast");
    expect(fieldText("author", "str", st())).toBe("");
    expect(xText("crossPitch", st({ crossPos: [] }))).toBe("300");
    expect(xText("crossFirst", st({ crossPos: [] }))).toBe("");
    expect(xText("crossFirst", st({ crossPos: [50.5, 350.5] }))).toBe("50,5");
  });
});

describe("COND, kindSig, sized, recommendKey, tabName", () => {
  it("shartlar", () => {
    expect(COND.toolRow(st({ lockOn: true, joinMethod: "install" }))).toBe(true);
    expect(COND.toolRow(st({ lockOn: true, joinMethod: "weld" }))).toBe(false);
    expect(COND.notBent(st({ bendAngle: 0 }))).toBe(true);
    expect(COND.gofro1(st({ gofroQty: 1 }))).toBe(true);
  });
  it("kindSig / sized", () => {
    expect(kindSig(st())).toBe("00000");
    expect(kindSig(st({ crossOn: true, perfOn: true, bendAngle: 30 }))).toBe("10011");
    expect(sized(st({ width: 600, length: 5000 }))).toBe(true);
    expect(sized(st({ width: 600, length: 0 }))).toBe(false);
    expect(sized(st({ width: 600, length: 5000, beltName: "" }))).toBe(false);
    expect(sized(null)).toBe(false);
  });
  it("recommendKey", () => {
    const sh = (...k: string[]): Sheet[] => k.map((key) => ({ key, title: key, svg: "" }));
    expect(recommendKey(sh("general", "plan", "curve"), st())).toBe("curve");
    expect(recommendKey(sh("plan", "general"), st({ guideOn: true }))).toBe("general");
    expect(recommendKey(sh("plan", "side"), st({ crossOn: true }))).toBe("plan");
    expect(recommendKey(sh("plan", "perf"), st({ perfOn: true }))).toBe("perf");
    expect(recommendKey(sh("side", "plan"), st())).toBe("plan");
    expect(recommendKey(sh("side", "cross"), st())).toBe("side");
  });
  it("tabName", () => {
    expect(tabName({ key: "plan", title: "X", svg: "" }, "uz")).toBe("Ustidan");
    expect(tabName({ key: "plan", title: "X", svg: "" }, "ru")).toBe("Сверху");
    expect(tabName({ key: "zzz", title: "Boshqa", svg: "" }, "ru")).toBe("Boshqa");
  });
});

describe("matnlar: short, joinText, secSummary, barChips", () => {
  it("short", () => {
    expect(short("U13/0A-B (P 9/A/BL blue - 1,3mm)")).toBe("U13/0A-B");
    expect(short("(abc)")).toBe("(abc)");
    expect(short("")).toBe("");
  });
  it("joinText", () => {
    expect(joinText(st(), "uz")).toBe("ochiq (ulanmaydi)");
    expect(joinText(st({ lockOn: true, lockName: "MR01 (металл)", lockQty: 2 }), "uz")).toBe("qulf MR01 · 2 ta");
    expect(joinText(st({ lockOn: true, joinMethod: "weld", weldType: "zinali" }), "ru")).toBe("сварка · zinali");
    expect(joinText(st({ lockOn: true, joinMethod: "xyz" }), "uz")).toBe("");
  });
  it("secSummary", () => {
    expect(secSummary("belt", st(), "uz", {})).toBe("U13/0A-B · o'lcham kiriting · ochiq (ulanmaydi)");
    expect(secSummary("belt", st({ width: 600, length: 5000 }), "ru", {})).toBe("U13/0A-B · 600 × 5 000 мм · открытая");
    expect(secSummary("guide", st({ guideOn: true, guideTopOn: true }), "uz", {})).toBe("UDK8-W · ostidan 1, ustidan 2");
    expect(secSummary("cross", st({ crossOn: true, crossPos: [50, 350, 650] }), "uz", {})).toBe("Профиль L 50 · 3 ta · qadam 300");
    expect(secSummary("perf", st({ perfOn: true }), "uz", { perfQty: 90 })).toBe("Ø30 mm · 90 ta");
    expect(secSummary("perf", st({ perfOn: true }), "uz", undefined)).toBe("Ø30 mm · 156 ta");
    expect(secSummary("bend", st({ bendAngle: 90, curveHoleCount: 4, curveHoleRows: 0 }), "uz", {})).toBe("90° · Ø8 × 4 ta");
    expect(secSummary("bend", st({ bendAngle: 90 }), "ru", {})).toBe("90° · без отверстий");
    expect(secSummary("more", st(), "uz", {})).toBe("profil, gofra, teshik va boshqalar");
    expect(secSummary("more", st({ guideOn: true, perfOn: true, bendAngle: 10 }), "uz", {})).toBe("Yo'naltiruvchi profil, Bukilgan lenta");
    expect(secSummary("tool", st(), "uz", {})).toBe("");
  });
  it("barChips", () => {
    expect(barChips(st(), "uz", {})).toEqual([]);
    expect(barChips(st({ width: 600, length: 5000, crossOn: true, crossPos: [1, 2], perfOn: true }), "uz", { perfQty: 12 })).toEqual([
      "U13/0A-B",
      "600 × 5 000 mm",
      "ochiq (ulanmaydi)",
      "profil 2 ta",
      "Ø30 × 12",
    ]);
  });
});

describe("tanlash oynasi: tok / filterItems / itemsFor", () => {
  it("tok — eskidagidek", () => {
    for (const s of ["U13/0A-B (P 9/A/BL blue - 1,3mm)", "Кордшнур К10", "k10", "", null, "  1,3 mm  ", "Профиль L-50"]) expect(tok(s)).toEqual(L_tok(s));
    expect(tok("1,3mm")).toEqual(["1.3MM"]);
    expect(tok("К10")).toEqual(["K10"]); // kirill К → lotin K
  });
  it("filterItems: har bir token boshlanishi bo'yicha, 120 tagacha", () => {
    const items = itemsFor("beltName", CAT, EN);
    expect(items[0]).toEqual({ name: "U13/0A-B (P 9/A/BL blue - 1,3mm)", note: "ko'k · 1.3 mm · Forbo" });
    expect(items[2]).toEqual({ name: "Кордшнур К10", note: "" });
    expect(filterItems(items, "").length).toBe(3);
    expect(filterItems(items, "u13 1,3").map((x) => x.name)).toEqual(["U13/0A-B (P 9/A/BL blue - 1,3mm)"]);
    expect(filterItems(items, "k10").map((x) => x.name)).toEqual(["Кордшнур К10"]);
    expect(filterItems(items, "forbo").length).toBe(1);
    expect(filterItems(items, "zzz")).toEqual([]);
    const many = Array.from({ length: 200 }, (_, i) => ({ name: "A" + i }));
    expect(filterItems(many, "a")).toHaveLength(120);
  });
  it("itemsFor: qulf — enums nomlari + katalog izohi; asbob — faqat nom", () => {
    expect(itemsFor("lockName", CAT, EN)).toEqual([
      { name: "KS - SE 90/10 пластик (Пластик замок FORBO)", note: undefined },
      { name: "MR01 (металл)", note: "mexanik" },
    ]);
    expect(itemsFor("lockToolName", CAT, EN)).toEqual([{ name: "Пресс A" }, { name: "Пресс B" }]);
  });
});

describe("issueMarks (eski markIssues)", () => {
  it("maydon klasslari, bo'lim nuqtalari, umumiy nuqta", () => {
    const m = issueMarks([
      { level: "warning", field: "width", tab: "cross" },
      { level: "error", field: "width", tab: "cross" },
      { level: "warning", field: "perfDia", tab: "perf" },
      { level: "warning", tab: "belt" },
    ]);
    expect(m.fields).toEqual({ width: ["warn", "bad"], perfDia: ["warn"] });
    expect(m.dots).toEqual({ cross: ["warnd", "err"], perf: ["warnd"] });
    expect(m.pDot).toBe("err");
    expect(issueMarks([{ level: "warning" }]).pDot).toBe("warnd");
    expect(issueMarks(undefined).pDot).toBe("");
  });
});

describe("History (eski pushHist/undo/redo)", () => {
  it("450 ms ichida — bitta qadam; undo/redo", () => {
    const h = new History();
    const a = st({ width: 1 }),
      b = st({ width: 2 }),
      c = st({ width: 3 });
    h.push(a, 1000);
    h.push(b, 1200); // 200 ms — yozilmaydi, lekin vaqt yangilanadi
    h.push(b, 1700); // 500 ms — yoziladi
    expect(h.past.map((x) => JSON.parse(x).width)).toEqual([1, 2]);
    expect(h.undo(c)?.width).toBe(2);
    expect(h.lastPush).toBe(0);
    expect(h.redo(st({ width: 2 }))?.width).toBe(3);
    expect(new History().undo(a)).toBeNull();
    expect(new History().redo(a)).toBeNull();
  });
  it("yangi qadam future'ni tozalaydi, 100 tagacha", () => {
    const h = new History();
    for (let i = 0; i < 105; i++) h.push(st({ width: i }), 1000 * (i + 1));
    expect(h.past).toHaveLength(100);
    expect(JSON.parse(h.past[0]).width).toBe(5);
    h.undo(st());
    expect(h.future).toHaveLength(1);
    h.push(st(), 1e9);
    expect(h.future).toHaveLength(0);
  });
});

describe("ko'ruvchi geometriyasi", () => {
  it("sheetWidth (eski layoutSheet)", () => {
    expect(sheetWidth(1000, 500, true, 1)).toBeCloseTo(476 * (1188 / 840));
    expect(sheetWidth(400, 100, false, 1)).toBe(384); // mobil: balandlik cheklamaydi
    expect(sheetWidth(100, 100, false, 2)).toBe(400); // kamida 200
  });
  it("zoomAt (eski openViewer.zoomAt)", () => {
    expect(zoomAt({ z: 1, tx: 10, ty: 20 }, 3, 100, 100)).toEqual({ z: 3, tx: -170, ty: -140 });
    expect(zoomAt({ z: 2, tx: 0, ty: 0 }, 0.5, 0, 0)).toBeNull(); // 1 gacha — fit()
    expect(zoomAt({ z: 1, tx: 0, ty: 0 }, 50, 0, 0)?.z).toBe(12);
  });
});

describe("draft / localStorage — eski kalitlar va shakl", () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => void (store[k] = String(v)),
      removeItem: (k: string) => void delete store[k],
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("kalitlar", () => {
    expect([DRAFT, LANG_KEY, OPEN_KEY, META_KEY]).toEqual(["lenta.draft.v1", "lenta.lang", "lenta.open3", "lenta.meta"]);
  });
  it("saveDraft shakli: {state, projectId, text} — JSON", () => {
    LS.set(DRAFT, draftValue(st({ width: 600 }), 12, "U13 600x5000"));
    const raw = JSON.parse(store[DRAFT]);
    expect(Object.keys(raw)).toEqual(["state", "projectId", "text"]);
    expect(raw.projectId).toBe(12);
    expect(raw.state.width).toBe(600);
  });
  it("eski qoralamani tiklash: {...INIT, ...d.state} + normBent; projectId || null", () => {
    store[DRAFT] = JSON.stringify({ state: { width: 600, extra: 1, bendAngle: 90, perfOn: true, perfQty: 7 }, projectId: 0, text: "x" });
    const r = restore(BASE, LS.get(DRAFT));
    expect(r.projectId).toBeNull();
    expect(r.state.width).toBe(600);
    expect(r.state.extra).toBe(1);
    expect(r.state).toMatchObject({ perfOn: false, curveHoleCount: 7 });
    expect(Object.keys(r.state).slice(0, 3)).toEqual(["beltName", "width", "length"]);
    expect(restore(BASE, null)).toEqual({ state: BASE, projectId: null });
  });
  it("buzilgan JSON → null; til va meta standartlari", () => {
    store[DRAFT] = "{buzilgan";
    expect(LS.get(DRAFT)).toBeNull();
    expect(loadLang()).toBe("uz");
    store[LANG_KEY] = JSON.stringify("ru");
    expect(loadLang()).toBe("ru");
    expect(loadMeta()).toEqual({ customer: "", application: "", contact: "" });
    LS.set(META_KEY, { customer: "A", application: "B", contact: "" });
    expect(loadMeta()).toEqual({ customer: "A", application: "B", contact: "" });
  });
});

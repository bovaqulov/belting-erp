import { describe, expect, it } from "vitest";

import {
  applyQuery,
  boardTotals,
  DEF,
  days,
  flt,
  goalTotals,
  hue,
  initials,
  isTeam,
  itemAmount,
  leadWait,
  paceCls,
  qs,
  rotLevel,
  snapshot,
  SYSV,
  timeline,
  toCsv,
  tomorrow10,
  waitText,
  type BoardStage,
  type Deal,
} from "./crm.lib";

const NOW = new Date("2026-11-13T12:00:00Z").getTime();
const deal = (p: Partial<Deal> = {}): Deal => ({ id: 1, title: "X", stage: "new", ...p });

describe("crm.lib", () => {
  it("qs: bo'sh/false/null tashlanadi, kodlanadi", () => {
    expect(qs({ a: "", b: false, c: null, d: undefined, e: 0, f: "a b", g: true })).toBe("e=0&f=a%20b&g=true");
  });
  it("flt: owner=me → joriy tg_id", () => {
    expect(flt({ ...DEF, owner: "me" }, 42).owner).toBe(42);
    expect(flt({ ...DEF, owner: "7" }, 42).owner).toBe("7");
    expect(flt(DEF, 1)).not.toHaveProperty("kind");
  });
  it("applyQuery: kanbanda voronka doim bor, ro'yxatda bo'sh bo'lishi mumkin", () => {
    expect(applyQuery({ view: "board", pipe: "" }, {}).pipe).toBe("main");
    const r = applyQuery({ view: "board", pipe: "x" }, { view: "list", pipe: "", sort: "idle", idle: 300 });
    expect(r.view).toBe("list");
    expect(r.pipe).toBe("");
    expect(r.f.sort).toBe("idle");
    expect(r.f).not.toHaveProperty("view");
    expect(applyQuery({ view: "list", pipe: "x" }, { rotten: true }).f).toEqual({ ...DEF, rotten: true });
  });
  it("snapshot: DEF kalitlari + voronka/ko'rinish", () => {
    const s = snapshot({ ...DEF, q: "abc" }, "list", "main");
    expect(s).toMatchObject({ q: "abc", view: "list", pipe: "main", kind: "open" });
    expect(Object.keys(s)).toHaveLength(Object.keys(DEF).length + 2);
  });
  it("isTeam: tizim ko'rinishi jamoa emas", () => {
    expect(isTeam(SYSV[0])).toBe(false);
    expect(isTeam({ id: 5, name: "a", owner_tg: null, query: {} })).toBe(true);
    expect(isTeam({ id: 5, name: "a", owner_tg: 3, query: {} })).toBe(false);
  });
  it("initials va hue", () => {
    expect(initials("«Belting» savdo uyi")).toBe("BS");
    expect(initials(null)).toBe("?");
    expect(hue("Ali")).toBe(hue("Ali"));
    expect(hue("")).toMatch(/^#/);
  });
  it("days va rotLevel", () => {
    expect(days("2026-11-10T12:00:00Z", NOW)).toBe(3);
    expect(days(null, NOW)).toBeNull();
    expect(rotLevel(deal(), NOW)).toBe("");
    expect(rotLevel(deal({ rotten: true, rot_days: 10, touched: "2026-11-01T12:00:00Z" }), NOW)).toBe("rot");
    expect(rotLevel(deal({ rotten: true, rot_days: 3, touched: "2026-11-01T12:00:00Z" }), NOW)).toBe("rot2");
  });
  it("boardTotals: faqat ochiq bosqichlar", () => {
    const s = (kind: "open" | "won", count: number, amount: string, weighted: string): BoardStage => ({
      code: kind + count,
      name: "",
      pipeline: "main",
      kind,
      count,
      amount,
      weighted,
      deals: [],
    });
    const t = boardTotals([s("open", 2, "100", "50"), s("open", 3, "200.5", ""), s("won", 9, "999", "999")]);
    expect(t).toMatchObject({ count: 5, amount: 300.5, weighted: 50 });
    expect(t.closed).toHaveLength(1);
  });
  it("itemAmount: chegirma bilan", () => {
    expect(itemAmount({ name: "a", qty: "2", price: "1000", discount: "10" })).toBe(1800);
    expect(itemAmount({ name: "a", qty: 3, price: 5, discount: null })).toBe(15);
  });
  it("tomorrow10: ertaga 10:00 mahalliy", () => {
    expect(tomorrow10(new Date(2026, 10, 13, 18, 0))).toBe("2026-11-14T10:00");
  });
  it("timeline: bosqich tarixi qo'shiladi, faollikdagi stage tashlanadi, yangisi tepada", () => {
    const tl = timeline({
      activity: [
        { kind: "comment", ts: "2026-11-02T00:00:00Z", text: "a" },
        { kind: "stage", ts: "2026-11-05T00:00:00Z" },
      ],
      stages: [{ ts: "2026-11-03T00:00:00Z", from_stage: "new", to_stage: "work", src: "tunnel" }],
    });
    expect(tl.map((a) => a.kind)).toEqual(["stage", "comment"]);
    expect(tl[0].data).toMatchObject({ from: "new", to: "work", src: "tunnel" });
  });
  it("leadWait / waitText", () => {
    expect(leadWait({ id: 1, created: "2026-11-13T11:15:00Z", status: "new" }, NOW)).toBe(45);
    expect(leadWait({ id: 1, created: "2026-11-13T11:15:00Z", status: "new", owner_tg: 5 }, NOW)).toBeNull();
    expect(waitText(45)).toBe("45 daq");
    expect(waitText(150)).toBe("3 soat");
  });
  it("goalTotals va paceCls", () => {
    expect(
      goalTotals([
        { tg_id: 1, name: "a", plan: "100", sales: "50", pct: 50, won_deals: 2, won_amount: 0 },
        { tg_id: 2, name: "b", plan: null, sales: 10, pct: null, won_deals: 1, won_amount: 0 },
      ]),
    ).toEqual({ plan: 100, sales: 60, won: 3 });
    expect(paceCls(60, 0.5)).toBe("");
    expect(paceCls(40, 0.5)).toBe("mid");
    expect(paceCls(20, 0.5)).toBe("low");
  });
  it("toCsv: BOM, ; ajratgich, qo'shtirnoq qochirish", () => {
    expect(toCsv([["a", 'b"c'], [1, null]])).toBe('﻿"a";"b""c"\r\n"1";""');
  });
});

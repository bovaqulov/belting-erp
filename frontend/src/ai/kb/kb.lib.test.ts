import { describe, expect, it } from "vitest";

import { buildKbTree, countKb, extractedCount, pathSegments, sortedEntries, splitKb, type KbDoc } from "./kb.lib";

const doc = (id: number, dept: string, path: string | null, extra: Partial<KbDoc> = {}): KbDoc => ({
  id,
  dept,
  path,
  title: `T${id}`,
  ...extra,
});

describe("kb — eski vKb bilan bir xil", () => {
  it("pathSegments", () => {
    expect(pathSegments("Mahsulotlar › Tishli remenlar")).toEqual(["Mahsulotlar", "Tishli remenlar"]);
    expect(pathSegments(" ›  a ›› b ")).toEqual(["a", "b"]);
    expect(pathSegments(null)).toEqual([]);
    expect(pathSegments("")).toEqual([]);
  });

  it("splitKb", () => {
    const docs = [
      doc(1, "umumiy", null, { status: "pending", source: "chat" }),
      doc(2, "savdo", "A", { status: "active", source: "chat" }),
      doc(3, "savdo", "A", { source: "manual" }),
    ];
    const r = splitKb(docs);
    expect(r.pending.map((d) => d.id)).toEqual([1]);
    expect(r.active.map((d) => d.id)).toEqual([2, 3]);
    expect(r.fromChat).toBe(1);
  });

  it("buildKbTree + countKb", () => {
    const root = buildKbTree([doc(1, "savdo", "A › B"), doc(2, "savdo", "A"), doc(3, "savdo", ""), doc(4, "umumiy", "X")]);
    expect(Object.keys(root)).toEqual(["savdo", "umumiy"]);
    expect(root.savdo.docs.map((d) => d.id)).toEqual([3]);
    expect(root.savdo.kids.A.docs.map((d) => d.id)).toEqual([2]);
    expect(root.savdo.kids.A.kids.B.docs.map((d) => d.id)).toEqual([1]);
    expect(countKb(root.savdo)).toBe(3);
    expect(countKb(root.umumiy)).toBe(1);
  });

  it("sortedEntries = Object.entries(o).sort()", () => {
    const o = { b: {}, a: {}, "a b": {}, "a,": {}, B: {}, Я: {}, "1": {}, a0: {} };
    const legacy = Object.entries(o).sort().map(([k]) => k);
    expect(sortedEntries(o).map(([k]) => k)).toEqual(legacy);
  });

  it("extractedCount", () => {
    expect(extractedCount({ a: { add: 2, update: 1 }, b: { add: 0 }, c: {} })).toBe(3);
    expect(extractedCount({})).toBe(0);
    expect(extractedCount(null)).toBe(0);
  });
});

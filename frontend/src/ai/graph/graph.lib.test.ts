import { describe, expect, it } from "vitest";

import {
  GPAL,
  bigCommunities,
  commColor,
  confPct,
  countText,
  focusUpdates,
  isDarkBg,
  scopeName,
  showLabel,
  toVisEdge,
  toVisNode,
} from "./graph.lib";

describe("graph helpers", () => {
  it("commColor wraps, including negatives", () => {
    expect(commColor(0)).toBe(GPAL[0]);
    expect(commColor(13)).toBe(GPAL[1]);
    expect(commColor(-1)).toBe(GPAL[11]);
  });

  it("confPct", () => {
    expect(confPct({})).toBe(0);
    expect(confPct(undefined)).toBe(0);
    expect(confPct({ EXTRACTED: 2, INFERRED: 1, AMBIGUOUS: 1 })).toBe(50);
    expect(confPct({ EXTRACTED: 1, INFERRED: 2 })).toBe(33);
  });

  it("scopeName", () => {
    const d = [{ key: "sales", name: "Savdo" }];
    expect(scopeName("all", d)).toBe("Butun firma");
    expect(scopeName("sales", d)).toBe("Savdo");
    expect(scopeName("xotira", d)).toBe("xotira");
  });

  it("bigCommunities drops singletons", () => {
    expect(bigCommunities({ communities: [{ id: 1, label: "a", size: 1 }, { id: 2, label: "b", size: 3 }] })).toEqual([
      { id: 2, label: "b", size: 3 },
    ]);
    expect(bigCommunities({})).toEqual([]);
  });

  it("isDarkBg", () => {
    expect(isDarkBg("rgb(23, 33, 43)")).toBe(true);
    expect(isDarkBg("rgb(255, 255, 255)")).toBe(false);
    expect(isDarkBg("transparent")).toBe(false);
  });

  it("showLabel threshold", () => {
    expect(showLabel(2, 1)).toBe(false);
    expect(showLabel(3, 1)).toBe(true);
    expect(showLabel(11, 100)).toBe(false);
    expect(showLabel(12, 100)).toBe(true);
  });

  it("toVisNode / toVisEdge", () => {
    const n = toVisNode({ id: "a", label: "SPB", d: 5, c: 1, t: "Hujjat" }, true, 10);
    expect(n).toMatchObject({ id: "a", label: "SPB", full: "SPB", value: 6, shape: "square" });
    expect(n.color.background).toBe(GPAL[1]);
    expect(n.font.color).toBe("#e8ecf3");
    expect(toVisNode({ id: "b", label: "x", d: 1, c: 0 }, false, 10)).toMatchObject({ label: "", shape: "dot" });
    const e = toVisEdge({ i: 1, a: "a", b: "b", k: "INFERRED", r: "" }, false);
    expect(e).toMatchObject({ id: 1, from: "a", to: "b", dashes: true, title: undefined });
    expect(toVisEdge({ i: 2, a: "a", b: "b", k: "EXTRACTED", r: "ishlatadi" }, true).dashes).toBe(false);
  });

  it("focusUpdates", () => {
    const all = [
      { id: "a", full: "A", d: 10 },
      { id: "b", full: "B", d: 1 },
    ];
    expect(focusUpdates(all, [], 10)).toEqual([
      { id: "a", opacity: 1, label: "A" },
      { id: "b", opacity: 1, label: "" },
    ]);
    expect(focusUpdates(all, ["b"], 10)).toEqual([
      { id: "a", opacity: 0.12, label: "A" },
      { id: "b", opacity: 1, label: "B" },
    ]);
  });

  it("countText", () => {
    expect(countText(150, 900)).toBe("150 / 900 tugun ko'rsatilgan");
  });
});

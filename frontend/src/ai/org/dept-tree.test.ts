import { describe, expect, it } from "vitest";

import {
  buildDeptTree,
  childCount,
  defaultParent,
  flatten,
  parentMap,
  parentOptions,
  pruneTree,
  type DeptNodeLike,
  type DeptTree,
} from "./dept-tree";

const keysOf = (t: DeptTree<DeptNodeLike>[]): unknown[] => t.map((n) => (n.children.length ? [n.d.key, keysOf(n.children)] : n.d.key));

// hozirgi backend: parent yo'q
const legacy: DeptNodeLike[] = [
  { key: "rahbariyat", sees_all: true },
  { key: "it" },
  { key: "sotuv_b2b" },
  { key: "ombor" },
];

describe("parentMap / buildDeptTree", () => {
  it("parent yo'q — oddiy bo'limlar Rahbariyat ostida (bugungi org chart)", () => {
    expect(keysOf(buildDeptTree(legacy))).toEqual([["rahbariyat", ["it", "sotuv_b2b", "ombor"]]]);
  });

  it("aniq parent, null — eng yuqori, ko'p darajali", () => {
    const d: DeptNodeLike[] = [
      { key: "rahbariyat", sees_all: true, parent: null },
      { key: "sotuv", parent: "rahbariyat" },
      { key: "sotuv_b2b", parent: "sotuv" },
      { key: "sotuv_mp", parent: "sotuv" },
      { key: "servis", parent: null },
    ];
    expect(keysOf(buildDeptTree(d))).toEqual([["rahbariyat", [["sotuv", ["sotuv_b2b", "sotuv_mp"]]]], "servis"]);
  });

  it("sikl, o'ziga ishora, yo'q kalit — eng yuqoriga", () => {
    const d: DeptNodeLike[] = [
      { key: "a", parent: "b" },
      { key: "b", parent: "a" },
      { key: "c", parent: "c" },
      { key: "e", parent: "yoq" },
    ];
    const p = parentMap(d);
    expect(p.get("c")).toBeNull();
    expect(p.get("e")).toBeNull();
    expect([p.get("a"), p.get("b")]).toContain(null);
    expect(flatten(buildDeptTree(d))).toHaveLength(4); // hech kim yo'qolmaydi
  });
});

describe("pruneTree — xodimlar daraxti AI daraxtining qismi", () => {
  const d: DeptNodeLike[] = [
    { key: "rahbariyat", sees_all: true, parent: null },
    { key: "sotuv", parent: "rahbariyat" },
    { key: "sotuv_b2b", parent: "sotuv" },
    { key: "yangi", parent: "rahbariyat" },
  ];
  it("xodimi yo'q shox kesiladi, xodimli avlodi bor oraliq bo'lim qoladi", () => {
    const people = new Set(["rahbariyat", "sotuv_b2b"]);
    expect(keysOf(pruneTree(buildDeptTree(d), (x) => people.has(x.key)))).toEqual([["rahbariyat", [["sotuv", ["sotuv_b2b"]]]]]);
  });
});

describe("parentOptions / defaultParent / childCount", () => {
  const d: DeptNodeLike[] = [
    { key: "rahbariyat", sees_all: true, parent: null },
    { key: "sotuv", parent: "rahbariyat" },
    { key: "sotuv_b2b", parent: "sotuv" },
    { key: "ombor", parent: "rahbariyat" },
  ];
  it("o'zi va avlodlari tanlovda yo'q, chuqurlik bilan", () => {
    expect(parentOptions(d, "sotuv").map((x) => [x.d.key, x.depth])).toEqual([
      ["rahbariyat", 0],
      ["ombor", 1],
    ]);
    expect(parentOptions(d, null)).toHaveLength(4);
  });
  it("standart yuqori bo'lim va bolalar soni", () => {
    expect(defaultParent(d)).toBe("rahbariyat");
    expect(defaultParent([{ key: "x" }])).toBeNull();
    expect(childCount(d, "rahbariyat")).toBe(2);
    expect(childCount(d, "sotuv_b2b")).toBe(0);
  });
});

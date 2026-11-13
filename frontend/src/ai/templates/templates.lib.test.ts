import { describe, expect, it } from "vitest";

import { deptOf, editableDepts, editorInit, groupByDept, pendingOf, savePayload, type Template } from "./templates.lib";

const t = (o: Partial<Template>): Template => ({ id: 1, dept: "a", title: "T", version: 1, status: "active", fields: [], ...o });

describe("templates", () => {
  const depts = [
    { key: "a", name: "A", icon: "x", color: "#111" },
    { key: "b", name: "B", icon: "y", color: "#222" },
  ];
  it("deptOf: topilmasa — folder/kulrang", () => {
    expect(deptOf(depts, "b").name).toBe("B");
    expect(deptOf(depts, "zz")).toEqual({ key: "zz", name: "zz", icon: "folder", color: "#8e8e93" });
  });
  it("editableDepts", () => {
    expect(editableDepts({ is_approver: true, depts, can_edit: [] })).toEqual(["a", "b"]);
    expect(editableDepts({ is_approver: false, depts, can_edit: ["b"] })).toEqual(["b"]);
  });
  it("groupByDept: kelish tartibi saqlanadi", () => {
    const g = groupByDept([t({ id: 1, dept: "b" }), t({ id: 2, dept: "a" }), t({ id: 3, dept: "b" })]);
    expect(Object.keys(g)).toEqual(["b", "a"]);
    expect(g.b.map((x) => x.id)).toEqual([1, 3]);
  });
  it("pendingOf", () => {
    expect(pendingOf([t({ id: 1 }), t({ id: 2, status: "pending" })]).map((x) => x.id)).toEqual([2]);
  });
  it("editorInit: faol shablondan / bo'sh", () => {
    const by = groupByDept([
      t({ id: 1, status: "pending", title: "P" }),
      t({ id: 2, title: "SOTUVCHI", ask_at: "18:00", fields: [{ key: "c", label: "L", type: "money" }, { key: "d", label: "M", type: "weird" }] }),
    ]);
    const e = editorInit(by, ["a"], "a", false);
    expect(e).toEqual({
      dept: "a",
      title: "SOTUVCHI",
      ask_at: "18:00",
      summary_at: "",
      fields: [
        { key: "c", label: "L", type: "money" },
        { key: "d", label: "M", type: "number" },
      ],
    });
    const b = editorInit(by, ["a"], "a", true);
    expect(b.title).toBe("");
    expect(b.fields).toEqual([{ key: "", label: "", type: "number" }]);
    expect(editorInit(by, ["a"], "zz", true).dept).toBe("a");
  });
  it("savePayload: key/label trim", () => {
    expect(
      savePayload({ dept: "a", title: " X ", ask_at: "", summary_at: "09:00", fields: [{ key: " k ", label: " l ", type: "text" }] }),
    ).toEqual({ dept: "a", title: " X ", fields: [{ key: "k", label: "l", type: "text" }], ask_at: "", summary_at: "09:00" });
  });
});

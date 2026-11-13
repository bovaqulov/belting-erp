import { describe, expect, it } from "vitest";

import { deptNameOf, groupMemory, type MemoryItem } from "./memory.lib";

const m = (id: number, scope: string, scope_id: string | null, status = "active", owner_name?: string): MemoryItem => ({
  id,
  fact: "f" + id,
  created: "2026-11-07T10:00:00",
  status,
  scope,
  scope_id,
  owner_name,
});

describe("groupMemory", () => {
  const depts = [{ key: "sotuv", name: "Sotuv" }];
  const dn = (k: string) => deptNameOf(depts, k);

  it("firma → bo'lim → xodim tartibi, arxiv alohida", () => {
    const r = groupMemory(
      [
        m(1, "xodim", "42", "active", "Ali"),
        m(2, "bolim", "sotuv"),
        m(3, "firma", null),
        m(4, "bolim", "ombor", "pending"),
        m(5, "xodim", "42"),
        m(6, "firma", null, "archived"),
        m(7, "xodim", "7"),
      ],
      dn,
    );
    expect(r.groups.map((g) => g.title)).toEqual(["Butun firma", "Bo'lim: Sotuv", "Bo'lim: ombor", "Ali", "Xodim 7"]);
    expect(r.groups[3].items.map((x) => x.id)).toEqual([1, 5]);
    expect(r.groups.map((g) => g.icon)).toEqual(["building-2", "folder", "folder", "user", "user"]);
    expect(r.live).toHaveLength(6);
    expect(r.archived.map((x) => x.id)).toEqual([6]);
  });

  it("bo'sh", () => {
    const r = groupMemory([m(1, "firma", null, "archived")], dn);
    expect(r.live).toEqual([]);
    expect(r.groups).toEqual([]);
    expect(r.archived).toHaveLength(1);
  });

  it("deptNameOf topilmasa kalit", () => {
    expect(deptNameOf(depts, "x")).toBe("x");
  });
});

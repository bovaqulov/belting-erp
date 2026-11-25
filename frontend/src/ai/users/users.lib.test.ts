import { describe, expect, it } from "vitest";

import {
  activeInvites,
  buildSavePayload,
  buildTree,
  headRow,
  headScopes,
  initScopes,
  pickValue,
  toggleScope,
  togglePerm,
  type AdminUser,
  type PhoneState,
  type UDept,
} from "./users.lib";

const u = (tg_id: number, name: string, manager_id: number | null = null, extra: Partial<AdminUser> = {}): AdminUser => ({
  tg_id,
  name,
  manager_id,
  role: "employee",
  departments: [],
  heads: [],
  ...extra,
});

const names = (ns: ReturnType<typeof buildTree<AdminUser>>): unknown =>
  ns.map((n) => (n.children.length ? [n.m.name, names(n.children)] : n.m.name));

describe("buildTree", () => {
  it("manager_id bo'yicha quradi, ism bo'yicha tartiblaydi", () => {
    const t = buildTree([u(1, "Boss"), u(2, "Vali", 1), u(3, "Ali", 1), u(4, "Sobir", 3)], () => false);
    expect(names(t)).toEqual([["Boss", [["Ali", ["Sobir"]], "Vali"]]]);
  });

  it("sikl va o'ziga ishora uziladi; tashqi manager — ildiz", () => {
    const t = buildTree([u(1, "A", 2), u(2, "B", 1), u(3, "C", 3), u(4, "D", 99)], () => false);
    // 1→2→1 sikl: eskidagidek ketma-ket uziladi — A ildiz bo'ladi, B esa A ostida qoladi
    expect(names(t)).toEqual([["A", ["B"]], "C", "D"]);
  });

  it("yagona boshliq — qolgan ildizlar unga osiladi, boshliqlar oldinda", () => {
    const head = (id: number) => id === 1 || id === 4;
    const t = buildTree([u(1, "Zafar"), u(2, "Ali"), u(3, "Bek"), u(4, "Yo'ldosh", 1)], (m) => head(m.tg_id));
    expect(names(t)).toEqual([["Zafar", ["Yo'ldosh", "Ali", "Bek"]]]);
  });

  it("ikki boshliq bo'lsa osilmaydi", () => {
    const t = buildTree([u(1, "B"), u(2, "A"), u(3, "C")], (m) => m.tg_id !== 3);
    expect(names(t)).toEqual(["A", "B", "C"]);
  });
});

const depts: UDept[] = [
  { key: "rahbar", name: "Rahbariyat", icon: "briefcase", color: "#000", group: "rahbar", sees_all: true },
  { key: "sotuv", name: "Sotuv", icon: "handshake", color: "#111", group: "savdo" },
  { key: "omb", name: "Ombor", icon: "package", color: "#222", group: "savdo" },
  { key: "it", name: "IT", icon: "monitor", color: "#333", group: "it" },
];

describe("headScopes / headRow", () => {
  it("bo'limlar + guruhlar", () => {
    expect(headScopes(depts).map((x) => [x.key, x.name])).toEqual([
      ["sotuv", "Sotuv"],
      ["omb", "Ombor"],
      ["it", "IT"],
      ["savdo", "Butun guruh: Sotuv + Ombor"],
    ]);
  });

  it("guruh bo'yicha boshliq, huquqsiz yozuv hisoblanmaydi", () => {
    const x = u(1, "X", null, { heads: [{ dept_group: "savdo", perms: { tasks: true } }, { dept_group: "it", perms: { tasks: false } }] });
    expect(headRow(x, "omb", depts)?.dept_group).toBe("savdo");
    expect(headRow(x, "it", depts)).toBeUndefined();
  });
});

describe("activeInvites", () => {
  it("bekor, muddati o'tgan, to'lganlar chiqariladi", () => {
    const base = { dept: "sotuv", created_by: 1, uses: 0, max_uses: 5, expires: "2026-12-01T00:00:00" };
    const inv = [
      { ...base, code: "a" },
      { ...base, code: "b", revoked: true },
      { ...base, code: "c", expires: "2026-01-01T00:00:00" },
      { ...base, code: "d", uses: 5 },
    ];
    expect(activeInvites(inv, "2026-11-08T10:00:00").map((i) => i.code)).toEqual(["a"]);
  });
});

describe("scopes", () => {
  const scopes = headScopes(depts);
  const keys = ["invite", "tasks"];
  it("init: yozuv bo'lmasa hammasi belgilangan, o'chiq", () => {
    const st = initScopes(u(1, "X", null, { heads: [{ dept_group: "sotuv", perms: { invite: false, tasks: true } }] }), scopes, keys);
    expect(st.sotuv).toEqual({ on: true, perms: { invite: false, tasks: true } });
    expect(st.omb).toEqual({ on: false, perms: { invite: true, tasks: true } });
  });
  it("toggle/perm qoidalari", () => {
    expect(toggleScope({ on: false, perms: { a: false, b: false } }, true)).toEqual({ on: true, perms: { a: true, b: true } });
    expect(toggleScope({ on: false, perms: { a: false, b: true } }, true)).toEqual({ on: true, perms: { a: false, b: true } });
    expect(togglePerm({ on: true, perms: { a: true, b: false } }, "a", false)).toEqual({ on: false, perms: { a: false, b: false } });
  });
});

describe("pickValue", () => {
  it("ro'yxatda bo'lmasa bo'sh", () => {
    expect(pickValue(101, ["101", "102"])).toBe("101");
    expect(pickValue(5, [1, 2])).toBe("");
    expect(pickValue(null, [1])).toBe("");
  });
});

describe("buildSavePayload", () => {
  const scopes = headScopes(depts);
  const phone: PhoneState = { loaded: true, yeastarCount: 2, mzDisabled: false, yext: "101", mzu: "" };
  const base = {
    departments: ["sotuv"],
    role: "pending",
    scopes,
    scopeState: { sotuv: { on: true, perms: { tasks: true } }, omb: { on: false, perms: { tasks: true } } },
    manager: "42",
    phone,
    prefs: { note: "  qisqa  " },
  };
  it("to'liq tana", () => {
    expect(buildSavePayload(base)).toEqual({
      role: "employee",
      departments: ["sotuv"],
      heads: [{ dept: "sotuv", perms: { tasks: true } }],
      manager_id: 42,
      yeastar_ext: "101",
      mz_user: null,
      prefs: { note: "qisqa" },
    });
  });
  it("telefon yuklanmagan — telefon maydonlari yo'q; mz o'chirilgan — mz_user yo'q", () => {
    const a = buildSavePayload({ ...base, departments: [], manager: "", phone: { ...phone, loaded: false, yext: "" } });
    expect(a.role).toBe("pending");
    expect(a.manager_id).toBeNull();
    expect("yeastar_ext" in a).toBe(false);
    const b = buildSavePayload({ ...base, phone: { ...phone, mzDisabled: true } });
    expect("mz_user" in b).toBe(false);
    // yeastar ro'yxati bo'sh — faqat yeastar_ext yuborilmaydi
    const c = buildSavePayload({ ...base, phone: { ...phone, yeastarCount: 0, yext: "" } });
    expect("yeastar_ext" in c).toBe(false);
  });
  it("ro'yxat xato bilan bo'sh kelsa — mavjud bog'lanish o'chirilmaydi; o'zgarmagan maydon yuborilmaydi", () => {
    const orig = { yext: "101", mzu: "" };
    const a = buildSavePayload({ ...base, phone: { ...phone, mzCount: 0, orig } });
    expect("mz_user" in a).toBe(false);
    expect("yeastar_ext" in a).toBe(false);      // o'zgarmagan
    const b = buildSavePayload({ ...base, phone: { ...phone, yext: "", orig } });
    expect(b.yeastar_ext).toBeNull();            // ataylab tozalandi
  });
  it("rol o'zgarmasa yuborilmaydi (ega bo'lmagan admin admin kartasini saqlay oladi)", () => {
    const a = buildSavePayload({ ...base, departments: ["sotuv"], role: "admin", origRole: "admin" });
    expect("role" in a).toBe(false);
    const b = buildSavePayload({ ...base, role: "pending", origRole: "pending" });   // bo'lim tanlandi -> employee
    expect(b.role).toBe("employee");
  });
});

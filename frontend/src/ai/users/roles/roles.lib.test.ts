import { describe, expect, it } from "vitest";

import { groupPerms, permSummary, roleNameError, rolesPerms, togglePerm, type AccessRole, type PermDef } from "./roles.lib";

const defs: PermDef[] = [
  { key: "crm", name: "CRM: o'z bitimlari", group: "Sotuv" },
  { key: "crm.head", name: "CRM rahbari: hammasi", group: "Sotuv" },
  { key: "sales", name: "Savdo hujjatlari: buyurtma", group: "Sotuv" },
  { key: "warehouse", name: "Ombor", group: "Ombor" },
  { key: "money", name: "Pul: kassa", group: "Moliya" },
];
const role = (id: number, key: string, perms: string[]): AccessRole => ({ id, key, name: key, note: "", perms, system: false, members: [] });

describe("roles.lib", () => {
  it("guruhlaydi", () => {
    expect(groupPerms(defs).map(([g, ps]) => [g, ps.length])).toEqual([
      ["Sotuv", 3],
      ["Ombor", 1],
      ["Moliya", 1],
    ]);
  });
  it("rahbarlik CRM'ni ham yoqadi, CRM o'chsa rahbarlik ham o'chadi; tartib — katalog", () => {
    expect(togglePerm(["money"], "crm.head", true, defs)).toEqual(["crm", "crm.head", "money"]);
    expect(togglePerm(["crm", "crm.head", "money"], "crm", false, defs)).toEqual(["money"]);
    expect(togglePerm(["crm", "crm.head"], "crm.head", false, defs)).toEqual(["crm"]);
  });
  it("qisqa tavsif", () => {
    expect(permSummary(["crm", "sales"], defs)).toBe("CRM, Savdo hujjatlari");
    expect(permSummary([], defs)).toBe("ruxsat yo'q");
    expect(permSummary(["crm", "crm.head", "sales", "warehouse", "money"], defs, 2)).toBe("CRM, CRM rahbari va yana 3");
  });
  it("rollar birlashmasi va nom tekshiruvi", () => {
    const roles = [role(1, "a", ["crm"]), role(2, "b", ["crm", "money"]), role(3, "c", ["warehouse"])];
    expect(rolesPerms(["a", "b"], roles).sort()).toEqual(["crm", "money"]);
    expect(roleNameError("  ", roles)).toBe("Rol nomini yozing");
    expect(roleNameError("A", roles)).toBe("«A» nomli rol bor");
    expect(roleNameError("a", roles, 1)).toBeNull();
  });
});

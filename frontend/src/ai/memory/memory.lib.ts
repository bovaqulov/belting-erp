// Xotira (eski vMemory, admin.html 693–726): yozuvlarni guruhlash — sof mantiq.

export type MemStatus = "active" | "pending" | "archived" | (string & {});
export type MemScope = "firma" | "bolim" | "xodim" | (string & {});

export interface MemoryItem {
  id: number | string;
  fact: string;
  created?: string | null;
  status: MemStatus;
  scope: MemScope;
  scope_id?: string | number | null;
  owner_name?: string | null;
}

export type MemGroupKind = "firma" | "bolim" | "xodim";

export interface MemGroup {
  kind: MemGroupKind;
  /** firma: "Butun firma"; bolim: "Bo'lim: <nom>"; xodim: owner_name || "Xodim <id>" */
  title: string;
  icon: string;
  color: string;
  items: MemoryItem[];
}

/** Eski tartib: firma → bo'limlar (birinchi uchrash tartibida) → xodimlar. Arxivlanganlar alohida. */
export function groupMemory(
  memory: MemoryItem[],
  deptName: (key: string) => string,
): { live: MemoryItem[]; groups: MemGroup[]; archived: MemoryItem[] } {
  const live = memory.filter((m) => m.status !== "archived");
  const groups: MemGroup[] = [];
  const firm = live.filter((m) => m.scope === "firma");
  if (firm.length) groups.push({ kind: "firma", title: "Butun firma", icon: "building-2", color: "#5288c1", items: firm });
  for (const k of [...new Set(live.filter((m) => m.scope === "bolim").map((m) => m.scope_id))])
    groups.push({
      kind: "bolim",
      title: `Bo'lim: ${deptName(String(k))}`,
      icon: "folder",
      color: "#34c759",
      items: live.filter((m) => m.scope === "bolim" && m.scope_id === k),
    });
  for (const k of [...new Set(live.filter((m) => m.scope === "xodim").map((m) => m.scope_id))]) {
    const list = live.filter((m) => m.scope === "xodim" && m.scope_id === k);
    groups.push({
      kind: "xodim",
      title: list[0].owner_name || "Xodim " + k,
      icon: "user",
      color: "#af52de",
      items: list,
    });
  }
  const archived = memory.filter((m) => m.status === "archived");
  return { live, groups, archived };
}

/** eski dn(k): bo'lim nomi, topilmasa kalitning o'zi */
export function deptNameOf(depts: { key: string; name: string }[], k: string): string {
  return depts.find((d) => d.key === k)?.name || k;
}

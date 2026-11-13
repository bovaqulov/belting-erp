// Accounting — 3 ta alohida qism (egasi qarori 2026-11-14): Mahsulotlar, Shartnomalar, Maoshlar. Ochilganda — 3 kartochka
// (hub), har biri o'z bo'limlari bilan. Holat URL'da: ?a=contracts&sec=list (hub — parametrsiz).
export type Area = "products" | "contracts" | "payroll";
export type Sec = "items" | "groups" | "contracts" | "month" | "staff";
export type View = { hub: true } | { hub: false; area: Area; sec: Sec };

export const AREAS: { key: Area; t: string; sub: string; color: string; secs: { key: Sec; t: string; icon: string }[] }[] = [
  {
    key: "products",
    t: "Mahsulotlar",
    sub: "Tovarlar katalogi, kategoriyalar, remen belgisi va kengliklar",
    color: "#2fa37a",
    secs: [
      { key: "items", t: "Tovarlar", icon: "package" },
      { key: "groups", t: "Kategoriyalar", icon: "layers" },
    ],
  },
  {
    key: "contracts",
    t: "Shartnomalar",
    sub: "Mijoz va yetkazib beruvchilar bilan shartnomalar, muddat, limit, imzo",
    color: "#3e88f7",
    secs: [{ key: "contracts", t: "Shartnomalar", icon: "file" }],
  },
  {
    key: "payroll",
    t: "Maoshlar",
    sub: "Xodimlar oklad, oylik hisob: bonus, ushlanma, avans, to'lov",
    color: "#e8961f",
    secs: [
      { key: "month", t: "Oylik hisob", icon: "calendar" },
      { key: "staff", t: "Xodimlar", icon: "users" },
    ],
  },
];

const area = (a: string | null) => AREAS.find((x) => x.key === a);

/** URL → ko'rinish; noto'g'ri qism — hub; bo'lim qismda yo'q — qismning birinchisi */
export function parseView(search: string): View {
  const p = new URLSearchParams(search);
  const a = area(p.get("a"));
  if (!a) return { hub: true };
  const s = p.get("sec");
  return { hub: false, area: a.key, sec: a.secs.some((x) => x.key === s) ? (s as Sec) : a.secs[0].key };
}

export const viewQs = (v: View): string => (v.hub ? "" : `?a=${v.area}&sec=${v.sec}`);
export const areaOf = (a: Area) => area(a)!;
export const firstOf = (a: Area): View => ({ hub: false, area: a, sec: areaOf(a).secs[0].key });
export const viewTitle = (v: View): string => {
  if (v.hub) return "Accounting";
  const a = areaOf(v.area);
  return a.secs.length > 1 ? `${a.t} · ${a.secs.find((s) => s.key === v.sec)!.t}` : a.t;
};

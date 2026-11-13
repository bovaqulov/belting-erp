import { describe, expect, it } from "vitest";

import { countRules, dateUz, localIso, matchFilter, money } from "./fields";
import { breaks, choropleth, classOf, colorScale, hexagons, inGeometry, summarize, weightedCenter } from "./stats";
import type { Filter, Rec } from "./types";

const base: Rec = {
  id: "bx:1", name: "Almerro Group", lat: 41.31, lng: 69.28, q: "exact", region: "toshkent", district: "UZB-ADM2-1",
  owner: "10", ownerName: "Begzod", status: "faol", sales: 900e6, salesCount: 12, lastSale: "2026-11-01", debt: 0,
  overdue: 0, deals: 1, territory: null, address: "Toshkent, Yunusobod", type: "CUSTOMER", industry: null, tag: null,
};
const rec = (o: Partial<Rec>): Rec => ({ ...base, ...o });
const NOW = Date.parse("2026-11-10");

describe("filtr", () => {
  const rs = [
    rec({}),
    rec({ id: "bx:2", name: "Mega Teks", region: "samarqand", status: "sust", sales: 50e6, lastSale: "2026-05-01", debt: 20e6, overdue: 40 }),
    rec({ id: "bx:3", name: "Zarafshon Agro", region: "navoiy", status: "xaridsiz", sales: 0, lastSale: null, owner: null, ownerName: null }),
  ];
  const run = (f: Partial<Filter>) => rs.filter((r) => matchFilter(r, { match: "all", rules: [], search: "", ...f }, NOW)).map((r) => r.id);

  it("qidiruv va AND", () => {
    expect(run({ search: "teks" })).toEqual(["bx:2"]);
    expect(run({ rules: [{ kind: "cond", field: "sales", op: "gt", value: 10e6 }, { kind: "cond", field: "debt", op: "gt", value: 0 }] })).toEqual(["bx:2"]);
  });
  it("OR guruh va enum", () => {
    const f: Partial<Filter> = {
      rules: [
        { kind: "group", match: "any", rules: [{ kind: "cond", field: "region", op: "in", value: ["navoiy"] }, { kind: "cond", field: "status", op: "in", value: ["faol"] }] },
      ],
    };
    expect(run(f)).toEqual(["bx:1", "bx:3"]);
    expect(run({ match: "any", rules: [{ kind: "cond", field: "owner", op: "empty" }, { kind: "cond", field: "overdue", op: "gte", value: 30 }] })).toEqual(["bx:2", "bx:3"]);
  });
  it("sana", () => {
    expect(run({ rules: [{ kind: "cond", field: "lastSale", op: "last_days", value: 30 }] })).toEqual(["bx:1"]);
    expect(run({ rules: [{ kind: "cond", field: "lastSale", op: "older_days", value: 90 }] })).toEqual(["bx:2", "bx:3"]);
  });
  it("qoidalar soni", () => {
    expect(countRules({ match: "all", search: "x", rules: [{ kind: "group", match: "any", rules: [{ kind: "cond", field: "name", op: "empty" }, { kind: "cond", field: "name", op: "empty" }] }] })).toBe(3);
  });
});

describe("statistika", () => {
  it("kvantil va sinf", () => {
    const br = breaks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(br.length).toBe(4);
    expect(classOf(1, br)).toBe(0);
    expect(classOf(10, br)).toBe(4);
  });
  it("olti burchak — taxminiy nuqtalar kirmaydi", () => {
    const { fc } = hexagons([rec({}), rec({ id: "b", lat: 41.3101, lng: 69.2801 }), rec({ id: "c", q: "region" })], 7, "sales", "sum");
    expect(fc.features.length).toBe(1);
    expect(fc.features[0].properties?.value).toBe(1800e6);
  });
  it("viloyat bo'yash o'rtacha", () => {
    const { values } = choropleth([rec({}), rec({ id: "b", sales: 100e6 })], "region", "sales", "avg");
    expect(values.get("toshkent")?.value).toBe(500e6);
  });
  it("og'irlikli markaz og'irga yaqin", () => {
    const c = weightedCenter([rec({ lat: 41, lng: 69, sales: 9 }), rec({ id: "b", lat: 39, lng: 67, sales: 1 })], "sales")!;
    expect(c.lat).toBeGreaterThan(40.5);
    expect(c.lng).toBeGreaterThan(68.5);
  });
  it("rang va xulosa", () => {
    const { legend } = colorScale([rec({}), rec({ id: "b", status: "sust" })], "status", new Map());
    expect(legend.map((l) => l.color)).toContain("#30a46c");
    const s = summarize([rec({}), rec({ id: "b", debt: 5, overdue: 3, lat: null, lng: null })]);
    expect(s.n).toBe(2);
    expect(s.located).toBe(1);
    expect(s.overdue).toBe(1);
  });
  it("poligon ichida", () => {
    const sq: GeoJSON.Polygon = { type: "Polygon", coordinates: [[[69, 41], [70, 41], [70, 42], [69, 42], [69, 41]]] };
    expect(inGeometry(69.5, 41.5, sq)).toBe(true);
    expect(inGeometry(68.5, 41.5, sq)).toBe(false);
  });
  it("pul formati", () => {
    expect(money(1.5e9)).toBe("1.5 mlrd");
    expect(money(25e6)).toBe("25 mln");
    expect(money(999_600)).toBe("1.0 mln");
    expect(money(999_950_000)).toBe("1.0 mlrd");
    expect(money(-12_400_000)).toBe("-12 mln");
    expect(money(999_400)).toBe("999 ming");
  });
  it("sana formati", () => {
    expect(dateUz("2026-11-10T14:05:09")).toBe("10.11.2026 14:05");
    expect(dateUz("2026-11-01")).toBe("01.11.2026");
    expect(dateUz(null)).toBe("—");
    expect(localIso(new Date(2026, 10, 10, 9, 5, 7))).toBe("2026-11-10T09:05:07");
  });
  it("gradient rang chegaralari legenda uchun qaytadi", () => {
    const sc = colorScale([rec({}), rec({ id: "b", sales: 10e6 })], "sales", new Map());
    expect(sc.breaks?.length).toBeGreaterThan(0);
  });
});

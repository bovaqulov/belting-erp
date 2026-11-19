import { describe, expect, it } from "vitest";

import { deskView, MORE, parseView, tabOf, TABS, viewQs } from "./nav.lib";
import { cellPos, genCells, invKey, parseNeeds, racks, size, stockCsv, tally } from "./wh.lib";

describe("ombor navigatsiyasi", () => {
  it("URL ↔ ko'rinish", () => {
    expect(parseView("")).toBe("place");
    expect(parseView("?sec=inv")).toBe("inv");
    expect(parseView("?sec=xx")).toBe("place");
    expect(parseView("?sec=pick")).toBe("pick");
    expect(parseView("?sec=stock")).toBe("place");
    expect(parseView("?sec=more")).toBe("more");
    expect(viewQs("place")).toBe("");
    expect(viewQs("cells")).toBe("?sec=cells");
  });
  it("telefon tablari va Amallar", () => {
    expect(TABS).toContain("more");
    expect(MORE).not.toContain("place");
    expect(MORE).toContain("cells");
    expect(MORE).toContain("pick");
    expect(TABS).not.toContain("pick");
    expect(tabOf("cells")).toBe("more");
    expect(tabOf("inv")).toBe("inv");
    expect(deskView("more")).toBe("place");
  });
});

describe("ombor yordamchilari", () => {
  it("o'lcham matni", () => {
    expect(size({ width_mm: 800, length_mm: 12500 })).toBe("800×12 500 mm");
    expect(size({ width_mm: 120 })).toBe("eni 120 mm");
    expect(size({ length_mm: 3000 })).toBe("3 000 mm");
    expect(size({})).toBe("");
  });
  it("kesish ehtiyojlari", () => {
    expect(parseNeeds("500x1200x2, 800x3000", "wl")).toEqual([
      { w: 500, l: 1200, n: 2 },
      { w: 800, l: 3000, n: 1 },
    ]);
    expect(parseNeeds("500", "wl")).toBeNull();
    // vergul — ajratuvchi (eski sahifa bilan bir xil), kasr — nuqta bilan
    expect(parseNeeds("2.5x3\n1.5", "l")).toEqual([
      { q: 2.5, n: 3 },
      { q: 1.5, n: 1 },
    ]);
  });
  it("joy kodlari", () => {
    expect(genCells("a", 1, 2, 2)).toEqual(["A-01-1", "A-01-2", "A-02-1", "A-02-2"]);
    expect(genCells("B", 9, 10, 0)).toEqual(["B-09", "B-10"]);
    expect(genCells("", 1, 2, 0)).toEqual([]);
    expect(genCells("A", 3, 2, 0)).toEqual([]);
    expect(genCells("A", 1, 200, 0)).toEqual([]);
  });
  it("sanash kaliti: birlik yoki tovar+kenglik+firma", () => {
    expect(invKey({ batch_id: 5, item_id: 1 })).toBe("b5");
    expect(invKey({ item_id: 1, char_id: 81, data: { firm_id: 2 } })).toBe("i1:81:2");
    expect(invKey({ item_id: 1 })).toBe("i1::");
  });
  it("CSV: BOM, ';', vergulli kasr, qo'shtirnoq", () => {
    const csv = stockCsv(
      [{ item_id: 1, name: 'Lenta "EP"', sku: "EP", qty: 12.5, unit: "m2", min_qty: 0, dims: "wl", rolls: 1, pieces: 2, units: 3, locs: ["A-01-1"], firms: ["BLT"], whs: ["Asosiy"], cost: 10.5 }],
      true,
    );
    expect(csv.startsWith("﻿")).toBe(true);
    const row = csv.split("\n")[1];
    expect(row).toContain('"Lenta ""EP"""');
    expect(row).toContain('"12,5";"m²"');
    expect(row.endsWith('"10,5"')).toBe(true);
  });
});

describe("joylar tuzilmasi", () => {
  it("joy kodi: qator va qavat", () => {
    expect(cellPos("A-03-2")).toEqual({ row: "A-03", floor: 2 });
    expect(cellPos("A-03")).toEqual({ row: "A-03", floor: null });
    expect(cellPos("RAMPA")).toEqual({ row: "RAMPA", floor: null });
  });
  it("stellaj: qatorlar tartibda, qavatlar yuqoridan pastga, birliklar jami", () => {
    const cs = [
      { code: "A-10-1", units: 1 },
      { code: "A-02-1", units: 2 },
      { code: "A-02-3", units: 0 },
      { code: "A-02-2", units: 4 },
    ];
    const r = racks(cs);
    expect(r.map((x) => x.row)).toEqual(["A-02", "A-10"]);
    expect(r[0].floors.map((f) => f.floor)).toEqual([3, 2, 1]);
    expect(r[0].units).toBe(6);
    expect(tally(cs)).toEqual({ cells: 4, units: 7 });
  });
});

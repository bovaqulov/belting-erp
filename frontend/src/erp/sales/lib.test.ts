import { describe, expect, it } from "vitest";

import { hitLine, lineCalc, parseView, sum, totals, viewQs, when } from "./lib";

describe("sales lib", () => {
  it("line and totals — backend bilan bir xil (QQS narx ichida)", () => {
    expect(lineCalc({ qty: "2", price: "740000", discount: "0" }, 12)).toEqual({ amount: 1480000, vat: 158571.43 });
    expect(lineCalc({ qty: "1", price: "100", discount: "10" }, 12)).toEqual({ amount: 90, vat: 9.64 });
    expect(totals([{ qty: "2", price: "740000", discount: "0" }, { qty: "1", price: "100", discount: "10" }], 12)).toEqual({ total: 1480090, vat: 158581.07 });
    expect(lineCalc({ qty: "3", price: "1000", discount: "0" }, 0)).toEqual({ amount: 3000, vat: 0 });
  });
  it("format", () => {
    expect(sum("1657600")).toBe("1 657 600");
    expect(sum(177600.5)).toBe("177 600,50");
    expect(sum(-5000)).toBe("−5 000");
    expect(when("2026-11-20T16:13:58+05:00")).toBe("20.11.2026 16:13");
  });
  it("view <-> url", () => {
    const v = parseView("?v=docs&g=orders,shipments,x&doc=12&c=5");
    expect(v).toEqual({ v: "docs", doc: 12, groups: ["orders", "shipments"], customer: 5 });
    expect(viewQs(v)).toBe("?v=docs&g=orders%2Cshipments&c=5&doc=12");
    expect(parseView("")).toEqual({ v: "home", doc: null, groups: [], customer: null });
    expect(parseView("?doc=3").v).toBe("docs");
  });
  it("hitLine", () => {
    expect(hitLine({ item_id: 1, char_id: 2, name: "A", char: "20 mm", unit: "", sku: null, price: "100", price_vat: "112", free: "3" })).toMatchObject({ unit: "dona", price: "112", qty: "1" });
  });
});

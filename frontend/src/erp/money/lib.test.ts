import { describe, expect, it } from "vitest";

import { cur, parseView, sum, totalsBy, viewQs } from "./lib";

describe("money lib", () => {
  it("format", () => {
    expect(sum("46099267523.65")).toBe("46 099 267 523,65");
    expect(sum(-1500)).toBe("−1 500");
    expect(cur("UZS")).toBe("so'm");
    expect(cur("USD")).toBe("USD");
  });
  it("totals by currency (so'm birinchi)", () => {
    expect(totalsBy([{ currency: "USD", balance: "10" }, { currency: "UZS", balance: "100" }, { currency: "UZS", balance: "50.5" }])).toEqual([
      ["UZS", 150.5],
      ["USD", 10],
    ]);
  });
  it("view", () => {
    const v = parseView("?t=docs&acc=3&doc=7");
    expect(v).toEqual({ tab: "docs", doc: 7, account: 3 });
    expect(viewQs(v)).toBe("?t=docs&acc=3&doc=7");
    expect(parseView("?doc=2").tab).toBe("docs");
    expect(parseView("").tab).toBe("accounts");
  });
});

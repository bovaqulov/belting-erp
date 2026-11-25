import { describe, expect, it } from "vitest";

import { bucket, delta, money, num } from "./analytics.lib";

describe("analitika formatlari", () => {
  it("pul qisqartmasi", () => {
    expect(money(37_780_833)).toBe("37,8 mln");
    expect(money(950_000)).toBe("950 ming");
    expect(money(1_250_000_000)).toBe("1,3 mlrd");
    expect(money(420)).toBe("420");
  });
  it("son va o'zgarish", () => {
    expect(num(1234567)).toBe("1 234 567");
    expect(delta(12.5)).toEqual({ text: "+12,5%", up: true });
    expect(delta(-4)).toEqual({ text: "−4%", up: false });
    expect(delta(null)).toBeNull();
  });
  it("kunlarni ustunlarga siqish", () => {
    const days = Array.from({ length: 90 }, (_, i) => ({ date: `2026-11-${String((i % 28) + 1).padStart(2, "0")}`, sum: 1 }));
    const b = bucket(days);
    expect(b.length).toBeLessThanOrEqual(31);
    expect(b.reduce((a, x) => a + x.sum, 0)).toBe(90);
    expect(bucket([{ date: "2026-11-05", sum: 7 }])).toEqual([{ label: "05.11", sum: 7 }]);
  });
});

import { describe, expect, it } from "vitest";

import { fmtMinutes, fmtSum, localInput, stageOf, tomorrowAt10, waitMinutes } from "./crm.lib";

describe("crm lib", () => {
  it("bosqich", () => {
    expect(stageOf("won").tone).toBe("done");
    expect(stageOf(null).id).toBe("new");
  });
  it("kutish va format", () => {
    const now = Date.parse("2026-11-19T10:30:00Z");
    expect(waitMinutes("2026-11-19T10:00:00Z", now)).toBe(30);
    expect(waitMinutes(null, now)).toBe(0);
    expect(fmtMinutes(5)).toBe("5 daq");
    expect(fmtMinutes(125)).toBe("2 soat");
    expect(fmtMinutes(4000)).toBe("2 kun");
    expect(fmtSum("12500000.00")).toBe("12 500 000");
    expect(fmtSum(null)).toBe("");
  });
  it("sana inputi", () => {
    expect(localInput(new Date(2026, 10, 19, 9, 5))).toBe("2026-11-19T09:05");
    expect(tomorrowAt10(new Date(2026, 10, 30, 15))).toBe("2026-12-01T10:00");
  });
});

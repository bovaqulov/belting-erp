import { describe, expect, it } from "vitest";

import { range } from "./index";
import { minutes } from "./ui";

describe("hisobot", () => {
  it("davr", () => {
    const now = new Date(2026, 10, 14);
    expect(range("month", now)).toEqual(["2026-11-01", "2026-11-14"]);
    expect(range("prev", now)).toEqual(["2026-10-01", "2026-10-31"]);
    expect(range("30", now)).toEqual(["2026-10-16", "2026-11-14"]);
  });
  it("javob vaqti", () => {
    expect(minutes(null)).toBe("—");
    expect(minutes(45)).toBe("45 daq");
    expect(minutes(130)).toBe("2 soat 10 daq");
    expect(minutes(120)).toBe("2 soat");
    expect(minutes(3000)).toBe("2 kun");
  });
});

import { describe, expect, it } from "vitest";

import { dur, size } from "./system.lib";

describe("system.lib", () => {
  it("dur: soniya → o'qiladigan davomiylik", () => {
    expect(dur(45)).toBe("45 s");
    expect(dur(600)).toBe("10 daq");
    expect(dur(3 * 3600 + 15 * 60)).toBe("3 soat 15 daq");
    expect(dur(50 * 3600)).toBe("2 kun 2 soat");
  });
  it("size: bayt → B / KB / MB", () => {
    expect(size(512)).toBe("512 B");
    expect(size(2048)).toBe("2.0 KB");
    expect(size(3_500_000)).toBe("3.5 MB");
  });
});

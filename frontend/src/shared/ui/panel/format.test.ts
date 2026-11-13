import { describe, expect, it } from "vitest";

import { AV_COLORS, avColor, fmtTime, hue, initials, noEmoji } from "./format";

// Eski admin.html dagi funksiyalar — natijani taqqoslash uchun aynan nusxa
const legacyHue = (str: unknown) => {
  let h = 0;
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
};

describe("admin format — eski admin.html bilan bir xil", () => {
  it("initials", () => {
    expect(initials("Ali Valiyev Karimovich")).toBe("AV");
    expect(initials("  muhammad  ")).toBe("M");
    expect(initials("")).toBe("?");
    expect(initials(null)).toBe("?");
    expect(initials("олег петров")).toBe("ОП");
  });
  it("hue / avColor: barqaror, eski formula", () => {
    for (const v of [0, 1, 123456789, 987654321012, "abc", "Ўзбек", ""]) {
      expect(hue(v)).toBe(legacyHue(v));
      expect(hue(v)).toBeGreaterThanOrEqual(0);
    }
    expect(hue("a")).toBe(97);
    expect(avColor({ tg_id: 123456789 })).toBe(avColor({ tg_id: 123456789 }));
    expect(avColor({ tg_id: 123456789 })).toBe(AV_COLORS[legacyHue(123456789) % AV_COLORS.length]);
    expect(AV_COLORS).toContain(avColor({ tg_id: "x" }));
  });
  it("noEmoji", () => {
    expect(noEmoji("🤝 Sotuv")).toBe("Sotuv");
    expect(noEmoji("📦  Ombor")).toBe("Ombor");
    expect(noEmoji("Sotuv 🤝")).toBe("Sotuv 🤝");
    expect(noEmoji("1C")).toBe("1C");
    expect(noEmoji(undefined)).toBe("");
  });
  it("fmtTime", () => {
    expect(fmtTime("2026-11-07T14:05:33.123")).toBe("2026-11-07 14:05");
    expect(fmtTime("2026-11-07 14:05:33")).toBe("2026-11-07 14:05");
    expect(fmtTime(null)).toBe("");
    expect(fmtTime(undefined)).toBe("");
  });
});

import { describe, expect, it } from "vitest";

import { displayName, floodLeft, fmtBytes, fmtPhone, fmtWait, hasSession, inLogin, needsLogin, normPhone, tone } from "./status.lib";

describe("tgcrm status", () => {
  it("tone va bosqichlar", () => {
    expect(tone("active")).toBe("done");
    expect(tone("banned")).toBe("bad");
    expect(inLogin("qr")).toBe(true);
    expect(needsLogin("logged_out")).toBe(true);
    expect(hasSession("flood")).toBe(true);
    expect(hasSession("banned")).toBe(false);
    expect(hasSession("code_sent")).toBe(false);
  });

  it("telefon", () => {
    expect(normPhone("90 111-22-33")).toBe("+998901112233");
    expect(normPhone("+7 999 123 45 67")).toBe("+79991234567");
    expect(normPhone("")).toBe("");
    expect(fmtPhone("+998901112233")).toBe("+998 90 111 22 33");
    expect(fmtPhone("79991234567")).toBe("+79991234567");
  });

  it("formatlar", () => {
    expect(fmtBytes(4000 * 512 * 1024)).toBe("2 GB");
    expect(fmtBytes(undefined)).toBe("—");
    expect(fmtWait(30)).toBe("30 soniya");
    expect(fmtWait(600)).toBe("10 daqiqa");
    expect(fmtWait(36000)).toBe("10 soat");
    expect(floodLeft("2026-01-01T00:01:00Z", Date.parse("2026-01-01T00:00:00Z"))).toBe(60);
    expect(floodLeft(null)).toBe(0);
    expect(displayName({ id: 3, title: "", name: "", phone: "" })).toBe("Akkaunt #3");
  });
});

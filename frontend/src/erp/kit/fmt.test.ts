import { describe, expect, it } from "vitest";

import { ago, dnum, dtitle, iso, num, short, un, usz } from "./fmt";

// erp_ui.js bilan bir xil natija bo'lishi shart (eski va yangi sahifalar yonma-yon ishlaydi)
describe("erp fmt", () => {
  it("num: bo'shliq bilan guruhlash, vergul kasr", () => {
    expect(num(1478000.5)).toBe("1 478 000,5");
    expect(num("63.000", 3)).toBe("63");
    expect(num(null)).toBe("");
    expect(num("abc")).toBe("");
  });
  it("dnum: kiritilgan son", () => expect(dnum("1 250,5")).toBe("1250.5"));
  it("un va usz", () => {
    expect(un("m2")).toBe("m²");
    expect(usz({ width_mm: 120, length_mm: 12000 })).toBe("120×12 000 mm");
    expect(usz({ width_mm: 450 })).toBe("eni 450 mm");
  });
  it("short: mln/ming/mlrd", () => {
    expect(short(1500000)).toBe("1,5 mln");
    expect(short(250000)).toBe("250 ming");
    expect(short(1250000000)).toBe("1,25 mlrd");
    expect(short(900)).toBe("900");
    expect(short(null)).toBe("0");
  });
  it("ago", () => {
    const now = new Date("2026-11-13T12:00:00").getTime();
    expect(ago("2026-11-13T11:59:40", now)).toBe("hozir");
    expect(ago("2026-11-13T11:50:00", now)).toBe("10 daq oldin");
    expect(ago("2026-11-13T09:00:00", now)).toBe("3 soat oldin");
    expect(ago("2026-11-10T09:00:00", now)).toBe("10.11.26");
    expect(ago(null)).toBe("");
  });
  it("iso: mahalliy sana", () => expect(iso(new Date(2026, 10, 5, 23, 30))).toBe("2026-11-05"));
  it("dtitle: Bitrix ruscha qoliplari", () => {
    expect(dtitle("Сделка #123")).toBe("Bitim #123");
    expect(dtitle("Входящий звонок от X")).toBe("Kiruvchi qo'ng'iroq от X");
    expect(dtitle(null)).toBe("");
  });
});

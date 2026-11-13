import { describe, expect, it } from "vitest";

import { isoToDmy, money, normNumber } from "./format.lib";
import { collectValues, type Field } from "./report.lib";

describe("format — eski report.html bilan bir xil", () => {
  it("money", () => {
    expect(money("")).toBe("");
    expect(money("abc")).toBe("");
    expect(money("1250000").replace(/\s/g, " ")).toBe("1 250 000 so'm");
    expect(money("0")).toBe("0 so'm");
    expect(money("1250.5").replace(/\s/g, " ")).toBe("1 250,5 so'm");   // kasr verguli yo'qolmaydi
  });
  it("normNumber: bo'shliqlar, birinchi vergul", () => {
    expect(normNumber(" 1 250 000 ")).toBe("1250000");
    expect(normNumber("12,5")).toBe("12.5");
  });
  it("isoToDmy", () => expect(isoToDmy("2026-11-07")).toBe("07.11.2026"));
});

describe("collectValues", () => {
  const fields: Field[] = [
    { key: "a", label: "A", type: "money" },
    { key: "b", label: "B", type: "text" },
    { key: "c", label: "C", type: "number" },
  ];
  it("bo'sh -> null (saqlanganini o'chirish uchun), son normallashadi, matn o'zgarmaydi", () => {
    expect(collectValues(fields, { a: " 1 000 ", b: " izoh, 2 ", c: "" })).toEqual({ a: "1000", b: "izoh, 2", c: null });
  });
});

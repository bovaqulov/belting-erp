import { describe, expect, it } from "vitest";

import { check, EMPTY, errText, filterQs, sum, toForm, when, type Shipment } from "./logistics.lib";
import { ApiError } from "@/shared/api/client";

describe("logistics.lib", () => {
  it("check", () => {
    expect(check(EMPTY)).toBe("Tashuvchini tanlang");
    expect(check({ ...EMPTY, carrier: "emu" })).toBe("Qabul qiluvchini yozing");
    expect(check({ ...EMPTY, carrier: "emu", recipient: "A" })).toBe("Shahar yoki manzilni yozing");
    expect(check({ ...EMPTY, carrier: "emu", recipient: "A", city: "Navoiy", places: "0" })).toBe("Joylar soni 1–999");
    expect(check({ ...EMPTY, carrier: "emu", recipient: "A", city: "Navoiy" })).toBeNull();
  });
  it("errText and format", () => {
    expect(errText(new ApiError("x", 422, { cost: "Narx: son kiriting" }))).toBe("Narx: son kiriting");
    expect(errText(new Error("tarmoq"))).toBe("tarmoq");
    expect(sum(1234567)).toBe("1 234 567");
    expect(sum(null)).toBe("");
    expect(when("2026-11-21T09:05:00+05:00")).toBe("21.11 09:05");
    expect(filterQs("all")).toBe("");
    expect(filterQs("active")).toBe("status=active");
  });
  it("toForm", () => {
    const x = { weight_kg: 3.5, cost: null, places: 2 } as Shipment;
    const f = toForm(x);
    expect([f.weight_kg, f.cost, f.places]).toEqual(["3,5", "", "2"]);
  });
});

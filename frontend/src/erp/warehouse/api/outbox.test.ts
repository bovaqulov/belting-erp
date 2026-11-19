import { beforeEach, describe, expect, it } from "vitest";

import { ApiError } from "@/shared/api/client";

import { flush, outbox, outTitle, queueable, Queued, sendOrQueue } from "./outbox";

const net = () => Promise.reject(new TypeError("Failed to fetch"));

describe("internetsiz navbat", () => {
  beforeEach(() => {
    while (outbox.get().pending.length) outbox.get().pending.shift();
    outbox.dropFailed();
  });

  it("faqat skaner amallari navbatga olinadi", () => {
    expect(queueable("/app/api/erp/units/loc")).toBe(true);
    expect(queueable("/app/api/erp/docs/12/receive")).toBe(true);
    expect(queueable("/app/api/erp/picks/3/short")).toBe(true);
    expect(queueable("/app/api/erp/place")).toBe(false); // yangi QR/stiker darhol kerak
    expect(queueable("/app/api/erp/docs/12/post")).toBe(false);
    expect(outTitle("/app/api/erp/units/loc")).toBe("Joyga qo'yish / ko'chirish");
  });

  it("internet yo'q — navbatga (Queued); keyin o'sha kalit bilan tartibda yuboriladi", async () => {
    await expect(sendOrQueue("/app/api/erp/units/loc", { a: 1 }, net)).rejects.toBeInstanceOf(Queued);
    // navbat bo'sh emas — yangi amal ham navbatga (tartib buzilmasin), darhol yuborishga urinadi
    const sent: [string, unknown, string][] = [];
    const ok = (p: string, b: unknown, k: string) => {
      sent.push([p, b, k]);
      return Promise.resolve({});
    };
    await expect(sendOrQueue("/app/api/erp/picks/1/short", { b: 2 }, net)).rejects.toBeInstanceOf(Queued);
    const keys = outbox.get().pending.map((x) => x.key);
    expect(keys).toHaveLength(2);
    expect(await flush(ok)).toBe(2);
    expect(sent.map((x) => x[1])).toEqual([{ a: 1 }, { b: 2 }]);
    expect(sent.map((x) => x[2])).toEqual(keys);
    expect(outbox.get().pending).toHaveLength(0);
  });

  it("server rad etsa (4xx) — rad etilganlarga; 5xx / internet — navbatda qoladi", async () => {
    await expect(sendOrQueue("/app/api/erp/units/loc", {}, net)).rejects.toBeInstanceOf(Queued);
    await expect(sendOrQueue("/app/api/erp/units/loc", {}, net)).rejects.toBeInstanceOf(Queued);
    expect(await flush(() => Promise.reject(new ApiError("down", 502, null)))).toBe(0);
    expect(outbox.get().pending).toHaveLength(2);
    expect(await flush(() => Promise.reject(new ApiError("Joy to'la", 400, null)))).toBe(0);
    expect(outbox.get().pending).toHaveLength(0);
    expect(outbox.get().failed.map((x) => x.err)).toEqual(["Joy to'la", "Joy to'la"]);
    outbox.dropFailed(outbox.get().failed[0].key);
    expect(outbox.get().failed).toHaveLength(1);
  });

  it("navbatga olinmaydigan amal — xato o'zi qaytadi", async () => {
    await expect(sendOrQueue("/app/api/erp/place", {}, net)).rejects.toBeInstanceOf(TypeError);
    expect(outbox.get().pending).toHaveLength(0);
  });
});

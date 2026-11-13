import { describe, expect, it } from "vitest";

import { ApiError } from "@/shared/api/client";

import { applyEvent, chatError, defaultAgent, splitEvents, type ChatMsg } from "./chat.lib";

describe("splitEvents", () => {
  it("to'liq hodisalar ajraladi, chala qism qoladi", () => {
    const { events, rest } = splitEvents('data: {"type":"text","delta":"Sal"}\n\ndata: {"type":"tool","name":"crm"}\n\ndata: {"type":"te');
    expect(events).toEqual([
      { type: "text", delta: "Sal" },
      { type: "tool", name: "crm" },
    ]);
    expect(rest).toBe('data: {"type":"te');
  });
  it("CRLF, izoh qatorlari, JSON bo'lmagan data", () => {
    const { events } = splitEvents(': ping\r\n\r\ndata: salom\r\n\r\n');
    expect(events).toEqual([{ type: "text", delta: "salom" }]);
  });
});

describe("applyEvent", () => {
  const base: ChatMsg[] = [
    { id: "u", role: "user", agent: "it", text: "?", tools: [] },
    { id: "a", role: "agent", agent: "it", text: "", tools: [], pending: true },
  ];
  it("matn qo'shiladi, vosita bir marta, done — pending yo'q", () => {
    let m = applyEvent(base, "a", { type: "text", delta: "Ha" });
    m = applyEvent(m, "a", { type: "tool", name: "crm" });
    m = applyEvent(m, "a", { type: "tool", name: "crm" });
    m = applyEvent(m, "a", { type: "text", delta: "!" });
    m = applyEvent(m, "a", { type: "done", session_id: "s1" });
    expect(m[1]).toMatchObject({ text: "Ha!", tools: ["crm"], pending: false });
    expect(m[0]).toBe(base[0]);
  });
  it("xato", () => {
    expect(applyEvent(base, "a", { type: "error", detail: "limit" })[1]).toMatchObject({ error: "limit", pending: false });
  });
});

describe("defaultAgent", () => {
  const d = [{ key: "rahbariyat", sees_all: true }, { key: "it" }, { key: "ombor" }];
  it("o'z bo'limi → rahbariyat → birinchi", () => {
    expect(defaultAgent(d, ["yoq", "ombor"])).toBe("ombor");
    expect(defaultAgent(d, [])).toBe("rahbariyat");
    expect(defaultAgent([{ key: "x" }], undefined)).toBe("x");
    expect(defaultAgent([], ["it"])).toBeNull();
  });
});

describe("chatError", () => {
  it("API yo'q / to'xtatildi / boshqa", () => {
    expect(chatError(new ApiError("Not Found", 404, null))).toMatch(/2-bosqich/);
    expect(chatError(Object.assign(new Error("x"), { name: "AbortError" }))).toBe("To'xtatildi.");
    expect(chatError(new ApiError("Limit tugadi", 429, null))).toBe("Limit tugadi");
  });
});

import { describe, expect, it } from "vitest";

import { auditIcon, auditToolInfo, auditTs, voiceFetchError, voiceInfo } from "./audit.lib";

describe("auditToolInfo — backend/tests/onec/test_audit_cost.py::test_admin_panel_tool_label bilan bir xil", () => {
  it("python testidagi holatlar", () => {
    const rows = [
      {
        event: "tool",
        detail: JSON.stringify({ tool: "mcp__jarvis__remember", input: {}, result: "ok", action: "memory_add" }),
      },
      {
        event: "tool",
        detail: JSON.stringify({ tool: "mcp__jarvis__stock_check", input: {}, result: "empty", via: "ask_department" }),
      },
      { event: "tool", detail: '{"broken' },
      { event: "answer", detail: "{}" },
    ];
    expect(rows.map(auditToolInfo)).toEqual([
      { action: "memory_add", label: "memory_add" },
      { action: "", label: "stock_check · empty · via ask_department" },
      {},
      {},
    ]);
  });
  it("detail yo'q / null", () => {
    expect(auditToolInfo({ event: "tool", detail: null })).toEqual({});
    expect(auditToolInfo({ event: "tool", detail: "" })).toEqual({});
  });
});

describe("auditIcon", () => {
  it("amal ikonkasi, event ikonkasi, zaxira", () => {
    expect(auditIcon({ event: "tool", detail: JSON.stringify({ tool: "x", action: "kb_add" }) })).toEqual([
      "book-open",
      "#5288c1",
    ]);
    expect(auditIcon({ event: "tool", detail: JSON.stringify({ tool: "x" }) })).toEqual(["settings", "#8e8e93"]);
    expect(auditIcon({ event: "denied", detail: null })).toEqual(["x", "#ec3942"]);
    expect(auditIcon({ event: "nomalum", detail: null })).toEqual(["history", "#8e8e93"]);
  });
});

describe("voiceInfo / auditTs", () => {
  it("holatlar", () => {
    expect(
      voiceInfo({ detail: JSON.stringify({ status: "tanildi", duration: 7, text: "salom", forwarded_from: "Ali" }) }),
    ).toEqual({ cls: "ok", label: "tanildi", forwardedFrom: "Ali", duration: 7, text: "salom" });
    expect(voiceInfo({ detail: JSON.stringify({ status: "boshqa" }) })).toMatchObject({ cls: "", label: "boshqa" });
    expect(voiceInfo({ detail: "{buzuq" })).toEqual({ cls: "", label: "", forwardedFrom: "", duration: 0, text: "" });
    expect(voiceInfo({ detail: null }).duration).toBe(0);
  });
  it("vaqt va xato matni", () => {
    expect(auditTs("2026-11-08T14:05:33.123")).toBe("11-08 14:05");
    expect(voiceFetchError(404)).toBe("Fayl saqlanmagan (eski yozuv)");
    expect(voiceFetchError(500)).toBe("Yuklab bo'lmadi");
  });
});

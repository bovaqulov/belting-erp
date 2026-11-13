import { describe, expect, it } from "vitest";

import { ApiError } from "@/shared/api/client";

import {
  blankForm,
  createBody,
  deleteWarning,
  patchBody,
  saveError,
  slugKey,
  toggleTool,
  validate,
  type AgentForm,
} from "./agents.lib";

const ok: AgentForm = {
  ...blankForm(),
  key: "servis",
  name: "Servis",
  persona: "Sen servis bo'limi agentisan, mijoz shikoyatlarini qabul qilasan.",
};

describe("slugKey", () => {
  it("o'zbekcha nomdan lotin kalit", () => {
    expect(slugKey("Sotuv — Marketplace")).toBe("sotuv_marketplace");
    expect(slugKey("Ombor va logistika")).toBe("ombor_va_logistika");
    expect(slugKey("Bog'lanish")).toBe("boglanish");
    expect(slugKey("2-sex")).toBe("sex");
    expect(slugKey("Отдел")).toBe("");
  });
});

describe("validate", () => {
  it("to'g'ri forma — xato yo'q", () => {
    expect(validate(ok, ["rahbariyat"], true)).toEqual([]);
  });
  it("band kalit, noto'g'ri kalit, qisqa persona, vositasiz", () => {
    expect(validate(ok, ["servis"], true)[0]).toMatch(/band/);
    expect(validate({ ...ok, key: "Servis!" }, [], true)[0]).toMatch(/Kalit/);
    expect(validate({ ...ok, persona: "qisqa" }, [], true)).toHaveLength(1);
    expect(validate({ ...ok, tools: [] }, [], true)[0]).toMatch(/vosita/);
  });
  it("xodim agenti — xodim majburiy; kanal manzili", () => {
    expect(validate({ ...ok, kind: "staff" }, [], true)[0]).toMatch(/xodimni/);
    expect(validate({ ...ok, kind: "staff", owner_tg: 7 }, [], true)).toEqual([]);
    expect(validate({ ...ok, channels: [{ id: "c", type: "instagram_direct", ref: " ", mode: "auto" }] }, [], true)[0]).toMatch(/Kanal/);
  });
  it("tahrirda kalit tekshirilmaydi (o'zgarmaydi)", () => {
    expect(validate({ ...ok, key: "servis" }, ["servis"], false)).toEqual([]);
  });
});

describe("tana", () => {
  it("createBody: ruscha nom bo'sh bo'lsa — o'zbekchasi", () => {
    expect(createBody({ ...ok, name: " Servis ", name_ru: "" })).toMatchObject({ name: "Servis", name_ru: "Servis" });
  });
  it("patchBody: faqat o'zgargan maydonlar, key yo'q", () => {
    const next = { ...ok, color: "#ff3b30", tools: [...ok.tools, "crm"], key: "boshqa" };
    expect(patchBody(ok, next)).toEqual({ color: "#ff3b30", tools: [...ok.tools, "crm"] });
    expect(patchBody(ok, { ...ok })).toEqual({});
    expect(patchBody({ ...ok, parent: "rahbariyat" }, { ...ok, parent: null })).toEqual({ parent: null });
    expect(patchBody(ok, { ...ok, scopes: { crm: "inherit" } })).toEqual({});
    expect(patchBody(ok, { ...ok, scopes: { crm: "all" }, kind: "dept" })).toEqual({ scopes: { crm: "all" } });
  });
});

describe("toggleTool", () => {
  it("katalog tartibi, noma'lum vosita saqlanadi", () => {
    expect(toggleTool(["kb", "eski"], "web", true)).toEqual(["web", "kb", "eski"]);
    expect(toggleTool(["web", "kb"], "web", false)).toEqual(["kb"]);
  });
});

describe("matnlar", () => {
  it("o'chirish oqibati", () => {
    const t = deleteWarning("IT", 2, 1, 3);
    expect(t).toMatch(/3 ta sub-agent/);
    expect(t).toMatch(/2 xodim/);
    expect(t).toMatch(/1 ta Telegram/);
    expect(deleteWarning("IT", 0, 0)).not.toMatch(/xodim/);
  });
  it("backend API yo'q — tushunarli xato", () => {
    expect(saveError(new ApiError("Not Found", 404, null))).toMatch(/2-bosqich/);
    expect(saveError(new ApiError("Ruxsat yo'q", 403, null))).toBe("Ruxsat yo'q");
  });
});

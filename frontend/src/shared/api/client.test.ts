import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ApiError } from "./client";

describe("api", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("{detail} xato → ApiError (matn va obyekt)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "Siz bu bo'limda emassiz" }), { status: 403 })));
    await expect(api("/app/api/report")).rejects.toMatchObject({ status: 403, message: "Siz bu bo'limda emassiz" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: { message: "Chizma bloklandi", issues: [] } }), { status: 409 })));
    const e = (await api("/x").catch((x: unknown) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect(e.message).toBe("Chizma bloklandi");
  });
  it("POST: JSON tana, same-origin", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    await api("/app/api/report", { method: "POST", body: { dept: "it" } });
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.body).toBe('{"dept":"it"}');
  });
});

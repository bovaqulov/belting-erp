import { describe, expect, it } from "vitest";

import { wsUrl } from "./live";

describe("wsUrl", () => {
  it("https → wss, initData so'rov satrida", () => {
    expect(wsUrl({ protocol: "https:", host: "a.trycloudflare.com" }, "")).toBe("wss://a.trycloudflare.com/app/api/erp/crm/tg/ws/");
    expect(wsUrl({ protocol: "http:", host: "localhost:3000" }, "user=%7B%7D&hash=x")).toBe(
      "ws://localhost:3000/app/api/erp/crm/tg/ws/?init_data=user%3D%257B%257D%26hash%3Dx",
    );
  });
});

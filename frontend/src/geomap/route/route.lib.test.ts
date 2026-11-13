import { describe, expect, it } from "vitest";

import { csv, toStop } from "./route.lib";

describe("route.lib", () => {
  it("csv: sarlavha, tartib raqami, qo'shtirnoq ekranlanadi, 6 xona", () => {
    const out = csv([{ id: "1", name: 'OOO "Alfa"', lat: 41.3, lng: 69.25 }]);
    expect(out.split("\n")).toEqual(["Tartib,Nomi,Kenglik,Uzunlik", '1,"OOO ""Alfa""",41.300000,69.250000']);
  });
  it("toStop: koordinatasiz yozuv — null", () => {
    expect(toStop({ id: "a", name: "A", lat: null, lng: null } as never)).toBeNull();
    expect(toStop({ id: "b", name: "B", lat: 1, lng: 2 } as never)).toEqual({ id: "b", name: "B", lat: 1, lng: 2 });
  });
});

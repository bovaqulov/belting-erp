import { describe, expect, it } from "vitest";

import { ageCls, agoText, chsOf, goSec, leftText, parseView, picking, sold, splitVat, switchCh, viewQs, viewTitle } from ".";

describe("navigatsiya", () => {
  it("URL → ko'rinish: bo'sh/noto'g'ri — Umumiy; bo'lim kanalda yo'q — birinchisi", () => {
    expect(parseView("")).toEqual({ home: true });
    expect(parseView("?ch=amazon&sec=orders")).toEqual({ home: true });
    expect(parseView("?ch=ozon&sec=stock")).toEqual({ home: false, ch: "ozon", sec: "stock" });
    expect(parseView("?ch=site&sec=orders")).toEqual({ home: false, ch: "site", sec: "products" });
    expect(parseView("?ch=wb")).toEqual({ home: false, ch: "wb", sec: "orders" });
  });
  it("ko'rinish → URL → ko'rinish (aylana)", () => {
    for (const s of ["", "?ch=wb&sec=reviews", "?ch=uzum&sec=price"]) expect(viewQs(parseView(s))).toBe(s);
  });
  it("kanal almashganda bo'lim saqlanadi (bo'lsa)", () => {
    expect(switchCh({ home: false, ch: "wb", sec: "price" }, "site")).toEqual({ home: false, ch: "site", sec: "price" });
    expect(switchCh({ home: false, ch: "wb", sec: "reviews" }, "ozon")).toEqual({ home: false, ch: "ozon", sec: "orders" });
    expect(switchCh({ home: true }, "uzum")).toEqual({ home: false, ch: "uzum", sec: "orders" });
  });
  it("bo'lim → kanallar; bo'limga o'tishda kanal saqlanadi (bo'lsa)", () => {
    expect(chsOf("orders")).toEqual(["wb", "ozon", "uzum"]);
    expect(chsOf("reviews")).toEqual(["wb"]);
    expect(chsOf("price")).toEqual(["wb", "ozon", "uzum", "site"]);
    expect(goSec({ home: false, ch: "uzum", sec: "orders" }, "stock")).toEqual({ home: false, ch: "uzum", sec: "stock" });
    expect(goSec({ home: false, ch: "uzum", sec: "orders" }, "reviews")).toEqual({ home: false, ch: "wb", sec: "reviews" });
    expect(goSec({ home: false, ch: "site", sec: "price" }, "orders")).toEqual({ home: false, ch: "wb", sec: "orders" });
    expect(goSec({ home: true }, "products")).toEqual({ home: false, ch: "wb", sec: "products" });
  });
  it("sarlavha", () => {
    expect(viewTitle({ home: true })).toBe("Umumiy");
    expect(viewTitle({ home: false, ch: "wb", sec: "orders" })).toBe("Wildberries · Buyurtmalar");
  });
});

describe("buyurtma formatlari", () => {
  it("muddat va yosh", () => {
    expect(leftText(null)).toBe("");
    expect(leftText(-5)).toBe("muddat o'tdi");
    expect(leftText(45)).toBe("45 daq");
    expect(leftText(200)).toBe("3 soat 20 daq");
    expect(agoText(30)).toBe("30 daq. oldin");
    expect(agoText(125)).toBe("2 s. 5 daq. oldin");
    expect([ageCls(60), ageCls(13 * 60), ageCls(25 * 60), ageCls(null)]).toEqual(["ok", "warn", "bad", ""]);
  });
  it("narx", () => {
    expect(sold({ price_uzs: 412000 })).toBe("412 000 so'm");
    expect(sold({ price_uzs: null })).toBe("");
  });
});

describe("tanlanma ro'yxati", () => {
  it("bir xil artikul bitta qatorga, narx — dona narxi, nom bo'yicha saralangan", () => {
    const L = (vc: string, title: string, qty = 1) => ({ vendor_code: vc, title, qty, codes: [] });
    const rows = picking([
      { ext_id: "1", lines: [L("8M-1040-30", "Ремень 8M")], price_uzs: 400000 },
      { ext_id: "2", lines: [L("8M-1040-30", "Ремень 8M", 2)], price_uzs: 820000 },
      { ext_id: "3", lines: [L("5M-450-15", "Ремень 5M")], price_uzs: null },
    ]);
    expect(rows.map((r) => [r.vendor_code, r.qty, r.orders, r.sum])).toEqual([
      ["5M-450-15", 1, ["3"], 0],
      ["8M-1040-30", 3, ["1", "2"], 1220000],
    ]);
    expect(rows[1].prices).toEqual([400000, 410000]);
  });
});

describe("QQS", () => {
  it("12% QQS summa ichidan ajratiladi", () => {
    const r = splitVat(1_120_000);
    expect(Math.round(r.net)).toBe(1_000_000);
    expect(Math.round(r.vat)).toBe(120_000);
    expect(Math.round(splitVat(1_040_475).net)).toBe(928_996);
  });
});

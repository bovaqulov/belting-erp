import { describe, expect, it } from "vitest";

import {
  addMonth,
  autoName,
  beltMark,
  contractState,
  daysLeft,
  family,
  groupAttrs,
  groupName,
  groupOptions,
  leftLabel,
  monthLabel,
  nextNumber,
  parseView,
  rowDue,
  roundStep,
  priceFor,
  rowTotal,
  splitWidths,
  totals,
  viewQs,
  viewTitle,
  type Group,
  type PayRow,
} from ".";

describe("remen belgisi", () => {
  it("oila profildan", () => {
    expect([family("8M"), family("SPB"), family("B"), family("3VX"), family("PK"), family("XL")]).toEqual(["timing", "v", "v", "v", "rib", "timing"]);
  });
  it("tishli: metrik 1040-8M, dyuymli 210XL", () => {
    expect(beltMark("8m", 1040)).toBe("1040-8M");
    expect(beltMark("XL", "210")).toBe("210XL");
    expect(beltMark("T5", "630.0")).toBe("630-T5");
  });
  it("klinli Lp/Li, poliklinli qovurg'a bilan", () => {
    expect(beltMark("B", 1450, "lp")).toBe("B-1450 Lp");
    expect(beltMark("SPA", 1250)).toBe("SPA-1250");
    expect(beltMark("PK", 1795, "", 8)).toBe("8PK-1795");
  });
  it("profil yoki uzunlik yo'q — bo'sh", () => {
    expect(beltMark("", 1040)).toBe("");
    expect(beltMark("8M", "")).toBe("");
    expect(beltMark("8M", null)).toBe("");
  });
  it("avtomatik nom: brend katta harf, rukav — «Рукав» bilan", () => {
    expect(autoName({ profile: "8m", length: 1040, brand: "megadyne" })).toBe("1040-8M MEGADYNE");
    expect(autoName({ profile: "8M", length: 1040, brand: "cnfulo", dims: "w" })).toBe("Рукав 1040-8M CNFULO");
    expect(autoName({ profile: "B", length: 1450, lstd: "lp", brand: "pix" })).toBe("B-1450 Lp PIX");
    expect(autoName({ profile: "14M", length: 1400, brand: "MEGADYNE", series: "SILVER3" })).toBe("1400-14M MEGADYNE SILVER3");
    expect(autoName({ brand: "PIX" })).toBe("");
  });
  it("kengliklar", () => {
    expect(splitWidths("10, 15;20  25,")).toEqual(["10", "15", "20", "25"]);
  });
});

describe("kategoriyalar", () => {
  const G: Group[] = [
    { id: 1, parent_id: null, name: "Remenlar", name_ru: null, attrs: { kind: "product", belt: true }, sort: 0, items: 0 },
    { id: 2, parent_id: 1, name: "Tishli", name_ru: null, attrs: { kind: "goods" }, sort: 0, items: 0 },
    { id: 3, parent_id: null, name: "Xizmatlar", name_ru: null, attrs: { kind: "service" }, sort: 10, items: 0 },
  ];
  it("to'liq nom va meros (o'ziniki ustun)", () => {
    expect(groupName(G, 2)).toBe("Remenlar › Tishli");
    expect(groupName(G, 9)).toBe("—");
    expect(groupAttrs(G, "2")).toEqual({ kind: "goods", belt: true });
  });
  it("tanlov tartibi: ota, keyin ichkilari", () => {
    expect(groupOptions(G).map((o) => o.value)).toEqual([1, 2, 3]);
  });
});

describe("qismlar va bo'limlar (URL)", () => {
  it("hub — parametrsiz; noto'g'ri qism — hub; bo'lim yo'q — qismning birinchisi", () => {
    expect(parseView("")).toEqual({ hub: true });
    expect(parseView("?a=xx")).toEqual({ hub: true });
    expect(parseView("?a=payroll")).toEqual({ hub: false, area: "payroll", sec: "month" });
    expect(parseView("?a=products&sec=groups")).toEqual({ hub: false, area: "products", sec: "groups" });
    expect(parseView("?a=contracts&sec=staff")).toEqual({ hub: false, area: "contracts", sec: "contracts" });
  });
  it("aylana va sarlavha", () => {
    for (const s of ["", "?a=products&sec=items", "?a=payroll&sec=staff"]) expect(viewQs(parseView(s))).toBe(s);
    expect(viewTitle({ hub: true })).toBe("Accounting");
    expect(viewTitle({ hub: false, area: "contracts", sec: "contracts" })).toBe("Shartnomalar");
    expect(viewTitle({ hub: false, area: "payroll", sec: "staff" })).toBe("Maoshlar · Xodimlar");
  });
});

describe("shartnomalar", () => {
  const T = "2026-11-14";
  it("muddatgacha kun va yorliq", () => {
    expect(daysLeft("2026-11-14", T)).toBe(0);
    expect(daysLeft("2026-12-14", T)).toBe(30);
    expect(daysLeft("2026-11-01", T)).toBe(-13);
    expect(daysLeft(null, T)).toBeNull();
    expect([leftLabel(0), leftLabel(5), leftLabel(-2), leftLabel(null)]).toEqual(["bugun tugaydi", "5 kun qoldi", "2 kun o'tdi", "muddatsiz"]);
  });
  it("holat: yopilgan > imzosiz > o'tgan > tugayapti (≤30 kun) > amalda", () => {
    const c = (o: object) => contractState({ active: true, signed: true, valid_until: "2027-06-01", ...o }, T);
    expect(c({ active: false, signed: false })).toBe("closed");
    expect(c({ signed: false, valid_until: "2020-01-01" })).toBe("draft");
    expect(c({ valid_until: "2026-11-13" })).toBe("expired");
    expect(c({ valid_until: "2026-12-14" })).toBe("expiring");
    expect(c({ valid_until: "2026-12-15" })).toBe("active");
    expect(c({ valid_until: null })).toBe("active");
  });
  it("keyingi raqam firma va yil bo'yicha", () => {
    const ns = ["BR-2026/001", "BR-2026/009", "NB-2026/004", "BR-2025/020"];
    expect(nextNumber(ns, "BR", 2026)).toBe("BR-2026/010");
    expect(nextNumber(ns, "NB", 2026)).toBe("NB-2026/005");
    expect(nextNumber(ns, "BR", 2027)).toBe("BR-2027/001");
  });
});

describe("maoshlar", () => {
  it("oylar", () => {
    expect(monthLabel("2026-11")).toBe("Noyabr 2026");
    expect(addMonth("2026-01", -1)).toBe("2025-12");
    expect(addMonth("2026-12", 1)).toBe("2027-01");
    expect(addMonth("2026-05", -17)).toBe("2024-12");
  });
  it("qator va jami", () => {
    const r = (o: Partial<PayRow>): PayRow => ({ employee_id: 1, name: "", position: "", dept: "", base: 5_000_000, bonus: 0, penalty: 0, advance: 0, note: null, paid_at: null, ...o });
    const a = r({ bonus: 1_000_000, penalty: 200_000, advance: 2_000_000 });
    expect([rowTotal(a), rowDue(a)]).toEqual([5_800_000, 3_800_000]);
    const t = totals([a, r({ paid_at: "2026-11-05" })]);
    expect([t.total, t.due, t.paid, t.left, t.n, t.n_paid]).toEqual([10_800_000, 8_800_000, 5_000_000, 3_800_000, 2, 1]);
  });
});

describe("narx (dona / mm, qadam, qo'lda)", () => {
  it("qadamga yaxlitlash", () => {
    expect([roundStep(7, 5), roundStep(10, 5), roundStep(11, 5), roundStep(7, null), roundStep(30.5, 5)]).toEqual([10, 10, 15, 7, 35]);
  });
  it("mm bo'yicha: qadam 5 — 6–10 mm bir xil; qo'lda narx ustun", () => {
    const p = { mode: "mm" as const, price: 14_000, step_mm: 5, overrides: { "40": 520_000 } };
    expect(priceFor(p, 6)).toBe(priceFor(p, 10));
    expect(priceFor(p, 10)).toBe(140_000);
    expect(priceFor(p, 11)).toBe(210_000);
    expect(priceFor(p, 40)).toBe(520_000);
  });
  it("dona: hamma kenglik bir xil; belgilanmagan — null", () => {
    expect(priceFor({ mode: "piece", price: 185_000, step_mm: null, overrides: {} }, 20)).toBe(185_000);
    expect(priceFor({ mode: "piece", price: null, step_mm: null, overrides: {} }, 20)).toBeNull();
    expect(priceFor(null, 20)).toBeNull();
  });
});

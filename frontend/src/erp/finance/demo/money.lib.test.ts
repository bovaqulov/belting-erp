import { describe, expect, it } from "vitest";

import type { Contract, Counterparty, Employee, Month } from "@/erp/finance/lib";

import { seed, type Db } from "./seed.lib";
import { handle } from "./server.lib";

const NOW = Date.parse("2026-11-14T09:00:00Z");
const call = (db: Db, method: "GET" | "POST", path: string, body?: Record<string, unknown>) => handle(db, method, path, body, NOW);
const ok = <T,>(r: { status: number; body: unknown }) => {
  expect(r.status).toBe(200);
  return r.body as T;
};
const detail = (r: { body: unknown }) => (r.body as { detail: string }).detail;

describe("demo shartnomalar", () => {
  it("ro'yxat: faollar oldin, holat hisoblangan; 'e'tibor' filtri", () => {
    const db = seed(NOW);
    const all = ok<Contract[]>(call(db, "GET", "/app/api/erp/contracts"));
    expect(all.at(-1)!.state).toBe("closed");
    const att = ok<Contract[]>(call(db, "GET", "/app/api/erp/contracts?state=attention"));
    expect(new Set(att.map((c) => c.state))).toEqual(new Set(["draft", "expiring", "expired"]));
    expect(ok<Contract[]>(call(db, "GET", "/app/api/erp/contracts?q=305112847")).every((c) => c.inn === "305112847")).toBe(true);
  });

  it("yangi: raqam avtomatik, qoidalar", () => {
    const db = seed(NOW);
    const c = ok<Contract>(call(db, "POST", "/app/api/erp/contracts", { counterparty_id: 3, firm_id: 1, kind: "sale", date: "2026-11-14", valid_until: "2027-11-14", signed: true }));
    expect([c.number, c.state]).toEqual(["BR-2026/010", "active"]);
    expect(detail(call(db, "POST", "/app/api/erp/contracts", { firm_id: 1, kind: "sale" }))).toBe("Kontragentni tanlang");
    expect(detail(call(db, "POST", "/app/api/erp/contracts", { counterparty_id: 3, firm_id: 1, kind: "sale", number: "br-2026/010" }))).toMatch(/raqamli shartnoma bor/);
    expect(detail(call(db, "POST", "/app/api/erp/contracts", { counterparty_id: 3, firm_id: 1, kind: "sale", date: "2026-11-14", valid_until: "2026-01-01" }))).toMatch(/oldin bo'lmaydi/);
    expect(detail(call(db, "POST", "/app/api/erp/contracts", { counterparty_id: 3, firm_id: 1, kind: "sale", amount: "-5" }))).toMatch(/manfiy/);
  });

  it("yopish → tahrirlanmaydi → qayta ochish", () => {
    const db = seed(NOW);
    ok(call(db, "POST", "/app/api/erp/contracts/2/close"));
    expect(detail(call(db, "POST", "/app/api/erp/contracts", { id: 2, counterparty_id: 2, firm_id: 1, kind: "sale" }))).toMatch(/Yopilgan/);
    expect(ok<Contract>(call(db, "POST", "/app/api/erp/contracts/2/reopen")).state).toBe("active");
  });

  it("kontragent: qidiruv va qo'shish (takror, INN)", () => {
    const db = seed(NOW);
    expect(ok<Counterparty[]>(call(db, "GET", "/app/api/erp/counterparties?q=megadyne")).length).toBe(1);
    expect(detail(call(db, "POST", "/app/api/erp/counterparties", { name: "X MChJ", inn: "12" }))).toMatch(/INN/);
    expect(detail(call(db, "POST", "/app/api/erp/counterparties", { name: "y", inn: "305112847" }))).toMatch(/bor/);
    expect(ok<Counterparty>(call(db, "POST", "/app/api/erp/counterparties", { name: "Yangi Zavod MChJ", inn: "309000111", kind: "customer" })).id).toBeGreaterThan(0);
  });
});

describe("demo maoshlar", () => {
  it("o'tgan oylar to'langan, joriy — hisoblanmagan", () => {
    const db = seed(NOW);
    expect(ok<Month>(call(db, "GET", "/app/api/erp/payroll/2026-10")).state).toBe("paid");
    expect(ok<Month>(call(db, "GET", "/app/api/erp/payroll/2026-11")).state).toBe("none");
  });

  it("oqim: hisoblash → tahrir → tasdiq (qulf) → qisman/to'liq to'lov", () => {
    const db = seed(NOW);
    const P = "/app/api/erp/payroll/2026-11";
    expect(detail(call(db, "POST", `${P}/approve`))).toMatch(/Avval oyni hisoblang/);
    let m = ok<Month>(call(db, "POST", `${P}/calc`));
    expect([m.state, m.rows.length]).toEqual(["draft", 9]);
    m = ok<Month>(call(db, "POST", `${P}/rows/2`, { bonus: "1 000 000", advance: "2000000" }));
    expect(m.rows.find((r) => r.employee_id === 2)!.bonus).toBe(1_000_000);
    expect(detail(call(db, "POST", `${P}/rows/2`, { penalty: "99000000" }))).toMatch(/oshib ketdi/);
    // qayta hisoblash: tahrir saqlanadi, oklad yangilanadi
    ok(call(db, "POST", "/app/api/erp/payroll/staff", { ...db.staff[1], salary: 7_500_000 }));
    m = ok<Month>(call(db, "POST", `${P}/calc`));
    const r2 = m.rows.find((r) => r.employee_id === 2)!;
    expect([r2.base, r2.bonus]).toEqual([7_500_000, 1_000_000]);
    expect(ok<Month>(call(db, "POST", `${P}/approve`)).state).toBe("approved");
    expect(detail(call(db, "POST", `${P}/rows/3`, { bonus: 1 }))).toMatch(/tahrirlanmaydi/);
    expect(detail(call(db, "POST", `${P}/calc`))).toMatch(/qayta hisoblanmaydi/);
    m = ok<Month>(call(db, "POST", `${P}/pay`, { ids: [1] }));
    expect([m.state, m.rows.filter((r) => r.paid_at).length]).toEqual(["approved", 1]);
    expect(detail(call(db, "POST", `${P}/unapprove`))).toMatch(/To'lov qilingan/);
    expect(ok<Month>(call(db, "POST", `${P}/pay`)).state).toBe("paid");
  });

  it("yangi xodim: ishga kirgan oydan hisobga tushadi; ruxsatsiz — 403", () => {
    const db = seed(NOW);
    const e = ok<Employee>(call(db, "POST", "/app/api/erp/payroll/staff", { name: "Yangi Xodim", salary: "5000000", hired: "2026-12-01" }));
    expect(ok<Month>(call(db, "POST", "/app/api/erp/payroll/2026-11/calc")).rows.some((r) => r.employee_id === e.id)).toBe(false);
    expect(ok<Month>(call(db, "POST", "/app/api/erp/payroll/2026-12/calc")).rows.some((r) => r.employee_id === e.id)).toBe(true);
    expect(detail(call(db, "POST", "/app/api/erp/payroll/staff", { name: "X" }))).toMatch(/Oklad/);
    db.me.roles = [];
    expect(call(db, "GET", "/app/api/erp/payroll/staff").status).toBe(403);
  });
});

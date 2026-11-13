// Demo: shartnomalar (taklif etilgan API /app/api/erp/contracts/*, docs/api/accounting.md). Kontragent va firma —
// Jarvis erp.counterparty / erp.firm shakli. Holat har so'rovda bugungi sanadan hisoblanadi.
import { contractState, CKIND, CURRENCIES, daysLeft, nextNumber, type CKind, type Contract, type Counterparty, type CpKind, type Firm } from "@/erp/finance/lib";

import { Invalid } from "./errors.lib";

export type DbContract = Omit<Contract, "counterparty" | "inn" | "firm" | "state" | "days_left">;
export type ContractsDb = { seq: number; firms: Firm[]; counterparties: Counterparty[]; contracts: DbContract[] };

type B = Record<string, unknown>;
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v)).trim();
const numOrNull = (v: unknown): number | null => {
  const s = str(v).replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Invalid(`Raqam noto'g'ri: ${str(v)}`);
  return n;
};
const isoDay = (now: number, plusDays = 0) => new Date(now + plusDays * 864e5).toISOString().slice(0, 10);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

export function seedContracts(now: number): Omit<ContractsDb, "seq"> {
  const firms: Firm[] = [
    { id: 1, code: "BR", name: "Belting Rezina MChJ" },
    { id: 2, code: "NB", name: "Nur Belting MChJ" },
  ];
  const cps: [string, string, CpKind][] = [
    ["Navoiy Konveyer Servis MChJ", "305112847", "customer"],
    ["Samarqand Don Mahsulotlari AJ", "201554310", "customer"],
    ["Farg'ona Tekstil MChJ", "306998421", "customer"],
    ["Andijon Mexanika Zavodi AJ", "200741182", "customer"],
    ["Qarshi Shakar Kombinati AJ", "203887105", "customer"],
    ["Chirchiq Agregat Zavodi AJ", "200993874", "both"],
    ["Megadyne Rus OOO", "7714551230", "supplier"],
    ["Ningbo CNFULO Transmission Co.", null as unknown as string, "supplier"],
    ["PIX Transmissions Ltd", null as unknown as string, "supplier"],
    ["Toshkent Logistika MChJ", "307441209", "supplier"],
  ];
  const counterparties = cps.map(([name, inn, kind], i) => ({ id: i + 1, name, inn: inn || null, kind }));
  const y = new Date(now).getUTCFullYear();
  const C = (
    id: number,
    firm: number,
    cp: number,
    kind: CKind,
    n: number,
    ageDays: number,
    validDays: number | null,
    o: Partial<DbContract> = {},
  ): DbContract => ({
    id,
    number: `${firms[firm - 1].code}-${y}/${String(n).padStart(3, "0")}`,
    date: isoDay(now, -ageDays),
    kind,
    counterparty_id: cp,
    firm_id: firm,
    currency: "UZS",
    amount: null,
    pay_days: kind === "sale" ? 30 : 15,
    credit_limit: null,
    valid_until: validDays === null ? null : isoDay(now, validDays),
    signed: true,
    active: true,
    note: null,
    ...o,
  });
  const contracts: DbContract[] = [
    C(1, 1, 1, "sale", 1, 300, 65, { amount: 480_000_000, credit_limit: 60_000_000 }),
    C(2, 1, 2, "sale", 2, 250, 115, { amount: 220_000_000, credit_limit: 25_000_000 }),
    C(3, 1, 3, "sale", 3, 200, 18, { amount: 95_000_000 }),
    C(4, 1, 4, "sale", 4, 380, -15, { amount: 150_000_000, note: "Yangilash kerak — yangi narxlar bilan" }),
    C(5, 2, 5, "sale", 1, 90, 275, { amount: 310_000_000, credit_limit: 40_000_000, pay_days: 45 }),
    C(6, 1, 6, "sale", 5, 20, 345, { signed: false, amount: 70_000_000, note: "Didox'ga yuborildi, imzo kutilmoqda" }),
    C(7, 1, 7, "purchase", 6, 410, 320, { currency: "RUB", amount: 12_500_000, pay_days: 0, note: "100% oldindan to'lov" }),
    C(8, 1, 8, "purchase", 7, 160, 205, { currency: "USD", amount: 85_000, pay_days: 60 }),
    C(9, 2, 9, "purchase", 2, 60, 305, { currency: "USD", amount: 40_000, pay_days: 30 }),
    C(10, 1, 10, "service", 8, 120, 245, { amount: 36_000_000, pay_days: 10, note: "Shahar ichida yetkazish" }),
    C(11, 1, 1, "sale", 9, 720, -365, { active: false, amount: 260_000_000, note: "O'tgan yilgi shartnoma — yangisi bilan almashtirilgan" }),
  ];
  return { firms, counterparties, contracts };
}

function view(db: ContractsDb, c: DbContract, today: string): Contract {
  const cp = db.counterparties.find((x) => x.id === c.counterparty_id);
  return {
    ...c,
    counterparty: cp?.name ?? "—",
    inn: cp?.inn ?? null,
    firm: db.firms.find((f) => f.id === c.firm_id)?.code ?? "—",
    state: contractState(c, today),
    days_left: daysLeft(c.valid_until, today),
  };
}

function save(db: ContractsDb, d: B, now: number): DbContract {
  const id = Number(d.id) || 0;
  const cp = db.counterparties.find((x) => x.id === Number(d.counterparty_id));
  if (!cp) throw new Invalid("Kontragentni tanlang");
  const firm = db.firms.find((x) => x.id === Number(d.firm_id));
  if (!firm) throw new Invalid("Firmani tanlang");
  const kind = str(d.kind) as CKind;
  if (!(kind in CKIND)) throw new Invalid("Shartnoma turi noto'g'ri");
  const date = str(d.date) || isoDay(now);
  if (!isDate(date)) throw new Invalid("Sana noto'g'ri");
  const valid = str(d.valid_until) || null;
  if (valid && !isDate(valid)) throw new Invalid("Amal qilish muddati noto'g'ri");
  if (valid && valid < date) throw new Invalid("Amal qilish muddati shartnoma sanasidan oldin bo'lmaydi");
  const currency = str(d.currency) || "UZS";
  if (!CURRENCIES.includes(currency)) throw new Invalid("Valyuta noto'g'ri");
  const amount = numOrNull(d.amount);
  const limit = numOrNull(d.credit_limit);
  const payDays = numOrNull(d.pay_days);
  if ([amount, limit, payDays].some((x) => x !== null && x < 0)) throw new Invalid("Summa, limit va muddat manfiy bo'lmaydi");
  const number = str(d.number) || nextNumber(db.contracts.map((c) => c.number), firm.code, Number(date.slice(0, 4)));
  const dup = db.contracts.find((c) => c.number.toLowerCase() === number.toLowerCase() && c.id !== id);
  if (dup) throw new Invalid(`«${number}» raqamli shartnoma bor`);
  const vals = {
    number,
    date,
    kind,
    counterparty_id: cp.id,
    firm_id: firm.id,
    currency,
    amount,
    pay_days: payDays === null ? null : Math.round(payDays),
    credit_limit: limit,
    valid_until: valid,
    signed: !!d.signed,
    note: str(d.note) || null,
  };
  if (id) {
    const c = db.contracts.find((x) => x.id === id);
    if (!c) throw new Invalid("Shartnoma topilmadi");
    if (!c.active) throw new Invalid("Yopilgan shartnoma tahrirlanmaydi — avval qayta oching");
    Object.assign(c, vals);
    return c;
  }
  const c = { id: ++db.seq, ...vals, active: true };
  db.contracts.push(c);
  return c;
}

/** null — bu yo'l shartnomalarniki emas */
export function handleContracts(db: ContractsDb, get: boolean, p: string, q: URLSearchParams, b: B, now: number): unknown {
  const today = isoDay(now);
  if (p === "/app/api/erp/counterparties") {
    if (get) {
      const s = (q.get("q") ?? "").trim().toLowerCase();
      return db.counterparties.filter((c) => !s || c.name.toLowerCase().includes(s) || (c.inn ?? "").includes(s)).slice(0, 30);
    }
    const name = str(b.name);
    if (!name) throw new Invalid("Kontragent nomi kerak");
    const inn = str(b.inn).replace(/\D/g, "") || null;
    if (inn && !/^\d{9}$|^\d{10,14}$/.test(inn)) throw new Invalid("INN 9 raqam (O'zbekiston) yoki 10–14 raqam (xorij)");
    const dup = db.counterparties.find((c) => (inn && c.inn === inn) || c.name.toLowerCase() === name.toLowerCase());
    if (dup) throw new Invalid(`«${dup.name}» bor${dup.inn ? ` (INN ${dup.inn})` : ""}`);
    const kind = (str(b.kind) || "customer") as CpKind;
    const c = { id: ++db.seq, name, inn, kind };
    db.counterparties.push(c);
    return c;
  }
  if (p === "/app/api/erp/firms") return db.firms;
  if (!p.startsWith("/app/api/erp/contracts")) return null;
  const r = p.slice("/app/api/erp/contracts".length).split("/").filter(Boolean);
  if (get && !r.length) {
    const s = (q.get("q") ?? "").trim().toLowerCase();
    const kind = q.get("kind");
    const state = q.get("state");
    return db.contracts
      .map((c) => view(db, c, today))
      .filter((c) => !kind || c.kind === kind)
      .filter((c) => !state || (state === "attention" ? ["draft", "expiring", "expired"].includes(c.state) : c.state === state))
      .filter((c) => !s || [c.number, c.counterparty, c.inn ?? "", c.note ?? ""].some((x) => x.toLowerCase().includes(s)))
      .sort((a, b) => Number(b.active) - Number(a.active) || b.date.localeCompare(a.date) || b.id - a.id);
  }
  if (!get && !r.length) return view(db, save(db, b, now), today);
  const c = db.contracts.find((x) => x.id === Number(r[0]));
  if (!c) throw new Invalid("Shartnoma topilmadi");
  if (get && r.length === 1) return view(db, c, today);
  if (!get && r[1] === "close") {
    c.active = false;
    return view(db, c, today);
  }
  if (!get && r[1] === "reopen") {
    c.active = true;
    return view(db, c, today);
  }
  return null;
}

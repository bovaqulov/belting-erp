// Demo: maoshlar (taklif etilgan API /app/api/erp/payroll/*, docs/api/accounting.md). Faqat admin/owner ko'radi.
// Oy: qoralama (tahrir) → tasdiqlangan (qulf) → to'langan. Hisoblash faol xodimlardan; qoralamada tahrirlar saqlanadi.
import { addMonth, monthOf, rowDue, type Employee, type Month, type MState, type PayRow } from "@/erp/finance/lib";

import { Invalid } from "./errors.lib";

export type DbMonth = { rows: PayRow[]; approved_at: string | null };
export type PayrollDb = { seq: number; staff: Employee[]; payroll: Record<string, DbMonth> };
type B = Record<string, unknown>;

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v)).trim();
const money = (v: unknown, what: string): number => {
  const s = str(v).replace(/\s/g, "").replace(",", ".");
  const n = s ? Number(s) : 0;
  if (!Number.isFinite(n) || n < 0) throw new Invalid(`${what}: musbat son kiriting`);
  return Math.round(n);
};

export function seedPayroll(now: number): Omit<PayrollDb, "seq"> {
  const S: [string, string, string, number, number][] = [
    ["Rustam Aliyev", "Direktor", "Rahbariyat", 15_000_000, 1900],
    ["Akmal Karimov", "Sotuv menejeri", "Savdo", 7_000_000, 700],
    ["Dilshod Rahimov", "Sotuv menejeri", "Savdo", 7_000_000, 420],
    ["Nodira Yusupova", "Buxgalter", "Moliya", 8_500_000, 1100],
    ["Jasur Toshmatov", "Marketplace operatori", "Savdo", 6_000_000, 260],
    ["Bekzod Ergashev", "Omborchi", "Ombor", 5_200_000, 880],
    ["Sardor Qodirov", "Kesuvchi (sex)", "Sex", 6_500_000, 1300],
    ["Ulug'bek Nazarov", "Kesuvchi (sex)", "Sex", 6_000_000, 150],
    ["Madina Sobirova", "Haydovchi-ekspeditor", "Logistika", 4_800_000, 540],
  ];
  const staff: Employee[] = S.map(([name, position, dept, salary, days], i) => ({
    id: i + 1,
    name,
    position,
    dept,
    salary,
    hired: new Date(now - days * 864e5).toISOString().slice(0, 10),
    phone: `99890${String(1234567 + i * 1111111).slice(-7)}`,
    active: true,
  }));
  const cur = monthOf(new Date(now).toISOString());
  const payroll: Record<string, DbMonth> = {};
  for (const [k, back] of [[0, 2], [1, 1]] as const) {
    const m = addMonth(cur, -back);
    const at = `${addMonth(cur, -back + 1)}-05T10:00:00.000Z`;
    payroll[m] = {
      approved_at: `${addMonth(cur, -back + 1)}-03T10:00:00.000Z`,
      rows: staff.map((e, i) => ({
        employee_id: e.id,
        name: e.name,
        position: e.position,
        dept: e.dept,
        base: e.salary,
        bonus: i % 3 === k ? 1_000_000 : 0,
        penalty: i === 5 + k ? 200_000 : 0,
        advance: i % 2 === 0 ? 2_000_000 : 0,
        note: i % 3 === k ? "Reja bajarilgani uchun" : null,
        paid_at: at,
      })),
    };
  }
  return { staff, payroll };
}

function stateOf(m: DbMonth | undefined): MState {
  if (!m) return "none";
  if (!m.approved_at) return "draft";
  return m.rows.length && m.rows.every((r) => r.paid_at) ? "paid" : "approved";
}
const view = (db: PayrollDb, month: string): Month => {
  const m = db.payroll[month];
  return { month, state: stateOf(m), rows: m ? m.rows.map((r) => ({ ...r })) : [], approved_at: m?.approved_at ?? null };
};

function saveStaff(db: PayrollDb, d: B): Employee {
  const name = str(d.name);
  if (!name) throw new Invalid("Xodim ismi kerak");
  const salary = money(d.salary, "Oklad");
  if (!salary) throw new Invalid("Oklad kiriting");
  const hired = str(d.hired) || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hired)) throw new Invalid("Ishga kirgan sana noto'g'ri");
  const id = Number(d.id) || 0;
  const vals = { name, position: str(d.position) || "—", dept: str(d.dept) || "—", salary, hired, phone: str(d.phone) || null, active: d.active === undefined ? true : !!d.active };
  if (id) {
    const e = db.staff.find((x) => x.id === id);
    if (!e) throw new Invalid("Xodim topilmadi");
    Object.assign(e, vals);
    return e;
  }
  const e = { id: ++db.seq, ...vals };
  db.staff.push(e);
  return e;
}

export function handlePayroll(db: PayrollDb, admin: boolean, get: boolean, p: string, b: B, now: number): unknown {
  if (!p.startsWith("/app/api/erp/payroll")) return null;
  if (!admin) throw new Invalid("Ruxsat yo'q: maoshlarni faqat rahbariyat ko'radi");
  const r = p.slice("/app/api/erp/payroll".length).split("/").filter(Boolean);
  if (r[0] === "staff") {
    if (get) return [...db.staff].sort((a, b) => Number(b.active) - Number(a.active) || a.dept.localeCompare(b.dept) || a.name.localeCompare(b.name));
    return saveStaff(db, b);
  }
  const month = r[0] ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Invalid("Oy noto'g'ri (YYYY-MM)");
  const m = db.payroll[month];
  const st = stateOf(m);
  if (get && r.length === 1) return view(db, month);
  if (get) return null;
  const act = r[1];
  if (act === "calc") {
    if (st === "approved" || st === "paid") throw new Invalid("Tasdiqlangan oy qayta hisoblanmaydi — avval tasdiqni bekor qiling");
    const rows = m?.rows ?? [];
    const have = new Set(rows.map((x) => x.employee_id));
    for (const e of db.staff.filter((x) => x.active && monthOf(x.hired) <= month))
      if (!have.has(e.id)) rows.push({ employee_id: e.id, name: e.name, position: e.position, dept: e.dept, base: e.salary, bonus: 0, penalty: 0, advance: 0, note: null, paid_at: null });
    // qoralamada oklad xodim kartochkasidan yangilanadi (tahrir qilingan bonus/ushlanma/avans saqlanadi)
    for (const row of rows) {
      const e = db.staff.find((x) => x.id === row.employee_id);
      if (e) Object.assign(row, { name: e.name, position: e.position, dept: e.dept, base: e.salary });
    }
    if (!rows.length) throw new Invalid("Bu oyda faol xodim yo'q");
    db.payroll[month] = { rows, approved_at: null };
    return view(db, month);
  }
  if (!m) throw new Invalid("Avval oyni hisoblang");
  if (act === "rows") {
    if (st !== "draft") throw new Invalid("Tasdiqlangan oy tahrirlanmaydi");
    const row = m.rows.find((x) => x.employee_id === Number(r[2]));
    if (!row) throw new Invalid("Xodim bu oy hisobida yo'q");
    const next = { ...row, bonus: money(b.bonus, "Bonus"), penalty: money(b.penalty, "Ushlanma"), advance: money(b.advance, "Avans"), note: str(b.note) || null };
    if (rowDue(next) < 0) throw new Invalid("Ushlanma va avans hisoblangan summadan oshib ketdi");
    Object.assign(row, next);
    return view(db, month);
  }
  if (act === "approve") {
    if (st !== "draft") throw new Invalid("Oy allaqachon tasdiqlangan");
    m.approved_at = new Date(now).toISOString();
    return view(db, month);
  }
  if (act === "unapprove") {
    if (st === "draft") throw new Invalid("Oy tasdiqlanmagan");
    if (m.rows.some((x) => x.paid_at)) throw new Invalid("To'lov qilingan oy tasdig'i bekor qilinmaydi");
    m.approved_at = null;
    return view(db, month);
  }
  if (act === "pay") {
    if (st === "draft") throw new Invalid("Avval oyni tasdiqlang");
    const ids = Array.isArray(b.ids) ? (b.ids as unknown[]).map(Number) : m.rows.map((x) => x.employee_id);
    const at = new Date(now).toISOString();
    for (const row of m.rows) if (ids.includes(row.employee_id) && !row.paid_at) row.paid_at = at;
    return view(db, month);
  }
  return null;
}

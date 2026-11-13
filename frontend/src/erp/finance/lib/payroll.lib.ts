// Maoshlar: xodim (oklad) va oylik hisob. Qator: oklad + bonus − ushlanma = hisoblangan; hisoblangan − avans = to'lanadi.
// Oy holati: hisoblanmagan → qoralama (tahrirlanadi) → tasdiqlangan (qulf) → to'langan (hamma qator to'langan).
export type Employee = { id: number; name: string; position: string; dept: string; salary: number; hired: string; phone: string | null; active: boolean };
export type PayRow = { employee_id: number; name: string; position: string; dept: string; base: number; bonus: number; penalty: number; advance: number; note: string | null; paid_at: string | null };
export type MState = "none" | "draft" | "approved" | "paid";
export type Month = { month: string; state: MState; rows: PayRow[]; approved_at: string | null };

export const MSTATE: Record<MState, string> = { none: "Hisoblanmagan", draft: "Qoralama", approved: "Tasdiqlangan", paid: "To'langan" };
export const MSTATE_ST: Record<MState, string> = { none: "", draft: "new", approved: "work", paid: "done" };

const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];

/** "2026-11" → "Noyabr 2026" */
export const monthLabel = (m: string): string => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
/** "2026-01" + (-1) → "2025-12" */
export function addMonth(m: string, n: number): string {
  const i = Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}
export const monthOf = (iso: string): string => iso.slice(0, 7);

export const rowTotal = (r: Pick<PayRow, "base" | "bonus" | "penalty">): number => r.base + r.bonus - r.penalty;
export const rowDue = (r: Pick<PayRow, "base" | "bonus" | "penalty" | "advance">): number => rowTotal(r) - r.advance;

export type Totals = { base: number; bonus: number; penalty: number; advance: number; total: number; due: number; paid: number; left: number; n: number; n_paid: number };
export function totals(rows: PayRow[]): Totals {
  const t: Totals = { base: 0, bonus: 0, penalty: 0, advance: 0, total: 0, due: 0, paid: 0, left: 0, n: rows.length, n_paid: 0 };
  for (const r of rows) {
    t.base += r.base;
    t.bonus += r.bonus;
    t.penalty += r.penalty;
    t.advance += r.advance;
    t.total += rowTotal(r);
    t.due += rowDue(r);
    if (r.paid_at) {
      t.paid += rowDue(r);
      t.n_paid++;
    } else t.left += rowDue(r);
  }
  return t;
}

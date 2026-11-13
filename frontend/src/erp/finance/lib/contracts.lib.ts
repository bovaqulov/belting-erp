// Shartnomalar: turlar va sof mantiq. Maydonlar Jarvis erp.contract dan (kontragent, firma, raqam, sana, valyuta,
// to'lov muddati, kredit limiti, Didox imzosi) + tur, summa, amal qilish muddati, izoh.
export type CpKind = "customer" | "supplier" | "both";
export type Counterparty = { id: number; name: string; inn: string | null; kind: CpKind };
export type Firm = { id: number; code: string; name: string };
export type CKind = "sale" | "purchase" | "service";
export type CState = "draft" | "active" | "expiring" | "expired" | "closed";

export type Contract = {
  id: number;
  number: string;
  date: string;
  kind: CKind;
  counterparty_id: number;
  counterparty: string;
  inn: string | null;
  firm_id: number;
  firm: string;
  currency: string;
  amount: number | null;
  pay_days: number | null;
  credit_limit: number | null;
  valid_until: string | null;
  signed: boolean;
  active: boolean;
  note: string | null;
  // hisoblangan
  state: CState;
  days_left: number | null;
};

export const CKIND: Record<CKind, string> = { sale: "Sotuv", purchase: "Xarid", service: "Xizmat" };
export const CPKIND: Record<CpKind, string> = { customer: "Mijoz", supplier: "Yetkazib beruvchi", both: "Mijoz va yetkazib beruvchi" };
export const CSTATE: Record<CState, string> = { draft: "Imzolanmagan", active: "Amalda", expiring: "Muddati tugayapti", expired: "Muddati o'tgan", closed: "Yopilgan" };
/** Holat → .st belgisi (ma'no hamma sahifada bir xil) */
export const CSTATE_ST: Record<CState, string> = { draft: "new", active: "done", expiring: "work", expired: "bad", closed: "" };
export const CURRENCIES = ["UZS", "USD", "RUB", "EUR"];
/** Muddat tugashiga shuncha kun qolganda — "tugayapti" */
export const EXPIRING_DAYS = 30;

const DAY = 864e5;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY);

/** Muddatgacha kun (bugun tugasa — 0, o'tgan — manfiy); muddatsiz — null */
export function daysLeft(validUntil: string | null, today: string): number | null {
  return validUntil ? dayNum(validUntil) - dayNum(today) : null;
}

/** Holat: yopilgan → imzolanmagan → muddati o'tgan → tugayapti → amalda */
export function contractState(c: { active: boolean; signed: boolean; valid_until: string | null }, today: string): CState {
  if (!c.active) return "closed";
  if (!c.signed) return "draft";
  const d = daysLeft(c.valid_until, today);
  if (d !== null && d < 0) return "expired";
  if (d !== null && d <= EXPIRING_DAYS) return "expiring";
  return "active";
}

/** Keyingi raqam: "<firma>-<yil>/<tartib 3 xona>" — shu firma va yilning eng kattasidan keyin */
export function nextNumber(numbers: string[], firmCode: string, year: number): string {
  const pre = `${firmCode}-${year}/`;
  const max = numbers.filter((n) => n.startsWith(pre)).reduce((m, n) => Math.max(m, Number(n.slice(pre.length)) || 0), 0);
  return `${pre}${String(max + 1).padStart(3, "0")}`;
}

/** "45 kun qoldi" / "bugun tugaydi" / "12 kun o'tdi" */
export function leftLabel(d: number | null): string {
  if (d === null) return "muddatsiz";
  if (d === 0) return "bugun tugaydi";
  return d > 0 ? `${d} kun qoldi` : `${-d} kun o'tdi`;
}

// Pul (1C «Деньги»): turlar, nomlar, URL ko'rinishi va formatlash. Sof funksiyalar (test: lib.test.ts).
export type Kind = "in" | "out" | "transfer";
export type Status = "draft" | "posted" | "cancelled";
export type AccKind = "cash" | "bank" | "card";
export type Tab = "accounts" | "docs" | "flow" | "settings";

export const KIND: Record<Kind, { t: string; icon: string; color: string }> = {
  in: { t: "Kirim", icon: "arrow-left", color: "green" },
  out: { t: "Chiqim", icon: "arrow-up", color: "red" },
  transfer: { t: "O'tkazish", icon: "swap", color: "blue" },
};
export const STATUS: Record<Status, { t: string; st: string }> = {
  draft: { t: "Qoralama", st: "" },
  posted: { t: "O'tkazilgan", st: "done" },
  cancelled: { t: "Bekor", st: "bad" },
};
export const ACC_ICON: Record<AccKind, string> = { cash: "wallet", bank: "bank", card: "coins" };
export const TABS: [Tab, string, string][] = [
  ["accounts", "Bank va kassa", "bank"],
  ["docs", "Hujjatlar", "file-text"],
  ["flow", "Pul oqimi", "chart"],
  ["settings", "Sozlamalar", "settings"],
];

export type Account = {
  id: number;
  firm: string;
  kind: AccKind;
  kind_name: string;
  name: string;
  number: string | null;
  bank: string | null;
  mfo: string | null;
  currency: string;
  opening: string;
  opening_date: string | null;
  main: boolean;
  active: boolean;
  balance: string | null;
  from_1c: boolean;
};
export type FlowItem = { id: number; name: string; direction: "in" | "out"; code: string | null; active: boolean };
export type Row = {
  id: number;
  kind: Kind;
  kind_name: string;
  number: string;
  date: string;
  status: Status;
  firm: string;
  account_id: number;
  account: string;
  account_to_id: number | null;
  account_to: string | null;
  currency: string;
  amount: string;
  amount_to: string | null;
  op: string;
  op_name: string;
  item_id: number | null;
  item: string | null;
  party_kind: string | null;
  party_id: number | null;
  party: string | null;
  party_inn: string | null;
  purpose: string;
  comment: string;
  source: string | null;
  source_label: string | null;
  readonly: boolean;
};
export type Doc = Row & { can: { edit: boolean; post: boolean; unpost: boolean; cancel: boolean } };
export type Refs = {
  firms: { id: number; code: string; name: string }[];
  account_kinds: { key: AccKind; name: string }[];
  ops_in: { key: string; name: string }[];
  ops_out: { key: string; name: string }[];
  party_of: Record<string, string>;
};
export type Party = { id: number; name: string; inn: string | null; sub?: string | null };
export type Flow = {
  from: string;
  to: string;
  accounts: { id: number; name: string; firm: string; currency: string; start: string; in: string; out: string; end: string }[];
  items: { direction: "in" | "out"; item: string; amount: string }[];
};

export type View = { tab: Tab; doc: number | null; account: number | null };
export function parseView(search: string): View {
  const p = new URLSearchParams(search);
  const t = p.get("t") as Tab | null;
  const doc = Number(p.get("doc")) || null;
  return { tab: t && TABS.some(([k]) => k === t) ? t : doc ? "docs" : "accounts", doc, account: Number(p.get("acc")) || null };
}
export function viewQs(v: View): string {
  const p = new URLSearchParams();
  if (v.tab !== "accounts") p.set("t", v.tab);
  if (v.account) p.set("acc", String(v.account));
  if (v.doc) p.set("doc", String(v.doc));
  const s = p.toString();
  return s ? `?${s}` : "";
}

const n = (s: string | number | null | undefined): number => {
  const x = Number(String(s ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
};
/** 46099267523.65 → «46 099 267 523,65» */
export function sum(v: string | number | null | undefined): string {
  const x = n(v);
  const [i, f] = Math.abs(x).toFixed(2).split(".");
  return `${x < 0 ? "−" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}${f === "00" ? "" : `,${f}`}`;
}
/** Valyuta belgisi: UZS → so'm */
export const cur = (c: string): string => (c === "UZS" ? "so'm" : c);
export const when = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
/** Valyuta bo'yicha jami: {UZS: 123, USD: 4} */
export function totalsBy(accs: Pick<Account, "currency" | "balance">[]): [string, number][] {
  const m = new Map<string, number>();
  for (const a of accs) m.set(a.currency, (m.get(a.currency) ?? 0) + n(a.balance));
  return [...m.entries()].sort((a, b) => (a[0] === "UZS" ? -1 : b[0] === "UZS" ? 1 : a[0].localeCompare(b[0])));
}

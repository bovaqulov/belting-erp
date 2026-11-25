// Analitika: API turi (/app/api/analytics) va sof formatlash (test qilinadi).

export type Period = 7 | 30 | 90;
export const PERIODS: [Period, string][] = [
  [7, "7 kun"],
  [30, "30 kun"],
  [90, "90 kun"],
];

export interface Analytics {
  period: { days: Period; from: string; to: string };
  sales: {
    won_sum: number;
    won_n: number;
    avg: number;
    prev_won_sum: number;
    delta_pct: number | null;
    by_day: { date: string; sum: number }[];
    sellers: { tg_id: number | null; name: string; sum: number; n: number }[];
    leads_n: number;
    leads_converted: number;
    conv_pct: number | null;
    lead_sources: Record<string, number>;
    deals_new: number;
    deals_lost: number;
    open_n: number;
    open_sum: number;
    customers_new: number;
  };
  warehouse: {
    units: number;
    items: number;
    value: number | null;
    no_loc: number;
    low_n: number;
    low: { name: string; min_qty: number; unit: string; qty: number }[];
    accuracy: number | null;
    picks: number;
    slow_units: number;
    slow_days: number | null;
    scrap_pct: number | null;
  };
  marketplace: {
    orders_n: number;
    by_channel: Record<string, number>;
    by_stage: Record<string, number>;
    active_n: number;
    overdue_n: number;
    channel_names: Record<string, string>;
  };
}

/** 37 780 833 → "37,8 mln"; 950 000 → "950 ming"; 1,2 mlrd */
export function money(n: number): string {
  const a = Math.abs(n);
  const f = (x: number) => (Math.round(x * 10) / 10).toString().replace(".", ",");
  if (a >= 1e9) return `${f(n / 1e9)} mlrd`;
  if (a >= 1e6) return `${f(n / 1e6)} mln`;
  if (a >= 1e3) return `${Math.round(n / 1e3)} ming`;
  return String(Math.round(n));
}

/** 1234567 → "1 234 567" */
export const num = (n: number): string => Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ");

/** O'zgarish: "+12,5%" / "−4%" / null (oldingi davr bo'sh) */
export function delta(p: number | null): { text: string; up: boolean } | null {
  if (p === null) return null;
  const t = Math.abs(p).toString().replace(".", ",");
  return { text: `${p >= 0 ? "+" : "−"}${t}%`, up: p >= 0 };
}

export const SOURCE_LABEL: Record<string, string> = {
  telegram: "Telegram",
  bot: "Telegram bot",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  call: "Qo'ng'iroq",
  site: "Sayt",
  olx: "OLX",
  recommendation: "Tavsiya",
  manual: "Qo'lda",
};

export const STAGE_LABEL: Record<string, string> = {
  new: "Yangi",
  assembly: "Yig'ishda",
  transit: "Yo'lda",
  done: "Yetkazildi",
  cancelled: "Bekor",
};

/** Kunlik savdoni ustunlar soniga siqish (90 kun → haftalik): [{label, sum}] */
export function bucket(days: { date: string; sum: number }[], max = 31): { label: string; sum: number }[] {
  const step = Math.max(1, Math.ceil(days.length / max));
  const out: { label: string; sum: number }[] = [];
  for (let i = 0; i < days.length; i += step) {
    const part = days.slice(i, i + step);
    const d = part[0].date;
    out.push({ label: `${d.slice(8, 10)}.${d.slice(5, 7)}`, sum: part.reduce((a, x) => a + x.sum, 0) });
  }
  return out;
}

// CRM — sof mantiq (erp_crm.html dan): turlar, lug'atlar, filtr → so'rov, kanban/ro'yxat hisoblari, tarix, CSV.
// React'ga bog'liq emas — crm.lib.test.ts bilan tekshiriladi.
import { C } from "@/erp/kit/colors";

// ------------------------------------------------------------------ API turlari (Jarvis kontrakti bilan bir xil)
export type Me = { tg_id: number; name?: string; is_head?: boolean };
export type StageKind = "open" | "won" | "lost";
export type Stage = {
  code: string;
  name: string;
  pipeline: string;
  kind: StageKind;
  color?: string | null;
  probability?: number | null;
  guide?: string | null;
  /** bosqich muddati (soat) — o'tsa mas'ulga eslatma */
  sla_hours?: number | null;
};
export type Meta = {
  pipelines: { code: string; name: string }[];
  stages: Stage[];
  users: { tg_id: number; name: string }[];
  lost_reasons: string[];
  /** bo'linmalar (Novobelt, Belting Rezina) */
  divisions?: { code: string; name: string }[];
};
export type Num = number | string | null | undefined;
export type Deal = {
  id: number;
  title: string;
  customer?: string | null;
  owner_tg?: number | null;
  amount?: Num;
  next_task?: string | null;
  stage: string;
  stage_since?: string | null;
  created?: string | null;
  touched?: string | null;
  updated?: string | null;
  closed?: string | null;
  close_date?: string | null;
  rotten?: boolean;
  rot_days?: number | null;
  tags?: string[];
  prob?: number | null;
  source?: string | null;
  lost_reason?: string | null;
  pipeline?: string;
  /** kontakt shaxs (mijoz — kompaniya) */
  contact?: string | null;
  /** narxlash (tovarlar bo'lsa summa shundan): chegirma %, ustama %, logistika so'm */
  discount?: Num;
  markup?: Num;
  logistics?: Num;
  /** yetkazish manzili (standart — mijoz manzili) */
  location?: string | null;
  division?: string | null;
  /** 1C: mijoz buyurtmasi, ishlab chiqarish buyurtmasi, ishlab chiqarish */
  buyer_order?: string | null;
  prod_order?: string | null;
  prod_no?: string | null;
  repeat?: boolean;
  /** tunnel: manba bitim */
  parent_id?: number | null;
  /** bosqich muddati (SLA) o'tganmi */
  sla_late?: boolean;
  sla_hours?: number | null;
  /** to'lov sharti: full — 100% oldindan, half — 50/50 */
  pay_terms?: "full" | "half";
  paid_sum?: Num;
  /** shartnoma imzosi: sent — yuborildi, signed — imzolandi */
  sign_status?: "sent" | "signed" | null;
  sign_sent_at?: string | null;
  /** yuk xati va dalolatnoma imzolandi (Yutildi sharti) */
  docs_done?: boolean;
};
export type BoardStage = Stage & { count: number; amount: Num; weighted?: Num; rotten?: number; deals: Deal[] };
export type BoardResp = { counts: Record<string, number>; stages: BoardStage[] };
export type DealsResp = { rows: Deal[]; total: number; amount: Num; counts: Record<string, number> };
export type Doc = { id: number; number?: string | null; kind: string; date?: string | null; status?: string; state?: string | null; total: Num };
/** Hujjat (to'liq): yaratilgan paytdagi qatorlar va narxlash nusxasi */
export type DocFull = Doc & {
  deal_id: number;
  deal_title: string;
  lines: (DealItem & { amount: Num })[];
  meta: { customer?: string; inn?: string; location?: string; sub?: Num; discount?: Num; markup?: Num; logistics?: Num; restored?: boolean };
  customer_id?: number | null;
  /** Didox: ulanganmi (kalitlar), qoralama ID'si, holat (0 qoralama, 1 mijoz imzosi kutilmoqda, 3 imzolangan …) */
  didox?: {
    enabled: boolean;
    id: string | null;
    status: number | null;
    status_text: string | null;
    at: string | null;
    url: string;
    subtypes: { code: number; name: string }[];
  };
};
export type DealItem = {
  item_id?: number | null;
  char_id?: number | null;
  name: string;
  unit?: string | null;
  qty: Num;
  price: Num;
  discount?: Num;
};
export type Activity = {
  id?: number;
  kind: string;
  ts: string;
  actor?: number | null;
  text?: string | null;
  data?: { from?: string; to?: string; src?: string; reason?: string; auto?: boolean; result?: string } | null;
  due?: string | null;
  done_at?: string | null;
  assignee?: number | null;
};
export type StageHist = { ts: string; actor?: number | null; from_stage?: string | null; to_stage?: string | null; src?: string | null };
export type DealDetail = Deal & {
  counterparty_id?: number | null;
  probability?: Num;
  need?: string | null;
  docs: Doc[];
  items?: DealItem[];
  activity: Activity[];
  stages?: StageHist[];
  /** tunnel zanjiri: manba (parent) va undan ochilgan (child) bitimlar */
  linked?: { id: number; title: string; stage: string; pipeline: string; rel: "parent" | "child" }[];
};
export type View = { id: number | string; name: string; owner_tg: number | null; query: Partial<Query> };
export type Lead = {
  id: number;
  created: string;
  title?: string | null;
  name?: string | null;
  company?: string | null;
  note?: string | null;
  phone?: string | null;
  source?: string | null;
  owner_tg?: number | null;
  status: string;
  deal_id?: number | null;
  first_touch?: string | null;
  junk_reason?: string | null;
  /** kvalifikatsiya: tasma turi, o'lcham, hajm, STIR */
  product?: string | null;
  size?: string | null;
  qty?: string | null;
  inn?: string | null;
  region?: string | null;
  /** javob bermadi: urinishlar va keyingi qo'ng'iroq (1, 3, 7 kun) */
  no_answer?: number;
  next_call_at?: string | null;
  /** Telegram'dan ochilgan lid — sotuvchining chati */
  /** bog'langan chat (Telegram / WhatsApp / Instagram) */
  tg?: { chat_id: number; username: string | null; unread: number; channel?: "tg" | "wa" | "ig" } | null;
};
export type GoalRow = { tg_id: number; name: string; plan: Num; sales: Num; pct: number | null; won_deals: number; won_amount: Num };
export type Goals = { days: number; passed: number; can_edit: boolean; rows: GoalRow[] };
export type ItemHit = { item_id: number; char_id?: number | null; name: string; char?: string | null; price?: Num; free?: Num; unit?: string | null };
export type CustKind = "company" | "employee" | "trader" | "ip" | "person" | "state";
export type Customer = {
  id: number;
  name: string;
  /** turi (eski javoblarda yo'q — firma) */
  kind?: CustKind;
  inn?: string | null;
  phones?: string[];
  owner_tg?: number | null;
  address?: string | null;
  /** firma xodimi: lavozimi, firma nomi va STIRi */
  position?: string | null;
  company?: string | null;
  company_inn?: string | null;
};

/** Mijoz turlari (backend models.CustomerKind) va har birining shakli: nom yorlig'i, STIR maydoni, manzil yorlig'i,
 *  firma ma'lumotlari (xodim), majburiy telefon (savdogar). */
export const CUST_KINDS: {
  k: CustKind;
  name: string;
  short: string;
  nameLabel: string;
  /** STIR / JSHSHIR maydoni: yorliq va namuna (null — yo'q) */
  inn: { label: string; ph: string } | null;
  address: string;
  employee?: boolean;
  phoneRequired?: boolean;
  /** tanlov plitkasi: ikonka va qisqa izoh */
  icon: string;
  hint: string;
}[] = [
  { k: "company", name: "Yuridik shaxs (firma)", short: "Firma", nameLabel: "Firma nomi", inn: { label: "STIR", ph: "9 raqam" }, address: "Manzil", icon: "building", hint: "MChJ, AJ, QK" },
  { k: "employee", name: "Firma xodimi", short: "Firma xodimi", nameLabel: "Ismi", inn: null, address: "Manzil (yetkazish)", employee: true, icon: "users", hint: "lavozim + firma" },
  { k: "trader", name: "Savdogar", short: "Savdogar", nameLabel: "Ismi", inn: null, address: "Savdo joyi (bozor, do'kon)", phoneRequired: true, icon: "store", hint: "bozor, do'kon" },
  { k: "ip", name: "YaTT (yakka tadbirkor)", short: "YaTT", nameLabel: "Ismi / nomi", inn: { label: "STIR / JSHSHIR", ph: "9 yoki 14 raqam" }, address: "Manzil", icon: "briefcase", hint: "yakka tadbirkor" },
  { k: "person", name: "Jismoniy shaxs", short: "Jismoniy shaxs", nameLabel: "F.I.Sh.", inn: { label: "JSHSHIR", ph: "14 raqam" }, address: "Manzil", icon: "user", hint: "shaxsiy xarid" },
  { k: "state", name: "Davlat tashkiloti", short: "Davlat tashkiloti", nameLabel: "Tashkilot nomi", inn: { label: "STIR", ph: "9 raqam" }, address: "Manzil", icon: "bank", hint: "byudjet tashkiloti" },
];
/** Firma xodimi / kontakt shaxs lavozimlari (tanlov; ro'yxatda yo'q — «Boshqa» bilan qo'lda) */
export const POSITIONS = [
  "Rahbar",
  "Ta'minotchi",
  "Mexanik",
  "Bosh mexanik",
  "Buxgalter",
  "Bosh muhandis",
  "Energetik",
  "Omborchi",
  "Xarid bo'limi",
  "Ishlab chiqarish boshlig'i",
  "Texnolog",
];

export const custKind = (k: CustKind | null | undefined) => CUST_KINDS.find((x) => x.k === k) ?? CUST_KINDS[0];
/** yangi mijozda STIR majburiy turlar (backend deals.INN_REQUIRED bilan bir xil) */
export const innRequired = (k: CustKind) => k === "company" || k === "ip" || k === "state";

/** Ro'yxatdagi ikkinchi qator: turi, xodim — lavozim va firma; aks holda STIR / telefon */
export function custSub(c: Customer): string {
  const k = custKind(c.kind);
  const who = k.employee ? [c.position, c.company].filter(Boolean).join(", ") : "";
  return [k.short + (who ? `: ${who}` : ""), !k.employee && c.inn && `${k.inn?.label ?? "STIR"} ${c.inn}`, (c.phones || [])[0] && "+" + c.phones![0]]
    .filter(Boolean)
    .join(" · ");
}
/** GET customers/table — qator */
export type CustomerRow = Customer & {
  bought_n: number;
  bought_sum: string;
  last_buy: string | null;
  /** odatiy xarid oralig'i (kun) */
  cycle: number | null;
  next_buy: string | null;
  /** keyingi xarid vaqti o'tgan va ochiq bitim yo'q */
  overdue: boolean;
  open_n: number;
};
export type CustomersResp = { rows: CustomerRow[]; total: number; overdue: number };
/** GET reports — hisobot */
export type ReportSeller = {
  tg_id: number;
  name: string;
  leads: number;
  /** lidga birinchi javob (daqiqa, mediana) */
  response_min: number | null;
  lead_conv: number | null;
  deals: number;
  won: number;
  won_sum: string;
  lost: number;
  open_sum: string;
  overdue_tasks: number;
};
export type Report = {
  from: string;
  to: string;
  head: boolean;
  kpi: {
    leads: number;
    unassigned: number;
    response_min: number | null;
    lead_conv: number | null;
    deals: number;
    won: number;
    won_sum: string;
    lost: number;
    win_rate: number | null;
    open_sum: string;
  };
  funnel: { stage: string; count: number }[];
  sellers: ReportSeller[];
  reasons: { reason: string; count: number; sum: string }[];
  sources: { source: string; leads: number; converted: number }[];
};
export type Contact = { name: string; role: string; phone: string };
/** GET customers/{id} — kartochka */
/** Telefon qo'ng'irog'i (IP-telefoniya yoki qo'lda yozilgan) */
export type Call = {
  id: number;
  phone: string;
  direction: "in" | "out";
  status: "answered" | "missed" | "busy";
  started: string;
  duration: number;
  recording_url: string | null;
  owner_tg: number | null;
  note: string | null;
  source: string;
  deal_id: number | null;
};
export type CustomerCard = Customer & {
  contacts: Contact[];
  note: string;
  created: string | null;
  stats: { bought_n: number; bought_sum: string; last_buy: string | null; cycle: number | null; next_buy: string | null };
  deals: { id: number; title: string; stage: string; pipeline: string; kind: StageKind; amount: string; created: string; owner_tg: number | null; repeat: boolean }[];
  tg: { id: number; title: string; username: string | null; unread: number; channel?: "tg" | "wa" | "ig" }[];
};

// ------------------------------------------------------------------ lug'atlar
export const SRC: Record<string, string> = {
  "": "—",
  call: "Qo'ng'iroq",
  instagram: "Instagram",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  olx: "OLX",
  site: "Sayt",
  email: "Email",
  bot: "Bot",
  manual: "Qo'lda",
  recommendation: "Tavsiya",
  existing: "Doimiy mijoz",
  ads: "Reklama",
  expo: "Ko'rgazma",
};
export const KIND: Record<string, string> = {
  quote: "Tijorat taklifi",
  order: "Buyurtma",
  sale: "Jo'natish",
  return: "Qaytarish",
  cash_in: "Kassa",
  bank_in: "Bank",
};
export const DST: Record<string, string> = {
  confirmed: "to'lov kutilmoqda",
  active: "ishga tushgan",
  partly_shipped: "qisman jo'natilgan",
  shipped: "jo'natilgan",
  closed: "yopilgan",
  reserve_expired: "rezerv tugagan",
  ready: "tayyor",
};
export const ACTI: Record<string, [string, string]> = {
  stage: ["layers", "#5e5ce6"],
  comment: ["message", "#3e88f7"],
  call: ["phone", "#4ac158"],
  task: ["clock", "#f09a37"],
  meeting: ["users", "#a65ff0"],
  doc: ["file", "#8e8e93"],
  message: ["send", "#3ab5c9"],
  email: ["send", "#3ab5c9"],
  telegram: ["send", "#2aabee"],
  payment: ["coins", "#4ac158"],
  system: ["refresh", "#8e8e93"],
};
export const LSRC: Record<string, string> = {
  bot: "Telegram bot",
  call: "Qo'ng'iroq",
  site: "Sayt",
  instagram: "Instagram",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  manual: "Qo'lda",
  marketplace: "Marketplace",
  recommendation: "Tavsiya",
  olx: "OLX",
};
export const JUNK_REASONS = ["Shaxsiy chat (mijoz emas)", "Spam / adashib yozgan", "Bizning mahsulot emas", "Javob bermadi", "Takror", "Boshqa"];
/** Lidlar kanbani: ochiq bosqichlar (yopish — «Bitim ochish» yoki «Yaroqsiz») */
export const LEAD_STAGES: [string, string, string][] = [
  ["new", "Yangi", "javob kutmoqda"],
  ["work", "Ishda", "bog'lanildi"],
  ["interested", "Qiziqish bildirdi", "bitim ochishga tayyor"],
];

export type Sec = "deals" | "leads" | "customers" | "goals" | "reports";
export const SECS: [Sec, string][] = [
  ["deals", "Bitimlar"],
  ["leads", "Lidlar"],
  ["customers", "Mijozlar"],
  ["goals", "Reja"],
  ["reports", "Hisobot"],
];

// ------------------------------------------------------------------ filtr va ko'rinishlar (Smart View)
export type DealKind = "open" | "won" | "lost" | "all";
export type Query = {
  q: string;
  owner: string;
  source: string;
  overdue: boolean;
  rotten: boolean;
  notask: boolean;
  idle: string | number;
  closing: string;
  amount_min: string | number;
  tag: string;
  kind: DealKind;
  stage: string;
  sort: string;
  pipe?: string;
  view?: "board" | "list";
};
export const DEF: Query = {
  q: "",
  owner: "",
  source: "",
  overdue: false,
  rotten: false,
  notask: false,
  idle: "",
  closing: "",
  amount_min: "",
  tag: "",
  kind: "open",
  stage: "",
  sort: "updated",
};
export const SYSV: View[] = [
  { id: "s-all", name: "Hammasi", owner_tg: null, query: {} },
  { id: "s-mine", name: "Mening bitimlarim", owner_tg: null, query: { owner: "me" } },
  { id: "s-rot", name: "Harakatsiz", owner_tg: null, query: { rotten: true } },
  { id: "s-ntk", name: "Vazifasiz", owner_tg: null, query: { notask: true } },
  { id: "s-week", name: "Bu hafta yopiladi", owner_tg: null, query: { closing: "week", view: "list", sort: "amount" } },
  { id: "s-late", name: "Yopilish muddati o'tgan", owner_tg: null, query: { closing: "overdue", view: "list" } },
  { id: "s-big", name: "Katta (50 mln+)", owner_tg: null, query: { amount_min: 50000000 } },
  { id: "s-old", name: "300+ kun tegilmagan", owner_tg: null, query: { idle: 300, view: "list", sort: "idle" } },
];
export const isSys = (v: View): boolean => String(v.id).startsWith("s-");
export const isTeam = (v: View): boolean => v.owner_tg === null && !isSys(v);

/** So'rov satri: bo'sh, null, false qiymatlar tashlanadi (erp_crm.html qs) */
export function qs(o: Record<string, unknown>): string {
  return Object.entries(o)
    .filter(([, v]) => v !== "" && v !== null && v !== undefined && v !== false)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
}

/** Server filtri (kanban va ro'yxat uchun umumiy): "me" → joriy foydalanuvchi */
export function flt(f: Query, meTg: number): Record<string, unknown> {
  return {
    q: f.q,
    owner: f.owner === "me" ? meTg : f.owner,
    source: f.source,
    overdue: f.overdue,
    rotten: f.rotten,
    notask: f.notask,
    idle: f.idle,
    closing: f.closing,
    amount_min: f.amount_min,
    tag: f.tag,
  };
}

/** Ko'rinishni qo'llash: DEF ustiga ko'rinish so'rovi; voronka — kanbanda doim bitta (bo'sh bo'lsa "main") */
export function applyQuery(cur: { view: "board" | "list"; pipe: string }, q: Partial<Query>): { f: Query; view: "board" | "list"; pipe: string } {
  const f: Query = { ...DEF, ...q };
  const view = q.view ?? cur.view;
  let pipe = cur.pipe;
  if (q.pipe !== undefined) pipe = q.pipe || (view === "board" ? "main" : "");
  if (view === "board" && !pipe) pipe = "main";
  delete f.view;
  delete f.pipe;
  return { f, view, pipe };
}

/** Saqlanadigan joriy holat (ko'rinish yaratish) */
export const snapshot = (f: Query, view: string, pipe: string): Record<string, unknown> => ({
  pipe,
  view,
  ...Object.fromEntries(Object.keys(DEF).map((k) => [k, f[k as keyof Query]])),
});

// ------------------------------------------------------------------ kichik yordamchilar
export const initials = (s: string | null | undefined): string =>
  String(s || "?")
    .replace(/["«»']/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();

const HUES = Object.values(C);
/** Ism → doimiy rang (avatar) */
export const hue = (s: string | null | undefined): string => HUES[[...String(s || "")].reduce((a, c) => a + c.charCodeAt(0), 0) % 8];

/** Necha kun o'tdi (butun) */
/** Bitim nomi unikal raqam bilan: «#42 SPB 1650 remen» (backend: crm/models.deal_title). Eski «#N» prefiksi almashtiriladi. */
export const dealTitle = (id: number, title: string): string =>
  `#${id} ${title.trim().replace(/^#\d+\s*/, "") || "Yangi bitim"}`.slice(0, 255);

export const days = (s: string | null | undefined, now = Date.now()): number | null =>
  s ? Math.floor((now - new Date(s).getTime()) / 864e5) : null;

export const isLate = (s: string | null | undefined, now = Date.now()): boolean => !!s && new Date(s).getTime() < now;

/** Harakatsiz (uzoq tegilmagan) bitim darajasi: "" | "rot" (sariq) | "rot2" (qizil — chirish muddatining 3 baravari) */
export function rotLevel(d: Deal, now = Date.now()): "" | "rot" | "rot2" {
  if (!d.rotten) return "";
  const idle = days(d.touched || d.updated, now);
  return d.rot_days && idle !== null && idle >= d.rot_days * 3 ? "rot2" : "rot";
}

/** Kanban ustunlari bo'yicha jami: ochiq bitimlar soni, summa, vaznli prognoz */
export function boardTotals(stages: BoardStage[]): { open: BoardStage[]; closed: BoardStage[]; count: number; amount: number; weighted: number } {
  const open = stages.filter((s) => s.kind === "open");
  const closed = stages.filter((s) => s.kind !== "open");
  return {
    open,
    closed,
    count: open.reduce((a, s) => a + s.count, 0),
    amount: open.reduce((a, s) => a + Number(s.amount || 0), 0),
    weighted: open.reduce((a, s) => a + Number(s.weighted || 0), 0),
  };
}

/** Tovar qatori summasi: miqdor × narx × (1 − chegirma%) */
export const itemAmount = (r: DealItem): number => Number(r.qty || 0) * Number(r.price || 0) * (1 - Number(r.discount || 0) / 100);

/** Tizim beradigan bitim nomi (backend deals.auto_title bilan bir xil): birinchi tovar va miqdori, ko'p bo'lsa «+N»;
 *  tovarsiz — mijoz nomi. Raqam (#ID) — saqlanganda. */
export function autoTitle(items: { name: string; qty?: Num; unit?: string | null }[], customer?: string | null): string {
  const rows = items.filter((x) => x.name.trim());
  if (!rows.length) return (customer || "Yangi bitim").slice(0, 255);
  const x = rows[0];
  const q = Number(String(x.qty ?? "").replace(/\s/g, "").replace(",", "."));
  const qty = q ? ` — ${q} ${x.unit || "dona"}` : "";
  return `${x.name.trim()}${qty}${rows.length > 1 ? ` +${rows.length - 1}` : ""}`.slice(0, 255);
}

/** Bitim narxlash (backend deals.priced bilan bir xil): tovarlar → chegirma → ustama → + logistika; har qadam alohida */
export function priced(sub: number, p: { discount?: Num; markup?: Num; logistics?: Num }) {
  const disc = (sub * Number(p.discount || 0)) / 100;
  const mark = ((sub - disc) * Number(p.markup || 0)) / 100;
  const log = Number(p.logistics || 0);
  return { sub, disc, mark, log, total: Math.round(sub - disc + mark + log) };
}

/** Ertaga 10:00 — datetime-local qiymati */
export function tomorrow10(now = new Date()): string {
  const t = new Date(now.getTime() + 864e5);
  t.setHours(10, 0, 0, 0);
  return new Date(t.getTime() - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
}

/** Tarix: faolliklar + bosqichlar tarixi (tunnel orqali o'tganlari ham), yangisi tepada */
export function timeline(d: Pick<DealDetail, "activity" | "stages">): Activity[] {
  const st: Activity[] = (d.stages || []).map((h) => ({
    kind: "stage",
    ts: h.ts,
    actor: h.actor,
    text: "",
    data: { from: h.from_stage ?? undefined, to: h.to_stage ?? undefined, src: h.src ?? undefined },
  }));
  return [...d.activity.filter((a) => a.kind !== "stage"), ...st].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

/** Lid javob kutish vaqti (mas'ul yo'q bo'lsa): daqiqa; null — taqsimlangan */
export const leadWait = (l: Lead, now = Date.now()): number | null => (l.owner_tg ? null : Math.round((now - new Date(l.created).getTime()) / 6e4));
export const waitText = (m: number): string => (m < 60 ? `${m} daq` : `${Math.round(m / 60)} soat`);

/** Oylik reja: jami va sur'at rangi */
export function goalTotals(rows: GoalRow[]): { plan: number; sales: number; won: number } {
  return rows.reduce(
    (a, r) => ({ plan: a.plan + Number(r.plan || 0), sales: a.sales + Number(r.sales || 0), won: a.won + (r.won_deals || 0) }),
    { plan: 0, sales: 0, won: 0 },
  );
}
/** Bajarilish rangi: sur'atdan oldinda — "", 70% gacha — "mid", undan past — "low" */
export const paceCls = (pct: number, pace: number): "" | "mid" | "low" => (pct >= pace * 100 ? "" : pct >= pace * 70 ? "mid" : "low");

/** CSV (Excel ochadi; ; ajratgich, BOM bilan) */
export function toCsv(rows: unknown[][]): string {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}

/** localStorage (try/catch — maxfiy oyna, bloklangan) */
export function ls<T>(k: string): T | null;
export function ls<T>(k: string, v: T): void;
export function ls<T>(k: string, v?: T): T | null | void {
  try {
    if (v === undefined) return JSON.parse(localStorage.getItem("crm." + k) ?? "null") as T | null;
    localStorage.setItem("crm." + k, JSON.stringify(v));
  } catch {
    return null;
  }
}

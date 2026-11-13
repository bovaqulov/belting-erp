// Demo boshlang'ich ma'lumotlari: doimiy urug' (bir xil har safar), vaqt `now` dan. Remen tovarlari — haqiqiy nomlash
// (1C dan kirillda), kanal identifikatorlari — har kanal o'z formatida (WB raqam, Ozon posting, Uzum raqam).
import type { ChannelSum, Issue, Line, OrderCh, Picked, Source, Stage } from "@/erp/marketplace/lib";

export const DB_VERSION = 1;

export type DbOrder = {
  channel: OrderCh;
  ext_id: string;
  stage: Stage;
  ext_status: string | null;
  ordered: string;
  deadline: string | null;
  supply_id: string | null;
  lines: Line[];
  picked: Picked[];
  assembled_at: string | null;
  number: string | null;
  article: string | null;
  price_uzs: number | null;
};
export type DbSupply = { id: string; name: string; createdAt: string; closedAt: string | null; done: boolean };
export type DbBox = { id: string; supply_id: string; orders: string[] };
export type DbIssue = Issue & { muted: boolean };

export type Db = {
  v: number;
  seq: number;
  me: { tg_id: number; name: string; roles: string[] };
  channels: Record<OrderCh, ChannelSum>;
  sources: Source[];
  reviews: { n: number; bad: number };
  push_errors: number;
  orders: DbOrder[];
  supplies: DbSupply[];
  boxes: DbBox[];
  issues: DbIssue[];
};

type Prod = { title: string; vc: string; w: number | null; mode?: string; price: number; code: string };
export const PRODUCTS: Prod[] = [
  { title: "Ремень зубчатый 8M-1040-30", vc: "8M-1040-30", w: 30, price: 412000, code: "2041738190012" },
  { title: "Ремень зубчатый 5M-450-15", vc: "5M-450-15", w: 15, price: 89000, code: "2041738190029" },
  { title: "Ремень поликлиновой 8PK-1795", vc: "8PK-1795", w: null, price: 134000, code: "2041738190036" },
  { title: "Ремень клиновой SPB-1650", vc: "SPB-1650", w: null, price: 185000, code: "2041738190043" },
  { title: "Ремень клиновой SPA-1250", vc: "SPA-1250", w: null, price: 98000, code: "2041738190050" },
  { title: "Ремень зубчатый XL-210-10", vc: "XL-210-10", w: 10, price: 46000, code: "2041738190067" },
  { title: "Ремень зубчатый HTD 14M-1400-40", vc: "14M-1400-40", w: 40, mode: "sleeve", price: 960000, code: "2041738190074" },
  { title: "Ремень вариаторный 22x8-1000", vc: "22X8-1000", w: 22, price: 121000, code: "2041738190081" },
  { title: "Ремень зубчатый T5-630-16", vc: "T5-630-16", w: 16, price: 72000, code: "2041738190098" },
];

/** Doimiy urug'li PRNG (mulberry32) */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bosqich → kanal holati (sinxron natijasi qanday ko'rinsa) */
export const EXT_STATUS: Record<OrderCh, Record<Stage, string>> = {
  wb: { new: "waiting", assembly: "waiting", transit: "sorted", done: "sold", cancelled: "canceled" },
  ozon: { new: "awaiting_packaging", assembly: "awaiting_deliver", transit: "delivering", done: "delivered", cancelled: "cancelled" },
  uzum: { new: "CREATED", assembly: "PACKING", transit: "DELIVERING", done: "COMPLETED", cancelled: "CANCELED" },
};

export function makeLine(p: Prod, qty: number): Line {
  return { key: p.vc, title: p.title, vendor_code: p.vc, width_mm: p.w, mode: p.mode ?? "unit", qty, codes: [p.code] };
}

export function seed(now: number = Date.now()): Db {
  const r = rng(20261113);
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const at = (min: number) => new Date(now + min * 6e4).toISOString();
  let doc = 30;

  const orders: DbOrder[] = [];
  const add = (channel: OrderCh, stage: Stage, ext_id: string, o: { ageMin: number; leftMin?: number | null; qty?: number; supply?: string | null; assembled?: boolean }) => {
    const p = pick(PRODUCTS);
    const qty = o.qty ?? (channel === "wb" ? 1 : r() < 0.25 ? 2 : 1);
    const line = makeLine(p, qty);
    const lines = channel === "ozon" && r() < 0.3 ? [line, makeLine(pick(PRODUCTS.filter((x) => x !== p)), 1)] : [line];
    const price = lines.reduce((a, l) => a + PRODUCTS.find((x) => x.vc === l.vendor_code)!.price * l.qty, 0);
    const picked: Picked[] = o.assembled ? lines.flatMap((l, i) => Array.from({ length: l.qty }, () => ({ line: i, code: l.codes![0], ts: at(-o.ageMin / 2) }))) : [];
    orders.push({
      channel,
      ext_id,
      stage,
      ext_status: EXT_STATUS[channel][stage],
      ordered: at(-o.ageMin),
      deadline: o.leftMin === undefined || o.leftMin === null ? null : at(o.leftMin),
      supply_id: o.supply ?? null,
      lines,
      picked,
      assembled_at: o.assembled ? at(-Math.floor(o.ageMin / 2)) : null,
      number: isActiveStage(stage) ? `MP-26-${String(++doc).padStart(5, "0")}` : null,
      article: p.vc,
      price_uzs: Math.round(price * (0.92 + r() * 0.1)),
    });
  };

  // WB: yangilari (postavkasiz), bitta ochiq postavka (yig'ilmoqda), topshirilgan postavka (yo'lda), yakunlangan
  const SUP_OPEN = "WB-GI-31872045";
  const SUP_SENT = "WB-GI-31790118";
  let wb = 3518822040;
  for (const m of [25, 70, 190, 540, 820, 1600]) add("wb", "new", String(++wb), { ageMin: m });
  add("wb", "assembly", String(++wb), { ageMin: 300, supply: SUP_OPEN, assembled: true });
  add("wb", "assembly", String(++wb), { ageMin: 360, supply: SUP_OPEN });
  add("wb", "assembly", String(++wb), { ageMin: 410, supply: SUP_OPEN });
  for (let i = 0; i < 4; i++) add("wb", "transit", String(++wb), { ageMin: 1500 + i * 30, supply: SUP_SENT, assembled: true });
  for (let i = 0; i < 5; i++) add("wb", "done", String(++wb), { ageMin: 4000 + i * 900, assembled: true });
  add("wb", "cancelled", String(++wb), { ageMin: 2900 });

  // Ozon: posting raqami, muddat — jo'natish sanasi
  let oz = 41250;
  const ozId = () => `0${String(++oz)}873-0${int(100, 999)}-1`;
  for (const [age, left] of [[40, 150], [120, 400], [260, 1100], [30, -20]] as const) add("ozon", "new", ozId(), { ageMin: age, leftMin: left });
  add("ozon", "assembly", ozId(), { ageMin: 500, leftMin: 600, assembled: true });
  for (let i = 0; i < 3; i++) add("ozon", "transit", ozId(), { ageMin: 2000 + i * 200, assembled: true });
  for (let i = 0; i < 3; i++) add("ozon", "done", ozId(), { ageMin: 6000 + i * 700, assembled: true });

  // Uzum: CREATED — tasdiqlash muddati (acceptUntil), PACKING — topshirish muddati
  let uz = 41827730;
  for (const [age, left] of [[15, 95], [50, 60], [140, 170]] as const) add("uzum", "new", String(++uz), { ageMin: age, leftMin: left });
  add("uzum", "assembly", String(++uz), { ageMin: 400, leftMin: 1300 });
  add("uzum", "assembly", String(++uz), { ageMin: 620, leftMin: 160, assembled: true });
  for (let i = 0; i < 2; i++) add("uzum", "transit", String(++uz), { ageMin: 2600 + i * 400, assembled: true });
  for (let i = 0; i < 4; i++) add("uzum", "done", String(++uz), { ageMin: 5000 + i * 800, assembled: true });
  add("uzum", "cancelled", String(++uz), { ageMin: 3100 });

  const ch = (name: string, n: number, linked: number, off: number, ch_total: number, push_stock: boolean): ChannelSum => ({ name, n, linked, off, ch_total, push_stock, push_price: false });

  const audit: [OrderCh, string, Issue["severity"], string, number][] = [
    ["wb", "photo_none", "crit", "Rasm yo'q", 3],
    ["wb", "imt_mixed", "crit", "Guruhda turli remenlar birlashgan", 2],
    ["wb", "title_size", "warn", "Nomdagi kenglik mos emas", 4],
    ["ozon", "photo_mixed", "warn", "Rasmlar aralash (infografika + boshqa rasmlar)", 2],
    ["uzum", "price_min", "crit", "Narx minimaldan past", 1],
  ];
  const issues: DbIssue[] = [];
  let iid = 0;
  for (const [c, code, severity, text, n] of audit)
    for (let i = 0; i < n; i++) {
      const p = PRODUCTS[(iid * 4 + i) % PRODUCTS.length];
      issues.push({
        id: ++iid,
        code,
        severity,
        text,
        channel: c,
        ext_id: c === "ozon" ? p.vc : String(184220000 + iid * 37),
        vendor_code: p.vc,
        title: p.title,
        photos: code === "photo_none" ? 0 : int(2, 9),
        detail: code === "title_size" ? { nomda: `${(p.w ?? 20) + 5} mm`, kartochkada: `${p.w ?? 20} mm` } : code === "price_min" ? { narx: p.price * 0.8, minimal: p.price } : null,
        muted: false,
      });
    }

  return {
    v: DB_VERSION,
    seq: 0,
    me: { tg_id: 1001, name: "Rustam Aliyev", roles: ["admin", "marketplace"] },
    channels: {
      wb: ch("Wildberries", 412, 377, 9, 2841, true),
      ozon: ch("Ozon", 198, 171, 4, 1320, true),
      uzum: ch("Uzum", 156, 156, 0, 1104, false),
    },
    sources: [
      { id: 1, code: "main", name: "Asosiy ombor", source: "onec", sklad: ["Склад 1"] },
      { id: 2, code: "shop", name: "Sex", source: "erp", sklad: [] },
    ],
    reviews: { n: 7, bad: 2 },
    push_errors: 1,
    orders,
    supplies: [
      { id: SUP_OPEN, name: `Yetkazma ${new Date(now).toLocaleDateString("ru")}`, createdAt: at(-420), closedAt: null, done: false },
      { id: SUP_SENT, name: "Yetkazma (kecha)", createdAt: at(-1700), closedAt: at(-1300), done: true },
    ],
    boxes: [{ id: "WB-TRBX-9811204", supply_id: SUP_SENT, orders: [] }],
    issues,
  };
}

function isActiveStage(s: Stage) {
  return s === "new" || s === "assembly";
}

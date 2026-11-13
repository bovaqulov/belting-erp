// Demo ma'lumotlari: Belting savdosi (remenlar, konveyer lentalari, rukavlar) — 3 voronka, ~36 bitim, zavod mijozlar,
// 5 sotuvchi, lidlar, vazifalar, hujjatlar, oylik reja. Hammasi uydirma. Sanalar `now` ga nisbatan (doim "yangi").
// Tasodif — doimiy urug'li PRNG: bir xil `now` → bir xil ma'lumot (testlar uchun).
import type { DealItem, ItemHit, Lead, Meta, Stage, View } from "@/erp/crm/lib";

export const DB_VERSION = 2;

export type DbStage = Stage & { rot_days?: number | null };
export type DbDeal = {
  id: number;
  title: string;
  counterparty_id: number | null;
  owner_tg: number | null;
  amount: number;
  stage: string;
  stage_since: string;
  created: string;
  updated: string;
  closed: string | null;
  close_date: string | null;
  tags: string[];
  source: string | null;
  lost_reason: string | null;
  probability: number | null;
  need: string | null;
  bx_id: string | null;
  items: DealItem[];
};
export type DbCustomer = { id: number; name: string; inn: string | null; phones: string[]; owner_tg: number | null };
export type DbHist = { deal_id: number; ts: string; actor: number | null; from_stage: string | null; to_stage: string; src: string; reason?: string | null };
export type DbAct = {
  id: number;
  deal_id: number;
  kind: string;
  ts: string;
  actor: number | null;
  text: string;
  data: Record<string, unknown> | null;
  due: string | null;
  done_at: string | null;
  assignee: number | null;
};
export type DbDoc = { id: number; deal_id: number; number: string; kind: string; date: string; status: string; state: string | null; total: number };
export type DbLead = Lead & { junk_reason?: string | null };
export type DbGoal = { owner_tg: number; month: string; amount: number };
export type DbShip = { owner_tg: number; month: string; amount: number };
export type Db = {
  v: number;
  seq: number;
  me: { tg_id: number; name: string; is_head: boolean };
  pipelines: Meta["pipelines"];
  stages: DbStage[];
  users: Meta["users"];
  lost_reasons: string[];
  customers: DbCustomer[];
  catalog: (ItemHit & { price: number; free: number })[];
  deals: DbDeal[];
  history: DbHist[];
  activity: DbAct[];
  docs: DbDoc[];
  leads: DbLead[];
  goals: DbGoal[];
  shipments: DbShip[];
  views: View[];
};

const ME = 1001;
const SELLERS = [
  { tg_id: ME, name: "Rustam Aliyev" },
  { tg_id: 1002, name: "Akmal Karimov" },
  { tg_id: 1003, name: "Dilshod Rahimov" },
  { tg_id: 1004, name: "Nodira Yusupova" },
  { tg_id: 1005, name: "Jasur Toshmatov" },
];

const STAGES: DbStage[] = [
  { code: "new", name: "Yangi so'rov", pipeline: "main", kind: "open", color: "#3e88f7", probability: 10, rot_days: 3, guide: "24 soat ichida qo'ng'iroq qiling: qaysi remen, o'lcham, miqdor, muddat." },
  { code: "qual", name: "Ehtiyoj aniqlandi", pipeline: "main", kind: "open", color: "#3ab5c9", probability: 25, rot_days: 7, guide: "Tovarlarni qo'shing va tijorat taklifini yuboring." },
  { code: "offer", name: "Taklif yuborildi", pipeline: "main", kind: "open", color: "#a65ff0", probability: 45, rot_days: 10, guide: "Taklif bo'yicha javobni oling, e'tirozlarni yozib qo'ying." },
  { code: "agree", name: "Kelishuv", pipeline: "main", kind: "open", color: "#e8538f", probability: 70, rot_days: 14, guide: "Narx va muddat kelishilgach — buyurtma tuzing." },
  { code: "pay", name: "To'lov kutilmoqda", pipeline: "main", kind: "open", color: "#f09a37", probability: 90, rot_days: 7, guide: "To'lovni kuzating; tushgach jo'natishga o'tkazing." },
  { code: "won", name: "Yutildi", pipeline: "main", kind: "won", color: "#4ac158", probability: 100 },
  { code: "lost", name: "Yutqazildi", pipeline: "main", kind: "lost", color: "#eb4d3d", probability: 0 },
  { code: "dl_new", name: "Muzokara", pipeline: "dealer", kind: "open", color: "#5e5ce6", probability: 30, rot_days: 14 },
  { code: "dl_contract", name: "Shartnoma", pipeline: "dealer", kind: "open", color: "#e6b422", probability: 75, rot_days: 21 },
  { code: "dl_won", name: "Diler bo'ldi", pipeline: "dealer", kind: "won", color: "#4ac158", probability: 100 },
  { code: "dl_lost", name: "Rad etdi", pipeline: "dealer", kind: "lost", color: "#eb4d3d", probability: 0 },
];

const CUSTOMERS: [string, string][] = [
  ["Navoiy Konveyer Servis MChJ", "305112847"],
  ["Samarqand Don Mahsulotlari AJ", "201554310"],
  ["Farg'ona Tekstil MChJ", "306998421"],
  ["Andijon Mexanika Zavodi AJ", "200741182"],
  ["Buxoro Paxta Tozalash MChJ", "302245619"],
  ["Qarshi Shakar Kombinati AJ", "203887105"],
  ["Jizzax Qurilish Materiallari MChJ", "307114562"],
  ["Namangan Yog' Ekstrakt MChJ", "304667290"],
  ["Termiz Tegirmon MChJ", "308452013"],
  ["Chirchiq Agregat Zavodi AJ", "200993874"],
  ["Urganch Shisha Idish MChJ", "309321765"],
  ["Guliston Plastmass MChJ", "305780134"],
  ["Nukus Karton MChJ", "306214498"],
  ["Angren Ko'mir Transport MChJ", "302906357"],
];

const CATALOG: Db["catalog"] = [
  { item_id: 1, name: "Ремень клиновой SPB 1650", unit: "dona", price: 185000, free: 64 },
  { item_id: 2, name: "Ремень клиновой SPA 1250", unit: "dona", price: 98000, free: 120 },
  { item_id: 3, name: "Ремень клиновой B-1800", unit: "dona", price: 76000, free: 0 },
  { item_id: 4, name: "Ремень зубчатый 1040-8M-30", unit: "dona", price: 412000, free: 18 },
  { item_id: 5, name: "Ремень зубчатый 5M-450-15", unit: "dona", price: 89000, free: 42 },
  { item_id: 6, name: "Ремень поликлиновой 8PK 1795", unit: "dona", price: 134000, free: 30 },
  { item_id: 7, name: "Лента конвейерная EP-400/3", char: "800 мм", char_id: 71, unit: "m", price: 520000, free: 260 },
  { item_id: 7, name: "Лента конвейерная EP-400/3", char: "1000 мм", char_id: 72, unit: "m", price: 655000, free: 140 },
  { item_id: 8, name: "Лента конвейерная резинотканевая 2-650", unit: "m", price: 310000, free: 95 },
  { item_id: 9, name: "Рукав напорный 50 мм", unit: "m", price: 64000, free: 400 },
  { item_id: 10, name: "Рукав всасывающий 75 мм", unit: "m", price: 118000, free: 0 },
  { item_id: 11, name: "Ремень зубчатый 1800-14M-40", unit: "dona", price: 960000, free: 6 },
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

const p5 = (n: number) => String(n).padStart(5, "0");

export function seed(now: number = Date.now()): Db {
  const r = rng(20261113);
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const ago = (d: number) => new Date(now - d * 864e5).toISOString();
  const dateOnly = (d: number) => ago(d).slice(0, 10);
  let seq = 100;
  const id = () => ++seq;

  const customers: DbCustomer[] = CUSTOMERS.map(([name, inn], i) => ({
    id: i + 1,
    name,
    inn,
    phones: [`9989${String(int(0, 9))}${String(1000000 + int(0, 8999999)).slice(-7)}`],
    owner_tg: SELLERS[i % SELLERS.length].tg_id,
  }));

  const db: Db = {
    v: DB_VERSION,
    seq: 0,
    me: { tg_id: ME, name: "Rustam Aliyev", is_head: true },
    pipelines: [
      { code: "main", name: "Asosiy savdo" },
      { code: "dealer", name: "Dilerlar" },
    ],
    stages: STAGES.map((s) => ({ ...s })),
    users: SELLERS.map((u) => ({ ...u })),
    lost_reasons: ["Qimmat", "Raqobatchidan oldi", "Muddat to'g'ri kelmadi", "Tovar yo'q edi", "Javob bermay qo'ydi", "Loyiha to'xtadi"],
    customers,
    catalog: CATALOG.map((c) => ({ ...c })),
    deals: [],
    history: [],
    activity: [],
    docs: [],
    leads: [],
    goals: [],
    shipments: [],
    views: [{ id: 1, name: "Katta zavod bitimlari", owner_tg: null, query: { tag: "zavod", amount_min: 20000000 } }],
  };

  const act = (deal_id: number, kind: string, ts: string, actor: number | null, text: string, extra: Partial<DbAct> = {}) =>
    db.activity.push({ id: id(), deal_id, kind, ts, actor, text, data: null, due: null, done_at: null, assignee: null, ...extra });

  type Plan = { stage: string; createdAgo: number; idleAgo?: number; closedAgo?: number; lost?: string; bitrix?: boolean };
  const plans: Plan[] = [];
  const mainOpen = ["new", "new", "new", "qual", "qual", "qual", "offer", "offer", "offer", "offer", "agree", "agree", "agree", "pay", "pay"];
  for (const s of mainOpen) plans.push({ stage: s, createdAgo: int(2, 60) });
  // 300+ kun tegilmagan ochiq bitimlar (banner)
  plans.push({ stage: "offer", createdAgo: 420, idleAgo: 330, bitrix: true }, { stage: "qual", createdAgo: 390, idleAgo: 310, bitrix: true }, { stage: "new", createdAgo: 365, idleAgo: 352 });
  // yopilganlar: shu oy va oldingi oylar (reja uchun)
  for (const c of [2, 5, 8, 11, 34, 47]) plans.push({ stage: "won", createdAgo: c + int(10, 40), closedAgo: c });
  plans.push({ stage: "lost", createdAgo: 50, closedAgo: 9, lost: "Qimmat" }, { stage: "lost", createdAgo: 80, closedAgo: 40, lost: "Raqobatchidan oldi", bitrix: true });
  plans.push({ stage: "dl_new", createdAgo: 25 }, { stage: "dl_contract", createdAgo: 70 }, { stage: "dl_won", createdAgo: 120, closedAgo: 60 });

  const TAGS = ["zavod", "ulgurji", "takroriy", "tender"];
  const NEEDS = ["Konveyer liniyasi uchun almashtirish", "Rejali ta'mirga zaxira", "Yangi sex ishga tushyapti", "Avariya — tez kerak", "Yillik ehtiyoj, bo'lib olish"];
  const SOURCES = ["call", "telegram", "existing", "recommendation", "site", "instagram", "expo"];
  let bx = 45200;

  plans.forEach((pl, i) => {
    const st = STAGES.find((s) => s.code === pl.stage)!;
    const dId = i + 1;
    const cust = customers[i % customers.length];
    const owner = SELLERS[(i * 3) % SELLERS.length].tg_id;
    const prod = pick(CATALOG);
    const qty = prod.unit === "m" ? int(2, 12) * 10 : int(2, 40);
    const items: DealItem[] =
      r() < 0.65
        ? [{ item_id: prod.item_id, char_id: prod.char_id ?? null, name: prod.name + (prod.char ? ` (${prod.char})` : ""), unit: prod.unit, qty, price: prod.price, discount: r() < 0.3 ? 5 : 0 }]
        : [];
    if (items.length && r() < 0.35) {
      const p2 = pick(CATALOG);
      items.push({ item_id: p2.item_id, char_id: p2.char_id ?? null, name: p2.name + (p2.char ? ` (${p2.char})` : ""), unit: p2.unit, qty: int(2, 20), price: p2.price, discount: 0 });
    }
    const amount = items.length
      ? Math.round(items.reduce((a, x) => a + Number(x.qty) * Number(x.price) * (1 - Number(x.discount || 0) / 100), 0))
      : int(3, 90) * 1000000;
    const short = prod.name.replace(/^(Ремень|Лента|Рукав)\s+\S+\s+/, "");
    const title = pl.bitrix ? `Сделка #${++bx}` : `${short} — ${qty} ${prod.unit === "m" ? "m" : "dona"}`;
    const createdAgo = pl.createdAgo;
    const sinceAgo = pl.closedAgo ?? (pl.idleAgo ?? Math.max(0, createdAgo - int(1, Math.max(1, createdAgo))));
    const touchedAgo = pl.idleAgo ?? Math.max(0, Math.min(sinceAgo, int(0, 12)));
    const pipe = st.pipeline;
    const first = STAGES.find((s) => s.pipeline === pipe && s.kind === "open")!;
    const deal: DbDeal = {
      id: dId,
      title,
      counterparty_id: cust.id,
      owner_tg: owner,
      amount,
      stage: st.code,
      stage_since: ago(sinceAgo),
      created: ago(createdAgo),
      updated: ago(touchedAgo),
      closed: pl.closedAgo !== undefined ? ago(pl.closedAgo) : null,
      close_date: st.kind === "open" && r() < 0.6 ? dateOnly(-int(-6, 21)) : null,
      tags: r() < 0.55 ? [pick(TAGS)] : [],
      source: pick(SOURCES),
      lost_reason: pl.lost ?? null,
      probability: null,
      need: r() < 0.7 ? pick(NEEDS) : null,
      bx_id: pl.bitrix ? String(bx) : null,
      items,
    };
    db.deals.push(deal);
    const src = pl.bitrix ? "bitrix" : "web";
    db.history.push({ deal_id: dId, ts: deal.created, actor: owner, from_stage: null, to_stage: first.code, src });
    if (st.code !== first.code) db.history.push({ deal_id: dId, ts: deal.stage_since, actor: owner, from_stage: first.code, to_stage: st.code, src, reason: pl.lost ?? null });
    act(dId, "comment", ago(Math.max(touchedAgo, createdAgo - 1)), owner, pick(["Mijoz o'lchamlarni yubordi", "Narx so'radi, chegirma kutyapti", "Texnik bilan gaplashib aniqlaydi", "Oldingi partiyadan mamnun"]));
    if (r() < 0.5) act(dId, "call", ago(Math.max(touchedAgo, createdAgo - 2)), owner, pick(["Qo'ng'iroq qildim — ertaga javob beradi", "Ta'minot bo'limi bilan kelishildi", "Telefonni olmadi"]));
    if (st.kind === "open" && !pl.idleAgo && r() < 0.7) {
      const due = int(-4, 6);
      act(dId, "task", ago(touchedAgo), ME, pick(["Taklifni qayta yuborish", "To'lov holatini aniqlash", "Namuna jo'natish", "Qayta qo'ng'iroq qilish"]), { due: ago(-due + 0.3), assignee: owner });
    }
    const docTotal = Math.round(items.reduce((a, x) => a + Number(x.qty) * Number(x.price) * (1 - Number(x.discount || 0) / 100), 0));
    if (items.length && ["offer", "agree", "pay", "won"].includes(st.code))
      db.docs.push({ id: id(), deal_id: dId, number: `BR-TT-26-${p5(120 + dId)}`, kind: "quote", date: dateOnly(Math.max(0, sinceAgo)), status: "posted", state: null, total: docTotal });
    if (items.length && ["pay", "won"].includes(st.code))
      db.docs.push({ id: id(), deal_id: dId, number: `BR-BU-26-${p5(30 + dId)}`, kind: "order", date: dateOnly(Math.max(0, sinceAgo)), status: "posted", state: st.code === "won" ? "shipped" : "confirmed", total: docTotal });
  });

  // lidlar
  const L = (p: Partial<DbLead> & { minutes: number }): DbLead => ({
    id: id(),
    created: new Date(now - p.minutes * 6e4).toISOString(),
    title: p.title ?? null,
    name: p.name ?? null,
    company: p.company ?? null,
    note: p.note ?? null,
    phone: p.phone ?? null,
    source: p.source ?? "call",
    owner_tg: p.owner_tg ?? null,
    status: p.status ?? "new",
    deal_id: p.deal_id ?? null,
    first_touch: p.first_touch ?? null,
  });
  db.leads.push(
    L({ minutes: 12, name: "Bobur", phone: "998901234567", source: "bot", note: "SPB 1650 remen 10 dona kerak, narxi qancha?" }),
    L({ minutes: 47, name: "Sardor aka", company: "Chinoz Un MChJ", phone: "998935550117", source: "call", note: "Tegirmon uchun klinli remenlar" }),
    L({ minutes: 140, title: "Лид #8812", phone: "998977001122", source: "site", note: "Konveyer lentasi 800 mm, 60 m" }),
    L({ minutes: 60 * 26, name: "Gulnora", company: "Qo'qon Qog'oz MChJ", phone: "998911239876", source: "instagram", owner_tg: 1003, status: "work", first_touch: ago(0.9) }),
    L({ minutes: 60 * 50, name: "Otabek", phone: "998946665544", source: "telegram", owner_tg: 1002, status: "work", first_touch: ago(2) }),
    L({ minutes: 60 * 24 * 6, name: "Rahim", company: "Navoiy Konveyer Servis MChJ", phone: customers[0].phones[0], source: "call", owner_tg: 1002, status: "converted", deal_id: 1, first_touch: ago(6) }),
    L({ minutes: 60 * 24 * 9, name: "Noma'lum", phone: "998900000001", source: "bot", status: "junk", note: "Adashib yozgan" }),
  );

  // oylik reja va jo'natishlar (joriy va o'tgan oy)
  const mon = (back: number) => {
    const d = new Date(now);
    d.setDate(1);
    d.setMonth(d.getMonth() - back);
    return d.toISOString().slice(0, 7) + "-01";
  };
  SELLERS.forEach((u, i) => {
    for (const back of [0, 1]) {
      db.goals.push({ owner_tg: u.tg_id, month: mon(back), amount: [150, 120, 100, 90, 60][i] * 1e6 });
      db.shipments.push({ owner_tg: u.tg_id, month: mon(back), amount: Math.round((back ? [140, 131, 72, 95, 58] : [61, 54, 22, 47, 39])[i] * 1e6) });
    }
  });

  db.seq = seq;
  return db;
}

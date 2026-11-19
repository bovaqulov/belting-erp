// Brauzer ichidagi soxta CRM backend: Jarvis kontrakti bilan bir xil yo'llar va JSON shakllari, holat haqiqatan
// o'zgaradi (Db obyekti joyida). Filtr, saralash, sahifalash, "harakatsiz"/300+ kun mantiqi — shu yerda hisoblanadi.
// handle() sof: tarmoq yo'q, vaqt `now` bilan beriladi.
import { autoTitle, days, dealTitle, innRequired, itemAmount, priced, type CustKind, type Deal, type DealItem } from "@/erp/crm/lib";

import { HEAD_TG, type Db, type DbAct, type DbCustomer, type DbDeal, type DbDoc, type DbLead, type DbTgChat, type DbTgMsg } from "./seed.lib";

export type Res = { status: number; body: unknown };
type B = Record<string, unknown>;

const ok = (body: unknown): Res => ({ status: 200, body });
const fail = (status: number, detail: string): Res => ({ status, body: { detail } });
const s = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const n = (v: unknown): number => {
  const x = Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
};
const nOrNull = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : n(v));
const lc = (v: unknown) => s(v).toLowerCase();
const digits = (v: unknown) => s(v).replace(/\D/g, "");
/** Telefon kaliti: oxirgi 9 raqam (998 prefiksi bo'lsa ham, bo'lmasa ham bir xil) */
export const phoneKey = (v: unknown): string => digits(v).slice(-9);

const iso = (now: number) => new Date(now).toISOString();
const nextId = (db: Db) => ++db.seq;
const PAGE = 20;

// ------------------------------------------------------------------ hisoblangan bitim qatori
function stageOf(db: Db, code: string) {
  return db.stages.find((x) => x.code === code);
}
function touchedOf(db: Db, d: DbDeal): string {
  let t = d.updated;
  for (const a of db.activity) if (a.deal_id === d.id && a.ts > t) t = a.ts;
  return t;
}
function nextTask(db: Db, d: DbDeal): string | null {
  let best: string | null = null;
  for (const a of db.activity) if (a.deal_id === d.id && a.kind === "task" && !a.done_at && a.due && (!best || a.due < best)) best = a.due;
  return best;
}
export function row(db: Db, d: DbDeal, now: number): Deal {
  const st = stageOf(db, d.stage);
  const open = st?.kind === "open";
  const touched = touchedOf(db, d);
  const idle = days(touched, now) ?? 0;
  return {
    id: d.id,
    title: d.title,
    customer: db.customers.find((c) => c.id === d.counterparty_id)?.name ?? null,
    owner_tg: d.owner_tg,
    amount: String(d.amount),
    discount: String(d.discount ?? 0),
    markup: String(d.markup ?? 0),
    logistics: String(d.logistics ?? 0),
    location: d.location || null,
    next_task: open ? nextTask(db, d) : null,
    stage: d.stage,
    stage_since: d.stage_since,
    created: d.created,
    touched,
    updated: d.updated,
    closed: d.closed,
    close_date: d.close_date,
    rotten: !!(open && st?.rot_days && idle >= st.rot_days),
    rot_days: st?.rot_days ?? null,
    tags: [...d.tags],
    prob: d.probability ?? st?.probability ?? null,
    source: d.source,
    lost_reason: d.lost_reason,
    pipeline: "main",
    sla_hours: open ? (st?.sla_hours ?? null) : null,
    sla_late: !!(open && st?.sla_hours && now - new Date(d.stage_since).getTime() > st.sla_hours * 36e5),
    pay_terms: d.pay_terms ?? "full",
    paid_sum: String(d.paid_sum ?? 0),
    sign_status: d.sign_status ?? null,
    docs_done: !!d.docs_done,
  };
}

// ------------------------------------------------------------------ ko'rish huquqi
// Sotuv bo'limi rahbari (is_head) — hamma bitim, mijoz va lidni ko'radi, lidlarni taqsimlaydi.
// Sotuvchi — faqat o'ziga biriktirilgan bitim/lidlarni va o'z mijozlarini (o'zi mas'ul yoki unda o'z bitimi bor) ko'radi.
export const seesOwner = (db: Db, owner: number | null | undefined): boolean => db.me.is_head || owner === db.me.tg_id;
export const seesDeal = (db: Db, d: DbDeal): boolean => seesOwner(db, d.owner_tg);
export const seesCustomer = (db: Db, c: DbCustomer): boolean =>
  seesOwner(db, c.owner_tg) || db.deals.some((d) => d.counterparty_id === c.id && d.owner_tg === db.me.tg_id);
const findDeal = (db: Db, id: number): DbDeal | undefined => db.deals.find((d) => d.id === id && seesDeal(db, d));

// ------------------------------------------------------------------ filtrlar
type F = URLSearchParams;
function matches(db: Db, d: DbDeal, r: Deal, q: F, now: number): boolean {
  if (!seesDeal(db, d)) return false;
  const text = q.get("q")?.trim();
  if (text) {
    const t = text.toLowerCase();
    const c = db.customers.find((x) => x.id === d.counterparty_id);
    const idm = /^#?(\d+)$/.exec(t);
    const hay = [d.title, c?.name, c?.inn, ...(c?.phones ?? [])].map(lc).join(" ");
    const dg = digits(t);
    if (!(idm && Number(idm[1]) === d.id) && !hay.includes(t) && !(dg.length >= 5 && (c?.phones ?? []).some((p) => p.includes(dg)))) return false;
  }
  const owner = q.get("owner");
  if (owner && s(d.owner_tg) !== owner) return false;
  const src = q.get("source");
  if (src === "-" ? !!d.source : src ? d.source !== src : false) return false;
  const open = stageOf(db, d.stage)?.kind === "open";
  if (q.get("overdue") === "true" && !(open && r.next_task && new Date(r.next_task).getTime() < now)) return false;
  if (q.get("rotten") === "true" && !r.rotten) return false;
  if (q.get("notask") === "true" && !(open && !r.next_task)) return false;
  const idle = n(q.get("idle"));
  if (idle && !(open && (days(r.touched, now) ?? 0) >= idle)) return false;
  const closing = q.get("closing");
  if (closing) {
    const today = iso(now).slice(0, 10);
    const week = iso(now + 7 * 864e5).slice(0, 10);
    if (!open || !d.close_date) return false;
    if (closing === "week" && !(d.close_date >= today && d.close_date <= week)) return false;
    if (closing === "overdue" && !(d.close_date < today)) return false;
  }
  const amin = n(q.get("amount_min"));
  if (amin && d.amount < amin) return false;
  const tag = q.get("tag");
  if (tag && !d.tags.includes(tag)) return false;
  return true;
}

function sorter(db: Db, sort: string, now: number): (a: Deal, b: Deal) => number {
  const order = new Map(db.stages.map((x, i) => [x.code, i]));
  const name = (tg?: number | null) => db.users.find((u) => u.tg_id === tg)?.name ?? "";
  const desc = (x: string | null | undefined, y: string | null | undefined) => s(y).localeCompare(s(x));
  switch (sort) {
    case "idle":
      return (a, b) => (days(b.touched, now) ?? 0) - (days(a.touched, now) ?? 0);
    case "title":
      return (a, b) => a.title.localeCompare(b.title);
    case "customer":
      return (a, b) => s(a.customer).localeCompare(s(b.customer));
    case "stage":
      return (a, b) => (order.get(a.stage) ?? 0) - (order.get(b.stage) ?? 0);
    case "amount":
      return (a, b) => n(b.amount) - n(a.amount);
    case "owner":
      return (a, b) => name(a.owner_tg).localeCompare(name(b.owner_tg));
    case "task":
      return (a, b) => (a.next_task ? (b.next_task ? a.next_task.localeCompare(b.next_task) : -1) : b.next_task ? 1 : 0);
    case "created":
      return (a, b) => desc(a.created, b.created);
    default:
      return (a, b) => desc(a.updated, b.updated);
  }
}

/** Har voronkada filtrga mos ochiq bitimlar soni (tablar) */
function counts(db: Db, q: F, now: number): Record<string, number> {
  const c: Record<string, number> = Object.fromEntries(db.pipelines.map((p) => [p.code, 0]));
  for (const d of db.deals) {
    const st = stageOf(db, d.stage);
    if (st?.kind === "open" && matches(db, d, row(db, d, now), q, now)) c[st.pipeline] = (c[st.pipeline] ?? 0) + 1;
  }
  return c;
}

function board(db: Db, q: F, now: number) {
  const pipe = q.get("pipeline") || "main";
  const only = q.get("stage");
  const off = n(q.get("offset"));
  const stages = db.stages.filter((x) => x.pipeline === pipe && (!only || x.code === only));
  return {
    counts: counts(db, q, now),
    stages: stages.map((st) => {
      const rows = db.deals
        .filter((d) => d.stage === st.code)
        .map((d) => row(db, d, now))
        .filter((r) => matches(db, db.deals.find((d) => d.id === r.id)!, r, q, now))
        .sort(sorter(db, "updated", now));
      const open = st.kind === "open";
      return {
        ...st,
        count: open ? rows.length : 0,
        amount: open ? String(rows.reduce((a, r) => a + n(r.amount), 0)) : "0",
        weighted: open ? String(Math.round(rows.reduce((a, r) => a + (n(r.amount) * (r.prob ?? 0)) / 100, 0))) : "0",
        rotten: open ? rows.filter((r) => r.rotten).length : 0,
        deals: open ? rows.slice(only === st.code ? off : 0, (only === st.code ? off : 0) + PAGE) : [],
      };
    }),
  };
}

function list(db: Db, q: F, now: number) {
  const pipe = q.get("pipeline");
  const stage = q.get("stage");
  const kind = q.get("kind") || "open";
  const rows = db.deals
    .filter((d) => {
      const st = stageOf(db, d.stage);
      if (!st) return false;
      if (pipe && st.pipeline !== pipe) return false;
      if (stage && d.stage !== stage) return false;
      return kind === "all" || st.kind === kind;
    })
    .map((d) => [d, row(db, d, now)] as const)
    .filter(([d, r]) => matches(db, d, r, q, now))
    .map(([, r]) => r)
    .sort(sorter(db, q.get("sort") || "updated", now));
  const off = n(q.get("offset"));
  const lim = n(q.get("limit")) || 50;
  return { rows: rows.slice(off, off + lim), total: rows.length, amount: String(rows.reduce((a, r) => a + n(r.amount), 0)), counts: counts(db, q, now) };
}

function detail(db: Db, d: DbDeal, now: number) {
  return {
    ...row(db, d, now),
    counterparty_id: d.counterparty_id,
    probability: d.probability,
    need: d.need,
    docs: db.docs.filter((x) => x.deal_id === d.id).map((x) => ({ ...x, total: String(x.total) })),
    items: d.items.map((x) => ({ ...x })),
    activity: db.activity
      .filter((a) => a.deal_id === d.id)
      .sort((a, b) => b.ts.localeCompare(a.ts))
      .map((a) => ({ ...a, data: a.data ? { ...a.data } : null })),
    stages: db.history.filter((h) => h.deal_id === d.id).map((h) => ({ ts: h.ts, actor: h.actor, from_stage: h.from_stage, to_stage: h.to_stage, src: h.src })),
  };
}

// ------------------------------------------------------------------ o'zgartirishlar
/** Bosqichga o'tkazish (tarix bilan). Xato bo'lsa — matn. */
// Sales ketma-ketligi — avtomatik o'tish faqat oldinga (backend sales.advance bilan bir xil)
const FLOW = ["new", "offer", "later", "contract", "payment", "production", "ready", "shipping", "won"];
function advance(db: Db, d: DbDeal, code: string, now: number, why: string): boolean {
  const cur = stageOf(db, d.stage);
  if (cur?.kind !== "open" || !FLOW.includes(d.stage) || !FLOW.includes(code) || FLOW.indexOf(d.stage) >= FLOW.indexOf(code)) return false;
  if (moveStage(db, d, code, null, now)) return false;
  const h = db.history.at(-1);
  if (h && h.deal_id === d.id) h.src = "auto";
  addAct(db, { deal_id: d.id, kind: "stage", text: `Avtomatik: «${stageOf(db, code)?.name ?? code}» bosqichiga o'tdi — ${why}`, due: null, assignee: null }, now);
  return true;
}

export function moveStage(db: Db, d: DbDeal, code: string, reason: string | null, now: number): string | null {
  const st = stageOf(db, code);
  if (!st) return "Bunday bosqich yo'q";
  if (st.kind === "lost" && !reason) return "Rad etish sababini tanlang";
  if (d.stage === code) return null;
  // backend sales.check_move bilan bir xil
  const paid = d.paid_sum ?? 0;
  const need = d.pay_terms === "half" ? d.amount / 2 : d.amount;
  if (code === "production" && d.amount && paid < need) return `Oldindan to'lov tushmagan: kerak ${need} so'm, tushgan ${paid}.`;
  if (code === "shipping" && d.amount && paid < d.amount) return `Qolgan to'lov tushmagan: ${d.amount - paid} so'm. Jo'natishdan oldin to'liq to'lov olinadi.`;
  if (code === "won" && !d.docs_done) return "Yuk xati va dalolatnoma imzolanmagan — bitim kartochkasida «Hujjatlar imzolandi» ni belgilang.";
  const ts = iso(now);
  db.history.push({ deal_id: d.id, ts, actor: db.me.tg_id, from_stage: d.stage, to_stage: code, src: "web", reason: st.kind === "lost" ? reason : null });
  d.stage = code;
  d.stage_since = ts;
  d.updated = ts;
  d.closed = st.kind === "open" ? null : ts;
  d.lost_reason = st.kind === "lost" ? reason : null;
  if (code === "offer")
    for (const n of [2, 5])
      db.activity.push({ id: nextId(db), deal_id: d.id, kind: "task", ts, actor: null, text: `Taklif bo'yicha mijozga qayta yozing (${n}-kun)`, data: null, due: iso(now + n * 864e5), done_at: null, assignee: d.owner_tg });
  return null;
}

function addAct(db: Db, p: Omit<DbAct, "id" | "ts" | "actor" | "data" | "done_at"> & Partial<DbAct>, now: number): DbAct {
  const a: DbAct = { id: nextId(db), ts: iso(now), actor: db.me.tg_id, data: null, done_at: null, ...p };
  db.activity.push(a);
  return a;
}

function newDeal(db: Db, b: B, now: number): DbDeal {
  const first = db.stages.find((x) => x.pipeline === "main" && x.kind === "open")!;
  const ts = iso(now);
  const id = nextId(db);
  const d: DbDeal = {
    id,
    // nomni tizim beradi (backend auto_title): birinchi tovar va miqdori / mijoz nomi
    title: dealTitle(
      id,
      s(b.title) ||
        autoTitle(
          (Array.isArray(b.items) ? (b.items as B[]) : []).map((x) => ({ name: s(x.name), qty: s(x.qty), unit: s(x.unit) || null })),
          db.customers.find((c) => c.id === nOrNull(b.counterparty_id))?.name,
        ),
    ),
    counterparty_id: nOrNull(b.counterparty_id),
    owner_tg: db.me.is_head ? (nOrNull(b.owner_tg) ?? db.me.tg_id) : db.me.tg_id,
    amount: n(b.amount),
    stage: first.code,
    stage_since: ts,
    created: ts,
    updated: ts,
    closed: null,
    close_date: null,
    tags: [],
    source: s(b.source) || null,
    lost_reason: null,
    probability: null,
    need: s(b.need) || null,
    items: [],
  };
  const pe = pricing(d, b);
  if (pe) throw new Error(pe);
  d.location = s(b.location).trim() || db.customers.find((c) => c.id === d.counterparty_id)?.address || null;
  db.deals.push(d);
  if (Array.isArray(b.items) && b.items.length) saveItems(d, b, now); // tovarlar bilan — summa ulardan
  db.history.push({ deal_id: d.id, ts, actor: db.me.tg_id, from_stage: null, to_stage: first.code, src: "web" });
  return d;
}

const DEAL_FIELDS = ["title", "amount", "close_date", "probability", "owner_tg", "source", "need"] as const;
function patchDeal(db: Db, d: DbDeal, b: B, now: number): string | null {
  const pe = pricing(d, b);
  if (pe) return pe;
  if ("location" in b) d.location = s(b.location).trim() || null;
  if (b.pay_terms === "full" || b.pay_terms === "half") d.pay_terms = b.pay_terms;
  const signedNow = s(b.sign_status) === "signed" && d.sign_status !== "signed";
  if ("sign_status" in b) d.sign_status = (s(b.sign_status) || null) as DbDeal["sign_status"];
  if (signedNow) advance(db, d, "payment", now, "shartnoma imzolandi");
  if ("docs_done" in b) d.docs_done = !!b.docs_done;
  for (const k of DEAL_FIELDS) {
    if (!(k in b)) continue;
    const v = b[k];
    if (k === "title") d.title = dealTitle(d.id, s(v) || d.title);
    else if (k === "amount") d.amount = n(v);
    else if (k === "probability") d.probability = nOrNull(v);
    else if (k === "owner_tg") {
      if (db.me.is_head) d.owner_tg = nOrNull(v);
    }
    else if (k === "close_date") d.close_date = s(v) || null;
    else if (k === "source") d.source = s(v) || null;
    else d.need = s(v) || null;
  }
  // narxlash o'zgarsa — tovarlar bor bo'lsa summa qayta hisoblanadi (backend deals.recalc)
  if (["discount", "markup", "logistics"].some((f) => f in b) && d.items.length) d.amount = priced(d.items.reduce((a, x) => a + itemAmount(x), 0), d).total;
  d.updated = iso(now);
  return null;
}

function saveItems(d: DbDeal, b: B, now: number) {
  const raw = Array.isArray(b.items) ? (b.items as B[]) : [];
  d.items = raw.map(
    (x): DealItem => ({
      item_id: nOrNull(x.item_id),
      char_id: nOrNull(x.char_id),
      name: s(x.name).trim() || "Nomsiz",
      unit: s(x.unit) || null,
      qty: String(n(x.qty)),
      price: String(n(x.price)),
      discount: String(n(x.discount)),
    }),
  );
  d.amount = d.items.length ? priced(d.items.reduce((a, x) => a + itemAmount(x), 0), d).total : 0;
  d.updated = iso(now);
  return { items: d.items, amount: String(d.amount) };
}

/** Narxlash maydonlari (backend deals.PRICING bilan bir xil): xato — matn */
function pricing(d: DbDeal, b: B): string | null {
  const lim: [keyof DbDeal & ("discount" | "markup" | "logistics"), number | null, string][] = [
    ["discount", 100, "Chegirma 0–100% oralig'ida bo'lsin."],
    ["markup", 1000, "Ustama 0–1000% oralig'ida bo'lsin."],
    ["logistics", null, "Logistika summasi manfiy bo'lmasin."],
  ];
  for (const [f, hi, msg] of lim) {
    if (!(f in b)) continue;
    const v = n(b[f]);
    if (v < 0 || (hi !== null && v > hi)) return msg;
    d[f] = v;
  }
  return null;
}

function makeDoc(db: Db, d: DbDeal, kind: string, now: number): Res {
  if (kind !== "quote" && kind !== "order") return fail(400, "Hujjat turi noto'g'ri");
  const items = d.items.filter((x) => x.item_id);
  if (!items.length) return fail(400, "Katalogdagi tovar yo'q — avval tovar qo'shing");
  const doc = {
    id: nextId(db),
    deal_id: d.id,
    number: `BR-${kind === "quote" ? "TT" : "BU"}-26-${String(db.seq).padStart(5, "0")}`,
    kind,
    date: iso(now).slice(0, 10),
    status: kind === "quote" ? "posted" : "draft",
    state: null,
    total: priced(items.reduce((a, x) => a + itemAmount(x), 0), d).total,
    ...docSnap(db, d),
  };
  db.docs.push(doc);
  addAct(db, { deal_id: d.id, kind: "doc", text: `${kind === "quote" ? "Tijorat taklifi" : "Buyurtma qoralamasi"} ${doc.number}`, due: null, assignee: null }, now);
  d.updated = iso(now);
  advance(db, d, "offer", now, `${kind === "quote" ? "tijorat taklifi" : "buyurtma"} ${doc.number} tuzildi`);
  return ok({ ...doc, total: String(doc.total) });
}

/** hujjat nusxasi: bitimning katalog tovarlari va narxlash (backend make_doc bilan bir xil) */
function docSnap(db: Db, d: DbDeal): { lines: (DealItem & { amount: string })[]; meta: Record<string, string> } {
  const items = d.items.filter((x) => x.item_id);
  const c = db.customers.find((y) => y.id === d.counterparty_id);
  return {
    lines: items.map((x) => ({ ...x, amount: String(Math.round(itemAmount(x))) })),
    meta: {
      customer: c?.name ?? "",
      inn: c?.inn ?? "",
      location: d.location ?? "",
      sub: String(Math.round(items.reduce((a, x) => a + itemAmount(x), 0))),
      discount: String(d.discount ?? 0),
      markup: String(d.markup ?? 0),
      logistics: String(d.logistics ?? 0),
    },
  };
}

function docFull(db: Db, x: DbDoc) {
  const d = db.deals.find((y) => y.id === x.deal_id)!;
  const snap = x.lines?.length ? { lines: x.lines, meta: x.meta ?? {} } : { ...docSnap(db, d), meta: { ...docSnap(db, d).meta, restored: true } };
  return {
    ...x,
    total: String(x.total),
    deal_title: d.title,
    customer_id: d.counterparty_id,
    ...snap,
    // demo: Didox ulanmagan (kalitlar — haqiqiy backend'da)
    didox: { enabled: false, id: null, status: null, status_text: null, at: null, url: "https://didox.uz", subtypes: DIDOX_SUBTYPES },
  };
}
const DIDOX_SUBTYPES = [
  { code: 3, name: "Shartnoma" },
  { code: 4, name: "To'lov uchun hisob" },
  { code: 7, name: "Buyurtma (zayavka)" },
  { code: 8, name: "Spetsifikatsiya" },
  { code: 6, name: "Boshqa hujjat" },
];

/** hujjatni mijoz chatiga (demo): Telegram / WhatsApp — fayl xabari, Instagram — matn */
function sendDoc(db: Db, x: DbDoc, b: B, now: number): Res {
  const c = tgChats(db).find((y) => y.id === n(b.chat_id));
  if (!c) return fail(404, "Chat topilmadi");
  const ch = c.channel ?? "tg";
  const text = ch === "ig" ? `${x.number}: jami ${x.total} so'm` : `${x.number} — ${x.total} so'm`;
  db.tg_msgs.push({ id: nextId(db), chat: c.id, out: true, kind: ch === "ig" ? "text" : "document", text, date: iso(now), edited: false, deleted: false, via_crm: true });
  c.unread = 0;
  const name = { tg: "Telegram", wa: "WhatsApp", ig: "Instagram" }[ch];
  addAct(db, { deal_id: x.deal_id, kind: "message", text: `${x.number} mijozga ${name} orqali yuborildi`, due: null, assignee: null }, now);
  advance(db, findDeal(db, x.deal_id)!, x.kind === "quote" ? "offer" : "contract", now, `${x.number} mijozga yuborildi`);
  return ok({ ok: true, channel: ch });
}

function bulk(db: Db, b: B, now: number): Res {
  const ids = Array.isArray(b.ids) ? (b.ids as unknown[]).map(n) : [];
  const action = s(b.action);
  const errors: { id: number; error: string }[] = [];
  let done = 0;
  for (const id of ids) {
    const d = findDeal(db, id);
    if (!d) {
      errors.push({ id, error: "Bitim topilmadi" });
      continue;
    }
    let e: string | null = null;
    if (action === "stage") e = moveStage(db, d, s(b.value), s(b.reason) || null, now);
    else if (action === "owner") {
      if (db.me.is_head) d.owner_tg = n(b.value);
      else e = "Mas'ulni faqat sotuv bo'limi rahbari o'zgartiradi";
    }
    else if (action === "task") addAct(db, { deal_id: d.id, kind: "task", text: s(b.value), due: s(b.due) || iso(now + 864e5), assignee: d.owner_tg ?? db.me.tg_id }, now);
    else if (action === "tag_add") d.tags = [...new Set([...d.tags, s(b.value).trim()])].filter(Boolean);
    else if (action === "tag_del") d.tags = d.tags.filter((t) => t !== s(b.value).trim());
    else if (action === "close_date") d.close_date = s(b.value) || null;
    else e = "Noma'lum amal";
    if (e) errors.push({ id, error: e });
    else {
      if (action !== "task") d.updated = iso(now);
      done++;
    }
  }
  return ok({ ok: done, errors });
}

// ------------------------------------------------------------------ lidlar
function leads(db: Db, q: F) {
  // Jarvis bilan bir xil: holat berilmasa — faqat ochiq lidlar (new, work)
  const st = (q.get("status") || "new,work,interested").split(",").filter(Boolean);
  const owner = db.me.is_head ? q.get("owner") || "" : "";
  const t = lc(q.get("q")).trim();
  return db.leads
    .filter((l) => seesOwner(db, l.owner_tg))
    .filter((l) => st.includes(l.status) && (!owner || (owner === "none" ? !l.owner_tg : s(l.owner_tg) === owner)))
    .filter((l) => !t || [l.name, l.company, l.phone, l.title, l.note].map(lc).join(" ").includes(t))
    .sort((a, b) => b.created.localeCompare(a.created))
    .map((l) => ({ ...l }));
}

function newLead(db: Db, b: B, now: number): Res {
  const phone = digits(b.phone);
  const full = phone.length === 9 ? "998" + phone : phone || null;
  const key = phoneKey(full);
  const note = s(b.note).trim() || null;
  if (key.length === 9) {
    const dup = db.leads.find((l) => ["new", "work", "interested"].includes(l.status) && phoneKey(l.phone) === key);
    if (dup) {
      if (note) dup.note = dup.note ? `${dup.note}\n${note}` : note;
      return ok({ ...dup, duplicate: true });
    }
  }
  // taqsimlash: sotuvchi o'zi kiritdi — o'zi; rahbar — tanlangan, qoida (mahsulot / hudud) yoki navbat
  const ruled = () => {
    const hay = { product: [b.product, b.size, b.note].map(lc).join(" "), region: [b.region, b.company, b.note].map(lc).join(" ") };
    return (db.routing ?? []).find((r) => r.keywords.split(",").map((w) => w.trim().toLowerCase()).some((w) => w && hay[r.kind].includes(w)))?.seller_tg ?? null;
  };
  const owner = db.me.is_head ? (nOrNull(b.owner_tg) ?? ruled()) : db.me.tg_id;
  const l: DbLead = {
    id: nextId(db),
    created: iso(now),
    title: null,
    name: s(b.name).trim() || null,
    company: s(b.company).trim() || null,
    note,
    phone: full,
    source: s(b.source) || "manual",
    owner_tg: owner,
    status: owner ? "work" : "new",
    deal_id: null,
    first_touch: null,
  };
  db.leads.push(l);
  return ok({ ...l, duplicate: false });
}

function convertLead(db: Db, l: DbLead, now: number): Res {
  const miss = [!s(l.product).trim() && "tasma turi", !s(l.company || l.name).trim() && "kompaniya"].filter(Boolean);
  if (miss.length) return fail(400, `Kvalifikatsiya to'liq emas: ${miss.join(", ")} kiritilmagan.`);
  if (l.status === "converted") return fail(400, "Lid allaqachon bitimga aylangan");
  if (l.status === "junk") return fail(400, "Yaroqsiz lidni bitimga aylantirib bo'lmaydi");
  const key = phoneKey(l.phone);
  let c = key.length === 9 ? db.customers.find((x) => x.phones.some((p) => phoneKey(p) === key)) : undefined;
  if (!c) {
    c = { id: nextId(db), name: l.company || l.name || l.title || `Lid #${l.id}`, inn: null, phones: l.phone ? [l.phone] : [], owner_tg: l.owner_tg ?? db.me.tg_id };
    db.customers.push(c);
  }
  const d = newDeal(db, { counterparty_id: c.id, title: l.title || l.company || l.name || `Lid #${l.id}`, owner_tg: l.owner_tg ?? db.me.tg_id, source: l.source, need: l.note }, now);
  l.status = "converted";
  l.deal_id = d.id;
  l.first_touch = l.first_touch ?? iso(now);
  if (!l.owner_tg) l.owner_tg = d.owner_tg;
  return ok(detail(db, d, now));
}

// ------------------------------------------------------------------ reja
function goals(db: Db, month: string, now: number) {
  const m = /^\d{4}-\d{2}$/.test(month) ? month : iso(now).slice(0, 7);
  const [y, mo] = m.split("-").map(Number);
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const cur = iso(now).slice(0, 7);
  const passed = m < cur ? dim : m > cur ? 0 : new Date(now).getUTCDate();
  const won = db.deals.filter((d) => stageOf(db, d.stage)?.kind === "won" && d.closed?.slice(0, 7) === m);
  return {
    days: dim,
    passed,
    can_edit: db.me.is_head,
    rows: db.users.map((u) => {
      const plan = db.goals.find((g) => g.owner_tg === u.tg_id && g.month === `${m}-01`)?.amount ?? 0;
      const mine = won.filter((d) => d.owner_tg === u.tg_id);
      const wonAmount = mine.reduce((a, d) => a + d.amount, 0);
      const sales = (db.shipments.find((x) => x.owner_tg === u.tg_id && x.month === `${m}-01`)?.amount ?? 0) + wonAmount;
      return {
        tg_id: u.tg_id,
        name: u.name,
        plan: String(plan),
        sales: String(sales),
        pct: plan ? Math.round((sales / plan) * 1000) / 10 : null,
        won_deals: mine.length,
        won_amount: String(wonAmount),
      };
    }),
  };
}

// ------------------------------------------------------------------ Telegram (backend: erp/crm/views.py bilan bir xil)
// yozishmalar shaxsiy — har kim faqat o'z chatlarini ko'radi (rahbar ham)
const tgChats = (db: Db) => db.tg_chats.filter((c) => c.seller_tg === db.me.tg_id);
const tgLast = (db: Db, c: DbTgChat): DbTgMsg | undefined => db.tg_msgs.filter((m) => m.chat === c.id).at(-1);
const KINDS: Record<string, string> = { photo: "Rasm", document: "Fayl", voice: "Ovozli xabar", video: "Video", sticker: "Stiker" };
function tgChat(db: Db, c: DbTgChat) {
  const m = tgLast(db, c);
  return {
    id: c.id,
    title: c.title,
    username: c.username,
    seller_tg: c.seller_tg,
    seller: db.users.find((u) => u.tg_id === c.seller_tg)?.name ?? "",
    last_at: m?.date ?? null,
    last_text: m ? (m.text || KINDS[m.kind] || "").slice(0, 300) : "",
    last_out: !!m?.out,
    unread: c.unread,
    channel: c.channel ?? "tg",
    can_send: c.seller_tg === db.me.tg_id && c.can_reply,
    customer: c.customer_id ? (cu => (cu ? { id: cu.id, name: cu.name } : null))(db.customers.find((x) => x.id === c.customer_id)) : null,
  };
}
function tgList(db: Db, q: F) {
  const t = lc(q.get("q")).trim().replace(/^@/, "");
  const own = db.tg_chats.filter((c) => c.seller_tg === db.me.tg_id);
  const tgOwn = own.filter((c) => (c.channel ?? "tg") === "tg");
  const ch = q.get("ch") ?? "";
  const unread = (k: string) => own.filter((c) => (c.channel ?? "tg") === k).reduce((a, c) => a + c.unread, 0);
  return {
    bot: "belting_crm_bot",
    head: db.me.is_head,
    connection: tgOwn.length ? { enabled: true, can_reply: tgOwn.every((c) => c.can_reply) } : null,
    channels: Object.fromEntries((["tg", "wa", "ig"] as const).map((k) => [k, { enabled: true, unread: unread(k) }])),
    chats: tgChats(db)
      .filter((c) => !["tg", "wa", "ig"].includes(ch) || (c.channel ?? "tg") === ch)
      .map((c) => tgChat(db, c))
      .filter((c) => !t || [c.title, c.username, c.seller].map(lc).join(" ").includes(t))
      .sort((a, b) => (b.last_at ?? "").localeCompare(a.last_at ?? "")),
  };
}

// ------------------------------------------------------------------ mijozlar (backend erp/crm/customers.py bilan bir xil)
const BOUGHT = ["shipping", "won"];
const dayOf = (s: string) => s.slice(0, 10);
const addDays = (d: string, n: number) => new Date(new Date(d + "T00:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);
function cycleOf(dates: string[]): number | null {
  if (!dates.length) return null;
  const ds = [...dates].sort();
  const gaps = ds.slice(1).map((d, i) => Math.round((new Date(d).getTime() - new Date(ds[i]).getTime()) / 864e5)).filter((g) => g > 0).sort((a, b) => a - b);
  if (!gaps.length) return 90;
  const m = gaps.length % 2 ? gaps[(gaps.length - 1) / 2] : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2;
  return Math.max(14, Math.floor(m));
}
function custStats(db: Db, c: DbCustomer) {
  const bought = db.deals.filter((d) => d.counterparty_id === c.id && BOUGHT.includes(d.stage));
  const dates = bought.map((d) => dayOf(d.closed ?? d.stage_since));
  const cycle = cycleOf(dates);
  const last = dates.length ? [...dates].sort().at(-1)! : null;
  return { bought_n: bought.length, bought_sum: String(bought.reduce((a, d) => a + d.amount, 0)), last_buy: last, cycle, next_buy: last && cycle ? addDays(last, cycle) : null };
}
function custTable(db: Db, q: F, now: number) {
  const t = lc(q.get("q")).trim();
  const today = iso(now).slice(0, 10);
  const rows = db.customers
    .filter((c) => seesCustomer(db, c))
    .filter((c) => !t || [c.name, c.inn, ...c.phones, ...(c.contacts ?? []).map((x) => x.name)].map(lc).join(" ").includes(t))
    .map((c) => {
      const s = custStats(db, c);
      const open_n = db.deals.filter((d) => d.counterparty_id === c.id && stageOf(db, d.stage)?.kind === "open" && stageOf(db, d.stage)?.pipeline === "main" && !BOUGHT.includes(d.stage)).length;
      return { id: c.id, name: c.name, kind: c.kind ?? "company", company: c.company ?? null, position: c.position ?? null, inn: c.inn, phones: [...c.phones], owner_tg: c.owner_tg, ...s, overdue: !!(s.next_buy && s.next_buy < today && !open_n), open_n };
    });
  const sort = q.get("sort") || "next";
  if (sort === "name") rows.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "sum") rows.sort((a, b) => n(b.bought_sum) - n(a.bought_sum));
  else if (sort === "last") rows.sort((a, b) => s(b.last_buy).localeCompare(s(a.last_buy)));
  else rows.sort((a, b) => (a.next_buy ? (b.next_buy ? a.next_buy.localeCompare(b.next_buy) : -1) : b.next_buy ? 1 : a.name.localeCompare(b.name)));
  return { rows: rows.slice(0, 100), total: rows.length, overdue: rows.filter((r) => r.overdue).length };
}
// mijoz turi va turga xos maydonlar (backend deals.cust_fields bilan bir xil): xato — matn
const INN_RULES: Record<string, [number[], string]> = {
  company: [[9], "Firma STIRi 9 xonali bo'lsin."],
  state: [[9], "Tashkilot STIRi 9 xonali bo'lsin."],
  person: [[14], "JSHSHIR 14 xonali bo'lsin."],
  ip: [[9, 14], "YaTT: STIR 9 yoki JSHSHIR 14 xonali bo'lsin."],
};
const CUST_KINDS = ["company", "employee", "trader", "ip", "person", "state"];
function custFields(b: B, c: DbCustomer | null): Partial<DbCustomer> | string {
  const kind = "kind" in b ? s(b.kind) : (c?.kind ?? "company");
  if (!CUST_KINDS.includes(kind)) return "Mijoz turi noto'g'ri.";
  const out: Partial<DbCustomer> = "kind" in b ? { kind: kind as DbCustomer["kind"] } : {};
  if ("inn" in b) {
    const inn = digits(b.inn);
    const [lens, msg] = INN_RULES[kind] ?? [[9, 14], "STIR 9 yoki JSHSHIR 14 xonali bo'lsin."];
    if (inn && !lens.includes(inn.length)) return msg;
    out.inn = inn || null;
  }
  for (const f of ["position", "company", "address"] as const) if (f in b) out[f] = s(b[f]).trim() || null;
  if ("company_inn" in b) {
    const ci = digits(b.company_inn);
    if (ci && ci.length !== 9) return "Firma STIRi 9 xonali bo'lsin.";
    out.company_inn = ci || null;
  }
  if ("phones" in b) out.phones = Array.isArray(b.phones) ? (b.phones as unknown[]).map(digits).filter(Boolean).map((p) => (p.length === 9 ? "998" + p : p)) : [];
  const cur = <K extends keyof DbCustomer>(f: K) => (f in out ? out[f] : c?.[f]);
  if (kind === "employee" && !s(cur("company")).trim()) return "Firma xodimi: qaysi firmadan — firma nomini yozing.";
  if (kind === "trader" && !(cur("phones") as string[] | undefined)?.length) return "Savdogar: telefon raqamini yozing.";
  return out;
}
function custCard(db: Db, c: DbCustomer) {
  return {
    id: c.id,
    name: c.name,
    inn: c.inn,
    phones: [...c.phones],
    owner_tg: c.owner_tg,
    contacts: (c.contacts ?? []).map((x) => ({ ...x })),
    note: c.note ?? "",
    address: c.address ?? "",
    kind: c.kind ?? "company",
    position: c.position ?? "",
    company: c.company ?? "",
    company_inn: c.company_inn ?? "",
    created: null,
    stats: custStats(db, c),
    deals: db.deals
      .filter((d) => d.counterparty_id === c.id && seesDeal(db, d))
      .sort((a, b) => b.created.localeCompare(a.created))
      .map((d) => ({ id: d.id, title: d.title, stage: d.stage, pipeline: stageOf(db, d.stage)?.pipeline ?? "main", kind: stageOf(db, d.stage)?.kind ?? "open", amount: String(d.amount), created: d.created, owner_tg: d.owner_tg, repeat: false })),
    tg: db.tg_chats.filter((x) => x.customer_id === c.id && x.seller_tg === db.me.tg_id).map((x) => ({ id: x.id, title: x.title, username: x.username, unread: x.unread, channel: x.channel ?? "tg" })),
  };
}

// ------------------------------------------------------------------ hisobot (backend erp/crm/reports.py bilan bir xil)
const FUNNEL = ["new", "offer", "contract", "payment", "production", "ready", "shipping", "won"];
function report(db: Db, q: F, now: number) {
  const today = iso(now).slice(0, 10);
  const from = q.get("from") || today.slice(0, 8) + "01";
  const to = q.get("to") || today;
  const inP = (x: string | null | undefined) => !!x && x.slice(0, 10) >= from && x.slice(0, 10) <= to;
  const mine = (o: number | null | undefined) => db.me.is_head || o === db.me.tg_id;
  const leadsP = db.leads.filter((l) => mine(l.owner_tg) && inP(l.created));
  const main = db.deals.filter((d) => mine(d.owner_tg) && stageOf(db, d.stage)?.pipeline === "main");
  const created = main.filter((d) => inP(d.created));
  const bought = main.filter((d) => BOUGHT.includes(d.stage) && inP(d.closed ?? d.stage_since));
  const lost = main.filter((d) => stageOf(db, d.stage)?.kind === "lost" && inP(d.closed));
  const open = main.filter((d) => stageOf(db, d.stage)?.kind === "open" && !BOUGHT.includes(d.stage));
  const reached = new Map(created.map((d) => [d.id, Math.max(0, FUNNEL.indexOf(d.stage))]));
  for (const h of db.history) if (reached.has(h.deal_id) && FUNNEL.includes(h.to_stage)) reached.set(h.deal_id, Math.max(reached.get(h.deal_id)!, FUNNEL.indexOf(h.to_stage)));
  const med = (xs: number[]) => (xs.length ? (([...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] + [...xs].sort((a, b) => a - b)[Math.ceil((xs.length - 1) / 2)]) / 2) : null);
  const resp = (ls: DbLead[]) => ls.filter((l) => l.first_touch).map((l) => (new Date(l.first_touch!).getTime() - new Date(l.created).getTime()) / 6e4).filter((m) => m >= 0);
  const sum = (ds: DbDeal[]) => String(ds.reduce((a, d) => a + d.amount, 0));
  const conv = (ls: DbLead[]) => ls.filter((l) => l.status === "converted").length;
  const who = db.users.filter((u) => db.me.is_head || u.tg_id === db.me.tg_id);
  const round = (x: number | null) => (x === null ? null : Math.round(x));
  const reasons = new Map<string, DbDeal[]>();
  for (const d of lost) reasons.set(d.lost_reason || "Sababsiz", [...(reasons.get(d.lost_reason || "Sababsiz") ?? []), d]);
  const sources = new Map<string, DbLead[]>();
  for (const l of leadsP) sources.set(l.source || "—", [...(sources.get(l.source || "—") ?? []), l]);
  return {
    from,
    to,
    head: db.me.is_head,
    kpi: {
      leads: leadsP.length,
      unassigned: db.me.is_head ? leadsP.filter((l) => !l.owner_tg).length : 0,
      response_min: round(med(resp(leadsP))),
      lead_conv: leadsP.length ? Math.round((conv(leadsP) / leadsP.length) * 100) : null,
      deals: created.length,
      won: bought.length,
      won_sum: sum(bought),
      lost: lost.length,
      win_rate: bought.length + lost.length ? Math.round((bought.length / (bought.length + lost.length)) * 100) : null,
      open_sum: sum(open),
    },
    funnel: FUNNEL.map((stage, i) => ({ stage, count: [...reached.values()].filter((r) => r >= i).length })),
    sellers: who.map((u) => {
      const ls = leadsP.filter((l) => l.owner_tg === u.tg_id);
      const won = bought.filter((d) => d.owner_tg === u.tg_id);
      return {
        tg_id: u.tg_id,
        name: u.name,
        leads: ls.length,
        response_min: round(med(resp(ls))),
        lead_conv: ls.length ? Math.round((conv(ls) / ls.length) * 100) : null,
        deals: created.filter((d) => d.owner_tg === u.tg_id).length,
        won: won.length,
        won_sum: sum(won),
        lost: lost.filter((d) => d.owner_tg === u.tg_id).length,
        open_sum: sum(open.filter((d) => d.owner_tg === u.tg_id)),
        overdue_tasks: db.activity.filter((a) => a.kind === "task" && !a.done_at && a.due && new Date(a.due).getTime() < now && a.assignee === u.tg_id).length,
      };
    }),
    reasons: [...reasons].sort((a, b) => b[1].length - a[1].length).map(([reason, ds]) => ({ reason, count: ds.length, sum: sum(ds) })),
    sources: [...sources].sort((a, b) => b[1].length - a[1].length).map(([source, ls]) => ({ source, leads: ls.length, converted: conv(ls) })),
  };
}

// ------------------------------------------------------------------ marshrutlar
export function handle(db: Db, method: "GET" | "POST", path: string, body: unknown, now: number): Res {
  const u = new URL(path, "http://demo.local");
  const p = u.pathname.replace(/\/+$/, "");
  const q = u.searchParams;
  const b = (body && typeof body === "object" ? body : {}) as B;
  const m = (re: RegExp) => re.exec(p);
  const C = "/app/api/erp/crm";
  let x: RegExpExecArray | null;

  if (method === "GET") {
    if (p === "/app/api/erp/me") return ok({ ...db.me });
    if (p === `${C}/meta`) return ok({ pipelines: db.pipelines, stages: db.stages, users: db.users, lost_reasons: db.lost_reasons });
    if (p === `${C}/views`) return ok(db.views.filter((v) => v.owner_tg === null || v.owner_tg === db.me.tg_id));
    if (p === `${C}/tags`) return ok([...new Set(db.deals.filter((d) => seesDeal(db, d)).flatMap((d) => d.tags))].sort());
    if (p === `${C}/board`) return ok(board(db, q, now));
    if (p === `${C}/deals`) return ok(list(db, q, now));
    if ((x = m(/^\/app\/api\/erp\/crm\/docs\/(\d+)$/))) {
      const doc = db.docs.find((y) => y.id === Number(x![1]));
      return doc && findDeal(db, doc.deal_id) ? ok(docFull(db, doc)) : fail(404, "Hujjat topilmadi");
    }
    if ((x = m(/^\/app\/api\/erp\/crm\/deals\/(\d+)$/))) {
      const d = findDeal(db, Number(x[1]));
      return d ? ok(detail(db, d, now)) : fail(404, "Bitim topilmadi");
    }
    if (m(/^\/app\/api\/erp\/crm\/docs\/\d+\/pdf$/)) return fail(501, "PDF demo rejimda mavjud emas");
    if (p === `${C}/items`) {
      const toks = lc(q.get("q")).split(/\s+/).filter(Boolean);
      return ok(db.catalog.filter((c) => toks.length && toks.every((t) => lc(`${c.name} ${c.char ?? ""}`).includes(t))).slice(0, 20));
    }
    if (p === `${C}/customers`) {
      const t = lc(q.get("q")).trim();
      const dg = digits(t);
      return ok(
        db.customers
          .filter((c) => seesCustomer(db, c))
          .filter((c) => t && (lc(c.name).includes(t) || lc(c.company ?? "").includes(t) || s(c.inn).includes(t) || (dg.length >= 4 && c.phones.some((ph) => ph.includes(dg)))))
          .slice(0, 20)
          .map((c) => ({ ...c, phones: [...c.phones] })),
      );
    }
    if (p === `${C}/leads`) return ok(leads(db, q));
    if (p === `${C}/customers/table`) return ok(custTable(db, q, now));
    if (p === `${C}/reports`) return ok(report(db, q, now));
    if (p === `${C}/routing`) return ok({ rules: (db.routing ?? []).map((r) => ({ ...r })) });
    if ((x = m(/^\/app\/api\/erp\/crm\/customers\/(\d+)$/))) {
      const c = db.customers.find((y) => y.id === Number(x![1]) && seesCustomer(db, y));
      return c ? ok(custCard(db, c)) : fail(404, "Mijoz topilmadi");
    }
    if (p === `${C}/goals`) return ok(goals(db, q.get("month") || "", now));
    if (p === `${C}/tg/chats`) return ok(tgList(db, q));
    if (p === `${C}/calls`) {
      const c = db.customers.find((y) => y.id === n(q.get("customer")) && seesCustomer(db, y));
      if (!c) return fail(404, "Mijoz topilmadi");
      return ok((db.calls ?? []).filter((x) => x.customer_id === c.id).sort((a, b) => b.started.localeCompare(a.started)).slice(0, 50));
    }
    if ((x = m(/^\/app\/api\/erp\/crm\/tg\/chats\/(\d+)\/messages$/))) {
      const c = tgChats(db).find((y) => y.id === Number(x![1]));
      if (!c) return fail(404, "Chat topilmadi");
      if (c.seller_tg === db.me.tg_id) c.unread = 0; // demo: GET ham holatni o'zgartiradi (backend kabi)
      return ok({ chat: tgChat(db, c), messages: db.tg_msgs.filter((y) => y.chat === c.id).slice(-50), more: false });
    }
    return fail(404, "Not Found");
  }

  // POST
  // demo: kim sifatida ishlash (rahbar yoki sotuvchi) — huquqlarni sinash uchun; rahbar — seed'dagi HEAD_TG
  if (p === `${C}/demo/as`) {
    const u = db.users.find((y) => y.tg_id === n(b.tg_id));
    if (!u) return fail(404, "Foydalanuvchi topilmadi");
    db.me = { tg_id: u.tg_id, name: u.name, is_head: u.tg_id === HEAD_TG };
    return ok({ ...db.me });
  }
  if (p === `${C}/views`) {
    const name = s(b.name).trim();
    if (!name) return fail(400, "Nomini yozing");
    const v = { id: nextId(db), name, owner_tg: b.team && db.me.is_head ? null : db.me.tg_id, query: (b.query ?? {}) as Record<string, unknown> };
    db.views.push(v);
    return ok(v);
  }
  if ((x = m(/^\/app\/api\/erp\/crm\/views\/(\d+)\/delete$/))) {
    const i = db.views.findIndex((v) => String(v.id) === x![1]);
    if (i < 0) return fail(404, "Ko'rinish topilmadi");
    const v = db.views[i];
    if (!(v.owner_tg === db.me.tg_id || (v.owner_tg === null && db.me.is_head))) return fail(403, "Bu ko'rinishni o'chirish huquqi yo'q");
    db.views.splice(i, 1);
    return ok({ ok: true });
  }
  if (p === `${C}/deals/bulk`) return bulk(db, b, now);
  if (p === `${C}/deals`) {
    if (!b.counterparty_id) return fail(400, "Mijozni tanlang");
    const c = db.customers.find((y) => y.id === n(b.counterparty_id));
    if (!c || !seesCustomer(db, c)) return fail(404, "Mijoz topilmadi");
    const tgc = b.tg_chat_id ? tgChats(db).find((y) => y.id === n(b.tg_chat_id)) : null;
    if (b.tg_chat_id && !tgc) return fail(404, "Chat topilmadi");
    if (tgc) tgc.customer_id = c.id;
    try {
      return ok(detail(db, newDeal(db, b, now), now));
    } catch (e) {
      return fail(400, (e as Error).message);
    }
  }
  if ((x = m(/^\/app\/api\/erp\/crm\/docs\/(\d+)\/(send|didox|didox-status)$/))) {
    const doc = db.docs.find((y) => y.id === Number(x![1]));
    if (!doc || !findDeal(db, doc.deal_id)) return fail(404, "Hujjat topilmadi");
    if (x[2] === "send") return sendDoc(db, doc, b, now);
    if (x[2] === "didox") return fail(503, "Didox ulanmagan — administrator DIDOX_PARTNER_TOKEN, DIDOX_TIN va DIDOX_PASSWORD kalitlarini qo'yishi kerak.");
    return fail(400, "Hujjat hali Didox'ga yuborilmagan.");
  }
  if ((x = m(/^\/app\/api\/erp\/crm\/docs\/(\d+)\/confirm$/))) {
    const doc = db.docs.find((y) => y.id === Number(x![1]));
    if (!doc || !findDeal(db, doc.deal_id)) return fail(404, "Hujjat topilmadi");
    if (doc.kind !== "order") return fail(400, "Faqat buyurtma qoralamasi tasdiqlanadi.");
    if (doc.status !== "draft") return fail(409, "Buyurtma allaqachon tasdiqlangan.");
    doc.status = "posted";
    doc.state = "confirmed";
    addAct(db, { deal_id: doc.deal_id, kind: "doc", text: `Buyurtma ${doc.number} tasdiqlandi`, due: null, assignee: null }, now);
    advance(db, findDeal(db, doc.deal_id)!, "contract", now, `buyurtma ${doc.number} tasdiqlandi`);
    return ok(docFull(db, doc));
  }
  if ((x = m(/^\/app\/api\/erp\/crm\/deals\/(\d+)\/payment$/))) {
    const d = findDeal(db, Number(x[1]));
    if (!d) return fail(404, "Bitim topilmadi");
    const amount = n(b.amount);
    if (amount <= 0) return fail(400, "To'lov summasi musbat bo'lsin.");
    d.paid_sum = (d.paid_sum ?? 0) + amount;
    addAct(db, { deal_id: d.id, kind: "payment", text: `To'lov: ${amount} so'm (${s(b.via) || "bank"})`, due: null, assignee: null }, now);
    const need = d.pay_terms === "half" ? d.amount / 2 : d.amount;
    if (["new", "offer", "later", "contract", "payment"].includes(d.stage) && d.paid_sum >= need) moveStage(db, d, "production", null, now);
    return ok(detail(db, d, now));
  }
  if ((x = m(/^\/app\/api\/erp\/crm\/deals\/(\d+)(?:\/(stage|items|doc))?$/))) {
    const d = findDeal(db, Number(x[1]));
    if (!d) return fail(404, "Bitim topilmadi");
    if (x[2] === "stage" && s(b.stage) === "later") {
      // «Keyinroq» — qayta bog'lanish sanasi majburiy (kun.oy.yil yoki yil-oy-kun)
      const m2 = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s(b.recall).trim());
      const day = m2 ? `${m2[3]}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}` : /^\d{4}-\d{2}-\d{2}/.test(s(b.recall)) ? s(b.recall).slice(0, 10) : "";
      if (!day) return fail(400, "Qayta bog'lanish sanasini kiriting (masalan, 15.12.2026).");
      if (day < iso(now).slice(0, 10)) return fail(400, "Qayta bog'lanish sanasi o'tib ketgan — bugun yoki keyingi kunni tanlang.");
      // soat (standart 10:00, mahalliy vaqt) va izoh — vazifa matnida
      const hm = /^(\d{1,2}):(\d{2})/.exec(s(b.recall_time).trim() || "10:00");
      if (!hm) return fail(400, "Soat noto'g'ri — masalan, 14:30.");
      const [y, mo, dd] = day.split("-").map(Number);
      const due = new Date(y, mo - 1, dd, Number(hm[1]), Number(hm[2]));
      if (due.getTime() < now) return fail(400, "Bu vaqt o'tib ketgan — keyingi soat yoki kunni tanlang.");
      const note = s(b.recall_note).trim().slice(0, 500);
      const e = moveStage(db, d, "later", null, now);
      if (e) return fail(400, e);
      addAct(db, { deal_id: d.id, kind: "task", text: note ? `Mijoz bilan qayta bog'lanish: ${note}` : "Mijoz bilan qayta bog'lanish (keyinroq degan)", due: due.toISOString(), assignee: d.owner_tg }, now);
      return ok(detail(db, d, now));
    }
    if (x[2] === "stage") {
      const e = moveStage(db, d, s(b.stage), s(b.reason) || null, now);
      return e ? fail(400, e) : ok(detail(db, d, now));
    }
    if (x[2] === "items") return ok(saveItems(d, b, now));
    if (x[2] === "doc") return makeDoc(db, d, s(b.kind), now);
    if ("owner_tg" in b && !db.me.is_head && nOrNull(b.owner_tg) !== d.owner_tg) return fail(403, "Mas'ulni faqat sotuv bo'limi rahbari o'zgartiradi");
    const pe = patchDeal(db, d, b, now);
    return pe ? fail(400, pe) : ok(detail(db, d, now));
  }
  if ((x = m(/^\/app\/api\/erp\/crm\/customers\/(\d+)$/))) {
    const c = db.customers.find((y) => y.id === Number(x![1]) && seesCustomer(db, y));
    if (!c) return fail(404, "Mijoz topilmadi");
    if ("owner_tg" in b && nOrNull(b.owner_tg) !== c.owner_tg && !db.me.is_head) return fail(403, "Mijoz mas'ulini faqat sotuv bo'limi rahbari o'zgartiradi");
    if ("name" in b && s(b.name).trim()) c.name = s(b.name).trim();
    const f = custFields(b, c);
    if (typeof f === "string") return fail(400, f);
    Object.assign(c, f);
    if (Array.isArray(b.contacts)) c.contacts = (b.contacts as B[]).map((y) => ({ name: s(y.name).trim(), role: s(y.role).trim(), phone: ((p) => (p.length === 9 ? "998" + p : p))(digits(y.phone)) })).filter((y) => y.name || y.phone);
    if ("note" in b) c.note = s(b.note);
    if ("owner_tg" in b) c.owner_tg = nOrNull(b.owner_tg);
    return ok(custCard(db, c));
  }
  if (p === `${C}/customers`) {
    const name = s(b.name).trim();
    if (!name) return fail(400, "Mijoz nomini yozing");
    const f = custFields({ phones: [], ...b }, null);
    if (typeof f === "string") return fail(400, f);
    if (!f.phones?.length) return fail(400, "Telefon raqamini yozing.");
    if (innRequired((f.kind ?? "company") as CustKind) && !f.inn) return fail(400, "STIR raqamini yozing.");
    const twin = f.inn ? db.customers.find((y) => y.inn === f.inn && seesCustomer(db, y)) : null;
    if (twin) return fail(409, `Bu STIR bilan mijoz bor: «${twin.name}» — ro'yxatdan tanlang.`);
    const c: DbCustomer = { id: nextId(db), name, inn: null, phones: [], owner_tg: db.me.is_head ? (nOrNull(b.owner_tg) ?? db.me.tg_id) : db.me.tg_id, ...f };
    db.customers.push(c);
    return ok(c);
  }
  if (p === `${C}/activity`) {
    const d = findDeal(db, n(b.deal_id));
    if (!d) return fail(404, "Bitim topilmadi");
    const kind = s(b.kind) || "comment";
    if (!s(b.text).trim()) return fail(400, "Matn bo'sh");
    if (kind === "task" && !b.due) return fail(400, "Muddatni tanlang");
    const a = addAct(db, { deal_id: d.id, kind, text: s(b.text).trim(), due: kind === "task" ? s(b.due) : null, assignee: kind === "task" ? (nOrNull(b.assignee) ?? db.me.tg_id) : null }, now);
    return ok(a);
  }
  if ((x = m(/^\/app\/api\/erp\/crm\/tasks\/(\d+)\/done$/))) {
    const a = db.activity.find((y) => y.id === Number(x![1]) && y.kind === "task" && (y.assignee === db.me.tg_id || !!findDeal(db, y.deal_id)));
    if (!a) return fail(404, "Vazifa topilmadi");
    a.done_at = a.done_at ?? iso(now);
    const res = s(b.result).trim();
    if (res) a.data = { ...(a.data ?? {}), result: res };
    return ok(a);
  }
  if (p === `${C}/leads`) return newLead(db, b, now);
  if ((x = m(/^\/app\/api\/erp\/crm\/leads\/(\d+)\/(assign|convert|junk|status|edit|noanswer)$/))) {
    const l = db.leads.find((y) => y.id === Number(x![1]) && seesOwner(db, y.owner_tg));
    if (!l) return fail(404, "Lid topilmadi");
    if (x[2] === "assign") {
      if (!db.me.is_head) return fail(403, "Lidlarni faqat sotuv bo'limi rahbari taqsimlaydi");
      l.owner_tg = n(b.owner_tg) || null;
      if (l.status === "new" && l.owner_tg) l.status = "work";
      return ok({ ...l });
    }
    if (x[2] === "edit") {
      for (const k of ["name", "company", "product", "size", "qty", "note", "source"] as const) if (k in b) (l as Record<string, unknown>)[k] = s(b[k]).trim() || null;
      if ("inn" in b) {
        const inn = digits(b.inn);
        if (inn && ![9, 14].includes(inn.length)) return fail(400, "STIR 9 xonali (yuridik) yoki JSHSHIR 14 xonali bo'lsin.");
        l.inn = inn || null;
      }
      return ok({ ...l });
    }
    if (x[2] === "noanswer") {
      const days = [1, 3, 7];
      l.no_answer = (l.no_answer ?? 0) + 1;
      l.first_touch = l.first_touch ?? iso(now);
      if (l.no_answer > days.length) {
        l.status = "junk";
        l.junk_reason = "Javob bermadi (3 marta qayta qo'ng'iroq)";
        l.next_call_at = null;
      } else {
        l.next_call_at = iso(now + days[l.no_answer - 1] * 864e5);
        if (l.status === "new") l.status = "work";
      }
      return ok({ ...l });
    }
    if (x[2] === "status") {
      const ns = s(b.status);
      if (!["new", "work", "interested"].includes(ns)) return fail(400, "Bosqich noto'g'ri: yangi, ishda yoki qiziqish bildirdi.");
      if (!["new", "work", "interested"].includes(l.status)) return fail(400, "Yopilgan lidni qayta ochib bo'lmaydi.");
      l.status = ns;
      if (ns !== "new") l.first_touch = l.first_touch ?? iso(now);
      return ok({ ...l });
    }
    if (x[2] === "junk") {
      l.status = "junk";
      l.junk_reason = s(b.reason) || null;
      return ok({ ...l });
    }
    return convertLead(db, l, now);
  }
  if ((x = m(/^\/app\/api\/erp\/crm\/tg\/chats\/(\d+)\/send-file$/))) {
    // demo: fayl Telegram'ga bormaydi — xabar turi va nomi saqlanadi (ko'rsatish uchun fayl yo'q)
    const c = tgChats(db).find((y) => y.id === Number(x![1]));
    if (!c) return fail(404, "Chat topilmadi");
    if (!c.can_reply) return fail(403, "Bot javob yoza olmaydi: Telegram Business'da «Xabarlarga javob berish» ni yoqing.");
    const f = (b.file ?? null) as { name?: string; type?: string; size?: number } | null;
    if (!f) return fail(400, "Faylni tanlang.");
    const t = s(f.type);
    const kind = t.startsWith("image/") ? "photo" : t === "video/mp4" ? "video" : t.startsWith("audio/") ? "audio" : "document";
    const msg: DbTgMsg = { id: nextId(db), chat: c.id, out: true, kind, text: s(b.caption).trim(), date: iso(now), edited: false, deleted: false, via_crm: true, media: { name: s(f.name), mime: t, size: n(f.size) } };
    db.tg_msgs.push(msg);
    c.unread = 0;
    return ok(msg);
  }
  if ((x = m(/^\/app\/api\/erp\/crm\/tg\/chats\/(\d+)\/link$/))) {
    const c = tgChats(db).find((y) => y.id === Number(x![1]));
    if (!c) return fail(404, "Chat topilmadi");
    const cu = b.customer_id ? db.customers.find((y) => y.id === n(b.customer_id) && seesCustomer(db, y)) : null;
    if (b.customer_id && !cu) return fail(404, "Mijoz topilmadi");
    c.customer_id = cu ? cu.id : null;
    return ok(tgChat(db, c));
  }
  if (p === `${C}/calls`) {
    // qo'lda yozilgan qo'ng'iroq (backend calls.log_manual bilan bir xil)
    const cu = db.customers.find((y) => y.id === n(b.customer_id) && seesCustomer(db, y));
    if (!cu) return fail(404, "Mijoz topilmadi");
    const dir = s(b.direction) || "out";
    const st = s(b.status) || "answered";
    if (!["in", "out"].includes(dir) || !["answered", "missed", "busy"].includes(st)) return fail(400, "Qo'ng'iroq turi yoki natijasi noto'g'ri.");
    const phone = digits(b.phone) || cu.phones[0] || "";
    if (!phone) return fail(400, "Telefon raqami yo'q — mijozga telefon qo'shing yoki raqamni yozing.");
    const deal = db.deals.find((y) => y.id === n(b.deal_id) && y.counterparty_id === cu.id) ?? null;
    const call = {
      id: nextId(db),
      customer_id: cu.id,
      deal_id: deal?.id ?? null,
      phone,
      direction: dir as "in" | "out",
      status: st as "answered" | "missed" | "busy",
      started: iso(now),
      duration: st === "answered" ? Math.max(0, n(b.duration)) : 0,
      recording_url: null,
      owner_tg: db.me.tg_id,
      note: s(b.note).trim() || null,
      source: "manual",
    };
    (db.calls ??= []).push(call);
    if (deal) {
      const mm = `${Math.floor(call.duration / 60)}:${String(call.duration % 60).padStart(2, "0")}`;
      const res = { answered: `gaplashildi ${mm}`, missed: "javob berilmadi", busy: "band" }[call.status];
      addAct(db, { deal_id: deal.id, kind: "call", text: `${dir === "in" ? "Kiruvchi" : "Chiquvchi"} qo'ng'iroq +${phone}: ${res}${call.note ? ` — ${call.note}` : ""}`, due: null, assignee: null }, now);
    }
    return ok(call);
  }
  if ((x = m(/^\/app\/api\/erp\/crm\/tg\/chats\/(\d+)\/send$/))) {
    const c = tgChats(db).find((y) => y.id === Number(x![1]));
    if (!c) return fail(404, "Chat topilmadi");
    if (c.seller_tg !== db.me.tg_id) return fail(403, "Javobni faqat chat egasi — sotuvchining o'zi yozadi.");
    if (!c.can_reply) return fail(403, "Bot javob yoza olmaydi: Telegram → Sozlamalar → Telegram Business → Chat-botlar → «Xabarlarga javob berish» ni yoqing.");
    const text = s(b.text).trim();
    const loc = b.latitude !== undefined ? { lat: n(b.latitude), lon: n(b.longitude) } : null;
    if (!text && !loc) return fail(400, "Xabar bo'sh.");
    const rm = b.reply_to ? db.tg_msgs.find((y) => y.chat === c.id && y.id === n(b.reply_to)) : null;
    if (b.reply_to && !rm) return fail(400, "Javob beriladigan xabar topilmadi.");
    const reply = rm ? { text: (rm.text || KINDS[rm.kind] || "").slice(0, 200), kind: rm.kind, out: rm.out, ref: rm.id } : null;
    const msg: DbTgMsg = { id: nextId(db), chat: c.id, out: true, kind: loc ? "location" : "text", text, date: iso(now), edited: false, deleted: false, via_crm: true, media: loc, reply };
    db.tg_msgs.push(msg);
    c.unread = 0;
    return ok(msg);
  }
  if (p === `${C}/routing`) {
    if (!db.me.is_head) return fail(403, "Taqsimlash qoidalarini sotuv bo'limi rahbari belgilaydi");
    const rows = Array.isArray(b.rules) ? (b.rules as B[]) : [];
    const bad = rows.findIndex((r) => !["product", "region"].includes(s(r.kind)) || !s(r.keywords).trim() || !n(r.seller_tg));
    if (bad >= 0) return fail(400, `${bad + 1}-qoida to'liq emas: turi, kalit so'zlar va sotuvchi kerak.`);
    db.routing = rows.map((r) => ({ kind: s(r.kind) as "product" | "region", keywords: s(r.keywords).trim(), seller_tg: n(r.seller_tg) }));
    return ok({ rules: db.routing });
  }
  if (p === `${C}/goals`) {
    const tg = n(b.owner_tg);
    const month = s(b.month).slice(0, 7) + "-01";
    if (!tg || !/^\d{4}-\d{2}-01$/.test(month)) return fail(400, "Sotuvchi yoki oy noto'g'ri");
    const g = db.goals.find((y) => y.owner_tg === tg && y.month === month);
    if (g) g.amount = n(b.amount);
    else db.goals.push({ owner_tg: tg, month, amount: n(b.amount) });
    return ok({ ok: true });
  }
  return fail(404, "Not Found");
}

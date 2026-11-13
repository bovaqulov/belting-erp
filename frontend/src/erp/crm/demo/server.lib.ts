// Brauzer ichidagi soxta CRM backend: Jarvis kontrakti bilan bir xil yo'llar va JSON shakllari, holat haqiqatan
// o'zgaradi (Db obyekti joyida). Filtr, saralash, sahifalash, "chirigan"/300+ kun mantiqi — shu yerda hisoblanadi.
// handle() sof: tarmoq yo'q, vaqt `now` bilan beriladi.
import { days, itemAmount, type Deal, type DealItem } from "@/erp/crm/lib";

import type { Db, DbAct, DbDeal, DbLead } from "./seed.lib";

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
  };
}

// ------------------------------------------------------------------ filtrlar
type F = URLSearchParams;
function matches(db: Db, d: DbDeal, r: Deal, q: F, now: number): boolean {
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
    bx_id: d.bx_id,
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
export function moveStage(db: Db, d: DbDeal, code: string, reason: string | null, now: number): string | null {
  const st = stageOf(db, code);
  if (!st) return "Bunday bosqich yo'q";
  if (st.kind === "lost" && !reason) return "Rad etish sababini tanlang";
  if (d.stage === code) return null;
  const ts = iso(now);
  db.history.push({ deal_id: d.id, ts, actor: db.me.tg_id, from_stage: d.stage, to_stage: code, src: "web", reason: st.kind === "lost" ? reason : null });
  d.stage = code;
  d.stage_since = ts;
  d.updated = ts;
  d.closed = st.kind === "open" ? null : ts;
  d.lost_reason = st.kind === "lost" ? reason : null;
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
  const d: DbDeal = {
    id: nextId(db),
    title: s(b.title).trim() || "Yangi bitim",
    counterparty_id: nOrNull(b.counterparty_id),
    owner_tg: nOrNull(b.owner_tg) ?? db.me.tg_id,
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
    bx_id: null,
    items: [],
  };
  db.deals.push(d);
  db.history.push({ deal_id: d.id, ts, actor: db.me.tg_id, from_stage: null, to_stage: first.code, src: "web" });
  return d;
}

const DEAL_FIELDS = ["title", "amount", "close_date", "probability", "owner_tg", "source", "need"] as const;
function patchDeal(d: DbDeal, b: B, now: number) {
  for (const k of DEAL_FIELDS) {
    if (!(k in b)) continue;
    const v = b[k];
    if (k === "title") d.title = s(v).trim() || d.title;
    else if (k === "amount") d.amount = n(v);
    else if (k === "probability") d.probability = nOrNull(v);
    else if (k === "owner_tg") d.owner_tg = nOrNull(v);
    else if (k === "close_date") d.close_date = s(v) || null;
    else if (k === "source") d.source = s(v) || null;
    else d.need = s(v) || null;
  }
  d.updated = iso(now);
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
  d.amount = Math.round(d.items.reduce((a, x) => a + itemAmount(x), 0));
  d.updated = iso(now);
  return { items: d.items, amount: String(d.amount) };
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
    total: Math.round(items.reduce((a, x) => a + itemAmount(x), 0)),
  };
  db.docs.push(doc);
  addAct(db, { deal_id: d.id, kind: "doc", text: `${kind === "quote" ? "Tijorat taklifi" : "Buyurtma qoralamasi"} ${doc.number}`, due: null, assignee: null }, now);
  d.updated = iso(now);
  return ok({ ...doc, total: String(doc.total) });
}

function bulk(db: Db, b: B, now: number): Res {
  const ids = Array.isArray(b.ids) ? (b.ids as unknown[]).map(n) : [];
  const action = s(b.action);
  const errors: { id: number; error: string }[] = [];
  let done = 0;
  for (const id of ids) {
    const d = db.deals.find((x) => x.id === id);
    if (!d) {
      errors.push({ id, error: "Bitim topilmadi" });
      continue;
    }
    let e: string | null = null;
    if (action === "stage") e = moveStage(db, d, s(b.value), s(b.reason) || null, now);
    else if (action === "owner") d.owner_tg = n(b.value);
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
  const st = (q.get("status") || "new,work").split(",").filter(Boolean);
  const owner = q.get("owner") || "";
  const t = lc(q.get("q")).trim();
  return db.leads
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
    const dup = db.leads.find((l) => ["new", "work"].includes(l.status) && phoneKey(l.phone) === key);
    if (dup) {
      if (note) dup.note = dup.note ? `${dup.note}\n${note}` : note;
      return ok({ ...dup, duplicate: true });
    }
  }
  const l: DbLead = {
    id: nextId(db),
    created: iso(now),
    title: null,
    name: s(b.name).trim() || null,
    company: s(b.company).trim() || null,
    note,
    phone: full,
    source: s(b.source) || "manual",
    owner_tg: nOrNull(b.owner_tg),
    status: b.owner_tg ? "work" : "new",
    deal_id: null,
    first_touch: null,
  };
  db.leads.push(l);
  return ok({ ...l, duplicate: false });
}

function convertLead(db: Db, l: DbLead, now: number): Res {
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
    if (p === `${C}/tags`) return ok([...new Set(db.deals.flatMap((d) => d.tags))].sort());
    if (p === `${C}/board`) return ok(board(db, q, now));
    if (p === `${C}/deals`) return ok(list(db, q, now));
    if ((x = m(/^\/app\/api\/erp\/crm\/deals\/(\d+)$/))) {
      const d = db.deals.find((y) => y.id === Number(x![1]));
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
          .filter((c) => t && (lc(c.name).includes(t) || s(c.inn).includes(t) || (dg.length >= 4 && c.phones.some((ph) => ph.includes(dg)))))
          .slice(0, 20)
          .map((c) => ({ ...c, phones: [...c.phones] })),
      );
    }
    if (p === `${C}/leads`) return ok(leads(db, q));
    if (p === `${C}/goals`) return ok(goals(db, q.get("month") || "", now));
    return fail(404, "Not Found");
  }

  // POST
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
    return ok(detail(db, newDeal(db, b, now), now));
  }
  if ((x = m(/^\/app\/api\/erp\/crm\/deals\/(\d+)(?:\/(stage|items|doc))?$/))) {
    const d = db.deals.find((y) => y.id === Number(x![1]));
    if (!d) return fail(404, "Bitim topilmadi");
    if (x[2] === "stage") {
      const e = moveStage(db, d, s(b.stage), s(b.reason) || null, now);
      return e ? fail(400, e) : ok(detail(db, d, now));
    }
    if (x[2] === "items") return ok(saveItems(d, b, now));
    if (x[2] === "doc") return makeDoc(db, d, s(b.kind), now);
    patchDeal(d, b, now);
    return ok(detail(db, d, now));
  }
  if (p === `${C}/customers`) {
    const name = s(b.name).trim();
    if (!name) return fail(400, "Mijoz nomini yozing");
    const c = { id: nextId(db), name, inn: null, phones: Array.isArray(b.phones) ? (b.phones as unknown[]).map(s) : [], owner_tg: nOrNull(b.owner_tg) ?? db.me.tg_id };
    db.customers.push(c);
    return ok(c);
  }
  if (p === `${C}/activity`) {
    const d = db.deals.find((y) => y.id === n(b.deal_id));
    if (!d) return fail(404, "Bitim topilmadi");
    const kind = s(b.kind) || "comment";
    if (!s(b.text).trim()) return fail(400, "Matn bo'sh");
    if (kind === "task" && !b.due) return fail(400, "Muddatni tanlang");
    const a = addAct(db, { deal_id: d.id, kind, text: s(b.text).trim(), due: kind === "task" ? s(b.due) : null, assignee: kind === "task" ? (nOrNull(b.assignee) ?? db.me.tg_id) : null }, now);
    return ok(a);
  }
  if ((x = m(/^\/app\/api\/erp\/crm\/tasks\/(\d+)\/done$/))) {
    const a = db.activity.find((y) => y.id === Number(x![1]) && y.kind === "task");
    if (!a) return fail(404, "Vazifa topilmadi");
    a.done_at = a.done_at ?? iso(now);
    const res = s(b.result).trim();
    if (res) a.data = { ...(a.data ?? {}), result: res };
    return ok(a);
  }
  if (p === `${C}/leads`) return newLead(db, b, now);
  if ((x = m(/^\/app\/api\/erp\/crm\/leads\/(\d+)\/(assign|convert|junk)$/))) {
    const l = db.leads.find((y) => y.id === Number(x![1]));
    if (!l) return fail(404, "Lid topilmadi");
    if (x[2] === "assign") {
      l.owner_tg = n(b.owner_tg) || null;
      if (l.status === "new" && l.owner_tg) l.status = "work";
      return ok({ ...l });
    }
    if (x[2] === "junk") {
      l.status = "junk";
      l.junk_reason = s(b.reason) || null;
      return ok({ ...l });
    }
    return convertLead(db, l, now);
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

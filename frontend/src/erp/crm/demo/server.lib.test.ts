import { describe, expect, it } from "vitest";

import { decideMode, decideModeAll } from "./mode.lib";
import { DB_VERSION, seed, type Db } from "./seed.lib";
import { handle, phoneKey, seesCustomer } from "./server.lib";
import { DEMO_KEY, makeStore, type KV } from "./store.lib";

const NOW = new Date("2026-11-13T09:00:00Z").getTime();
const C = "/app/api/erp/crm";
const get = <T,>(db: Db, p: string) => handle(db, "GET", p, undefined, NOW).body as T;
const post = <T,>(db: Db, p: string, b: unknown, now = NOW) => handle(db, "POST", p, b, now) as { status: number; body: T };

type Row = { id: number; stage: string; amount: string; updated: string; touched: string };
type List = { rows: Row[]; total: number; counts: Record<string, number> };

describe("demo seed", () => {
  it("realistik hajm va doimiylik", () => {
    const db = seed(NOW);
    expect(db.deals.length).toBeGreaterThanOrEqual(25);
    expect(db.deals.length).toBeLessThanOrEqual(40);
    expect(db.pipelines.map((p) => p.name)).toEqual(["Sales"]); // CRM — faqat Sales
    expect(db.me.is_head).toBe(true);
    expect(JSON.stringify(seed(NOW))).toBe(JSON.stringify(db));
  });
});

describe("demo server", () => {
  it("bosqichga o'tkazish + tarix; lost — sababsiz rad", () => {
    const db = seed(NOW);
    const d = db.deals.find((x) => x.stage === "new")!;
    const r = post<{ stage: string; stages: { from_stage: string | null; to_stage: string }[] }>(db, `${C}/deals/${d.id}/stage`, { stage: "offer" }, NOW + 1000);
    expect(r.status).toBe(200);
    expect(r.body.stage).toBe("offer");
    expect(r.body.stages.at(-1)).toMatchObject({ from_stage: "new", to_stage: "offer" });
    expect(post(db, `${C}/deals/${d.id}/stage`, { stage: "lost" }).status).toBe(400);
    const l = post<{ lost_reason: string; closed: string }>(db, `${C}/deals/${d.id}/stage`, { stage: "lost", reason: "Qimmat" });
    expect(l.body.lost_reason).toBe("Qimmat");
    expect(l.body.closed).toBeTruthy();
  });

  it("taqsimlanmagan lidlar: holat berilmasa faqat ochiqlar (Jarvis standarti)", () => {
    const db = seed(NOW);
    db.leads.push({ ...db.leads[0], id: 9999, status: "junk", owner_tg: null });
    const none = get<{ id: number; status: string }[]>(db, `${C}/leads?owner=none`);
    expect(none.every((l) => ["new", "work"].includes(l.status))).toBe(true);
    expect(none.some((l) => l.id === 9999)).toBe(false);
    expect(get<unknown[]>(db, `${C}/leads?owner=none&status=junk`).length).toBeGreaterThan(0);
  });

  it("lidni bitimga aylantirish", () => {
    const db = seed(NOW);
    const lead = db.leads.find((x) => x.status === "new" && !x.owner_tg)!;
    const n0 = db.deals.length;
    const bad = post<{ detail: string }>(db, `${C}/leads/${lead.id}/convert`, {});
    expect(bad.status).toBe(400); // kvalifikatsiyasiz — yo'q
    expect(bad.body.detail).toContain("tasma turi");
    post(db, `${C}/leads/${lead.id}/edit`, { product: "SPB 1650", company: "Chinoz Un MChJ" });
    const r = post<{ id: number; stage: string; customer: string }>(db, `${C}/leads/${lead.id}/convert`, {});
    expect(r.status).toBe(200);
    expect(db.deals.length).toBe(n0 + 1);
    expect(r.body.stage).toBe("new");
    expect(db.leads.find((x) => x.id === lead.id)).toMatchObject({ status: "converted", deal_id: r.body.id });
    expect(post(db, `${C}/leads/${lead.id}/convert`, {}).status).toBe(400);
  });

  it("telefon takrori: oxirgi 9 raqam bo'yicha", () => {
    expect(phoneKey("+998 90 123-45-67")).toBe(phoneKey("901234567"));
    const db = seed(NOW);
    const n0 = db.leads.length;
    const a = post<{ id: number; duplicate: boolean }>(db, `${C}/leads`, { name: "Test", phone: "93 777 11 22", note: "birinchi" });
    expect(a.body.duplicate).toBe(false);
    const b = post<{ id: number; duplicate: boolean; note: string }>(db, `${C}/leads`, { name: "Test2", phone: "+998937771122", note: "ikkinchi" });
    expect(b.body.duplicate).toBe(true);
    expect(b.body.id).toBe(a.body.id);
    expect(b.body.note).toContain("ikkinchi");
    expect(db.leads.length).toBe(n0 + 1);
  });

  it("filtrlar, saralash, sahifalash, 300+ kun", () => {
    const db = seed(NOW);
    const all = get<List>(db, `${C}/deals?kind=all&limit=200`);
    expect(all.total).toBe(db.deals.length);
    const p1 = get<List>(db, `${C}/deals?kind=all&limit=10&offset=0`);
    const p2 = get<List>(db, `${C}/deals?kind=all&limit=10&offset=10`);
    expect(p1.rows).toHaveLength(10);
    expect(new Set([...p1.rows, ...p2.rows].map((r) => r.id)).size).toBe(20);
    const amt = get<List>(db, `${C}/deals?kind=all&sort=amount&limit=200`).rows.map((r) => Number(r.amount));
    expect(amt).toEqual([...amt].sort((x, y) => y - x));
    const old = get<List>(db, `${C}/deals?idle=300&limit=50`);
    expect(old.total).toBe(3);
    const mine = get<List>(db, `${C}/deals?kind=all&owner=1002&limit=200`);
    expect(mine.rows.every((r) => db.deals.find((d) => d.id === r.id)!.owner_tg === 1002)).toBe(true);
    const won = get<List>(db, `${C}/deals?kind=won&limit=200`);
    expect(won.rows.every((r) => r.stage === "won")).toBe(true);
    const byId = get<List>(db, `${C}/deals?kind=all&q=%23${db.deals[4].id}`);
    expect(byId.rows.map((r) => r.id)).toContain(db.deals[4].id);
    const b = get<{ stages: { code: string; count: number; deals: unknown[] }[]; counts: Record<string, number> }>(db, `${C}/board?pipeline=main`);
    expect(b.stages.reduce((a, x) => a + x.count, 0)).toBe(b.counts.main);
  });

  it("tovarlar → summa; taklif hujjati; vazifa bajarildi", () => {
    const db = seed(NOW);
    const d = db.deals.find((x) => x.stage === "offer")!;
    const r = post<{ amount: string }>(db, `${C}/deals/${d.id}/items`, { items: [{ item_id: 1, name: "SPB", qty: "2", price: "1000", discount: "10" }] });
    expect(r.body.amount).toBe("1800");
    expect(post<{ number: string }>(db, `${C}/deals/${d.id}/doc`, { kind: "quote" }).body.number).toMatch(/^BR-TT-26-/);
    const t = post<{ id: number }>(db, `${C}/activity`, { deal_id: d.id, kind: "task", text: "Qo'ng'iroq", due: new Date(NOW + 864e5).toISOString() });
    expect(post<{ done_at: string; data: { result: string } }>(db, `${C}/tasks/${t.body.id}/done`, { result: "ok" }).body.data.result).toBe("ok");
    expect(handle(db, "GET", `${C}/docs/1/pdf`, undefined, NOW).status).toBe(501);
  });

  it("ommaviy amal: teg va mas'ul", () => {
    const db = seed(NOW);
    const ids = db.deals.slice(0, 3).map((d) => d.id);
    expect(post<{ ok: number }>(db, `${C}/deals/bulk`, { ids, action: "tag_add", value: "demo" }).body.ok).toBe(3);
    expect(get<string[]>(db, `${C}/tags`)).toContain("demo");
    post(db, `${C}/deals/bulk`, { ids, action: "owner", value: 1004 });
    expect(db.deals.slice(0, 3).every((d) => d.owner_tg === 1004)).toBe(true);
  });
});

describe("demo store", () => {
  const mem = (): KV & { m: Map<string, string> } => {
    const m = new Map<string, string>();
    return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  };
  it("saqlash → qayta yuklash (aylanma)", () => {
    const kv = mem();
    const st = makeStore<Db>(kv, DB_VERSION);
    const db = st.load(() => seed(NOW));
    post(db, `${C}/deals/${db.deals[0].id}`, { title: "O'zgargan nom" });
    st.save(db);
    expect(kv.m.has(DEMO_KEY)).toBe(true);
    const again = makeStore<Db>(kv, DB_VERSION).load(() => seed(NOW));
    expect(again.deals[0].title).toBe(`#${db.deals[0].id} O'zgargan nom`);
  });
  it("storage xato bersa — xotirada ishlaydi; eski versiya — qayta seed", () => {
    const bad: KV = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const st = makeStore<Db>(bad, DB_VERSION);
    const db = st.load(() => seed(NOW));
    db.deals[0].title = "X";
    st.save(db);
    expect(st.load(() => seed(NOW)).deals[0].title).toBe("X");
    const kv = mem();
    kv.setItem(DEMO_KEY, JSON.stringify({ v: 0 }));
    expect(makeStore<Db>(kv, DB_VERSION).load(() => seed(NOW)).v).toBe(DB_VERSION);
  });
});

describe("probe qarori", () => {
  it("404/tarmoq/5xx → demo; 200/401/403 → haqiqiy", () => {
    expect(decideMode(404)).toBe("demo");
    expect(decideMode("network")).toBe("demo");
    expect(decideMode(502)).toBe("demo");
    expect(decideMode(500)).toBe("demo");
    expect(decideMode(200)).toBe("real");
    expect(decideMode(401)).toBe("real");
    expect(decideMode(403)).toBe("real");
    // ishga tushishdagi ikkala so'rov: bittasi yo'q bo'lsa ham demo (erp/me 404 — sahifa to'xtab qolmasin)
    expect(decideModeAll([404, 200])).toBe("demo");
    expect(decideModeAll([200, "network"])).toBe("demo");
    expect(decideModeAll([401, 401])).toBe("real");
    expect(decideModeAll([200, 403])).toBe("real");
  });
});

describe("demo server: ko'rish huquqi", () => {
  type Lead = { id: number; owner_tg: number | null };
  type Cust = { id: number; owner_tg: number | null };
  const asSeller = (db: Db) => {
    const r = post<{ tg_id: number; is_head: boolean }>(db, `${C}/demo/as`, { tg_id: 1002 });
    expect(r.body.is_head).toBe(false);
    return r.body.tg_id;
  };

  it("sotuvchi — faqat o'z bitimlari; boshqasining bitimi 404", () => {
    const db = seed(NOW);
    const all = get<List>(db, `${C}/deals?kind=all&limit=500`).total;
    const me = asSeller(db);
    const mine = get<List>(db, `${C}/deals?kind=all&limit=500`);
    expect(mine.total).toBeGreaterThan(0);
    expect(mine.total).toBeLessThan(all);
    expect(mine.rows.every((r) => db.deals.find((d) => d.id === r.id)!.owner_tg === me)).toBe(true);
    const other = db.deals.find((d) => d.owner_tg !== me)!;
    expect(handle(db, "GET", `${C}/deals/${other.id}`, undefined, NOW).status).toBe(404);
    expect(post(db, `${C}/deals/${other.id}/stage`, { stage: "offer" }).status).toBe(404);
  });

  it("sotuvchi — faqat o'z mijozlari; boshqasining mijoziga bitim ochib bo'lmaydi", () => {
    const db = seed(NOW);
    const me = asSeller(db);
    const own = (c: Cust) => c.owner_tg === me || db.deals.some((d) => d.counterparty_id === c.id && d.owner_tg === me);
    const found = get<Cust[]>(db, `${C}/customers?q=a`);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every(own)).toBe(true);
    const foreign = db.customers.find((c) => !own(c))!;
    expect(post(db, `${C}/deals`, { counterparty_id: foreign.id, title: "x" }).status).toBe(404);
  });

  it("sotuvchi — mas'ulni o'zgartira olmaydi, yangi bitim o'ziga yoziladi", () => {
    const db = seed(NOW);
    const me = asSeller(db);
    const d = db.deals.find((x) => x.owner_tg === me)!;
    expect(post(db, `${C}/deals/${d.id}`, { owner_tg: 1003 }).status).toBe(403);
    const c = db.customers.find((x) => x.owner_tg === me)!;
    const r = post<{ owner_tg: number }>(db, `${C}/deals`, { counterparty_id: c.id, title: "Yangi", owner_tg: 1003 });
    expect(r.body.owner_tg).toBe(me);
    // tovarlar bilan yaratish — summa tovarlardan, nomda unikal raqam
    const w = post<{ id: number; title: string; amount: string; items: { name: string }[] }>(db, `${C}/deals`, {
      counterparty_id: c.id,
      title: "Tovarli",
      amount: 5,
      items: [{ name: "SPB 1650", qty: "2", price: "185000", discount: 0 }],
    }).body;
    expect([w.title, w.amount, w.items.map((x) => x.name)]).toEqual([`#${w.id} Tovarli`, "370000", ["SPB 1650"]]);
  });

  it("lidlar: sotuvchi faqat o'zinikini ko'radi va taqsimlay olmaydi; rahbar hammasini ko'radi va taqsimlaydi", () => {
    const db = seed(NOW);
    const head = get<Lead[]>(db, `${C}/leads`);
    const free = head.find((l) => !l.owner_tg)!;
    expect(free).toBeTruthy();
    const me = asSeller(db);
    const mine = get<Lead[]>(db, `${C}/leads?owner=none`);
    expect(mine.every((l) => l.owner_tg === me)).toBe(true);
    expect(mine.length).toBeLessThan(head.length);
    expect(post(db, `${C}/leads/${free.id}/assign`, { owner_tg: me }).status).toBe(404);
    const own = mine[0] ?? db.leads.find((l) => l.owner_tg === me);
    if (own) expect(post(db, `${C}/leads/${own.id}/assign`, { owner_tg: 1003 }).status).toBe(403);
    post(db, `${C}/demo/as`, { tg_id: db.users[0].tg_id });
    expect(db.me.is_head).toBe(true);
    expect(post(db, `${C}/leads/${free.id}/assign`, { owner_tg: me }).status).toBe(200);
    asSeller(db);
    expect(get<Lead[]>(db, `${C}/leads`).some((l) => l.id === free.id)).toBe(true);
  });
});

describe("demo server: Telegram", () => {
  type Chat = { id: number; seller_tg: number; unread: number; can_send: boolean; channel?: string };
  type Chats = { head: boolean; connection: { can_reply: boolean } | null; chats: Chat[] };
  type Thread = { messages: { text: string; out: boolean }[] };

  it("yozishmalar shaxsiy: rahbar ham, sotuvchi ham faqat o'z chatlarini ko'radi", () => {
    const db = seed(NOW);
    const head = get<Chats>(db, `${C}/tg/chats`);
    expect(head.head).toBe(true);
    expect(head.chats.length).toBeGreaterThan(0);
    expect(head.chats.every((c) => c.seller_tg === db.me.tg_id)).toBe(true);
    const foreign = db.tg_chats.find((c) => c.seller_tg !== db.me.tg_id)!;
    expect(handle(db, "GET", `${C}/tg/chats/${foreign.id}/messages`, undefined, NOW).status).toBe(404);
    expect(post(db, `${C}/tg/chats/${foreign.id}/send`, { text: "x" }).status).toBe(404);

    post(db, `${C}/demo/as`, { tg_id: 1002 });
    const mine = get<Chats>(db, `${C}/tg/chats`);
    expect(mine.chats.length).toBeGreaterThan(0);
    expect(mine.chats.every((c) => c.seller_tg === 1002)).toBe(true);
  });

  it("sotuvchi ochsa o'qilgan, javob yozadi; huquqsiz — 403; ulanmagan — connection null", () => {
    const db = seed(NOW);
    const c = get<Chats>(db, `${C}/tg/chats`).chats.find((x) => x.seller_tg === db.me.tg_id && x.unread > 0)!;
    get<Thread>(db, `${C}/tg/chats/${c.id}/messages`);
    expect(get<Chats>(db, `${C}/tg/chats`).chats.find((x) => x.id === c.id)!.unread).toBe(0);
    expect(post(db, `${C}/tg/chats/${c.id}/send`, { text: "Narxi 185 000" }).status).toBe(200);
    expect(get<Thread>(db, `${C}/tg/chats/${c.id}/messages`).messages.at(-1)).toMatchObject({ text: "Narxi 185 000", out: true });

    post(db, `${C}/demo/as`, { tg_id: 1004 });
    const n = get<Chats>(db, `${C}/tg/chats`);
    expect(n.connection?.can_reply).toBe(false);
    expect(post(db, `${C}/tg/chats/${n.chats[0].id}/send`, { text: "x" }).status).toBe(403);

    post(db, `${C}/demo/as`, { tg_id: 1005 });
    expect(get<Chats>(db, `${C}/tg/chats`).connection).toBeNull();
  });

  it("narxlash, joylashuv va yangi mijoz (STIR, manzil) — backend bilan bir xil", () => {
    const db = seed(NOW);
    type Cu = { id: number; address: string | null; phones: string[] };
    const c = post<Cu>(db, `${C}/customers`, { name: "Chinoz Un", phones: ["90 123 45 67"], inn: "301999888", address: "Chinoz t." }).body;
    expect([c.phones, c.address]).toEqual([["998901234567"], "Chinoz t."]);
    expect(post(db, `${C}/customers`, { name: "X", phones: ["900000001"], inn: "301999888" }).status).toBe(409);
    type D = { id: number; amount: string; location: string | null };
    const items = [{ name: "SPB", qty: "10", price: "100000" }, { name: "Lenta", qty: "2", price: "50000" }];
    const d = post<D>(db, `${C}/deals`, { counterparty_id: c.id, title: "Ko'p", items, discount: 10, markup: 5, logistics: 200000 }).body;
    expect([d.amount, d.location]).toEqual(["1239500", "Chinoz t."]);
    expect(post<D>(db, `${C}/deals/${d.id}`, { discount: 0, markup: 0, logistics: 0 }).body.amount).toBe("1100000");
    expect(post(db, `${C}/deals/${d.id}`, { discount: 150 }).status).toBe(400);
  });

  it("hujjatni yuborish: chatga (Telegram — fayl, Instagram — matn), Didox demo'da ulanmagan", () => {
    const db = seed(NOW);
    const chat = db.tg_chats.find((c) => c.seller_tg === db.me.tg_id && c.customer_id)!;
    const d = db.deals.find((x) => x.counterparty_id === chat.customer_id && x.items.some((i) => i.item_id))!;
    const doc = post<{ id: number }>(db, `${C}/deals/${d.id}/doc`, { kind: "quote" }).body;
    const full = get<{ customer_id: number; didox: { enabled: boolean } }>(db, `${C}/docs/${doc.id}`);
    expect([full.customer_id, full.didox.enabled]).toEqual([chat.customer_id, false]);
    expect(post(db, `${C}/docs/${doc.id}/send`, { chat_id: chat.id }).status).toBe(200);
    expect(db.tg_msgs.filter((m) => m.chat === chat.id).at(-1)).toMatchObject({ out: true, via_crm: true, kind: (chat.channel ?? "tg") === "ig" ? "text" : "document" });
    expect(post(db, `${C}/docs/${doc.id}/send`, { chat_id: 99999 }).status).toBe(404);
    expect(post(db, `${C}/docs/${doc.id}/didox`, { subtype: 4 }).status).toBe(503);
  });

  it("ketma-ketlik: taklif → buyurtma tasdig'i → imzo — bitim avtomatik oldinga o'tadi (orqaga emas)", () => {
    const db = seed(NOW);
    const cu = db.customers.find((c) => seesCustomer(db, c))!;
    const items = [{ item_id: 1, name: "SPB", qty: "2", unit: "dona", price: "100000" }];
    const d = post<{ id: number }>(db, `${C}/deals`, { counterparty_id: cu.id, items }).body;
    const stage = () => get<{ stage: string }>(db, `${C}/deals/${d.id}`).stage;
    expect(stage()).toBe("new");
    post(db, `${C}/deals/${d.id}/doc`, { kind: "quote" });
    expect(stage()).toBe("offer");
    const o = post<{ id: number }>(db, `${C}/deals/${d.id}/doc`, { kind: "order" }).body;
    post(db, `${C}/docs/${o.id}/confirm`, {});
    expect(stage()).toBe("contract");
    post(db, `${C}/deals/${d.id}`, { sign_status: "signed" });
    expect(stage()).toBe("payment");
    post(db, `${C}/deals/${d.id}/doc`, { kind: "quote" });
    expect(stage()).toBe("payment");
    expect(db.history.filter((h) => h.deal_id === d.id && h.src === "auto").map((h) => h.to_stage)).toEqual(["offer", "contract", "payment"]);
  });

  it("bitim nomi — tizimdan (backend auto_title bilan bir xil)", () => {
    const db = seed(NOW);
    const cu = db.customers.find((c) => seesCustomer(db, c))!;
    const d = post<{ id: number; title: string }>(db, `${C}/deals`, { counterparty_id: cu.id, items: [{ name: "Ремень SPB 1650", qty: "10", unit: "dona", price: "1" }, { name: "Lenta", qty: "2", unit: "m", price: "1" }] }).body;
    expect(d.title).toBe(`#${d.id} Ремень SPB 1650 — 10 dona +1`);
    const e = post<{ id: number; title: string }>(db, `${C}/deals`, { counterparty_id: cu.id }).body;
    expect(e.title).toBe(`#${e.id} ${cu.name}`);
  });

  it("chatni mijozga ulash va qo'ng'iroqni yozish", () => {
    const db = seed(NOW);
    const chat = db.tg_chats.find((c) => c.seller_tg === db.me.tg_id)!;
    const cu = db.customers.find((c) => c.phones.length && db.deals.some((d) => d.counterparty_id === c.id && d.owner_tg === db.me.tg_id))!;
    expect(post<{ customer: { id: number } }>(db, `${C}/tg/chats/${chat.id}/link`, { customer_id: cu.id }).body.customer.id).toBe(cu.id);
    const deal = db.deals.find((d) => d.counterparty_id === cu.id)!;
    const r = post<{ duration: number; deal_id: number }>(db, `${C}/calls`, { customer_id: cu.id, deal_id: deal.id, direction: "out", status: "answered", duration: 125, note: "Narx" });
    expect([r.status, r.body.duration, r.body.deal_id]).toEqual([200, 125, deal.id]);
    expect(get<unknown[]>(db, `${C}/calls?customer=${cu.id}`)).toHaveLength(1);
    expect(db.activity.filter((a) => a.deal_id === deal.id && a.kind === "call").at(-1)!.text).toBe(`Chiquvchi qo'ng'iroq +${cu.phones[0]}: gaplashildi 2:05 — Narx`);
    expect(post(db, `${C}/calls`, { customer_id: cu.id, direction: "x" }).status).toBe(400);
  });

  it("mijoz turlari: firma xodimi, savdogar, jismoniy shaxs — backend bilan bir xil", () => {
    const db = seed(NOW);
    const cu = `${C}/customers`;
    expect(post(db, cu, { kind: "employee", name: "Rahim" }).status).toBe(400);
    const e = post<{ id: number; kind: string; company: string }>(db, cu, { kind: "employee", name: "Rahim", phones: ["900000002"], position: "Ta'minotchi", company: "Termiz Sement" }).body;
    expect([e.kind, e.company]).toEqual(["employee", "Termiz Sement"]);
    expect(post(db, cu, { kind: "trader", name: "Akmal" }).status).toBe(400);
    expect(post(db, cu, { kind: "trader", name: "Akmal", phones: ["901112233"] }).status).toBe(200);
    expect(post(db, cu, { kind: "person", name: "Ali", phones: ["900000003"], inn: "305112847" }).status).toBe(400);
    // yangi mijoz: telefonsiz — 400; firma / YaTT / davlat — STIRsiz 400
    expect(post(db, cu, { kind: "person", name: "Vali" }).status).toBe(400);
    for (const kind of ["company", "ip", "state"]) expect(post(db, cu, { kind, name: "Q", phones: ["900000009"] }).status).toBe(400);
    expect(get<{ id: number }[]>(db, `${cu}?q=termiz sement`).map((x) => x.id)).toEqual([e.id]);
    expect(post(db, `${cu}/${e.id}`, { kind: "trader", phones: [] }).status).toBe(400); // telefonsiz savdogar bo'lmaydi
  });

  it("hujjat: qatorlar nusxasi, ko'rish va buyurtmani tasdiqlash", () => {
    const db = seed(NOW);
    const d = db.deals.find((x) => x.items.some((i) => i.item_id) && x.owner_tg === db.me.tg_id) ?? db.deals.find((x) => x.items.some((i) => i.item_id))!;
    type F = { id: number; status: string; state: string | null; lines: { name: string }[]; meta: { customer?: string } };
    const q = post<{ id: number }>(db, `${C}/deals/${d.id}/doc`, { kind: "quote" }).body;
    const f = get<F>(db, `${C}/docs/${q.id}`);
    expect(f.lines.length).toBeGreaterThan(0);
    expect(f.meta.customer).toBeTruthy();
    expect(post(db, `${C}/docs/${q.id}/confirm`, {}).status).toBe(400);
    const o = post<{ id: number }>(db, `${C}/deals/${d.id}/doc`, { kind: "order" }).body;
    expect(post<F>(db, `${C}/docs/${o.id}/confirm`, {}).body).toMatchObject({ status: "posted", state: "confirmed" });
    expect(post(db, `${C}/docs/${o.id}/confirm`, {}).status).toBe(409);
  });

  it("WhatsApp / Instagram: kanal filtri va o'qilmaganlar (tab belgilari)", () => {
    const db = seed(NOW);
    type Ch = Chats & { channels: Record<string, { enabled: boolean; unread: number }> };
    const all = get<Ch>(db, `${C}/tg/chats`);
    expect(new Set(all.chats.map((x) => x.channel))).toEqual(new Set(["tg", "wa", "ig"]));
    const wa = get<Ch>(db, `${C}/tg/chats?ch=wa`);
    expect(wa.chats.length).toBeGreaterThan(0);
    expect(wa.chats.every((x) => x.channel === "wa")).toBe(true);
    expect(all.channels.wa.unread).toBe(wa.chats.reduce((a, x) => a + x.unread, 0));
  });

  it("fayl va joylashuv yuborish (demo)", () => {
    const db = seed(NOW);
    const c = get<Chats>(db, `${C}/tg/chats`).chats.find((x) => x.can_send)!;
    const f = post<{ kind: string; text: string }>(db, `${C}/tg/chats/${c.id}/send-file`, { file: { name: "remen.jpg", type: "image/jpeg", size: 1200 }, caption: "Mana" });
    expect(f.status).toBe(200);
    expect(f.body).toMatchObject({ kind: "photo", text: "Mana" });
    expect(post(db, `${C}/tg/chats/${c.id}/send-file`, { file: null }).status).toBe(400);
    const l = post<{ kind: string; media: unknown }>(db, `${C}/tg/chats/${c.id}/send`, { latitude: 41.31, longitude: 69.28 });
    expect(l.body).toMatchObject({ kind: "location", media: { lat: 41.31, lon: 69.28 } });
  });

  it("chatdan bitim — chat mijozga biriktiriladi", () => {
    const db = seed(NOW);
    const c = get<Chats>(db, `${C}/tg/chats`).chats[0];
    const cu = post<{ id: number }>(db, `${C}/customers`, { name: "Bobur Xasanov", kind: "person", phones: ["907770011"] }).body;
    expect(post(db, `${C}/deals`, { counterparty_id: cu.id, title: "SPB", tg_chat_id: c.id }).status).toBe(200);
    const after = get<{ chats: { id: number; customer: { id: number } | null }[] }>(db, `${C}/tg/chats`).chats.find((x) => x.id === c.id)!;
    expect(after.customer?.id).toBe(cu.id);
    expect(post(db, `${C}/deals`, { counterparty_id: cu.id, tg_chat_id: 999999 }).status).toBe(404);
  });

  it("lid bosqichlari: yangi → ishda → qiziqish bildirdi; yopilgan — qayta ochilmaydi", () => {
    const db = seed(NOW);
    const l = db.leads.find((x) => x.status === "new")!;
    expect(post<{ status: string }>(db, `${C}/leads/${l.id}/status`, { status: "interested" }).body.status).toBe("interested");
    expect(get<{ id: number }[]>(db, `${C}/leads`).some((x) => x.id === l.id)).toBe(true);
    expect(post(db, `${C}/leads/${l.id}/status`, { status: "junk" }).status).toBe(400);
    post(db, `${C}/leads/${l.id}/junk`, { reason: "Shaxsiy chat (mijoz emas)" });
    expect(post(db, `${C}/leads/${l.id}/status`, { status: "work" }).status).toBe(400);
  });

  it("mijozlar jadvali va kartochka (demo)", () => {
    const db = seed(NOW);
    const tb = get<{ rows: { id: number; bought_n: number; next_buy: string | null }[]; total: number }>(db, `${C}/customers/table`);
    expect(tb.total).toBeGreaterThan(0);
    const c = tb.rows.find((r) => r.bought_n > 0)!;
    expect(c.next_buy).toBeTruthy();
    const k = post<{ contacts: { name: string; phone: string }[] }>(db, `${C}/customers/${c.id}`, { contacts: [{ name: "Rahim", role: "ta'minotchi", phone: "90 123 45 67" }, { name: "", phone: "" }] });
    expect(k.body.contacts).toEqual([{ name: "Rahim", role: "ta'minotchi", phone: "998901234567" }]);
    expect(handle(db, "GET", `${C}/customers/999999`, undefined, NOW).status).toBe(404);
  });

  it("hisobot (demo): voronka kamayib boradi, sotuvchi — faqat o'zi", () => {
    const db = seed(NOW);
    const r = get<{ funnel: { count: number }[]; sellers: { tg_id: number }[]; kpi: { leads: number } }>(db, `${C}/reports?from=2026-01-01&to=2026-12-31`);
    expect(r.funnel[0].count).toBeGreaterThan(0);
    for (let i = 1; i < r.funnel.length; i++) expect(r.funnel[i].count).toBeLessThanOrEqual(r.funnel[i - 1].count);
    expect(r.sellers.length).toBeGreaterThan(1);
    post(db, `${C}/demo/as`, { tg_id: 1002 });
    const s = get<{ sellers: { tg_id: number }[] }>(db, `${C}/reports?from=2026-01-01&to=2026-12-31`);
    expect(s.sellers.map((x) => x.tg_id)).toEqual([1002]);
  });

  it("javob (reply) — iqtibos bilan (demo)", () => {
    const db = seed(NOW);
    const c = get<{ chats: { id: number; can_send: boolean }[] }>(db, `${C}/tg/chats`).chats.find((x) => x.can_send)!;
    const first = get<{ messages: { id: number; text: string }[] }>(db, `${C}/tg/chats/${c.id}/messages`).messages[0];
    const r = post<{ reply: { ref: number; text: string } }>(db, `${C}/tg/chats/${c.id}/send`, { text: "Ha", reply_to: first.id });
    expect(r.body.reply).toMatchObject({ ref: first.id, text: first.text });
    expect(post(db, `${C}/tg/chats/${c.id}/send`, { text: "x", reply_to: 999999 }).status).toBe(400);
  });

  it("jarayon qoidalari (demo): to'lov → ishlab chiqarish, to'liq to'lovsiz jo'natish yo'q, hujjatsiz yutish yo'q", () => {
    const db = seed(NOW);
    const d = db.deals.find((x) => x.stage === "contract")!;
    post(db, `${C}/deals/${d.id}`, { pay_terms: "half" });
    expect(post(db, `${C}/deals/${d.id}/stage`, { stage: "production" }).status).toBe(400);
    expect(post<{ stage: string }>(db, `${C}/deals/${d.id}/payment`, { amount: d.amount / 2 }).body.stage).toBe("production");
    expect(post(db, `${C}/deals/${d.id}/stage`, { stage: "shipping" }).status).toBe(400);
    post(db, `${C}/deals/${d.id}/payment`, { amount: d.amount / 2 });
    expect(post(db, `${C}/deals/${d.id}/stage`, { stage: "shipping" }).status).toBe(200);
    expect(post(db, `${C}/deals/${d.id}/stage`, { stage: "won" }).status).toBe(400);
    post(db, `${C}/deals/${d.id}`, { docs_done: true });
    expect(post<{ stage: string }>(db, `${C}/deals/${d.id}/stage`, { stage: "won" }).body.stage).toBe("won");
    const l = db.leads.find((x) => x.status === "new")!;
    for (const n of [1, 2, 3]) expect(post<{ no_answer: number }>(db, `${C}/leads/${l.id}/noanswer`, {}).body.no_answer).toBe(n);
    expect(post<{ status: string }>(db, `${C}/leads/${l.id}/noanswer`, {}).body.status).toBe("junk");
  });

  it("taqsimlash qoidalari va «Keyinroq» sanasi (demo)", () => {
    const db = seed(NOW);
    expect(post(db, `${C}/routing`, { rules: [{ kind: "product", keywords: "konveyer", seller_tg: 1003 }] }).status).toBe(200);
    expect(post<{ owner_tg: number }>(db, `${C}/leads`, { name: "X", product: "Konveyer lenta" }).body.owner_tg).toBe(1003);
    const d = db.deals.find((x) => x.stage === "offer")!;
    expect(post(db, `${C}/deals/${d.id}/stage`, { stage: "later" }).status).toBe(400);
    expect(post<{ stage: string }>(db, `${C}/deals/${d.id}/stage`, { stage: "later", recall: "15.12.2026" }).body.stage).toBe("later");
    // soat va izoh bilan — vazifa shu vaqtga, izoh matnida
    const d2 = db.deals.find((x) => x.stage === "offer" && x.id !== d.id)!;
    const r = post<{ stage: string }>(db, `${C}/deals/${d2.id}/stage`, { stage: "later", recall: "2026-12-01", recall_time: "14:30", recall_note: "Rahbar bilan kelishadi" });
    expect(r.body.stage).toBe("later");
    const task = db.activity.filter((a) => a.deal_id === d2.id && a.kind === "task").at(-1)!;
    expect(task.text).toBe("Mijoz bilan qayta bog'lanish: Rahbar bilan kelishadi");
    const due = new Date(task.due!);
    expect([due.getDate(), due.getHours(), due.getMinutes()]).toEqual([1, 14, 30]);
    expect(post(db, `${C}/deals/${d2.id}/stage`, { stage: "later", recall: "2026-12-01", recall_time: "xx" }).status).toBe(400);
  });
});


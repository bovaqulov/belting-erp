import { describe, expect, it } from "vitest";

import { decideMode, decideModeAll } from "./mode.lib";
import { DB_VERSION, seed, type Db } from "./seed.lib";
import { handle, phoneKey } from "./server.lib";
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
    expect(db.pipelines.length).toBeGreaterThanOrEqual(2);
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
    expect(won.rows.every((r) => ["won", "dl_won"].includes(r.stage))).toBe(true);
    const byId = get<List>(db, `${C}/deals?kind=all&q=%23${db.deals[4].id}`);
    expect(byId.rows.map((r) => r.id)).toContain(db.deals[4].id);
    const b = get<{ stages: { code: string; count: number; deals: unknown[] }[]; counts: Record<string, number> }>(db, `${C}/board?pipeline=main`);
    expect(b.stages.reduce((a, x) => a + x.count, 0)).toBe(b.counts.main);
  });

  it("tovarlar → summa; taklif hujjati; vazifa bajarildi", () => {
    const db = seed(NOW);
    const d = db.deals.find((x) => x.stage === "qual")!;
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
    expect(again.deals[0].title).toBe("O'zgargan nom");
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

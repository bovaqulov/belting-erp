import { describe, expect, it } from "vitest";

import type { Board, Counts, Overview, SupplyDetail } from "@/erp/marketplace/lib";

import { seed, type Db } from "./seed.lib";
import { handle } from "./server.lib";

const NOW = Date.parse("2026-11-14T09:00:00Z");
const P = "/app/api/erp/mk";
const fresh = () => seed(NOW);
const get = <T,>(db: Db, path: string) => {
  const r = handle(db, "GET", path, undefined, NOW);
  expect(r.status).toBe(200);
  return r.body as T;
};
const post = (db: Db, path: string, body: Record<string, unknown> = {}) => handle(db, "POST", path, body, NOW);

describe("demo marketplace backend", () => {
  it("seed doimiy (bir xil urug')", () => {
    expect(JSON.stringify(seed(NOW))).toBe(JSON.stringify(seed(NOW)));
  });

  it("umumiy: faol buyurtmalar, audit — og'irlik bo'yicha", () => {
    const db = fresh();
    const o = get<Overview>(db, `${P}/overview`);
    expect(o.orders.n).toBe(db.orders.filter((x) => x.stage === "new" || x.stage === "assembly").length);
    expect(o.orders.soon).toBeGreaterThan(0);
    expect(o.audit[0].severity).toBe("crit");
    expect(o.audit.at(-1)!.severity).not.toBe("crit");
  });

  it("menyu raqamlari va taxta bosqichlari", () => {
    const db = fresh();
    const c = get<Counts>(db, `${P}/orders-counts`);
    const b = get<Board>(db, `${P}/orders/ozon/board?stage=active`);
    expect(b.orders.length).toBe(c.ozon.new + c.ozon.assembly);
    expect(b.counts.new).toBe(c.ozon.new);
    // muddat bo'yicha: o'tgani birinchi
    expect(b.orders[0].left_min!).toBeLessThan(0);
    expect(handle(db, "GET", `${P}/orders/ozon/board?stage=xx`, undefined, NOW).status).toBe(400);
    expect(handle(db, "GET", `${P}/orders/amazon/board`, undefined, NOW).status).toBe(404);
  });

  it("skanerlash: noto'g'ri tovar — xato, ortiqcha — xato, oxirgisi — yig'ildi", () => {
    const db = fresh();
    const o = db.orders.find((x) => x.channel === "uzum" && x.stage === "assembly" && !x.assembled_at)!;
    const url = `${P}/orders/uzum/${o.ext_id}/scan`;
    const bad = post(db, url, { code: "0000" });
    expect(bad.status).toBe(400);
    expect((bad.body as { detail: string }).detail).toMatch(/NOTO'G'RI TOVAR/);
    const code = o.lines[0].codes![0];
    let last: { done?: boolean } = {};
    for (let i = 0; i < o.lines[0].qty; i++) last = post(db, url, { code }).body as { done?: boolean };
    expect(last.done).toBe(true);
    expect(o.assembled_at).not.toBeNull();
    expect(post(db, url, { code }).status).toBe(400); // allaqachon yig'ilgan
    post(db, `${P}/orders/uzum/${o.ext_id}/reset`);
    expect(o.picked).toEqual([]);
    expect(o.assembled_at).toBeNull();
  });

  it("kanal amallari: Uzum tasdiqlash, Ozon yig'ildi, bekor qilish", () => {
    const db = fresh();
    const uz = db.orders.find((x) => x.channel === "uzum" && x.ext_status === "CREATED")!;
    expect(post(db, `${P}/orders/uzum/${uz.ext_id}/confirm`).status).toBe(200);
    expect([uz.stage, uz.ext_status]).toEqual(["assembly", "PACKING"]);
    expect(post(db, `${P}/orders/uzum/${uz.ext_id}/confirm`).status).toBe(400);
    const oz = db.orders.find((x) => x.channel === "ozon" && x.stage === "new")!;
    expect(post(db, `${P}/orders/ozon/${oz.ext_id}/ship`).status).toBe(200);
    expect(oz.stage).toBe("assembly");
    expect(post(db, `${P}/orders/ozon/${oz.ext_id}/cancel`, { reason: "tugagan" }).status).toBe(200);
    expect(oz.stage).toBe("cancelled");
    const done = db.orders.find((x) => x.stage === "done")!;
    expect(post(db, `${P}/orders/${done.channel}/${done.ext_id}/cancel`).status).toBe(400);
  });

  it("sinxron yangi buyurtma qo'shadi", () => {
    const db = fresh();
    const n = db.orders.length;
    expect((post(db, `${P}/orders/wb/sync`).body as { new: number }).new).toBe(1);
    expect(db.orders.length).toBe(n + 1);
    expect(db.orders.at(-1)!.stage).toBe("new");
  });

  it("WB postavka: yaratish → qo'shish → yuk joyi → topshirish", () => {
    const db = fresh();
    const { id } = post(db, `${P}/wb/supplies`, { name: "Test" }).body as { id: string };
    const news = db.orders.filter((x) => x.channel === "wb" && x.stage === "new").slice(0, 2);
    post(db, `${P}/wb/supplies/${id}/add`, { orders: news.map((x) => x.ext_id) });
    expect(news.every((x) => x.stage === "assembly" && x.supply_id === id)).toBe(true);
    let d = get<SupplyDetail>(db, `${P}/wb/supplies/${id}`);
    expect([d.orders.length, d.step, d.picking.length > 0]).toEqual([2, 1, true]);
    post(db, `${P}/wb/supplies/${id}/boxes`, { amount: 2 });
    d = get<SupplyDetail>(db, `${P}/wb/supplies/${id}`);
    expect([d.boxes.length, d.step]).toEqual([2, 2]);
    post(db, `${P}/wb/supplies/${id}/boxes/delete`, { ids: [d.boxes[0].id] });
    expect(get<SupplyDetail>(db, `${P}/wb/supplies/${id}`).boxes.length).toBe(1);
    expect(post(db, `${P}/wb/supplies/${id}/deliver`).status).toBe(200);
    d = get<SupplyDetail>(db, `${P}/wb/supplies/${id}`);
    expect(d.step).toBe(3);
    expect(news.every((x) => x.stage === "transit")).toBe(true);
    // topshirilgan postavka ochiqlar ro'yxatida yo'q, unga qo'shib bo'lmaydi
    expect(get<{ id: string }[]>(db, `${P}/wb/supplies`).some((s) => s.id === id)).toBe(false);
    expect(post(db, `${P}/wb/supplies/${id}/add`, { orders: [] }).status).toBe(400);
  });

  it("WB postavka: buyurtmani boshqa postavkaga o'tkazish", () => {
    const db = fresh();
    const news = get<Board>(db, `${P}/orders/wb/board?stage=new`).orders.slice(0, 2);
    const a = (post(db, `${P}/wb/supplies`, { name: "A" }).body as { id: string }).id;
    const b = (post(db, `${P}/wb/supplies`, { name: "B" }).body as { id: string }).id;
    post(db, `${P}/wb/supplies/${a}/add`, { orders: news.map((x) => x.ext_id) });
    post(db, `${P}/wb/supplies/${b}/add`, { orders: [news[0].ext_id] });
    expect(get<SupplyDetail>(db, `${P}/wb/supplies/${a}`).orders.map((o) => o.ext_id)).toEqual([news[1].ext_id]);
    expect(get<SupplyDetail>(db, `${P}/wb/supplies/${b}`).orders.map((o) => o.ext_id)).toEqual([news[0].ext_id]);
  });
  it("audit: ro'yxat va 'Xato emas'", () => {
    const db = fresh();
    const rs = get<{ id: number }[]>(db, `${P}/audit?code=photo_none&ch=wb`);
    expect(rs.length).toBe(3);
    post(db, `${P}/audit/${rs[0].id}/mute`);
    expect(get<unknown[]>(db, `${P}/audit?code=photo_none&ch=wb`).length).toBe(2);
    expect(get<Overview>(db, `${P}/overview`).audit.find((a) => a.code === "photo_none")!.n).toBe(2);
  });

  it("fayllar (stiker, QR) demo'da — tushunarli xato", () => {
    const db = fresh();
    const r = post(db, `${P}/wb/stickers`, { orders: ["1"] });
    expect(r.status).toBe(501);
    expect((r.body as { detail: string }).detail).toMatch(/demo/);
  });
});

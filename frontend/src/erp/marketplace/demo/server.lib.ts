// Brauzer ichidagi soxta Marketplace backend: Jarvis /app/api/erp/mk/* kontrakti bilan bir xil yo'llar va JSON shakllari,
// holat haqiqatan o'zgaradi (Db joyida). Kanal API'lari (WB, Ozon, Uzum) chaqirilmaydi — natija kanal javob bergandek.
// handle() sof: tarmoq yo'q, vaqt `now` bilan beriladi.
import { ORDER_CHS, picking, supplyStep, type Board, type BoardStage, type Counts, type Order, type OrderCh, type Overview, type Stage, type SupplyDetail } from "@/erp/marketplace/lib";

import { EXT_STATUS, makeLine, PRODUCTS, type Db, type DbOrder } from "./seed.lib";

export type Res = { status: number; body: unknown };
type B = Record<string, unknown>;

const P = "/app/api/erp/mk";
const ok = (body: unknown): Res => ({ status: 200, body });
const fail = (status: number, detail: string): Res => ({ status, body: { detail } });
const STAGES: Stage[] = ["new", "assembly", "transit", "done", "cancelled"];
const isCh = (v: string): v is OrderCh => (ORDER_CHS as readonly string[]).includes(v);
const iso = (now: number) => new Date(now).toISOString();
const mins = (from: string | null, to: number): number | null => (from ? Math.floor((to - Date.parse(from)) / 6e4) : null);

export function orderRow(o: DbOrder, now: number): Order {
  return {
    ...o,
    need: o.lines.reduce((a, l) => a + (Number(l.qty) || 1), 0),
    left_min: o.deadline ? Math.floor((Date.parse(o.deadline) - now) / 6e4) : null,
    age_min: mins(o.ordered, now),
  };
}

const find = (db: Db, ch: string, ext: string) => db.orders.find((o) => o.channel === ch && o.ext_id === ext);

function board(db: Db, ch: OrderCh, stage: BoardStage, now: number): Board {
  const mine = db.orders.filter((o) => o.channel === ch);
  const counts: Board["counts"] = {};
  for (const o of mine) counts[o.stage] = (counts[o.stage] ?? 0) + 1;
  const rs = mine
    .filter((o) => (stage === "active" ? o.stage === "new" || o.stage === "assembly" : o.stage === stage))
    .sort((a, b) => (a.deadline ?? "9").localeCompare(b.deadline ?? "9") || b.ordered.localeCompare(a.ordered));
  return { counts, orders: rs.map((o) => orderRow(o, now)) };
}

function overview(db: Db, now: number): Overview {
  const active = db.orders.filter((o) => o.stage === "new" || o.stage === "assembly");
  const soon = active.filter((o) => o.deadline && Date.parse(o.deadline) < now + 3 * 3600e3).length;
  const agg = new Map<string, Overview["audit"][number]>();
  for (const i of db.issues) {
    if (i.muted) continue;
    const k = `${i.code}|${i.channel}`;
    const a = agg.get(k) ?? { code: i.code, severity: i.severity, channel: i.channel, n: 0, text: i.text };
    a.n++;
    agg.set(k, a);
  }
  const sev = { crit: 0, warn: 1, info: 2 };
  return {
    channels: db.channels,
    sources: db.sources,
    orders: { n: active.length, soon },
    reviews: db.reviews,
    push_errors: db.push_errors,
    audit: [...agg.values()].sort((a, b) => sev[a.severity] - sev[b.severity] || b.n - a.n),
  };
}

function counts(db: Db): Counts {
  const out = Object.fromEntries(ORDER_CHS.map((c) => [c, { new: 0, assembly: 0 }])) as Counts;
  for (const o of db.orders) if (o.stage === "new" || o.stage === "assembly") out[o.channel][o.stage]++;
  return out;
}

function scan(db: Db, ch: string, ext: string, code: string, now: number): Res {
  const o = find(db, ch, ext);
  if (!o) return fail(404, "Buyurtma topilmadi");
  if (o.assembled_at) return fail(400, "Buyurtma allaqachon yig'ilgan");
  const c = code.trim();
  const i = o.lines.findIndex((l) => (l.codes ?? []).includes(c));
  if (i < 0) {
    const expected = o.lines.map((l) => `${l.title} (${(l.codes ?? []).join(", ") || "shtrixkod yo'q"})`).join("; ");
    return fail(400, `NOTO'G'RI TOVAR: ${c} bu buyurtmada yo'q. Kutilgan: ${expected.slice(0, 300)}`);
  }
  const ln = o.lines[i];
  const done = o.picked.filter((p) => p.line === i).length;
  if (done >= (Number(ln.qty) || 1)) return fail(400, `Bu tovar yetarli skanerlangan (${done} ta) — ortiqchasini qo'ymang`);
  o.picked.push({ line: i, code: c, by: db.me.tg_id, ts: iso(now) });
  const need = o.lines.reduce((a, l) => a + (Number(l.qty) || 1), 0);
  const full = o.picked.length >= need;
  if (full) o.assembled_at = iso(now);
  return ok({ ok: true, line: i, title: ln.title, picked: o.picked.length, need, done: full });
}

/** Sinxron: kanaldan bitta yangi buyurtma "keladi" (demo) */
function sync(db: Db, ch: OrderCh, now: number): Res {
  const n = ++db.seq;
  const p = PRODUCTS[n % PRODUCTS.length];
  const ext = ch === "ozon" ? `0${41900 + n}873-0${100 + n}-1` : String((ch === "wb" ? 3518900000 : 41828000) + n);
  db.orders.push({
    channel: ch,
    ext_id: ext,
    stage: "new",
    ext_status: EXT_STATUS[ch].new,
    ordered: iso(now - 4 * 6e4),
    deadline: ch === "wb" ? null : iso(now + (ch === "uzum" ? 2 : 20) * 3600e3),
    supply_id: null,
    lines: [makeLine(p, 1)],
    picked: [],
    assembled_at: null,
    number: `MP-26-${String(100 + n).padStart(5, "0")}`,
    article: p.vc,
    price_uzs: p.price,
  });
  return ok({ new: 1, updated: db.orders.filter((o) => o.channel === ch).length - 1, imported: 1 });
}

function setStage(o: DbOrder, s: Stage) {
  o.stage = s;
  o.ext_status = EXT_STATUS[o.channel][s];
}

function supplyDetail(db: Db, sid: string, now: number): Res {
  const sp = db.supplies.find((x) => x.id === sid);
  if (!sp) return fail(404, "Postavka topilmadi");
  const rs = db.orders.filter((o) => o.channel === "wb" && o.supply_id === sid).sort((a, b) => a.ordered.localeCompare(b.ordered));
  const boxes = db.boxes.filter((b) => b.supply_id === sid).map(({ id, orders }) => ({ id, orders }));
  const pickedAll = rs.length > 0 && rs.every((o) => o.assembled_at);
  const body: SupplyDetail = {
    supply: sp,
    orders: rs.map((o) => orderRow(o, now)),
    boxes,
    picking: picking(rs),
    picked_all: pickedAll,
    step: supplyStep(!!(sp.closedAt || sp.done), pickedAll, boxes.length),
  };
  return ok(body);
}

export function handle(db: Db, method: "GET" | "POST", path: string, body: B | undefined, now: number): Res {
  const u = new URL(path, "http://x");
  const q = u.searchParams;
  const p = u.pathname.replace(/\/$/, "");
  const b = body ?? {};
  if (p === "/app/api/erp/me") return ok(db.me);
  if (!p.startsWith(P)) return fail(404, "Topilmadi");
  const r = p.slice(P.length).split("/").filter(Boolean).map(decodeURIComponent);
  const get = method === "GET";

  if (get && r[0] === "overview") return ok(overview(db, now));
  if (get && r[0] === "orders-counts") return ok(counts(db));

  // ---------------------------------------------------------------- audit
  if (r[0] === "audit") {
    if (get && r.length === 1)
      return ok(db.issues.filter((i) => !i.muted && (!q.get("code") || i.code === q.get("code")) && (!q.get("ch") || i.channel === q.get("ch"))).map((x) => ({ ...x, muted: undefined })));
    if (!get && r[1] === "run") return ok({ cards: Object.values(db.channels).reduce((a, c) => a + c.n, 0) });
    if (!get && r[2] === "mute") {
      const i = db.issues.find((x) => x.id === Number(r[1]));
      if (!i) return fail(404, "Muammo topilmadi");
      i.muted = true;
      return ok({ ok: true });
    }
  }

  // ---------------------------------------------------------------- buyurtmalar
  if (r[0] === "orders") {
    const ch = r[1] ?? "";
    if (!isCh(ch)) return fail(404, "Kanal yo'q");
    if (get && r[2] === "board") {
      const st = (q.get("stage") ?? "active") as BoardStage;
      if (st !== "active" && !STAGES.includes(st)) return fail(400, "Bosqich noto'g'ri");
      return ok(board(db, ch, st, now));
    }
    if (!get && r[2] === "sync") return sync(db, ch, now);
    const ext = r[2] ?? "";
    const act = r[3];
    if (get && act === "label") return fail(501, "Stiker demo rejimda mavjud emas — haqiqiy kanal ulanganda chiqadi");
    if (get) return fail(404, "Topilmadi");
    if (act === "scan") return scan(db, ch, ext, String(b.code ?? ""), now);
    const o = find(db, ch, ext);
    if (!o) return fail(404, "Buyurtma topilmadi");
    if (act === "reset") {
      o.picked = [];
      o.assembled_at = null;
      return ok({ ok: true });
    }
    if (act === "cancel") {
      if (o.stage !== "new" && o.stage !== "assembly") return fail(400, "Kanal bekor qilmadi: buyurtma allaqachon jo'natilgan");
      setStage(o, "cancelled");
      return ok({ ok: true });
    }
    if (act === "confirm" && ch === "uzum") {
      if (o.ext_status !== "CREATED") return fail(400, "Uzum tasdiqlamadi: buyurtma CREATED holatida emas");
      setStage(o, "assembly");
      return ok({ ok: true });
    }
    if (act === "ship" && ch === "ozon") {
      if (o.stage !== "new") return fail(400, "Ozon: jo'natma yig'ishga tayyor holatda emas");
      setStage(o, "assembly");
      return ok({ ok: true, note: "Etiketka 45–60 soniyadan keyin tayyor bo'ladi" });
    }
    return fail(404, "Topilmadi");
  }

  // ---------------------------------------------------------------- WB postavkalar
  if (r[0] === "wb" && r[1] === "supplies") {
    const sid = r[2];
    if (!sid) {
      if (get) return ok(db.supplies.filter((s) => !s.closedAt && !s.done));
      const id = `WB-GI-${31900000 + ++db.seq}`;
      db.supplies.push({ id, name: String(b.name || "ERP").slice(0, 128), createdAt: iso(now), closedAt: null, done: false });
      return ok({ id });
    }
    const sp = db.supplies.find((x) => x.id === sid);
    if (!sp) return fail(404, "Postavka topilmadi");
    if (get && !r[3]) return supplyDetail(db, sid, now);
    if (get && r[3] === "qr") return fail(501, "QR demo rejimda mavjud emas");
    if (get) return fail(404, "Topilmadi");
    const closed = !!(sp.closedAt || sp.done);
    if (r[3] === "add") {
      if (closed) return fail(400, "WB postavkaga qo'shmadi: postavka topshirilgan");
      const ids = ((b.orders as unknown[]) ?? []).map(String);
      for (const o of db.orders) if (o.channel === "wb" && ids.includes(o.ext_id) && (o.stage === "new" || o.stage === "assembly")) {
        o.supply_id = sid;
        setStage(o, "assembly");
      }
      return ok({ ok: true });
    }
    if (r[3] === "deliver") {
      if (closed) return fail(400, "Postavka allaqachon topshirilgan");
      if (!db.orders.some((o) => o.supply_id === sid)) return fail(400, "WB topshirishga o'tkazmadi: postavka bo'sh");
      sp.closedAt = iso(now);
      sp.done = true;
      for (const o of db.orders) if (o.supply_id === sid && o.stage === "assembly") setStage(o, "transit");
      return ok({ ok: true });
    }
    if (r[3] === "boxes" && !r[4]) {
      if (closed) return fail(400, "Postavka topshirilgan — yuk joyi qo'shib bo'lmaydi");
      const n = Math.max(1, Math.min(Number(b.amount) || 1, 1000));
      const ids: string[] = [];
      for (let i = 0; i < n; i++) {
        const id = `WB-TRBX-${9811300 + ++db.seq}`;
        db.boxes.push({ id, supply_id: sid, orders: [] });
        ids.push(id);
      }
      return ok({ trbxIds: ids });
    }
    if (r[3] === "boxes" && r[4] === "delete") {
      const ids = ((b.ids as unknown[]) ?? []).map(String);
      db.boxes = db.boxes.filter((x) => !(x.supply_id === sid && ids.includes(x.id)));
      return ok({ ok: true });
    }
    if (r[3] === "boxes" && r[4] === "stickers") return fail(501, "Yuk joyi QR stikerlari demo rejimda mavjud emas");
  }
  if (r[0] === "wb" && r[1] === "stickers") return fail(501, "Stikerlar demo rejimda mavjud emas — haqiqiy WB ulanganda chop etiladi");

  return fail(404, "Bu bo'lim demo rejimda hali yo'q");
}

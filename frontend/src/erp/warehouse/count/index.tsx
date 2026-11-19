"use client";
// Sanash (inventarizatsiya). Qoralama serverda saqlanadi (har skandan keyin) — kun bo'yi sanalgan narsa yo'qolmaydi,
// boshqa qurilmada davom etsa bo'ladi. O'lchamli tovar (rulon, bo'lak, rukav) skanerlanganda o'lchami so'raladi va QR
// stiker DARHOL chiqadi. Rejimlar: qisman (faqat sanalgan pozitsiyalar), to'liq (sanalmagan qoldiq hisobdan chiqadi),
// ABC sikl sanoq (ro'yxatdagi tovarlar to'liq sanaladi). Hisobdagi miqdor ko'rsatilmaydi — sanoq ko'r-ko'rona.
// Holat: React holati + ref nusxasi (asinxron skan ishlovchilari uchun) + modul nusxasi (bo'limlar orasida yo'qolmaydi).
import { useCallback, useEffect, useRef, useState } from "react";

import { beep, confirm, hap, toast } from "@/erp/kit/env";
import { dnum, hhmm, num, un } from "@/erp/kit/fmt";
import { List, MainButton, Row, useLoad } from "@/erp/kit/ui";
import { api, del, labelsPdf, post } from "@/erp/warehouse/api";
import { useWh } from "@/erp/warehouse/context";
import { invKey, size, type ChoiceOpt, type Cycle, type Doc, type DocBrief, type InvDiff, type Posted, type ScanItem, type ScanRes, type ScanUnit } from "@/erp/warehouse/lib";
import { ScanBar, useScanMsg, useScanner } from "@/erp/warehouse/scan-bar";

import { CountView, ReviewView, type Line, type Result, type Review } from "./ui";

type Inv = {
  doc: Doc | null;
  wh: number | undefined;
  firm: string | undefined;
  loc: { id: number; code: string } | null;
  full: boolean;
  items: number[] | null;
  plan: Cycle | null;
  lines: Line[];
  hist: { key: string; inc: number }[];
  savedAt: string;
  asked: boolean;
};
const blank = (wh: number | undefined, firm: string | undefined): Inv => ({
  doc: null,
  wh,
  firm,
  loc: null,
  full: false,
  items: null,
  plan: null,
  lines: [],
  hist: [],
  savedAt: "",
  asked: false,
});
let kept: Inv | null = null;
const keep = (s: Inv) => {
  kept = s;
};
const restore = () => kept;

const scopeData = (s: Inv) => (s.full ? { scope: "full" } : s.items?.length ? { scope: "items", items: s.items } : {});
const linesOut = (s: Inv) => s.lines.map((l) => ({ item_id: l.item_id, char_id: l.char_id || null, batch_id: l.batch_id || null, qty: String(l.qty), data: l.data }));

export function Count() {
  const { wide, me, stores, whName, firmId, choose, ask, askSize, pickCell } = useWh();
  const [s, setS] = useState<Inv>(() => restore() ?? blank(stores[0]?.id, me.firms[0]?.code));
  const [result, setResult] = useState<Result | null>(null);
  /** o'tkazishdan oldin ko'rish: katta farq bo'lsa — qayta sanash yoki rahbar tasdig'i */
  const [review, setReview] = useState<Review | null>(null);
  const [reason, setReason] = useState("");
  /** zaxira yozuvlari aniqligi (IRA, 90 kun) — jahon amaliyoti 95–98%+ */
  const ira = useLoad(
    () => (s.wh ? api<{ positions: number; ira: number | null; counts: number; days: number }>(`/app/api/erp/kpi/ira?store_id=${s.wh}`).catch(() => null) : Promise.resolve(null)),
    [s.wh, result?.number],
  );
  const S = useRef(s);
  /** Holatni yangilash: ref (asinxron ishlovchilar uchun), modul nusxasi va React holati birga */
  const patch = useCallback((p: Partial<Inv> | ((x: Inv) => Partial<Inv>)) => {
    const n = { ...S.current, ...(typeof p === "function" ? p(S.current) : p) };
    S.current = n;
    keep(n);
    setS(n);
  }, []);

  // ---- qoralamani saqlash: ketma-ket (versiya to'qnashmasin), 700 ms kechikish bilan
  const chain = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveNow = useCallback(() => {
    chain.current = chain.current.then(async () => {
      const x = S.current;
      if (!x.doc) return;
      try {
        const doc = await post<Doc>(`/app/api/erp/docs/${x.doc.id}/save`, { version: x.doc.version, header: { warehouse_id: x.wh, data: scopeData(x) }, lines: linesOut(x) });
        patch({ doc, savedAt: hhmm() });
      } catch (e) {
        toast("Qoralama saqlanmadi: " + (e as Error).message, "bad");
      }
    });
    return chain.current;
  }, [patch]);
  const save = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveNow(), 700);
  }, [saveNow]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const ensure = async () => {
    if (S.current.doc) return;
    const x = S.current;
    const doc = await post<Doc>("/app/api/erp/docs", { kind: "inventory", firm: x.firm, header: { warehouse_id: x.wh, data: scopeData(x) }, lines: [] });
    patch({ doc });
  };
  const loadPlan = useCallback(async () => {
    const wh = S.current.wh;
    const plan = wh ? await api<Cycle>(`/app/api/erp/stock/cycle?warehouse_id=${wh}`).catch(() => null) : null;
    patch({ plan });
  }, [patch]);

  // ---- ochilganda: tugallanmagan qoralama bormi (bir marta)
  useEffect(() => {
    const x = S.current;
    if (x.doc || x.asked) {
      if (x.items ? !x.plan : !x.lines.length && !x.plan) void loadPlan();
      return;
    }
    (async () => {
      patch({ asked: true });
      const ds = (await api<DocBrief[]>("/app/api/erp/docs?kind=inventory&status=draft&limit=20").catch(() => [] as DocBrief[])).filter((d) => d.author === me.tg_id);
      if (ds.length) {
        const v = await choose("Tugallanmagan sanash", [
          ...ds.map((d) => ({ value: d.id, label: `${d.number || "Qoralama"} · ${whName(d.warehouse_id)}`, sub: `oxirgi o'zgarish ${hhmm(new Date(d.updated))}` })),
          { value: 0, label: "Yangi sanash" },
        ]);
        if (v) {
          const d = await api<Doc>(`/app/api/erp/docs/${v}`);
          patch({
            doc: d,
            wh: d.warehouse_id,
            firm: me.firms.find((f) => f.id === d.firm_id)?.code ?? S.current.firm,
            full: d.data?.scope === "full",
            items: d.data?.scope === "items" ? ((d.data.items as number[]) ?? null) : null,
            lines: (d.lines ?? []).map((l) => ({ item_id: l.item_id, char_id: l.char_id, batch_id: l.batch_id, qty: Number(l.qty), data: (l.data ?? {}) as Line["data"] })),
          });
        }
      }
      const y = S.current;
      if (y.items ? !y.plan : !y.lines.length) await loadPlan();
    })().catch((e: Error) => toast(e.message, "bad"));
  }, [choose, loadPlan, me, patch, whName]);

  // ---- qatorlar
  const add = (line: Line) => {
    const k = invKey(line);
    patch((x) => {
      const cur = x.lines.find((l) => invKey(l) === k);
      return {
        lines: cur ? x.lines.map((l) => (l === cur ? { ...l, qty: l.qty + line.qty } : l)) : [...x.lines, line],
        hist: [...x.hist, { key: k, inc: cur ? line.qty : 0 }],
      };
    });
    save();
  };
  const removeLine = async (l: Line) => {
    if (l.data.created && l.batch_id) await del(`/app/api/erp/units/${l.batch_id}`);
    patch((x) => ({ lines: x.lines.filter((y) => invKey(y) !== invKey(l)) }));
    save();
  };

  const m = useScanMsg();
  const onUnit = async (r: ScanUnit) => {
    if (S.current.lines.some((l) => l.batch_id === r.id)) {
      beep(false);
      return m.say(false, "Bu birlik allaqachon sanalgan", `${r.code} · ${r.name}`);
    }
    await ensure();
    const here = r.stock.reduce((a, x) => a + Number(x.qty), 0);
    let q = here || Number(r.pending_qty || 0);
    if (!q && r.dims === "wl" && r.width_mm && r.length_mm) q = Math.round((r.width_mm * r.length_mm) / 1000) / 1000;
    if (!q) {
      const v = await ask(r.name, { label: `Miqdor, ${un(r.unit)}`, ok: "Qo'shish" });
      q = Number(dnum(v));
      if (!(q > 0)) return;
    }
    const loc = S.current.loc;
    if (loc && r.loc_id !== loc.id) await post("/app/api/erp/units/loc", { batch_ids: [r.id], loc_id: loc.id }).catch(() => null);
    add({ item_id: r.item_id, char_id: r.char_id, batch_id: r.id, qty: q, data: { name: r.name, code: r.code, size: size(r), unit: r.unit, loc: loc?.code ?? r.loc ?? undefined } });
    beep(true);
    m.say(true, `${r.code} · ${num(q, 3)} ${un(r.unit)}`, r.name);
  };

  const onItem = async (it: ScanItem | (ChoiceOpt & { legacy?: string })) => {
    const legacy = "legacy" in it ? it.legacy : null;
    const owner = legacy && firmId(legacy) ? legacy : (S.current.firm ?? "");
    if (it.dims) {
      const ci = it as ScanItem;
      const r = await askSize(it.name, it.dims, it.unit, {
        w: ci.char_w ? Number(ci.char_w) : "",
        l: ci.char_l ? Number(ci.char_l) : "",
        done: "Stiker chiqarish",
        hint: ci.char_w ? "O'lcham eski 1C yorlig'idan olindi — haqiqiy o'lchamni tekshiring." : undefined,
      });
      if (!r) return;
      await ensure();
      const x = S.current;
      const u = await post<{ batch_id: number; code: string; qty: number; width_mm: number | null; length_mm: number | null; existing?: boolean }>("/app/api/erp/units", {
        item_id: it.item_id,
        firm: owner,
        width_mm: r.w ?? (it.dims === "w" ? r.q : null),
        length_mm: r.l ?? null,
        qty: it.dims === "l" ? (r.q ?? null) : null,
        loc_id: x.loc?.id ?? null,
        warehouse_id: x.wh,
      });
      if (S.current.lines.some((l) => l.batch_id === u.batch_id)) {
        beep(false);
        return m.say(false, "Bu birlik allaqachon sanalgan", u.code);
      }
      add({ item_id: it.item_id, char_id: null, batch_id: u.batch_id, qty: Number(u.qty), data: { name: it.name, code: u.code, size: size(u), unit: it.unit, loc: x.loc?.code, created: !u.existing } });
      beep(true);
      return m.say(true, `${u.code} · ${num(u.qty, 3)} ${un(it.unit)} — stikerni yopishtiring`, `${it.name} · ${size(u)} · ${u.existing ? "1C qoldig'idagi birlik topildi" : owner}`, {
        label: "PDF",
        icon: "printer",
        onClick: () => void labelsPdf({ batch_ids: [u.batch_id] }),
      });
    }
    await ensure();
    const line: Line = { item_id: it.item_id, char_id: it.char_id || null, batch_id: null, qty: 1, data: { name: it.name, size: it.char || "", unit: it.unit, firm_id: firmId(owner) } };
    add(line);
    const tot = S.current.lines.find((l) => invKey(l) === invKey(line))?.qty ?? 1;
    beep(true);
    m.say(true, `+1 → ${num(tot, 3)} ${un(it.unit)}`, `${it.name}${it.char ? " · " + it.char : ""} · ${owner}`);
  };

  const sc = useScanner(async (code) => {
    const r = await api<ScanRes>(`/app/api/erp/scan?code=${encodeURIComponent(code)}`);
    if (r.type === "cell") {
      if (r.parent_id && r.parent_id !== S.current.wh) {
        beep(false);
        return m.say(false, `${r.code} — boshqa ombor joyi`, whName(r.parent_id));
      }
      patch({ loc: { id: r.id, code: r.code } });
      beep(true);
      return m.say(true, `Joy: ${r.code}`, "Keyingi birliklar shu joyga yoziladi");
    }
    if (r.type === "choice") {
      const i = await choose("Bu 1C kodi ikki bazada", r.options.map((o, k) => ({ value: k, label: o.name, sub: `${o.base} bazasi${o.char ? " · " + o.char : ""}` })));
      if (i === null) return;
      return onItem({ ...r.options[i], legacy: r.options[i].base });
    }
    if (r.type === "unit") return onUnit(r);
    if (r.type === "item") return onItem(r);
    beep(false);
    m.say(false, "Kod topilmadi", code);
  }, m);

  const finish = async () => {
    const x0 = S.current;
    if (x0.full && !(await confirm("To'liq inventarizatsiya: sanalmagan barcha qoldiq hisobdan chiqadi. Davom etaymi?"))) return;
    if (x0.items?.length) {
      const c = new Set(x0.lines.map((l) => l.item_id));
      const miss = x0.items.filter((i) => !c.has(i)).length;
      if (miss && !(await confirm(`${miss} ta tovar umuman topilmadi — ularning qoldig'i hisobdan chiqadi. Davom etaymi?`))) return;
    }
    try {
      clearTimeout(timer.current);
      await ensure();
      await saveNow();
      const x1 = S.current;
      const rv = await post<Review>(`/app/api/erp/docs/${x1.doc!.id}/review`);
      if (rv.need) {
        beep(false);
        setReason("");
        return setReview(rv);
      }
      await commit();
    } catch (e) {
      beep(false);
      m.say(false, (e as Error).message);
    }
  };

  /** o'tkazish (approve — rahbar tasdig'i, sabab bilan) */
  const commit = async (approve?: { reason: string }) => {
    try {
      const x = S.current;
      const p = await post<Posted>(`/app/api/erp/docs/${x.doc!.id}/post`, { version: x.doc!.version, ...(approve ? { approve: true, reason: approve.reason } : {}) });
      setReview(null);
      const names = Object.fromEntries(x.lines.map((l) => [l.batch_id ? `b${l.batch_id}` : `i${l.item_id}`, l.data.name]));
      const diff = ((p.data.result ?? []) as InvDiff[]).filter((r) => Number(r.diff) !== 0);
      patch({ ...blank(x.wh, x.firm), asked: true });
      beep(!diff.length);
      setResult({
        number: p.number ?? "",
        diff: diff.map((r) => ({ ...r, name: names[r.batch_id ? `b${r.batch_id}` : `i${r.item_id}`] ?? `#${r.item_id}`, from: r.moved_from ? whName(r.moved_from) : null })),
      });
    } catch (e) {
      beep(false);
      toast((e as Error).message, "bad"); // ko'rish ekranida skaner xabari ko'rinmaydi
      m.say(false, (e as Error).message);
    }
  };

  const counted = new Set(s.lines.map((l) => l.item_id));
  const showMain = !result && !review && (s.lines.length > 0 || s.full || !!s.items?.length);
  if (review)
    return (
      <ReviewView
        r={review}
        reason={reason}
        onReason={setReason}
        onRecount={() => {
          setReview(null);
          toast("Belgilangan pozitsiyalarni qayta sanang — skanerlab yoki qatorni bosib tuzating");
        }}
        onApprove={() => void commit({ reason })}
      />
    );
  const k = ira.data;
  return (
    <>
      {!result && !s.lines.length && k && k.positions ? (
        <List>
          <Row
            icon="chart"
            color={(k.ira ?? 0) >= 95 ? "green" : (k.ira ?? 0) >= 85 ? "orange" : "red"}
            t="Zaxira aniqligi (IRA)"
            s={`${k.days} kun · ${k.counts} sanash · ${k.positions} pozitsiya · maqsad ≥ 95%`}
            val={<span className="num">{k.ira === null ? "—" : `${num(k.ira, 1)}%`}</span>}
          />
        </List>
      ) : null}
      <CountView
        wide={wide}
        result={result}
        bar={<ScanBar sc={sc} ph="Joy, birlik QR yoki tovar kodi" />}
        wh={whName(s.wh)}
        firm={s.firm ?? ""}
        loc={s.loc?.code ?? null}
        full={s.full}
        mode={s.full ? "To'liq sanash" : s.items?.length ? `Sikl: ${s.items.length} tovar` : "Qisman sanash"}
        items={s.items}
        plan={s.plan}
        counted={counted}
        lines={s.lines}
        saved={s.doc ? (s.savedAt ? `saqlandi ${s.savedAt}` : "saqlangan") : ""}
        firmName={(id) => me.firms.find((f) => f.id === id)?.code ?? ""}
        onAgain={() => {
          setResult(null);
          void loadPlan();
        }}
        onWh={async () => {
          if (S.current.lines.length) return toast("Sanash boshlangan — omborni yakunlagach almashtiring", "bad");
          const w = await choose("Ombor", stores.map((x) => ({ value: x.id, label: x.name })));
          if (w) {
            patch({ wh: w, loc: null });
            await loadPlan();
          }
        }}
        onFirm={async () => {
          const f = await choose("Yangi birliklar egasi (1C kodi bo'lmasa)", me.firms.map((x) => ({ value: x.code, label: x.name || x.code })));
          if (f) patch({ firm: f });
        }}
        onLoc={async () => {
          const c = await pickCell(S.current.wh);
          if (c === undefined) return;
          patch({ loc: c ? { id: c.id, code: c.code } : null });
        }}
        onMode={async () => {
          const x = S.current;
          if (x.items?.length) {
            if (await confirm("Sikl sanoqdan oddiy qisman sanashga o'tilsinmi?")) {
              patch({ items: null });
              save();
            }
            return;
          }
          if (!x.full && !(await confirm("To'liq sanash: yakunlanganda shu omborda sanalmagan BARCHA qoldiq hisobdan chiqadi. Faqat butun omborni sanayotgan bo'lsangiz yoqing."))) return;
          patch({ full: !x.full, items: null });
          hap.tap();
          save();
        }}
        onCycle={() => {
          patch((x) => ({ items: (x.plan?.due ?? []).slice(0, 10).map((y) => y.item_id), full: false }));
          hap.tap();
          if (S.current.doc) save();
          m.say(null, "Sikl sanoq boshlandi", "Ro'yxatdagi tovarlarning joyiga boring va har birligini skanerlang");
        }}
        onUndo={async () => {
          const x = S.current;
          const h = x.hist[x.hist.length - 1];
          if (!h) return toast("Bekor qiladigan skan yo'q", "bad");
          patch({ hist: x.hist.slice(0, -1) });
          const l = x.lines.find((y) => invKey(y) === h.key);
          if (!l) return;
          try {
            if (h.inc && l.qty > h.inc) {
              patch((y) => ({ lines: y.lines.map((z) => (invKey(z) === h.key ? { ...z, qty: z.qty - h.inc } : z)) }));
              save();
            } else await removeLine(l);
            m.say(null, "Bekor qilindi", l.data.name ?? "");
          } catch (e) {
            toast((e as Error).message, "bad");
          }
        }}
        onLine={async (l) => {
          const a = await choose(l.data.name ?? "Qator", [
            { value: "qty", label: "Miqdorni tuzatish" },
            ...(l.batch_id ? [{ value: "pdf", label: "Stiker PDF" }] : []),
            { value: "del", label: "Olib tashlash", color: "var(--danger)" },
          ]);
          try {
            if (a === "pdf") return void labelsPdf({ batch_ids: [l.batch_id!] });
            if (a === "del") return await removeLine(l);
            if (a === "qty") {
              const v = await ask(l.data.name ?? "Qator", { label: `Sanalgan miqdor, ${un(l.data.unit)}`, value: String(l.qty) });
              if (v === null) return;
              const n = Number(dnum(v));
              if (n > 0) {
                patch((y) => ({ lines: y.lines.map((z) => (invKey(z) === invKey(l) ? { ...z, qty: n } : z)) }));
                save();
              } else await removeLine(l);
            }
          } catch (e) {
            toast((e as Error).message, "bad");
          }
        }}
      />
      {showMain ? <MainButton text={s.lines.length ? `Yakunlash · ${s.lines.length} pozitsiya` : "Yakunlash"} onClick={finish} /> : null}
    </>
  );
}

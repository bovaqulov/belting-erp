"use client";
// Sanash (inventarizatsiya). Qoralama serverda saqlanadi (har skandan keyin) — kun bo'yi sanalgan narsa yo'qolmaydi,
// boshqa qurilmada davom etsa bo'ladi. O'lchamli tovar (rulon, bo'lak, rukav) skanerlanganda o'lchami so'raladi va QR
// stiker DARHOL chiqadi. Rejimlar: qisman (faqat sanalgan pozitsiyalar), to'liq (sanalmagan qoldiq hisobdan chiqadi),
// ABC sikl sanoq (ro'yxatdagi tovarlar to'liq sanaladi). Hisobdagi miqdor ko'rsatilmaydi — sanoq ko'r-ko'rona.
// Holat modul darajasida — bo'limlar orasida o'tganda yo'qolmaydi.
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { beep, confirm, hap, toast } from "@/erp/kit/env";
import { dnum, hhmm, num, un } from "@/erp/kit/fmt";
import { MainButton } from "@/erp/kit/ui";
import { api, del, labelsPdf, post } from "@/erp/warehouse/api";
import { useWh } from "@/erp/warehouse/context";
import { invKey, size, type ChoiceOpt, type Cycle, type Doc, type DocBrief, type InvDiff, type Posted, type ScanItem, type ScanRes, type ScanUnit } from "@/erp/warehouse/lib";
import { ScanBar, useScanner } from "@/erp/warehouse/scan-bar";

import { CountView, type Line, type Result } from "./ui";

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
const fresh = (): Inv => ({ doc: null, wh: undefined, firm: undefined, loc: null, full: false, items: null, plan: null, lines: [], hist: [], savedAt: "", asked: false });
const INV: Inv = fresh();

const scopeData = (s: Inv) => (s.full ? { scope: "full" } : s.items?.length ? { scope: "items", items: s.items } : {});
const linesOut = (s: Inv) => s.lines.map((l) => ({ item_id: l.item_id, char_id: l.char_id || null, batch_id: l.batch_id || null, qty: String(l.qty), data: l.data }));

export function Count() {
  const { wide, me, stores, whName, firmId, choose, ask, askSize, pickCell } = useWh();
  const S = useRef(INV).current;
  const [, render] = useReducer((x: number) => x + 1, 0);
  const [result, setResult] = useState<Result | null>(null);
  S.wh ??= stores[0]?.id;
  S.firm ??= me.firms[0]?.code;

  // ---- qoralamani saqlash: ketma-ket (versiya to'qnashmasin), 700 ms kechikish bilan
  const chain = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveNow = useCallback(() => {
    chain.current = chain.current.then(async () => {
      if (!S.doc) return;
      try {
        S.doc = await post<Doc>(`/app/api/erp/docs/${S.doc.id}/save`, { version: S.doc.version, header: { warehouse_id: S.wh, data: scopeData(S) }, lines: linesOut(S) });
        S.savedAt = hhmm();
        render();
      } catch (e) {
        toast("Qoralama saqlanmadi: " + (e as Error).message, "bad");
      }
    });
    return chain.current;
  }, [S]);
  const save = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveNow(), 700);
  }, [saveNow]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const ensure = async () => {
    if (S.doc) return;
    S.doc = await post<Doc>("/app/api/erp/docs", { kind: "inventory", firm: S.firm, header: { warehouse_id: S.wh, data: scopeData(S) }, lines: [] });
  };
  const loadPlan = useCallback(async () => {
    S.plan = S.wh ? await api<Cycle>(`/app/api/erp/stock/cycle?warehouse_id=${S.wh}`).catch(() => null) : null;
    render();
  }, [S]);

  // ---- ochilganda: tugallanmagan qoralama bormi
  useEffect(() => {
    if (S.doc || S.asked) {
      if (S.items ? !S.plan : !S.lines.length && !S.plan) void loadPlan();
      return;
    }
    S.asked = true;
    (async () => {
      const ds = (await api<DocBrief[]>("/app/api/erp/docs?kind=inventory&status=draft&limit=20").catch(() => [] as DocBrief[])).filter((d) => d.author === me.tg_id);
      if (ds.length) {
        const v = await choose("Tugallanmagan sanash", [
          ...ds.map((d) => ({ value: d.id, label: `${d.number || "Qoralama"} · ${whName(d.warehouse_id)}`, sub: `oxirgi o'zgarish ${hhmm(new Date(d.updated))}` })),
          { value: 0, label: "Yangi sanash" },
        ]);
        if (v) {
          const d = await api<Doc>(`/app/api/erp/docs/${v}`);
          S.doc = d;
          S.wh = d.warehouse_id;
          S.firm = me.firms.find((f) => f.id === d.firm_id)?.code ?? S.firm;
          S.full = d.data?.scope === "full";
          S.items = d.data?.scope === "items" ? ((d.data.items as number[]) ?? null) : null;
          S.lines = (d.lines ?? []).map((l) => ({ item_id: l.item_id, char_id: l.char_id, batch_id: l.batch_id, qty: Number(l.qty), data: (l.data ?? {}) as Line["data"] }));
        }
      }
      if (S.items ? !S.plan : !S.lines.length) await loadPlan();
      render();
    })().catch((e: Error) => toast(e.message, "bad"));
  }, [S, choose, loadPlan, me, whName]);

  // ---- qatorlar
  const add = (line: Line) => {
    const k = invKey(line);
    const cur = S.lines.find((x) => invKey(x) === k);
    if (cur) cur.qty += line.qty;
    else S.lines.push(line);
    S.hist.push({ key: k, inc: cur ? line.qty : 0 });
    save();
  };
  const removeLine = async (l: Line) => {
    if (l.data.created && l.batch_id) await del(`/app/api/erp/units/${l.batch_id}`);
    S.lines = S.lines.filter((x) => x !== l);
    save();
    render();
  };

  const onUnit = async (r: ScanUnit) => {
    if (S.lines.some((l) => l.batch_id === r.id)) {
      beep(false);
      return sc.say(false, "Bu birlik allaqachon sanalgan", `${r.code} · ${r.name}`);
    }
    await ensure();
    const here = r.stock.reduce((a, s) => a + Number(s.qty), 0);
    let q = here || Number(r.pending_qty || 0);
    if (!q && r.dims === "wl" && r.width_mm && r.length_mm) q = Math.round((r.width_mm * r.length_mm) / 1000) / 1000;
    if (!q) {
      const v = await ask(r.name, { label: `Miqdor, ${un(r.unit)}`, ok: "Qo'shish" });
      q = Number(dnum(v));
      if (!(q > 0)) return;
    }
    if (S.loc && r.loc_id !== S.loc.id) await post("/app/api/erp/units/loc", { batch_ids: [r.id], loc_id: S.loc.id }).catch(() => null);
    add({ item_id: r.item_id, char_id: r.char_id, batch_id: r.id, qty: q, data: { name: r.name, code: r.code, size: size(r), unit: r.unit, loc: S.loc?.code ?? r.loc ?? undefined } });
    beep(true);
    render();
    sc.say(true, `${r.code} · ${num(q, 3)} ${un(r.unit)}`, r.name);
  };

  const onItem = async (it: ScanItem | (ChoiceOpt & { legacy?: string })) => {
    const legacy = "legacy" in it ? it.legacy : null;
    const owner = legacy && firmId(legacy) ? legacy : (S.firm ?? "");
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
      const u = await post<{ batch_id: number; code: string; qty: number; width_mm: number | null; length_mm: number | null; existing?: boolean }>("/app/api/erp/units", {
        item_id: it.item_id,
        firm: owner,
        width_mm: r.w ?? (it.dims === "w" ? r.q : null),
        length_mm: r.l ?? null,
        qty: it.dims === "l" ? (r.q ?? null) : null,
        loc_id: S.loc?.id ?? null,
        warehouse_id: S.wh,
      });
      if (S.lines.some((l) => l.batch_id === u.batch_id)) {
        beep(false);
        return sc.say(false, "Bu birlik allaqachon sanalgan", u.code);
      }
      add({ item_id: it.item_id, char_id: null, batch_id: u.batch_id, qty: Number(u.qty), data: { name: it.name, code: u.code, size: size(u), unit: it.unit, loc: S.loc?.code, created: !u.existing } });
      beep(true);
      render();
      return sc.say(
        true,
        `${u.code} · ${num(u.qty, 3)} ${un(it.unit)} — stikerni yopishtiring`,
        `${it.name} · ${size(u)} · ${u.existing ? "1C qoldig'idagi birlik topildi" : owner}`,
        { label: "PDF", icon: "printer", onClick: () => void labelsPdf({ batch_ids: [u.batch_id] }) },
      );
    }
    await ensure();
    const line: Line = { item_id: it.item_id, char_id: it.char_id || null, batch_id: null, qty: 1, data: { name: it.name, size: it.char || "", unit: it.unit, firm_id: firmId(owner) } };
    add(line);
    const tot = S.lines.find((l) => invKey(l) === invKey(line))?.qty ?? 1;
    beep(true);
    render();
    sc.say(true, `+1 → ${num(tot, 3)} ${un(it.unit)}`, `${it.name}${it.char ? " · " + it.char : ""} · ${owner}`);
  };

  const sc = useScanner(async (code) => {
    const r = await api<ScanRes>(`/app/api/erp/scan?code=${encodeURIComponent(code)}`);
    if (r.type === "cell") {
      if (r.parent_id && r.parent_id !== S.wh) {
        beep(false);
        return sc.say(false, `${r.code} — boshqa ombor joyi`, whName(r.parent_id));
      }
      S.loc = { id: r.id, code: r.code };
      beep(true);
      render();
      return sc.say(true, `Joy: ${r.code}`, "Keyingi birliklar shu joyga yoziladi");
    }
    if (r.type === "choice") {
      const i = await choose("Bu 1C kodi ikki bazada", r.options.map((o, k) => ({ value: k, label: o.name, sub: `${o.base} bazasi${o.char ? " · " + o.char : ""}` })));
      if (i === null) return;
      return onItem({ ...r.options[i], legacy: r.options[i].base });
    }
    if (r.type === "unit") return onUnit(r);
    if (r.type === "item") return onItem(r);
    beep(false);
    sc.say(false, "Kod topilmadi", code);
  });

  const finish = async () => {
    if (S.full && !(await confirm("To'liq inventarizatsiya: sanalmagan barcha qoldiq hisobdan chiqadi. Davom etaymi?"))) return;
    if (S.items?.length) {
      const c = new Set(S.lines.map((l) => l.item_id));
      const miss = S.items.filter((i) => !c.has(i)).length;
      if (miss && !(await confirm(`${miss} ta tovar umuman topilmadi — ularning qoldig'i hisobdan chiqadi. Davom etaymi?`))) return;
    }
    try {
      clearTimeout(timer.current);
      await ensure();
      await saveNow();
      const p = await post<Posted>(`/app/api/erp/docs/${S.doc!.id}/post`, { version: S.doc!.version });
      const names = Object.fromEntries(S.lines.map((l) => [l.batch_id ? `b${l.batch_id}` : `i${l.item_id}`, l.data.name]));
      const diff = ((p.data.result ?? []) as InvDiff[]).filter((r) => Number(r.diff) !== 0);
      Object.assign(S, fresh(), { wh: S.wh, firm: S.firm, asked: true });
      beep(!diff.length);
      setResult({ number: p.number ?? "", diff: diff.map((r) => ({ ...r, name: names[r.batch_id ? `b${r.batch_id}` : `i${r.item_id}`] ?? `#${r.item_id}`, from: r.moved_from ? whName(r.moved_from) : null })) });
    } catch (e) {
      beep(false);
      sc.say(false, (e as Error).message);
    }
  };

  const counted = new Set(S.lines.map((l) => l.item_id));
  const showMain = !result && (S.lines.length > 0 || S.full || !!S.items?.length);
  return (
    <>
      <CountView
        wide={wide}
        result={result}
        bar={<ScanBar sc={sc} ph="Joy, birlik QR yoki tovar kodi" />}
        wh={whName(S.wh)}
        firm={S.firm ?? ""}
        loc={S.loc?.code ?? null}
        mode={S.full ? "To'liq sanash" : S.items?.length ? `Sikl: ${S.items.length} tovar` : "Qisman sanash"}
        items={S.items}
        plan={S.plan}
        counted={counted}
        lines={S.lines}
        saved={S.doc ? (S.savedAt ? `saqlandi ${S.savedAt}` : "saqlangan") : ""}
        firmName={(id) => me.firms.find((f) => f.id === id)?.code ?? ""}
        onAgain={() => {
          setResult(null);
          void loadPlan();
        }}
        onWh={async () => {
          if (S.lines.length) return toast("Sanash boshlangan — omborni yakunlagach almashtiring", "bad");
          const w = await choose("Ombor", stores.map((x) => ({ value: x.id, label: x.name })));
          if (w) {
            S.wh = w;
            S.loc = null;
            await loadPlan();
          }
        }}
        onFirm={async () => {
          const f = await choose("Yangi birliklar egasi (1C kodi bo'lmasa)", me.firms.map((x) => ({ value: x.code, label: x.name || x.code })));
          if (f) {
            S.firm = f;
            render();
          }
        }}
        onLoc={async () => {
          const c = await pickCell(S.wh);
          if (c === undefined) return;
          S.loc = c ? { id: c.id, code: c.code } : null;
          render();
        }}
        onMode={async () => {
          if (S.items?.length) {
            if (await confirm("Sikl sanoqdan oddiy qisman sanashga o'tilsinmi?")) {
              S.items = null;
              save();
              render();
            }
            return;
          }
          if (!S.full && !(await confirm("To'liq sanash: yakunlanganda shu omborda sanalmagan BARCHA qoldiq hisobdan chiqadi. Faqat butun omborni sanayotgan bo'lsangiz yoqing."))) return;
          S.full = !S.full;
          S.items = null;
          hap.tap();
          save();
          render();
        }}
        onCycle={() => {
          S.items = (S.plan?.due ?? []).slice(0, 10).map((x) => x.item_id);
          S.full = false;
          hap.tap();
          if (S.doc) save();
          render();
          sc.say(null, "Sikl sanoq boshlandi", "Ro'yxatdagi tovarlarning joyiga boring va har birligini skanerlang");
        }}
        onUndo={async () => {
          const h = S.hist.pop();
          if (!h) return toast("Bekor qiladigan skan yo'q", "bad");
          const l = S.lines.find((x) => invKey(x) === h.key);
          if (!l) return render();
          try {
            if (h.inc && l.qty > h.inc) {
              l.qty -= h.inc;
              save();
              render();
            } else await removeLine(l);
            sc.say(null, "Bekor qilindi", l.data.name ?? "");
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
                l.qty = n;
                save();
                render();
              } else await removeLine(l);
            }
          } catch (e) {
            toast((e as Error).message, "bad");
          }
        }}
      />
      {showMain ? <MainButton text={S.lines.length ? `Yakunlash · ${S.lines.length} pozitsiya` : "Yakunlash"} onClick={finish} /> : null}
    </>
  );
}

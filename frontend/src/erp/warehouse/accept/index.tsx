"use client";
// Qabul (inbound): kutilgan kirim (ASN — ta'minotchi, tovarlar) → skaner bilan sanash → farq dalolatnomasi; qabul qilingan
// birliklar Joylashtirish › joylash navbatiga tushadi (u yerda — joy tavsiyasi). Jahon amaliyoti:
//  - ko'rmasdan sanash (blind receiving): kutilgan miqdor yashirin — sanovchi taxmin qilmaydi, farq faqat oxirida;
//  - rejadan tashqari tovar — tasdiq bilan qabul qilinadi va farqda «+» bo'lib ko'rinadi;
//  - rejasiz qabul — kirim yo'q bo'lsa ham: sanalganidan kutilgan kirim yaratiladi va darhol qabul qilinadi;
//  - dock-to-stock — qabuldan joylashgacha vaqt (yaxshi ko'rsatkich ≤ 2 soat).
// Sanash holati modul darajasida (bo'limlar orasida o'tganda yo'qolmaydi).
import { useReducer, useState } from "react";

import { beep, confirm, hap, toast } from "@/erp/kit/env";
import { dnum, num } from "@/erp/kit/fmt";
import { Loaded, MainButton, useLoad } from "@/erp/kit/ui";
import { api, del, post, Queued } from "@/erp/warehouse/api";
import { useWh } from "@/erp/warehouse/context";
import type { AccDiff, DockKpi, Doc, Incoming, Posted, ScanRes, Transit } from "@/erp/warehouse/lib";
import { ItemSearch } from "@/erp/warehouse/place/item-search";
import { Returns } from "@/erp/warehouse/returns";
import { ScanBar, useScanMsg, useScanner } from "@/erp/warehouse/scan-bar";

import { AccCountView, AccDoneView, AccListView, NewIncomingView, TransitView, type AccResult, type Extra, type NewLine } from "./ui";

type It = { item_id: number; char_id?: number | null };
const ACC: { rec: Incoming | null; counted: Map<string, number>; extra: Map<string, Extra>; partial: boolean; to: number | undefined } = {
  rec: null,
  counted: new Map(),
  extra: new Map(),
  partial: false,
  to: undefined,
};
const key = (x: It) => `${x.item_id}:${x.char_id || ""}`;
const BLIND = "wh.acc.blind";
const readBlind = () => {
  try {
    return localStorage.getItem(BLIND) !== "0";
  } catch {
    return true;
  }
};
/** rejasiz qabul — kirim (ASN) hali yo'q: sanalganidan yaratiladi */
const UNPLANNED: Incoming = { id: 0, number: "Rejasiz qabul", supplier: null, firm: "", warehouse_id: 0, expected: null, items: [] };

export function Accept() {
  const { stores } = useWh();
  const [, render] = useReducer((x: number) => x + 1, 0);
  const [done, setDone] = useState<AccResult | null>(null);
  const [creating, setCreating] = useState(false);
  const [transit, setTransit] = useState<Transit | null>(null);
  const [returning, setReturning] = useState(false);
  if (done) return <AccDoneView r={done} onBack={() => setDone(null)} />;
  if (transit) return <TransitRecv t0={transit} onBack={() => setTransit(null)} />;
  if (returning) return <Returns onBack={() => setReturning(false)} />;
  if (creating) return <NewIncoming onBack={() => setCreating(false)} />;
  if (ACC.rec)
    return (
      <Count
        rec={ACC.rec}
        onBack={() => {
          ACC.rec = null;
          render();
        }}
        onDone={(r) => {
          ACC.rec = null;
          setDone(r);
        }}
      />
    );
  const open = (r: Incoming) => {
    Object.assign(ACC, { rec: r, counted: new Map(), extra: new Map(), partial: false, to: ACC.to ?? stores[0]?.id });
    render();
  };
  return <List onOpen={open} onNew={() => setCreating(true)} onUnplanned={() => open(UNPLANNED)} onTransit={setTransit} onReturn={() => setReturning(true)} />;
}

function List({
  onOpen,
  onNew,
  onUnplanned,
  onTransit,
  onReturn,
}: {
  onOpen: (r: Incoming) => void;
  onNew: () => void;
  onUnplanned: () => void;
  onTransit: (t: Transit) => void;
  onReturn: () => void;
}) {
  const { stores } = useWh();
  const store = stores[0]?.id;
  const ids = stores.map((x) => x.id).join(",");
  const st = useLoad(async () => {
    const [rs, kpi, tr] = await Promise.all([
      api<Incoming[]>("/app/api/erp/purchase/incoming"),
      store ? api<DockKpi>(`/app/api/erp/kpi/dock?store_id=${store}`).catch(() => null) : Promise.resolve(null),
      // har bir omborga yo'lda kelayotgan ko'chirishlar
      Promise.all(ids ? ids.split(",").map((id) => api<Transit[]>(`/app/api/erp/transfers/incoming?store_id=${id}`).catch(() => [] as Transit[])) : []).then((xs) => xs.flat()),
    ]);
    return { rs, kpi, tr };
  }, [store, ids]);
  return <Loaded st={st}>{(d) => <AccListView rs={d.rs} kpi={d.kpi} tr={d.tr} onOpen={onOpen} onNew={onNew} onUnplanned={onUnplanned} onTransit={onTransit} onReturn={onReturn} />}</Loaded>;
}

/** Yo'ldagi ko'chirishni qabul qilish: birlik QR → shu birlik qabul; «Hammasi keldi» — qolganlari (donali ham) */
function TransitRecv({ t0, onBack }: { t0: Transit; onBack: () => void }) {
  const { wide } = useWh();
  const [t, setT] = useState(t0);
  const m = useScanMsg();
  const recv = async (body: Record<string, unknown>, msg: string) => {
    const r = await post<Transit>(`/app/api/erp/docs/${t.id}/receive`, body);
    setT(r);
    beep(true);
    hap.ok();
    if (r.done) {
      toast(`${r.number} to'liq qabul qilindi — Joylashtirish navbatida`);
      onBack();
    } else m.say(true, msg);
  };
  const sc = useScanner(async (code) => {
    const s = await api<ScanRes>(`/app/api/erp/scan?code=${encodeURIComponent(code)}`);
    const u = s.type === "unit" ? t.units.find((x) => x.batch_id === s.id) : undefined;
    if (!u) {
      beep(false);
      return m.say(false, "Bu birlik shu ko'chirishda yo'q", code);
    }
    if (u.received) {
      beep(false);
      return m.say(false, "Allaqachon qabul qilingan", u.code ?? code);
    }
    try {
      await recv({ batch_ids: [u.batch_id] }, `${u.name} — keldi`);
    } catch (e) {
      if (e instanceof Queued) setT({ ...t, units: t.units.map((x) => (x.batch_id === u.batch_id ? { ...x, received: true } : x)) });
      m.fail(e);
    }
  }, m);
  const left = t.units.filter((u) => !u.received).length + (t.lots_done ? 0 : t.lots.length);
  return (
    <>
      <TransitView
        wide={wide}
        t={t}
        bar={<ScanBar sc={sc} ph="Kelgan birlik QR'ini skanerlang" />}
        onLots={async () => {
          try {
            await recv({ lots: true }, "Donali tovarlar qabul qilindi");
          } catch (e) {
            m.fail(e);
          }
        }}
        onBack={onBack}
      />
      <MainButton
        text={`Hammasi keldi (${left})`}
        onClick={async () => {
          if (!(await confirm(`${t.number}: qolgan ${left} pozitsiya ham keldi deb qabul qilinsinmi?`))) return;
          try {
            await recv({ all: true }, "Qabul qilindi");
          } catch (e) {
            m.fail(e);
          }
        }}
      />
    </>
  );
}

/** Kutilgan kirim (ASN) yaratish: ta'minotchi, firma, sana, tovarlar */
function NewIncoming({ onBack }: { onBack: () => void }) {
  const { me } = useWh();
  const [supplier, setSupplier] = useState("");
  const [firm, setFirm] = useState(me.firms[0]?.code ?? "");
  const [expected, setExpected] = useState("");
  const [lines, setLines] = useState<NewLine[]>([]);
  const [search, setSearch] = useState<string | null>(null);
  const ok = !!firm && lines.length > 0 && lines.every((l) => Number(dnum(l.qty)) > 0);
  const save = async () => {
    try {
      const r = await post<Incoming>("/app/api/erp/purchase/incoming", {
        supplier,
        firm,
        expected: expected || null,
        items: lines.map((l) => ({ item_id: l.item_id, qty: dnum(l.qty) })),
      });
      toast(`${r.number} yaratildi — yetib kelganda shu ro'yxatdan qabul qilinadi`);
      onBack();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  return (
    <>
      <NewIncomingView
        supplier={supplier}
        firm={firm}
        firms={me.firms.map((f) => [f.code, f.name || f.code])}
        expected={expected}
        lines={lines}
        onSupplier={setSupplier}
        onFirm={setFirm}
        onExpected={setExpected}
        onAdd={() => setSearch("")}
        onQty={(i, v) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, qty: v } : l)))}
        onDel={(i) => setLines((ls) => ls.filter((_, k) => k !== i))}
        onBack={onBack}
      />
      <MainButton text={ok ? "Kirimni saqlash" : lines.length ? "Miqdorlarni kiriting" : "Tovar qo'shing"} disabled={!ok} onClick={save} />
      {search !== null ? (
        <ItemSearch
          q0={search}
          onClose={() => setSearch(null)}
          onPick={async (id) => {
            setSearch(null);
            if (lines.some((l) => l.item_id === id)) return toast("Bu tovar ro'yxatda bor", "bad");
            try {
              const it = await api<{ id: number; name: string; unit: string }>(`/app/api/erp/cat/items/${id}`);
              setLines((ls) => [...ls, { item_id: it.id, name: it.name, unit: it.unit, qty: "" }]);
            } catch (e) {
              toast((e as Error).message, "bad");
            }
          }}
        />
      ) : null}
    </>
  );
}

function Count({ rec: r, onBack, onDone }: { rec: Incoming; onBack: () => void; onDone: (x: AccResult) => void }) {
  const { wide, stores, whName, choose, ask, me } = useWh();
  const [, render] = useReducer((x: number) => x + 1, 0);
  const [blind, setBlind] = useState(readBlind);
  const unplanned = r.id === 0;
  const m = useScanMsg();
  const sc = useScanner(async (code) => {
    const s = await api<ScanRes>(`/app/api/erp/scan?code=${encodeURIComponent(code)}`);
    if (s.type !== "unit" && s.type !== "item") {
      beep(false);
      return m.say(false, "Tovar topilmadi", code);
    }
    const it = r.items.find((x) => x.item_id === s.item_id && (x.char_id || null) === (s.char_id || null));
    const k = key(s);
    if (!it && !ACC.extra.has(k)) {
      // rejada yo'q (yoki rejasiz qabul) — tasdiq bilan qo'shiladi, farqda «+»
      if (!unplanned && !(await confirm(`«${s.name}» bu kirimda yo'q. Rejadan tashqari qabul qilinsinmi?`))) return beep(false);
      ACC.extra.set(k, { item_id: s.item_id, char_id: s.char_id ?? null, name: s.name, unit: s.unit });
    }
    const inc = s.type === "unit" ? Number(s.stock[0]?.qty || 1) : 1;
    ACC.counted.set(k, (ACC.counted.get(k) ?? 0) + inc);
    beep(true);
    hap.ok();
    render();
    const got = num(ACC.counted.get(k), 3);
    m.say(true, s.name, blind || !it ? `keldi ${got}${it ? "" : " · rejadan tashqari"}` : `keldi ${got} / ${num(it.qty, 3)}`);
  }, m);

  const finish = async () => {
    const lines = [...ACC.counted.entries()]
      .filter(([, q]) => q > 0)
      .map(([k, q]) => {
        const [i, c] = k.split(":");
        return { item_id: Number(i), char_id: c ? Number(c) : null, batch_id: null, qty: String(q) };
      });
    if (!lines.length) return toast("Hali hech narsa sanalmadi", "bad");
    if (!ACC.to) return toast("Omborni tanlang", "bad");
    const short = r.items.some((x) => (ACC.counted.get(key(x)) ?? 0) < Number(x.qty));
    if (short && !ACC.partial && !(await confirm("Kamomad bor — farq dalolatnomasi va ta'minotchiga da'vo yoziladi. Davom etaymi?"))) return;
    try {
      let base = r;
      if (unplanned) {
        // rejasiz: sanalganidan kutilgan kirim (farqsiz), keyin uni qabul qilamiz
        const firm = await choose("Tovar egasi (firma)", me.firms.map((f) => ({ value: f.code, label: f.name || f.code })));
        if (!firm) return;
        base = await post<Incoming>("/app/api/erp/purchase/incoming", { supplier: "Rejasiz qabul", firm, items: lines.map((l) => ({ item_id: l.item_id, char_id: l.char_id, qty: l.qty })) });
      }
      const d = await post<Doc>("/app/api/erp/docs", { kind: "acceptance", firm: base.firm, header: { warehouse_id: base.warehouse_id, warehouse_to: ACC.to, base_id: base.id, data: { final: !ACC.partial } }, lines });
      const p = await post<Posted>(`/app/api/erp/docs/${d.id}/post`, { version: d.version });
      const diff = ((p.data.result ?? []) as AccDiff[]).filter((x) => Number(x.diff) !== 0);
      beep(!diff.length);
      onDone({ number: p.number ?? "", diff: diff.map((x) => ({ ...x, name: x.name ?? r.items.find((i) => i.item_id === x.item_id)?.name ?? `#${x.item_id}` })) });
    } catch (e) {
      beep(false);
      m.say(false, (e as Error).message);
    }
  };

  return (
    <>
      <AccCountView
        wide={wide}
        r={r}
        unplanned={unplanned}
        bar={<ScanBar sc={sc} ph="Tovar kodini skanerlang" />}
        to={whName(ACC.to)}
        partial={ACC.partial}
        blind={blind}
        counted={(x) => ACC.counted.get(key(x)) ?? 0}
        extras={[...ACC.extra.values()].map((x) => ({ ...x, got: ACC.counted.get(key(x)) ?? 0 }))}
        onTo={async () => {
          const w = await choose("Qayerga", stores.map((x) => ({ value: x.id, label: x.name })));
          if (w) {
            ACC.to = w;
            render();
          }
        }}
        onPartial={(v) => {
          ACC.partial = v;
          hap.tap();
          render();
        }}
        onBlind={(v) => {
          setBlind(v);
          try {
            localStorage.setItem(BLIND, v ? "1" : "0");
          } catch {
            /* xotira yo'q — faqat shu sahifada */
          }
          hap.tap();
        }}
        onBack={onBack}
        onCancel={
          unplanned
            ? undefined
            : async () => {
                if (!(await confirm(`${r.number} kirimini bekor qilasizmi? (ta'minotchi yubormaydigan bo'lsa)`))) return;
                try {
                  await del(`/app/api/erp/purchase/incoming/${r.id}`);
                  toast(`${r.number} bekor qilindi`);
                  onBack();
                } catch (e) {
                  toast((e as Error).message, "bad");
                }
              }
        }
        onLine={async (x) => {
          const v = await ask("Kelgan miqdor", { label: x.name, value: String(ACC.counted.get(key(x)) ?? 0) });
          if (v === null) return;
          ACC.counted.set(key(x), Number(dnum(v)) || 0);
          render();
        }}
      />
      <MainButton text="Qabulni yakunlash" onClick={finish} />
    </>
  );
}

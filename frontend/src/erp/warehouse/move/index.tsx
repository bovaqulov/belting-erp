"use client";
// Ko'chirish (ichki harakat), uch rejim:
//  - Ombor ichida (joydan joyga): birlik QR'lari → yangi javon (yorlig'ini skanerlang yoki tavsiyadan) → «Ko'chirish»;
//  - Boshqa omborga: tovar avval «Yo'lda» bo'ladi, qabul qiluvchi ombor Qabul bo'limida skanerlab qabul qiladi (Bag);
//  - To'ldirish (replenishment): ombor bo'yicha tovar me'yori (min/max) — kam qolganlar uchun manba ombordan taklif.
import { useRef, useState } from "react";

import { beep, confirm, hap, toast } from "@/erp/kit/env";
import { dnum } from "@/erp/kit/fmt";
import { Loaded, MainButton, Seg, useLoad } from "@/erp/kit/ui";
import { api, del, post, Queued } from "@/erp/warehouse/api";
import { Bag } from "@/erp/warehouse/bag";
import { useWh } from "@/erp/warehouse/context";
import { size, type Level, type PutawayTip, type Replenish, type ScanRes } from "@/erp/warehouse/lib";
import { ItemSearch } from "@/erp/warehouse/place/item-search";
import { ScanBar, useScanMsg, useScanner } from "@/erp/warehouse/scan-bar";

import { InnerView, ReplenishView, type InnerLine } from "./ui";

type Tab = "inner" | "outer" | "repl";
let lastTab: Tab = "inner";

export function Move() {
  const [tab, setTab] = useState<Tab>(lastTab);
  return (
    <>
      <Seg<Tab>
        items={[
          ["inner", "Ombor ichida"],
          ["outer", "Boshqa omborga"],
          ["repl", "To'ldirish"],
        ]}
        cur={tab}
        onPick={(t) => {
          lastTab = t;
          setTab(t);
        }}
      />
      {tab === "inner" ? <Inner /> : tab === "outer" ? <Bag mode="move" /> : <Repl />}
    </>
  );
}

/** Joydan joyga: birliklar → yangi javon */
function Inner() {
  const { wide, stores, whName, choose, pickCell } = useWh();
  const [store, setStore] = useState(stores[0]?.id);
  const [dest, setDest] = useState<{ id: number; code: string } | null>(null);
  const [lines, setLinesS] = useState<InnerLine[]>([]);
  const ref = useRef(lines);
  const setLines = (l: InnerLine[]) => {
    ref.current = l;
    setLinesS(l);
  };
  const m = useScanMsg();
  const sc = useScanner(async (code) => {
    const r = await api<ScanRes>(`/app/api/erp/scan?code=${encodeURIComponent(code)}`);
    if (r.type === "cell") {
      if (r.parent_id !== store) {
        beep(false);
        return m.say(false, "Bu javon boshqa omborda", r.code);
      }
      setDest({ id: r.id, code: r.code });
      beep(true);
      return m.say(true, `Qayerga: ${r.code}`, ref.current.length ? "«Ko'chirish» ni bosing" : "Endi birliklarni skanerlang");
    }
    if (r.type === "unit") {
      const here = r.stock.find((s) => s.warehouse_id === store);
      if (!here) {
        beep(false);
        return m.say(false, "Birlik bu omborda emas", `${r.code} · ${whName(store)}`);
      }
      if (ref.current.some((l) => l.batch_id === r.id)) {
        beep(false);
        return m.say(false, "Allaqachon ro'yxatda", r.code);
      }
      setLines([...ref.current, { batch_id: r.id, item_id: r.item_id, code: r.code, name: r.name, size: size(r), from: r.loc ?? null, width_mm: r.width_mm ?? null }]);
      beep(true);
      return m.say(true, r.name, `${r.code} · hozir ${r.loc ?? "joysiz"}`);
    }
    beep(false);
    m.say(false, r.type === "item" ? "Donali tovar — joy bo'yicha ko'chirish birlik QR'i bilan" : "Kod topilmadi", code);
  }, m);

  const tips = async () => {
    const l = ref.current[0];
    if (!l || !store) return toast("Avval birlikni skanerlang", "bad");
    const here = new Set(ref.current.map((x) => x.from));
    // ko'chirishda birlik hozir turgan joy tavsiya emas
    const ts = (await api<PutawayTip[]>(`/app/api/erp/putaway?store_id=${store}&item_id=${l.item_id}&n=${ref.current.length}${l.width_mm ? `&width_mm=${l.width_mm}` : ""}`)).filter((x) => !here.has(x.code));
    if (!ts.length) return toast("Mos bo'sh joy topilmadi", "bad");
    const id = await choose("Tavsiya etilgan joy", ts.map((x, i) => ({ value: x.id, label: x.code, sub: x.reason, icon: i === 0 ? "sparkles" : "pin", color: i === 0 ? "green" : "gray" })));
    const x = ts.find((y) => y.id === id);
    if (x) setDest({ id: x.id, code: x.code });
  };

  const submit = async () => {
    if (!dest) return toast("Qayerga — javon yorlig'ini skanerlang yoki tanlang", "bad");
    try {
      await post("/app/api/erp/units/loc", { batch_ids: ref.current.map((l) => l.batch_id), loc_id: dest.id });
      beep(true);
      hap.ok();
      m.say(true, `${ref.current.length} birlik → ${dest.code}`);
      setLines([]);
    } catch (e) {
      m.fail(e);
      if (e instanceof Queued) setLines([]);
    }
  };

  return (
    <>
      <InnerView
        wide={wide}
        bar={<ScanBar sc={sc} ph={dest ? "Birlik QR yoki boshqa javon" : "Birlik QR yoki yangi javon yorlig'i"} />}
        store={whName(store)}
        dest={dest?.code ?? null}
        lines={lines}
        onStore={async () => {
          const w = await choose("Ombor", stores.map((x) => ({ value: x.id, label: x.name })));
          if (w && w !== store) {
            setStore(w);
            setDest(null);
            setLines([]);
          }
        }}
        onDest={async () => {
          const c = await pickCell(store);
          if (c) setDest({ id: c.id, code: c.code });
        }}
        onTips={() => void tips()}
        onRemove={(i) => setLines(lines.filter((_, k) => k !== i))}
      />
      {lines.length ? <MainButton text={dest ? `Ko'chirish → ${dest.code}` : "Qayerga — javonni tanlang"} disabled={!dest} onClick={submit} /> : null}
    </>
  );
}

/** To'ldirish: me'yorlar (min/max) va taklif — manba ombordan ko'chirish */
function Repl() {
  const { stores, whName, choose, ask } = useWh();
  const shops = stores.filter((x) => x.kind !== "store");
  const [store, setStore] = useState(shops[0]?.id ?? stores[0]?.id);
  const [search, setSearch] = useState(false);
  const st = useLoad(async () => {
    const [rp, lv] = await Promise.all([api<Replenish>(`/app/api/erp/replenish?store_id=${store}`), api<Level[]>(`/app/api/erp/wh/levels?store_id=${store}`)]);
    return { rp, lv };
  }, [store]);
  const setLevel = async (item_id: number, name: string, cur?: Level) => {
    const mn = await ask(`${name} — eng kam (min)`, { label: "Shundan kam qolsa — to'ldirish taklif qilinadi", value: cur ? String(cur.min_qty) : "", ok: "Keyingi" });
    if (mn === null) return;
    const mx = await ask(`${name} — to'ldirish chegarasi (max)`, { label: "Shu miqdorgacha to'ldiriladi", value: cur ? String(cur.max_qty) : "", ok: "Saqlash" });
    if (mx === null) return;
    try {
      await post("/app/api/erp/wh/levels", { store_id: store, item_id, min_qty: dnum(mn), max_qty: dnum(mx) });
      toast("Me'yor saqlandi");
      await st.reload();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  return (
    <>
      <Loaded st={st}>
        {(d) => (
          <ReplenishView
            store={whName(store)}
            rp={d.rp}
            levels={d.lv}
            onStore={async () => {
              const w = await choose("Qaysi omborni to'ldirish", stores.map((x) => ({ value: x.id, label: x.name })));
              if (w) setStore(w);
            }}
            onAdd={() => setSearch(true)}
            onLevel={async (l) => {
              const a = await choose(l.name, [
                { value: "edit", label: "Me'yorni o'zgartirish", sub: `min ${l.min_qty} · max ${l.max_qty}`, icon: "pencil", color: "gray" },
                { value: "del", label: "Me'yorni o'chirish", icon: "trash", danger: true },
              ]);
              if (a === "edit") await setLevel(l.item_id, l.name, l);
              else if (a === "del" && (await confirm(`${l.name} me'yori o'chirilsinmi?`))) {
                await del(`/app/api/erp/wh/levels/${l.id}`);
                await st.reload();
              }
            }}
          />
        )}
      </Loaded>
      {search ? (
        <ItemSearch
          q0=""
          onClose={() => setSearch(false)}
          onPick={async (id) => {
            setSearch(false);
            const it = await api<{ id: number; name: string }>(`/app/api/erp/cat/items/${id}`);
            await setLevel(it.id, it.name);
          }}
        />
      ) : null}
    </>
  );
}

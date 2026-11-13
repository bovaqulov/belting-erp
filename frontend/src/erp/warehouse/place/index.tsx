"use client";
// Joylashtirish (0 dan: tovar → javon). Javon yorlig'i skanerlanadi (joy saqlanib qoladi) → tovar (shtrixkod yoki
// katalogdan) → miqdor / o'lcham → "Joylash": boshlang'ich qoldiq hujjati darhol o'tkaziladi, birlik(lar) shu javonda,
// stiker — PDF. Qabul qilingan, joysiz birliklar ("joylash navbati") — bosib yoki stikerini skanerlab javonga qo'yiladi.
import { useState } from "react";

import { beep, confirm, hap, toast } from "@/erp/kit/env";
import { dnum } from "@/erp/kit/fmt";
import { MainButton } from "@/erp/kit/ui";
import { api, downloadPdf, post } from "@/erp/warehouse/api";
import { useWh, type Size } from "@/erp/warehouse/context";
import type { CatItem, Dims, PlaceRec, Placed, ScanRes, Unplaced, WhTree } from "@/erp/warehouse/lib";
import { ScanBar, useScanMsg, useScanner } from "@/erp/warehouse/scan-bar";
import { useLoad } from "@/erp/kit/ui";

import { ItemSearch } from "./item-search";
import { PlaceView, type Loc } from "./ui";

const dimsOf = (it: CatItem): Dims => it.attrs?.dims ?? (it.measured ? (it.unit === "m2" ? "wl" : "l") : null);

export function Place() {
  const { wide, me, stores, whName, choose, askSize } = useWh();
  const [store, setStore] = useState<number | undefined>(stores[0]?.id);
  const [loc, setLoc] = useState<Loc | null>(null);
  const [item, setItem] = useState<CatItem | null>(null);
  const [firm, setFirm] = useState(me.firms[0]?.code ?? "");
  const [char, setChar] = useState<number | null>(null);
  const [qty, setQty] = useState("");
  const [units, setUnits] = useState<Size[]>([]);
  const [last, setLast] = useState<Placed | null>(null);
  const [search, setSearch] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const side = useLoad(async () => {
    const [rec, tree, wait] = await Promise.all([
      api<PlaceRec[]>(loc ? `/app/api/erp/place/recent?loc_id=${loc.id}` : "/app/api/erp/place/recent").catch(() => [] as PlaceRec[]),
      store ? api<WhTree>(`/app/api/erp/wh/tree?store_id=${store}`).catch(() => null) : Promise.resolve(null),
      store ? api<Unplaced[]>(`/app/api/erp/wh/unplaced?store_id=${store}`).catch(() => [] as Unplaced[]) : Promise.resolve([] as Unplaced[]),
    ]);
    return { rec, tree, wait };
  }, [loc?.id, store, tick]);

  const d = item ? dimsOf(item) : null;
  const setItemId = async (id: number) => {
    const it = await api<CatItem>(`/app/api/erp/cat/items/${id}`);
    if (it.kind === "service") throw new Error("Xizmat omborga joylanmaydi");
    setItem(it);
    setUnits([]);
    setQty("");
    setChar(it.chars.length === 1 ? it.chars[0].id : null);
    setLast(null);
  };
  const moveTo = async (batch: number, code: string | null, name: string, from: string | null, to: Loc) => {
    if (!(await confirm(`${code ?? name} ${from ? `(${from}) ` : ""}→ ${to.code} ga qo'yilsinmi?`))) return;
    await post("/app/api/erp/units/loc", { batch_ids: [batch], loc_id: to.id });
    beep(true);
    toast(`Joylandi → ${to.code}`);
    refresh();
  };

  const m = useScanMsg();
  const sc = useScanner(async (code) => {
    const r = await api<ScanRes>(`/app/api/erp/scan?code=${encodeURIComponent(code)}`);
    if (r.type === "cell") {
      beep(true);
      setLoc({ id: r.id, code: r.code, parent_id: r.parent_id });
      setLast(null);
      return m.say(true, `Javon ${r.code}`, item ? "Endi miqdorni kiriting" : "Endi tovarni skanerlang");
    }
    if (r.type === "item" || r.type === "choice") {
      let id = r.type === "item" ? r.item_id : null;
      if (r.type === "choice") id = await choose("Bu 1C kodi ikki bazada", r.options.map((x) => ({ value: x.item_id, label: x.name, sub: x.base })));
      if (!id) return;
      await setItemId(id);
      beep(true);
      return m.clear();
    }
    if (r.type === "unit") {
      beep(true);
      if (!loc) return m.say(true, r.name, `${r.code} · hozir ${r.loc ?? "joysiz"} — avval javonni skanerlang, keyin shu birlikni ko'chirish mumkin`);
      if (r.loc_id === loc.id) return m.say(true, r.name, `${r.code} allaqachon ${loc.code} da`);
      return moveTo(r.id, r.code, r.name, r.loc ?? "joysiz", loc);
    }
    if (r.type === "unknown" && code.length >= 2) return setSearch(code);
    beep(false);
    m.say(false, "Kod topilmadi", code);
  }, m);

  const pickLoc = async (): Promise<void> => {
    if (!store) return toast("Ombor yo'q", "bad");
    const t = await api<WhTree>(`/app/api/erp/wh/tree?store_id=${store}`);
    type V = Loc | "store";
    const opts: { value: V; label: string; sub?: string }[] = [];
    for (const b of t.blocks.filter((x) => !t.restricted || x.mine))
      for (const r of b.racks)
        for (const c of r.cells)
          opts.push({ value: { id: c.id, code: c.code, parent_id: t.store.id, block: `Blok ${b.code}${b.name ? " — " + b.name : ""}` }, label: c.code, sub: `${b.name || "Blok " + b.code}${c.units ? ` · ${c.units} birlik` : ""}` });
    if (!t.restricted) for (const c of t.loose) opts.push({ value: { id: c.id, code: c.code, parent_id: t.store.id }, label: c.code, sub: "blokka biriktirilmagan" });
    if (stores.length > 1) opts.unshift({ value: "store", label: `Ombor: ${t.store.name}`, sub: "boshqa omborni tanlash" });
    if (!t.blocks.length && !t.loose.length)
      return toast(t.restricted ? "Bu omborda sizga biriktirilgan blok yo'q — rahbariyat blokka javobgar qilib biriktiradi" : "Bu omborda javon yo'q — Joylar bo'limida yarating", "bad");
    const v = await choose<V>("Joy (javon)", opts);
    if (v === "store") {
      const w = await choose("Ombor", stores.map((x) => ({ value: x.id, label: x.name })));
      if (w) {
        setStore(w);
        setLoc(null);
      }
      return;
    }
    if (v) {
      setLoc(v);
      setLast(null);
    }
  };

  const ready = !!item && !!loc && (d ? units.length > 0 : Number(dnum(qty)) > 0);
  const go = async () => {
    if (!item || !loc) return;
    try {
      const r = await post<Placed>("/app/api/erp/place", {
        loc_id: loc.id,
        item_id: item.id,
        firm,
        char_id: d ? null : char,
        qty: d ? null : dnum(qty),
        units: d ? units.map((u) => (d === "w" ? { w: u.q } : u)) : null,
      });
      beep(true);
      hap.ok();
      setLast(r);
      setItem(null);
      setUnits([]);
      setQty("");
      setChar(null);
      refresh();
    } catch (e) {
      beep(false);
      m.say(false, (e as Error).message);
    }
  };

  const tree = side.data?.tree;
  const mineB = tree?.restricted ? tree.blocks.filter((b) => b.mine) : null;
  return (
    <>
      <PlaceView
        wide={wide}
        bar={<ScanBar sc={sc} ph={loc ? "Tovar shtrixkodi yoki boshqa javon" : "Javon yorlig'ini skanerlang"} />}
        loc={loc}
        locSub={loc ? (loc.block ?? whName(loc.parent_id)) : ""}
        item={item}
        dims={d}
        firm={firm}
        myBlocks={mineB ? mineB.map((b) => b.code + (b.name ? " — " + b.name : "")).join(", ") || "—" : null}
        units={units}
        qty={qty}
        char={char}
        last={last}
        rec={side.data?.rec ?? []}
        wait={side.data?.wait ?? []}
        meId={me.tg_id}
        onLoc={() => void pickLoc()}
        onItem={() => setSearch("")}
        onFirm={async () => {
          const f = await choose("Tovar egasi", me.firms.map((x) => ({ value: x.code, label: x.name || x.code })));
          if (f) setFirm(f);
        }}
        onAddUnit={async () => {
          if (!item || !d) return;
          const r = await askSize(item.name, d, item.unit, { done: "Qo'shish" });
          if (r) setUnits((u) => [...u, r]);
        }}
        onDelUnit={(i) => setUnits((u) => u.filter((_, k) => k !== i))}
        onQty={setQty}
        onChar={setChar}
        onPdf={() => last && void downloadPdf(last.label.url, `${last.loc}.pdf`)}
        onWait={async (w) => {
          if (!loc) return toast("Avval javonni skanerlang yoki tanlang", "bad");
          try {
            await moveTo(w.batch_id, w.code, w.name, null, loc);
          } catch (e) {
            toast((e as Error).message, "bad");
          }
        }}
        onUndo={async (r) => {
          if (!(await confirm("Bu joylashtirish bekor qilinsinmi? (qoldiqdan chiqadi)"))) return;
          try {
            await post(`/app/api/erp/place/${r.id}/undo`);
            toast("Bekor qilindi");
            setLast(null);
            refresh();
          } catch (e) {
            toast((e as Error).message, "bad");
          }
        }}
      />
      {item && loc ? <MainButton text={ready ? `Joylash → ${loc.code}` : "Miqdorni kiriting"} disabled={!ready} onClick={go} /> : null}
      {search !== null ? (
        <ItemSearch
          q0={search}
          onClose={() => setSearch(null)}
          onPick={(id) => {
            setSearch(null);
            setItemId(id).catch((e: Error) => toast(e.message, "bad"));
          }}
        />
      ) : null}
    </>
  );
}

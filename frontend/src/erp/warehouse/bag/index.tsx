"use client";
// Ko'chirish va hisobdan chiqarish — umumiy skan ro'yxati: birlik QR — butun birlik, donali tovar — har skanerda +1.
// Bir firma — bir hujjat (birlik egasi bo'yicha guruhlanadi). Hisobdan chiqarishda sabab majburiy; o'tkazish huquqi
// bo'lmasa — rahbar tasdig'iga qoralama.
import { useRef, useState } from "react";

import { C } from "@/erp/kit/colors";
import { beep } from "@/erp/kit/env";
import { MainButton } from "@/erp/kit/ui";
import { api, post } from "@/erp/warehouse/api";
import { useWh } from "@/erp/warehouse/context";
import { size, type Doc, type ScanRes } from "@/erp/warehouse/lib";
import { ScanBar, useScanner } from "@/erp/warehouse/scan-bar";

import { BagView, type BagLine } from "./ui";

const REASONS = ["Brak", "Kamomad", "Chiqindi (kesish)", "Shikastlangan", "Boshqa"];

export function Bag({ mode }: { mode: "move" | "off" }) {
  const { wide, me, stores, whName, choose, ask, can } = useWh();
  const move = mode === "move";
  const [from, setFrom] = useState(stores[0]?.id);
  const [to, setTo] = useState<number | null>(null);
  const [firm, setFirm] = useState(me.firms[0]?.code ?? "");
  const [lines, setLinesS] = useState<BagLine[]>([]);
  const ref = useRef(lines);
  const setLines = (l: BagLine[]) => {
    ref.current = l;
    setLinesS(l);
  };
  const whs = me.warehouses.filter((x) => x.kind !== "transit");

  const sc = useScanner(async (code) => {
    const r = await api<ScanRes>(`/app/api/erp/scan?code=${encodeURIComponent(code)}`);
    const cur = ref.current;
    if (r.type === "unit") {
      const st = r.stock.filter((s) => s.warehouse_id === from);
      if (!st.length) {
        beep(false);
        return sc.say(false, "Birlik bu omborda emas", `${r.code} · ${whName(from)}`);
      }
      if (cur.some((l) => l.batch_id === r.id)) {
        beep(false);
        return sc.say(false, "Allaqachon ro'yxatda", r.code);
      }
      setLines([...cur, ...st.map((s) => ({ item_id: r.item_id, char_id: r.char_id, batch_id: r.id, qty: Number(s.qty), firm: s.firm, name: r.name, code: r.code, size: size(r), unit: r.unit }))]);
      beep(true);
      return sc.say(true, r.name, r.code);
    }
    if (r.type === "item") {
      if (r.dims) {
        beep(false);
        return sc.say(false, "O'lchamli tovar — birlik QR'ini skanerlang", r.name);
      }
      const l = cur.find((x) => !x.batch_id && x.item_id === r.item_id && (x.char_id || null) === (r.char_id || null) && x.firm === firm);
      setLines(l ? cur.map((x) => (x === l ? { ...x, qty: x.qty + 1 } : x)) : [...cur, { item_id: r.item_id, char_id: r.char_id, batch_id: null, qty: 1, firm, name: r.name, size: r.char ?? "", unit: r.unit }]);
      beep(true);
      return sc.say(true, r.name, `+1`);
    }
    beep(false);
    sc.say(false, "Kod topilmadi", code);
  });

  // bir firma — bir hujjat
  const docsByFirm = async (kind: string, header: Record<string, unknown>, data: Record<string, unknown> = {}) => {
    const groups = new Map<string, BagLine[]>();
    for (const l of ref.current) groups.set(l.firm, [...(groups.get(l.firm) ?? []), l]);
    const out: string[] = [];
    for (const [f, ls] of groups) {
      const d = await post<Doc>("/app/api/erp/docs", {
        kind,
        firm: f,
        header: { ...header, data },
        lines: ls.map((l) => ({ item_id: l.item_id, char_id: l.char_id || null, batch_id: l.batch_id, qty: String(l.qty) })),
      });
      out.push(can(kind, "post") ? `${(await post<Doc>(`/app/api/erp/docs/${d.id}/post`, { version: d.version })).number} o'tkazildi` : `${d.number || "qoralama"} — tasdiqlash kutilmoqda`);
    }
    return out.join(", ");
  };

  const submit = async () => {
    try {
      let r: string | null;
      if (move) {
        if (!to) throw new Error("Qayerga — omborni tanlang");
        r = await docsByFirm("transfer", { warehouse_id: from, warehouse_to: to });
      } else {
        const why = await choose("Sabab", REASONS.map((x) => ({ value: x, label: x })));
        if (!why) return;
        const note = why === "Boshqa" ? await ask("Sabab", { label: "Izoh", ok: "Hisobdan chiqarish" }) : "";
        if (why === "Boshqa" && !note) return;
        r = await docsByFirm("writeoff", { warehouse_id: from }, { reason: note ? `${why}: ${note}` : why });
      }
      beep(true);
      setLines([]);
      sc.say(true, r);
    } catch (e) {
      beep(false);
      sc.say(false, (e as Error).message);
    }
  };

  return (
    <>
      <BagView
        wide={wide}
        move={move}
        bar={<ScanBar sc={sc} ph="Birlik QR yoki tovar kodi" />}
        from={whName(from)}
        to={to ? whName(to) : null}
        firm={firm}
        lines={lines}
        onFrom={async () => {
          const w = await choose("Ombor", whs.map((x) => ({ value: x.id, label: x.name })));
          if (w) {
            setFrom(w);
            setLines([]);
            if (w === to) setTo(null);
          }
        }}
        onTo={async () => {
          const w = await choose("Qayerga", whs.filter((x) => x.id !== from).map((x) => ({ value: x.id, label: x.name })));
          if (w) setTo(w);
        }}
        onFirm={async () => {
          const f = await choose("Donali tovar egasi", me.firms.map((x) => ({ value: x.code, label: x.name || x.code })));
          if (f) setFirm(f);
        }}
        onRemove={(i) => setLines(lines.filter((_, k) => k !== i))}
      />
      {lines.length ? <MainButton text={move ? "Ko'chirish" : "Hisobdan chiqarish"} color={move ? undefined : C.red} onClick={submit} /> : null}
    </>
  );
}

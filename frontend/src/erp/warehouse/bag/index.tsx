"use client";
// Ko'chirish va hisobdan chiqarish — umumiy skan ro'yxati: birlik QR — butun birlik, donali tovar — har skanerda +1.
// Bir firma — bir hujjat (birlik egasi bo'yicha guruhlanadi). Hisobdan chiqarishda sabab majburiy; o'tkazish huquqi
// bo'lmasa — rahbar tasdig'iga qoralama.
import { useRef, useState } from "react";

import { C } from "@/erp/kit/colors";
import { ApiError } from "@/shared/api/client";
import { beep, confirm } from "@/erp/kit/env";
import { MainButton } from "@/erp/kit/ui";
import { api, post } from "@/erp/warehouse/api";
import { useWh } from "@/erp/warehouse/context";
import { size, type Doc, type ScanRes } from "@/erp/warehouse/lib";
import { ScanBar, useScanMsg, useScanner } from "@/erp/warehouse/scan-bar";

import { BagView, type BagLine } from "./ui";

// sabab kodlari — backend OFF_REASONS bilan bir xil
const REASONS: [string, string][] = [
  ["defect", "Brak (ishlab chiqarish nuqsoni)"],
  ["damage", "Shikastlangan"],
  ["shortage", "Kamomad"],
  ["scrap", "Chiqindi (kesish qoldig'i)"],
  ["expired", "Yaroqlilik muddati o'tgan"],
  ["other", "Boshqa"],
];

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

  const m = useScanMsg();
  const sc = useScanner(async (code) => {
    const r = await api<ScanRes>(`/app/api/erp/scan?code=${encodeURIComponent(code)}`);
    const cur = ref.current;
    if (r.type === "unit") {
      const st = r.stock.filter((s) => s.warehouse_id === from);
      if (!st.length) {
        beep(false);
        return m.say(false, "Birlik bu omborda emas", `${r.code} · ${whName(from)}`);
      }
      if (cur.some((l) => l.batch_id === r.id)) {
        beep(false);
        return m.say(false, "Allaqachon ro'yxatda", r.code);
      }
      setLines([...cur, ...st.map((s) => ({ item_id: r.item_id, char_id: r.char_id, batch_id: r.id, qty: Number(s.qty), firm: s.firm, name: r.name, code: r.code, size: size(r), unit: r.unit }))]);
      beep(true);
      return m.say(true, r.name, r.code);
    }
    if (r.type === "item") {
      if (r.dims) {
        beep(false);
        return m.say(false, "O'lchamli tovar — birlik QR'ini skanerlang", r.name);
      }
      const l = cur.find((x) => !x.batch_id && x.item_id === r.item_id && (x.char_id || null) === (r.char_id || null) && x.firm === firm);
      setLines(l ? cur.map((x) => (x === l ? { ...x, qty: x.qty + 1 } : x)) : [...cur, { item_id: r.item_id, char_id: r.char_id, batch_id: null, qty: 1, firm, name: r.name, size: r.char ?? "", unit: r.unit }]);
      beep(true);
      return m.say(true, r.name, `+1`);
    }
    beep(false);
    m.say(false, "Kod topilmadi", code);
  }, m);

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
      if (!can(kind, "post")) {
        out.push(`${d.number || "qoralama"} — tasdiqlash kutilmoqda`);
        continue;
      }
      try {
        out.push(`${(await post<Doc>(`/app/api/erp/docs/${d.id}/post`, { version: d.version })).number} o'tkazildi`);
      } catch (e) {
        // katta summa — rahbar tasdig'i (409): tasdiqlasa approve bilan qayta o'tkazamiz, aks holda qoralama qoladi
        if (!(e instanceof ApiError && e.status === 409) || !(await confirm(`${e.message}. Tasdiqlaysizmi?`))) {
          out.push(`${d.number || "qoralama"} — ${(e as Error).message}`);
          continue;
        }
        out.push(`${(await post<Doc>(`/app/api/erp/docs/${d.id}/post`, { version: d.version, approve: true })).number} o'tkazildi (tasdiqlangan)`);
      }
    }
    return out.join(", ");
  };

  const submit = async () => {
    try {
      let r: string | null;
      if (move) {
        if (!to) throw new Error("Qayerga — omborni tanlang");
        r = `${await docsByFirm("transfer", { warehouse_id: from, warehouse_to: to })} — tovar yo'lda; ${whName(to)} Qabul bo'limida skanerlab qabul qiladi`;
      } else {
        const why = await choose("Sabab", REASONS.map(([v, l]) => ({ value: v, label: l })));
        if (!why) return;
        const note = await ask("Izoh", { label: why === "other" ? "Sababni yozing (majburiy)" : "Qo'shimcha izoh (ixtiyoriy)", ok: "Hisobdan chiqarish" });
        if (note === null || (why === "other" && !note.trim())) return;
        const label = REASONS.find(([v]) => v === why)?.[1] ?? why;
        r = await docsByFirm("writeoff", { warehouse_id: from }, { reason_code: why, reason: note.trim() ? `${label}: ${note.trim()}` : label });
      }
      beep(true);
      setLines([]);
      m.say(true, r);
    } catch (e) {
      beep(false);
      m.say(false, (e as Error).message);
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

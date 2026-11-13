// Ombor sof mantig'i: o'lcham matni, sanash qatori kaliti, kesish ehtiyojlari, joy kodlari, CSV.
import { num, un } from "@/erp/kit/fmt";

import type { Dims, Need, StockRow, UnitKind } from "./types.lib";

export const KINDN: Record<UnitKind, string> = { roll: "Rulon", piece: "Bo'lak", lot: "Partiya", product: "Tayyor mahsulot" };

type Sz = { width_mm?: number | string | null; length_mm?: number | string | null };
/** "600×3250 mm" · "eni 120 mm" · "3250 mm" · "" */
export function size(x: Sz): string {
  if (x.width_mm && x.length_mm) return `${num(x.width_mm, 0)}×${num(x.length_mm, 0)} mm`;
  if (x.width_mm) return `eni ${num(x.width_mm, 0)} mm`;
  if (x.length_mm) return `${num(x.length_mm, 0)} mm`;
  return "";
}

/** Kesish/rejadagi bo'lak: wl — "600×1200", aks holda miqdor */
export const cutText = (dims: Dims, c: { width_mm?: number; length_mm?: number; qty: number }): string =>
  dims === "wl" ? `${num(c.width_mm, 0)}×${num(c.length_mm, 0)}` : num(c.qty, 3);

/** O'lcham so'rovi sarlavhasi */
export const dimsHint = (dims: Dims, unit: string): string =>
  dims === "wl" ? "eni × uzunligi, mm" : dims === "w" ? "eni, mm" : dims === "l" ? `uzunligi, ${un(unit)}` : "dona";

/** Sanash qatori kaliti: birlik — o'zi; donali — tovar + kenglik + firma */
export const invKey = (l: { batch_id?: number | null; item_id: number; char_id?: number | null; data?: { firm_id?: number | null } }): string =>
  l.batch_id ? `b${l.batch_id}` : `i${l.item_id}:${l.char_id || ""}:${l.data?.firm_id || ""}`;

/** "500x1200x2, 800x3000" → [{w,l,n}] (wl); "300x3, 150" → [{q,n}]. wl'da ikki son bo'lmasa — null (xato). */
export function parseNeeds(txt: string, dims: Dims): Need[] | null {
  const out: Need[] = [];
  for (const part of txt.split(/[,;\n]+/)) {
    const n = (part.match(/\d+(?:[.,]\d+)?/g) || []).map((x) => Number(x.replace(",", ".")));
    if (!n.length) continue;
    if (dims === "wl") {
      if (n.length < 2) return null;
      out.push({ w: n[0], l: n[1], n: n[2] || 1 });
    } else out.push({ q: n[0], n: n[1] || 1 });
  }
  return out;
}

/** Joy kodlari: zona A, javon 1..5, qavat 3 → A-01-1 … A-05-3; qavatsiz → A-01 … A-05. Oraliq noto'g'ri — []. */
export function genCells(zone: string, from: number, to: number, floors: number): string[] {
  const z = zone.trim().toUpperCase();
  if (!z || !(from > 0) || !(to >= from) || to - from > 99 || !(floors >= 0) || floors > 20) return [];
  const out: string[] = [];
  for (let r = from; r <= to; r++) {
    const rr = String(r).padStart(2, "0");
    if (!floors) out.push(`${z}-${rr}`);
    else for (let k = 1; k <= floors; k++) out.push(`${z}-${rr}-${k}`);
  }
  return out;
}

/** Qoldiq jadvali → CSV (Excel: ";" ajratuvchi, vergulli kasr, BOM) */
export function stockCsv(rows: StockRow[], cost: boolean): string {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const dec = (v: unknown) => String(v ?? "").replace(".", ",");
  const head = ["Tovar", "Artikul", "Qoldiq", "Birlik", "Rulon", "Bo'lak", "Joylar", "Firma", "Ombor", ...(cost ? ["Tannarx"] : [])];
  const lines = rows.map((r) =>
    [r.name, r.sku, dec(r.qty), un(r.unit), r.rolls, r.pieces, r.locs.join(" "), r.firms.join(" "), r.whs.join(" "), ...(cost ? [dec(r.cost)] : [])].map(q).join(";"),
  );
  return "﻿" + [head.map(q).join(";"), ...lines].join("\n");
}

/** Oxirgi sanash: "12 kun oldin sanalgan" / "hali sanalmagan" */
export const ago = (x: { last: string | null; age: number }): string => (x.last ? `${x.age} kun oldin sanalgan` : "hali sanalmagan");

export const EPS = 1e-9;

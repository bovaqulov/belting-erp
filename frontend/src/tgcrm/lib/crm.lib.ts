// CRM: voronka bosqichlari (holat tokenlari bilan — yangi rang yo'q), kutish vaqti. Sof funksiyalar.
import type { StageId } from "@/tgcrm/api";

import type { Tone } from "./status.lib";

export const STAGES: { id: StageId; label: string; tone: Tone }[] = [
  { id: "new", label: "Yangi", tone: "new" },
  { id: "qualified", label: "Ehtiyoj aniqlandi", tone: "work" },
  { id: "offer", label: "Taklif berildi", tone: "work" },
  { id: "negotiation", label: "Muzokara", tone: "work" },
  { id: "won", label: "Sotildi", tone: "done" },
  { id: "lost", label: "Yo'qotildi", tone: "bad" },
];

export const stageOf = (id: StageId | undefined | null) => STAGES.find((s) => s.id === id) ?? STAGES[0];

/** Mijoz qancha daqiqadan beri javob kutmoqda (since bo'lmasa — 0) */
export function waitMinutes(since: string | null | undefined, now: number): number {
  if (!since) return 0;
  return Math.max(0, Math.floor((now - Date.parse(since)) / 60_000));
}

/** 5 daq · 2 soat · 3 kun */
export function fmtMinutes(m: number): string {
  if (m < 60) return `${m} daq`;
  if (m < 48 * 60) return `${Math.floor(m / 60)} soat`;
  return `${Math.floor(m / 1440)} kun`;
}

/** Mahalliy vaqt bilan "datetime-local" qiymati (input uchun) va ertaga 10:00 standarti */
export function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function tomorrowAt10(now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return localInput(d);
}

/** Pul: 12500000 → "12 500 000" */
export const fmtSum = (v: string | null): string => (v ? Math.round(Number(v)).toLocaleString("ru-RU").replace(/ /g, " ") : "");

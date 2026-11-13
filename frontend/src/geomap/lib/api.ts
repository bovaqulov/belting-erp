// Backend so'rovlari: /app/api/geo/* (Jarvis web, geomap_api.py). Telegram'da initData sarlavhasi, brauzerda cookie.
import { initData } from "./tg";

export const BASE = "/app/api/geo";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const init = initData();
  if (init) headers["x-init-data"] = init;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
    signal: opts.signal,
  });
  if (!r.ok) {
    let msg = `Xato ${r.status}`;
    try {
      const j = await r.json();
      if (j?.detail) msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* matn emas */
    }
    throw new ApiError(r.status, msg);
  }
  return (await r.json()) as T;
}

// Brauzerda kirish — Jarvis /app/api/login (bot orqali tasdiqlash; cookie butun domen uchun)
export async function loginStart(): Promise<{ token: string; link: string }> {
  const r = await fetch("/app/api/login/start", { method: "POST", credentials: "same-origin" });
  if (!r.ok) throw new ApiError(r.status, "Kirishni boshlab bo'lmadi");
  return r.json();
}

export async function loginPoll(token: string): Promise<boolean> {
  const r = await fetch(`/app/api/login/poll?token=${encodeURIComponent(token)}`, { credentials: "same-origin" });
  if (!r.ok) return false;
  const j = await r.json();
  return !!j?.ok;
}

// ---------------- oflayn tashriflar navbati (internet yo'q joyda ham yozib qo'yiladi) ----------------
const QUEUE = "geomap.checkins.queue";

interface QueuedCheckin {
  record_id: string;
  note: string;
  lat?: number;
  lng?: number;
  ts: string;
}

function readQueue(): QueuedCheckin[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE) || "[]");
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedCheckin[]): void {
  try {
    localStorage.setItem(QUEUE, JSON.stringify(q));
  } catch {
    /* saqlash yopiq */
  }
}

export function pendingCheckins(): number {
  return typeof window === "undefined" ? 0 : readQueue().length;
}

/** Tashrif: internet bo'lsa darhol, bo'lmasa navbatga (keyin flushCheckins yuboradi). true — yuborildi. */
export async function addCheckin(c: QueuedCheckin): Promise<boolean> {
  try {
    await api("/checkins", { body: c });
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status < 500) throw e;
    writeQueue([...readQueue(), c]);
    return false;
  }
}

export async function flushCheckins(): Promise<number> {
  const q = readQueue();
  if (!q.length) return 0;
  const left: QueuedCheckin[] = [];
  let sent = 0;
  for (const c of q) {
    try {
      await api("/checkins", { body: c });
      sent++;
    } catch (e) {
      if (!(e instanceof ApiError && e.status < 500)) left.push(c); // 4xx — tashlab yuboriladi (yozuv o'chgan)
    }
  }
  writeQueue(left);
  return sent;
}

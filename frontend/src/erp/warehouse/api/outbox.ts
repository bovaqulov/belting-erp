// Internetsiz navbat (outbox): internet yo'q bo'lganda skaner amallari (birlikni joyga qo'yish / ko'chirish, yo'ldagi
// ko'chirishni qabul qilish, «topilmadi») localStorage'da saqlanadi va ulanganda tartib bilan yuboriladi.
// Har amalning o'z Idempotency-Key'i bor — javob yo'qolib qayta yuborilsa ham server uni bir marta bajaradi.
// Navbat bo'sh bo'lmasa, yangi shunday amal ham navbatga tushadi (tartib buzilmasin). Server rad etgani (4xx) —
// «rad etildi» ro'yxatiga, foydalanuvchi ko'rib o'chiradi.
import { ApiError } from "@/shared/api/client";

export type OutItem = { key: string; path: string; body: unknown; at: number; err?: string };
type State = { pending: OutItem[]; failed: OutItem[] };

const KEY = "wh.outbox.v1";
/** navbatga olinadigan amallar — javobi keyin kerak bo'lmaydiganlar */
const QUEUE = [/\/units\/loc$/, /\/docs\/\d+\/receive$/, /\/picks\/\d+\/short$/];
export const queueable = (path: string): boolean => QUEUE.some((r) => r.test(path.split("?")[0]));
/** amal nomi (navbat ro'yxatida) */
export const outTitle = (path: string): string => {
  const p = path.split("?")[0];
  if (QUEUE[0].test(p)) return "Joyga qo'yish / ko'chirish";
  if (QUEUE[1].test(p)) return "Ko'chirishni qabul qilish";
  if (QUEUE[2].test(p)) return "Yig'ish — topilmadi";
  return p.replace("/app/api/erp", "");
};

/** Amal navbatga qo'yildi — xato emas, ogohlantirish */
export class Queued extends Error {}

export const newKey = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
};

let st: State = { pending: [], failed: [] };
let loaded = false;
const subs = new Set<() => void>();

function load(): State {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    try {
      const x = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as State | null;
      if (x && Array.isArray(x.pending) && Array.isArray(x.failed)) st = x;
    } catch {
      /* xotira yo'q — faqat shu sahifada */
    }
  }
  return st;
}
function set(next: State): void {
  st = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(st));
  } catch {
    /* xotira yo'q */
  }
  subs.forEach((f) => f());
}

export const outbox = {
  get: (): State => load(),
  subscribe(f: () => void): () => void {
    subs.add(f);
    return () => subs.delete(f);
  },
  push(path: string, body: unknown, key: string): number {
    const s = load();
    set({ ...s, pending: [...s.pending, { key, path, body, at: Date.now() }] });
    return st.pending.length;
  },
  dropFailed(key?: string): void {
    const s = load();
    set({ ...s, failed: key ? s.failed.filter((x) => x.key !== key) : [] });
  },
};

const isNet = (e: unknown) => !(e instanceof ApiError);
let running: Promise<number> | null = null;

/** Navbatni tartib bilan yuborish; internet yo'q / server 5xx — to'xtaydi (keyinroq qayta). Yuborilganlar soni. */
export function flush(send: (path: string, body: unknown, key: string) => Promise<unknown>): Promise<number> {
  return (running ??= (async () => {
    let n = 0;
    try {
      for (;;) {
        const s = load();
        const x = s.pending[0];
        if (!x) break;
        try {
          await send(x.path, x.body, x.key);
          n++;
          set({ ...st, pending: st.pending.filter((y) => y.key !== x.key) });
        } catch (e) {
          if (isNet(e) || (e as ApiError).status >= 500) break;
          set({ pending: st.pending.filter((y) => y.key !== x.key), failed: [...st.failed, { ...x, err: (e as Error).message }] });
        }
      }
    } finally {
      running = null;
    }
    return n;
  })());
}

/** Navbat bilan yuborish: internet yo'q yoki navbat bo'sh emas — navbatga (Queued); aks holda — darhol */
export async function sendOrQueue<T>(path: string, body: unknown, send: (path: string, body: unknown, key: string) => Promise<T>): Promise<T> {
  const key = newKey();
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (queueable(path) && (offline || load().pending.length)) {
    const n = outbox.push(path, body, key);
    if (!offline) void flush(send);
    throw new Queued(`Internet yo'q — amal navbatga qo'yildi (${n}). Ulanganda o'zi yuboriladi`);
  }
  try {
    return await send(path, body, key);
  } catch (e) {
    if (queueable(path) && isNet(e)) {
      const n = outbox.push(path, body, key);
      throw new Queued(`Internet yo'q — amal navbatga qo'yildi (${n}). Ulanganda o'zi yuboriladi`);
    }
    throw e;
  }
}

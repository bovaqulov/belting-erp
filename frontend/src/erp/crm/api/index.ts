// CRM API adapteri: komponentlar faqat shuni chaqiradi (api/post/blob) — rejimni bilishmaydi.
// Sahifa ochilganda bir marta tekshiriladi (demo/mode.lib: /erp/me va /crm/meta): ikkalasi bo'lsa — haqiqiy backend (401 → kirish oynasi,
// kit/env), bo'lmasa — brauzer ichidagi demo backend (demo/server.lib), holat localStorage'da (demo/store.lib).
// Backend paydo bo'lgach demo o'zi o'chadi (keyingi ochilishda tekshiruv 200/401/403 qaytaradi).
import { api as realApi } from "@/erp/kit/env";
import { ApiError, apiBlob, authHeaders } from "@/shared/api/client";

import { decideModeAll, DB_VERSION, handle, makeStore, PROBE_PATHS, seed, type CrmMode, type Db, type KV } from "@/erp/crm/demo";

let modeP: Promise<CrmMode> | null = null;

const status = (path: string): Promise<number | "network"> =>
  fetch(path, { credentials: "same-origin", headers: authHeaders() }).then(
    (r) => r.status,
    () => "network" as const,
  );

async function probe(): Promise<CrmMode> {
  return decideModeAll(await Promise.all(PROBE_PATHS.map(status)));
}

/** Rejim — sahifa yuklanishiga bir marta */
export const crmMode = (): Promise<CrmMode> => (modeP ??= probe());

// Telegram (sotuvchilar yozishmalari) backendi CRM'ning qolganidan oldin tayyor — rejimi alohida tekshiriladi:
// tg/chats 200/401/403 → haqiqiy (CRM qolgani demo bo'lsa ham), 404/5xx/tarmoq → demo.
const TG_PREFIX = "/app/api/erp/crm/tg/";
let tgModeP: Promise<CrmMode> | null = null;
const tgMode = (): Promise<CrmMode> => (tgModeP ??= status(`${TG_PREFIX}chats`).then((s) => decideModeAll([s])));
const modeFor = (path: string): Promise<CrmMode> => (path.startsWith(TG_PREFIX) ? tgMode() : crmMode());
/** Telegram real vaqt (WebSocket) — faqat haqiqiy backend bilan (demo'da yo'q) */
export const tgLive = (): Promise<boolean> => tgMode().then((m) => m === "real");

const kv = (): KV | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};
const store = makeStore<Db>(typeof window === "undefined" ? null : kv(), DB_VERSION);
let db: Db | null = null;
const getDb = (): Db => (db ??= store.load(() => seed(Date.now())));

const DELAY = 150; // yuklanish holatlari demo'da ham ko'rinsin
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  if ((await modeFor(path)) === "real") return realApi<T>(path, body);
  await sleep(DELAY);
  const method = body === undefined ? "GET" : "POST";
  // demo: fayl yuklash (FormData) — faqat fayl ma'lumoti (nomi, turi, hajmi) va izoh
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const f = body.get("file");
    body = { file: f instanceof File ? { name: f.name, type: f.type, size: f.size } : null, caption: body.get("caption") ?? "" };
  }
  const res = handle(getDb(), method, path, body === undefined ? undefined : JSON.parse(JSON.stringify(body)), Date.now());
  if (res.status >= 400) {
    const detail = (res.body as { detail?: string }).detail ?? "Xato";
    throw new ApiError(detail, res.status, detail);
  }
  // tg xabarlarini ochish o'qilmaganlarni nolga tushiradi (backend kabi) — saqlanadi
  if (method === "POST" || /\/tg\/chats\/\d+\/messages/.test(path)) store.save(getDb());
  return JSON.parse(JSON.stringify(res.body)) as T;
}

export const post = <T = unknown>(path: string, body: unknown = {}): Promise<T> => api<T>(path, body);

/** Fayl (PDF) — demo'da mavjud emas */
export async function blob(path: string): Promise<Blob> {
  if ((await crmMode()) === "real") return apiBlob(path);
  await sleep(DELAY);
  throw new Error("PDF demo rejimda mavjud emas — haqiqiy backend ulanganda ochiladi");
}

/** Demo ma'lumotlarini boshlang'ich holatga qaytarish */
export function demoReset(): void {
  store.clear();
  db = seed(Date.now());
  store.save(db);
}

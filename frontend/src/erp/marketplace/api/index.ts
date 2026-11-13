// Marketplace API adapteri: komponentlar faqat shuni chaqiradi (api/post) — rejimni bilishmaydi.
// Sahifa ochilganda bir marta tekshiriladi (/erp/me va /erp/mk/overview): ikkalasi bo'lsa — haqiqiy backend (401 → kirish
// oynasi, kit/env), bo'lmasa — brauzer ichidagi demo backend (demo/server.lib), holat localStorage'da (mk.demo.v1).
import { api as realApi } from "@/erp/kit/env";
import { decideModeAll, makeStore, type DemoMode, type KV } from "@/shared/demo";
import { ApiError, authHeaders } from "@/shared/api/client";

import { DB_VERSION, DEMO_KEY, handle, PROBE_PATHS, seed, type Db } from "@/erp/marketplace/demo";

let modeP: Promise<DemoMode> | null = null;

const status = (path: string): Promise<number | "network"> =>
  fetch(path, { credentials: "same-origin", headers: authHeaders() }).then(
    (r) => r.status,
    () => "network" as const,
  );

/** Rejim — sahifa yuklanishiga bir marta */
export const mkMode = (): Promise<DemoMode> => (modeP ??= Promise.all(PROBE_PATHS.map(status)).then(decideModeAll));

const kv = (): KV | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};
const store = makeStore<Db>(typeof window === "undefined" ? null : kv(), DB_VERSION, DEMO_KEY);
let db: Db | null = null;
const getDb = (): Db => (db ??= store.load(() => seed(Date.now())));

const DELAY = 150; // yuklanish holatlari demo'da ham ko'rinsin
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  if ((await mkMode()) === "real") return realApi<T>(path, body);
  await sleep(DELAY);
  const method = body === undefined ? "GET" : "POST";
  const res = handle(getDb(), method, path, body === undefined ? undefined : JSON.parse(JSON.stringify(body)), Date.now());
  if (res.status >= 400) {
    const detail = (res.body as { detail?: string }).detail ?? "Xato";
    throw new ApiError(detail, res.status, detail);
  }
  if (method === "POST") store.save(getDb());
  return JSON.parse(JSON.stringify(res.body)) as T;
}

export const post = <T = unknown>(path: string, body: unknown = {}): Promise<T> => api<T>(path, body);

/** Demo ma'lumotlarini boshlang'ich holatga qaytarish */
export function demoReset(): void {
  store.clear();
  db = seed(Date.now());
  store.save(db);
}

export const P = "/app/api/erp/mk";

// Ombor API adapteri: komponentlar faqat shuni chaqiradi (api/post/del, stikerlar) — rejimni bilishmaydi.
// Sahifa ochilganda bir marta tekshiriladi (/erp/me va /erp/stock/dashboard): ikkalasi bo'lsa — haqiqiy backend (401 →
// kirish oynasi, kit/env), bo'lmasa — brauzer ichidagi demo backend (demo/server.lib), holat localStorage'da (wh.demo.v1).
import { api as realApi, download as realDownload, toast } from "@/erp/kit/env";
import { ApiError, api as baseApi, authHeaders, openBlob } from "@/shared/api/client";
import { decideModeAll, makeStore, type DemoMode, type KV } from "@/shared/demo";

import { DB_VERSION, DEMO_KEY, handle, PROBE_PATHS, seed, type Db } from "@/erp/warehouse/demo";

let modeP: Promise<DemoMode> | null = null;

const status = (path: string): Promise<number | "network"> =>
  fetch(path, { credentials: "same-origin", headers: authHeaders() }).then(
    (r) => r.status,
    () => "network" as const,
  );

/** Rejim — sahifa yuklanishiga bir marta */
export const whMode = (): Promise<DemoMode> => (modeP ??= Promise.all(PROBE_PATHS.map(status)).then(decideModeAll));

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

const DELAY = 120; // yuklanish holatlari demo'da ham ko'rinsin
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function demo<T>(method: string, path: string, body?: unknown): Promise<T> {
  await sleep(DELAY);
  const res = handle(getDb(), method, path, body === undefined ? undefined : JSON.parse(JSON.stringify(body)), Date.now());
  if (res.status >= 400) {
    const detail = (res.body as { detail?: string }).detail ?? "Xato";
    throw new ApiError(detail, res.status, detail);
  }
  if (method !== "GET") store.save(getDb());
  return JSON.parse(JSON.stringify(res.body)) as T;
}

export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  if ((await whMode()) === "real") return realApi<T>(path, body);
  return demo<T>(body === undefined ? "GET" : "POST", path, body);
}

export const post = <T = unknown>(path: string, body: unknown = {}): Promise<T> => api<T>(path, body);

/** DELETE (sanashda yaratilgan, hali hisobga kirmagan birlikni o'chirish) */
export async function del<T = unknown>(path: string): Promise<T> {
  if ((await whMode()) === "real") return baseApi<T>(path, { method: "DELETE" });
  return demo<T>("DELETE", path);
}

export type LabelReq = { batch_ids?: number[]; item_id?: number; char_id?: number | null; cell_ids?: number[] };

/** Stikerlarni printer navbatiga yuborish */
export async function queueLabels(body: LabelReq): Promise<void> {
  try {
    const r = await post<{ queued: unknown[] }>("/app/api/erp/labels/print", body);
    toast(`Chop etish navbatida: ${r.queued.length}`);
  } catch (e) {
    toast((e as Error).message, "bad");
  }
}

const DEMO_PDF = "Demo rejim: PDF backend ulanganda chiqadi";

/** Stiker/yorliq PDF (POST so'rov → fayl) */
export async function labelsPdf(body: LabelReq): Promise<void> {
  try {
    if ((await whMode()) === "demo") return toast(DEMO_PDF, "info");
    const r = await fetch("/app/api/erp/labels/pdf", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { detail?: string }).detail ?? r.statusText);
    openBlob(await r.blob(), "stiker.pdf");
  } catch (e) {
    toast((e as Error).message, "bad");
  }
}

/** Tayyor havoladagi PDF (joylashtirish natijasi) */
export async function downloadPdf(url: string, name: string): Promise<void> {
  if ((await whMode()) === "demo") return toast(DEMO_PDF, "info");
  realDownload(url, name);
}

/** Demo ma'lumotlarini boshlang'ich holatga qaytarish */
export function demoReset(): void {
  store.clear();
  db = seed(Date.now());
  store.save(db);
}

export const A = "/app/api/erp";

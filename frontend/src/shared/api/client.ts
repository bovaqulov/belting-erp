// Backend API (/app/api/*, bir xil domen). Auth: Telegram ichida — X-Init-Data sarlavhasi; brauzerda — sessiya
// cookie (credentials: "same-origin"). Xato javobi {detail: string | object} → ApiError.
import { initData } from "@/shared/telegram/telegram";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail: unknown,
  ) {
    super(message);
  }
}

function messageOf(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail) return detail;
  if (detail && typeof detail === "object" && "message" in detail && typeof detail.message === "string") {
    return detail.message;
  }
  return fallback;
}

/** Telegram ichida X-Init-Data (brauzerda — cookie). Oqimli so'rovlar (chat SSE) ham shu bilan. */
export function authHeaders(): Record<string, string> {
  const id = initData();
  return id ? { "X-Init-Data": id } : {};
}

/** Fayl (PDF/rasm) — api() bilan bir xil auth (Telegram ichida X-Init-Data; brauzerda cookie). */
export async function apiBlob(path: string): Promise<Blob> {
  const r = await fetch(path, { credentials: "same-origin", headers: authHeaders() });
  if (!r.ok) {
    const detail = ((await r.json().catch(() => ({}))) as { detail?: unknown }).detail;
    throw new ApiError(messageOf(detail, r.statusText || `Server javob bermadi (${r.status}) — birozdan so'ng qayta urining`), r.status, detail);
  }
  return r.blob();
}

/** Blob'ni ochish (PDF — yangi oyna); oyna bloklansa (iOS/WebView await'dan keyin) — yuklab olish. URL keyin bo'shatiladi. */
export function openBlob(blob: Blob, name = "fayl.pdf"): void {
  const u = URL.createObjectURL(blob);
  if (!window.open(u, "_blank")) {
    const a = document.createElement("a");
    a.href = u;
    a.download = name;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(u), 60_000);
}

/** body: obyekt → JSON; FormData → multipart (fayl yuklash; Content-Type'ni brauzer boundary bilan qo'yadi) */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const form = typeof FormData !== "undefined" && opts.body instanceof FormData;
  const headers: Record<string, string> = { ...(form ? {} : { "Content-Type": "application/json" }), ...authHeaders(), ...opts.headers };
  const r = await fetch(path, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    credentials: "same-origin",
    headers,
    body: opts.body === undefined ? undefined : form ? (opts.body as FormData) : JSON.stringify(opts.body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const detail = (data as { detail?: unknown }).detail;
    throw new ApiError(messageOf(detail, r.statusText || `Server javob bermadi (${r.status}) — birozdan so'ng qayta urining`), r.status, detail);
  }
  return data as T;
}

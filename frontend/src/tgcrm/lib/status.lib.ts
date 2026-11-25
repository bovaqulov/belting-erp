// Akkaunt holati → ko'rinish (holat rangi st-*), kirish bosqichi, raqam va hajm formatlari. Sof funksiyalar.
import type { Account, Status } from "@/tgcrm/api";

export type Tone = "new" | "work" | "done" | "bad" | "";

const TONE: Record<Status, Tone> = {
  new: "",
  code_sent: "work",
  password: "work",
  qr: "work",
  active: "done",
  offline: "work",
  flood: "work",
  limited: "bad",
  frozen: "bad",
  banned: "bad",
  logged_out: "bad",
  error: "bad",
};

export const tone = (s: Status): Tone => TONE[s] ?? "";

/** Kirish jarayoni davom etmoqda (kod/parol/QR kutilmoqda) */
export const inLogin = (s: Status): boolean => s === "code_sent" || s === "password" || s === "qr";

/** Ulash (yoki qayta ulash) kerak: sessiya yo'q */
export const needsLogin = (s: Status): boolean => s === "new" || s === "logged_out" || s === "error" || inLogin(s);

/** Sessiyasi bor (gateway ushlab turadi) */
export const hasSession = (s: Status): boolean => !needsLogin(s) && s !== "banned";

export const displayName = (a: Pick<Account, "title" | "name" | "phone" | "id">): string => a.title || a.name || a.phone || `Akkaunt #${a.id}`;

/** "+998 90 111 22 33" — O'zbekiston raqami guruhlab, boshqalari o'zgarmasdan */
export function fmtPhone(p: string): string {
  const d = p.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("998")) return `+998 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  return d ? `+${d}` : "";
}

/** Kiritilgan raqamni xalqaro shaklga: 9 raqam (90 111 22 33) → +998…; "+" va bo'shliqlar olib tashlanadi */
export function normPhone(input: string): string {
  const d = input.replace(/\D/g, "");
  if (d.length === 9) return `+998${d}`;
  return d ? `+${d}` : "";
}

export function fmtBytes(n: number | undefined): string {
  if (!n) return "—";
  const gb = n / 1024 ** 3;
  return gb >= 1 ? `${Math.round(gb * 10) / 10} GB` : `${Math.round(n / 1024 ** 2)} MB`;
}

/** Flood kutishi qancha qoldi (soniya), o'tgan bo'lsa 0 */
export function floodLeft(until: string | null, now = Date.now()): number {
  if (!until) return 0;
  return Math.max(0, Math.ceil((Date.parse(until) - now) / 1000));
}

export function fmtWait(sec: number): string {
  if (sec < 90) return `${sec} soniya`;
  if (sec < 7200) return `${Math.round(sec / 60)} daqiqa`;
  return `${Math.round(sec / 3600)} soat`;
}

const EVENT_NAMES: Record<string, string> = {
  created: "Karta yaratildi",
  code_sent: "Kod so'raldi",
  qr: "QR orqali kirish boshlandi",
  signed_in: "Kirdi",
  connected: "Ulandi",
  login_cancel: "Kirish bekor qilindi",
  logout: "Uzildi",
  offline: "Aloqa uzildi",
  flood: "Telegram kutishni so'radi",
  limited: "Spam cheklovi",
  frozen: "Muzlatildi",
  banned: "Bloklandi",
  logged_out: "Sessiya tugadi",
  assign: "Chat biriktirildi",
  member: "Kirish huquqi o'zgardi",
  msg_delete: "Xabar o'chirildi",
  msg_edit: "Xabar tahrirlandi",
  msg_forward: "Xabar uzatildi",
};

export const eventName = (k: string): string => EVENT_NAMES[k] ?? k;

// CRM yozishmalari (Telegram Business bot, WhatsApp va Instagram — rasmiy Meta API) — turlar va sof yordamchilar.
// Kontrakt: docs/api/crm.md «Telegram», «WhatsApp va Instagram».

/** Kanal: Telegram (har sotuvchi o'zini ulaydi), WhatsApp / Instagram (kompaniya raqami/akkaunti, chat sotuvchiga taqsimlanadi) */
export type Ch = "tg" | "wa" | "ig";
export const CHANNELS: { k: Ch; name: string; icon: string; color: string }[] = [
  { k: "tg", name: "Telegram", icon: "send-tg", color: "#2aabee" },
  { k: "wa", name: "WhatsApp", icon: "message-circle", color: "#25d366" },
  { k: "ig", name: "Instagram", icon: "instagram", color: "#e1306c" },
];
export const chOf = (k: Ch | undefined | null) => CHANNELS.find((x) => x.k === (k ?? "tg")) ?? CHANNELS[0];

export type TgChat = {
  id: number;
  title: string;
  username: string | null;
  seller_tg: number;
  seller: string;
  last_at: string | null;
  last_text: string;
  last_out: boolean;
  unread: number;
  /** kanal (eski javoblarda yo'q — Telegram) */
  channel?: Ch;
  /** joriy foydalanuvchi shu chatga javob yoza oladimi (chat egasi + bot huquqi) */
  can_send: boolean;
  /** biriktirilgan CRM mijozi */
  customer?: { id: number; name: string } | null;
};

/** Xabar fayli (backend orqali — url) yoki joylashuv (lat/lon) */
export type TgMedia = {
  url?: string;
  mime?: string;
  name?: string;
  size?: number;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  /** .tgs stiker — brauzer ko'rsata olmaydi */
  animated?: boolean;
  lat?: number;
  lon?: number;
};

export type TgMsg = {
  id: number;
  out: boolean;
  kind: string;
  text: string;
  date: string;
  edited: boolean;
  deleted: boolean;
  via_crm: boolean;
  media?: TgMedia | null;
  deleted_at?: string | null;
  /** tahrirlardan oldingi matnlar (eskisidan yangisiga) */
  history?: { text: string; kind?: string; at: string }[];
  /** javob (reply): iqtibos; out — sotuvchining xabariga; ref — CRM'dagi asl xabar id (bo'lmasa — null) */
  reply?: { text: string; kind: string; out: boolean; ref: number | null } | null;
};

export type TgChats = {
  /** bot nomi (@ siz) — ulash yo'riqnomasi uchun */
  bot: string;
  head: boolean;
  /** joriy foydalanuvchining o'z ulanishi; null — ulanmagan */
  connection: { enabled: boolean; can_reply: boolean } | null;
  /** kanallar holati: ulanganmi (WhatsApp / Instagram — kompaniya kalitlari) va o'qilmaganlar (tab belgisi) */
  channels?: Record<Ch, { enabled: boolean; unread: number }>;
  chats: TgChat[];
};

export type TgThread = { chat: TgChat; messages: TgMsg[]; more: boolean };

export const TG = "/app/api/erp/crm/tg";

/** matnsiz media nomi (backend tg.KINDS bilan bir xil) */
export const KIND_LABEL: Record<string, string> = {
  photo: "Rasm",
  video: "Video",
  voice: "Ovozli xabar",
  video_note: "Video xabar",
  audio: "Audio",
  document: "Fayl",
  sticker: "Stiker",
  animation: "GIF",
  contact: "Kontakt",
  venue: "Manzil",
  location: "Joylashuv",
  poll: "So'rovnoma",
  dice: "O'yin kubigi",
  story: "Story",
  paid_media: "Pullik media",
  game: "O'yin",
  invoice: "Hisob-faktura",
  gift: "Sovg'a",
  other: "Bu turdagi xabar CRM'da ko'rsatilmaydi — ilovaning o'zida oching",
};

/** Fayl hajmi: 1,2 MB / 340 KB */
export function fileSize(b?: number | null): string {
  if (!b) return "";
  return b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Ro'yxatdagi vaqt: bugun — 14:05, kecha — "kecha", shu yil — 12.11, aks holda — 12.11.25 */
export function chatTime(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const d = new Date(iso);
  const n = new Date(now);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(n) - day(d)) / 864e5);
  if (diff <= 0) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diff === 1) return "kecha";
  const dm = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
  return d.getFullYear() === n.getFullYear() ? dm : `${dm}.${String(d.getFullYear()).slice(2)}`;
}

/** Xabar vaqti (pufakcha ichida) */
export const msgTime = (iso: string): string => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Kun ajratgichi: xabarlar orasida sana o'zgarsa — "12 noyabr" */
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
export const dayKey = (iso: string): string => iso.slice(0, 10);
export function dayLabel(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const t = chatTime(iso, now);
  if (t === "kecha") return "Kecha";
  if (/^\d\d:\d\d$/.test(t)) return "Bugun";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === new Date(now).getFullYear() ? "" : ` ${d.getFullYear()}`}`;
}

/** Ro'yxatdagi oxirgi xabar ko'rinishi */
export const lastLine = (c: Pick<TgChat, "last_text" | "last_out">): string => (c.last_out ? `Siz: ${c.last_text}` : c.last_text);

/** Jami o'qilmaganlar — barcha kanallar (channels bo'lmasa — ro'yxatdagi o'z chatlari; tekshiruv zaxira uchun) */
export const unreadTotal = (r: TgChats | null | undefined, me: number): number =>
  r?.channels
    ? Object.values(r.channels).reduce((a, x) => a + (x.unread || 0), 0)
    : (r?.chats ?? []).filter((c) => c.seller_tg === me).reduce((a, c) => a + c.unread, 0);

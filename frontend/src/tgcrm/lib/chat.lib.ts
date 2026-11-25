// Chat ko'rinishi uchun sof yordamchilar: avatar rangi, bosh harflar, media yozuvi, xabarlarni guruhlash, xizmat matni.
import type { Chat, FileKind, Media, Msg, MsgPeer } from "@/tgcrm/api";

export const AV_COLORS = ["#e17076", "#7bc862", "#65aadd", "#a695e7", "#ee7aae", "#6ec9cb", "#faa774", "#5288c1"] as const;
export const avColor = (id: number): string => AV_COLORS[Math.abs(id) % AV_COLORS.length];

export function initials(name: string): string {
  const w = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  // Array.from — kod nuqtalari bo'yicha (𝐅 kabi "chiroyli" harflar ikki UTF-16 birligi — yarmini olmaslik uchun)
  return (
    w
      .slice(0, 2)
      .map((x) => (Array.from(x)[0] ?? "").toUpperCase())
      .join("") || "?"
  );
}

export const chatName = (c: Pick<Chat, "title" | "username" | "phone" | "is_self" | "deleted" | "peer_id">): string =>
  c.is_self ? "Saqlangan xabarlar" : c.title || (c.username ? `@${c.username}` : "") || c.phone || (c.deleted ? "O'chirilgan akkaunt" : `#${c.peer_id}`);

export const isGroup = (k: Chat["kind"]): boolean => k === "group" || k === "supergroup";

export function fmtSize(n: unknown): string {
  if (typeof n !== "number" || !n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function fmtDuration(s: unknown): string {
  if (typeof s !== "number") return "";
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

const MEDIA: Record<string, [string, string]> = {
  photo: ["Rasm", "file"],
  video: ["Video", "play"],
  round: ["Video xabar", "play"],
  voice: ["Ovozli xabar", "mic"],
  audio: ["Audio", "mic"],
  gif: ["GIF", "play"],
  sticker: ["Stiker", "sparkles"],
  file: ["Fayl", "file-text"],
  geo: ["Joylashuv", "map"],
  venue: ["Manzil", "map"],
  contact: ["Kontakt", "user"],
  poll: ["So'rovnoma", "chart"],
  dice: ["O'yin kubigi", "sparkles"],
  game: ["O'yin", "sparkles"],
  invoice: ["Hisob", "receipt"],
  story: ["Story", "circle-dot"],
  paid: ["Pullik media", "coins"],
  giveaway: ["Konkurs", "sparkles"],
  unsupported: ["Bu xabar turi hali ko'rsatilmaydi", "info"],
};

/** Media → [sarlavha, izoh, ikonka] (fayl o'zi 4-bosqichda) */
export function mediaLabel(m: Media): {
  title: string;
  sub: string;
  icon: string;
} {
  const [title, icon] = MEDIA[m.kind] ?? ["Xabar", "info"];
  const parts: string[] = [];
  if (m.kind === "file" && typeof m.name === "string" && m.name) return { title: m.name, sub: fmtSize(m.size), icon };
  if (m.kind === "audio" && (m.title || m.performer))
    return {
      title: [m.performer, m.title].filter(Boolean).join(" — "),
      sub: fmtDuration(m.duration),
      icon,
    };
  if (m.kind === "sticker" && m.emoji) return { title: `${m.emoji} Stiker`, sub: "", icon };
  if (m.kind === "contact")
    return {
      title: String(m.name || "Kontakt"),
      sub: String(m.phone || ""),
      icon,
    };
  if (m.kind === "venue")
    return {
      title: String(m.title || "Manzil"),
      sub: String(m.address || ""),
      icon,
    };
  if (m.kind === "poll")
    return {
      title: String(m.question || "So'rovnoma"),
      sub: `${(m.answers as unknown[] | undefined)?.length ?? 0} variant`,
      icon,
    };
  if (m.kind === "dice")
    return {
      title: `${m.emoji ?? "🎲"} ${m.value ?? ""}`.trim(),
      sub: "",
      icon,
    };
  if (m.duration !== undefined) parts.push(fmtDuration(m.duration));
  if (m.size) parts.push(fmtSize(m.size));
  return { title, sub: parts.join(" · "), icon };
}

/** Rasm/video joy egallovchisi o'lchami (Telegram kabi — eni ≤ maxW, bo'yi ≤ maxH, nisbat saqlanadi) */
export function boxSize(m: Media, maxW = 320, maxH = 360): { w: number; h: number } {
  const w = typeof m.w === "number" && m.w > 0 ? m.w : 4;
  const h = typeof m.h === "number" && m.h > 0 ? m.h : 3;
  const k = Math.min(maxW / w, maxH / h, 1.5);
  return {
    w: Math.max(120, Math.round(w * k)),
    h: Math.max(80, Math.round(h * k)),
  };
}

const ACTION: Record<string, string> = {
  ChatCreate: "guruh yaratildi",
  ChannelCreate: "kanal yaratildi",
  ChatEditTitle: "guruh nomi o'zgardi",
  ChatEditPhoto: "guruh rasmi o'zgardi",
  ChatDeletePhoto: "guruh rasmi o'chirildi",
  ChatAddUser: "a'zo qo'shildi",
  ChatDeleteUser: "a'zo chiqdi",
  ChatJoinedByLink: "havola orqali qo'shildi",
  ChatJoinedByRequest: "so'rov orqali qo'shildi",
  PinMessage: "xabar qadaldi",
  HistoryClear: "tarix tozalandi",
  ContactSignUp: "Telegram'ga qo'shildi",
  ScreenshotTaken: "skrinshot oldi",
  ChatMigrateTo: "superguruhga aylandi",
  ChannelMigrateFrom: "guruhdan ko'chirildi",
  GroupCall: "ovozli chat",
  SetMessagesTTL: "xabarlarni avtomatik o'chirish o'zgardi",
};

/** Xizmat xabari matni: "Ali: guruh nomi o'zgardi «Yangi»" */
export function actionText(a: NonNullable<Msg["action"]>, who: string): string {
  if (a.type === "PhoneCall") {
    const d = typeof a.duration === "number" && a.duration > 0 ? ` (${fmtDuration(a.duration)})` : "";
    const missed = a.reason === "Missed" ? "O'tkazib yuborilgan qo'ng'iroq" : a.reason === "Busy" ? "Band — qo'ng'iroq" : "Qo'ng'iroq";
    return `${a.video ? "Video " : ""}${missed}${d}`;
  }
  const base = ACTION[a.type] ?? a.type;
  const extra = a.type === "ChatEditTitle" || a.type === "ChatCreate" || a.type === "ChannelCreate" ? (a.title ? ` «${a.title}»` : "") : "";
  return `${who ? `${who}: ` : ""}${base}${extra}`;
}

export type Row =
  { k: "day"; key: string; date: string } | { k: "msg"; key: string; m: Msg; first: boolean; last: boolean } | { k: "service"; key: string; m: Msg };

const GAP = 5 * 60_000;

/** Ketma-ket bir yuboruvchidan (5 daqiqa ichida) — bitta guruh: ism faqat birinchisida, "dum" oxirgisida. */
export function layoutRows(msgs: Msg[], sameDay: (a: string, b: string) => boolean): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const prev = msgs[i - 1];
    const next = msgs[i + 1];
    if (!prev || !sameDay(prev.date, m.date))
      out.push({
        k: "day",
        key: `d${m.date.slice(0, 10)}-${m.id}`,
        date: m.date,
      });
    if (m.action) {
      out.push({ k: "service", key: `s${m.id}`, m });
      continue;
    }
    const joins = (a?: Msg, b?: Msg) =>
      !!a &&
      !!b &&
      !a.action &&
      !b.action &&
      a.out === b.out &&
      a.sender_id === b.sender_id &&
      sameDay(a.date, b.date) &&
      Math.abs(Date.parse(b.date) - Date.parse(a.date)) < GAP;
    out.push({
      k: "msg",
      key: `m${m.id}`,
      m,
      first: !joins(prev, m),
      last: !joins(m, next),
    });
  }
  return out;
}

export const senderName = (id: number | null, peers: Record<string, MsgPeer>): string =>
  id ? peers[String(id)]?.title || peers[String(id)]?.username || "" : "";

const PHOTO_MAX = 10 * 1024 * 1024;

/** Fayl → standart yuborish usuli: JPEG/PNG/WebP (≤10 MB) — rasm (Telegram siqadi), MP4/MOV — video, audio — audio, qolgani — fayl */
export function defaultKind(f: { type: string; size: number }): FileKind {
  if (/^image\/(jpeg|png|webp)$/.test(f.type) && f.size <= PHOTO_MAX) return "photo";
  if (f.type === "video/mp4" || f.type === "video/quicktime") return "video";
  if (f.type.startsWith("audio/")) return "audio";
  return "file";
}

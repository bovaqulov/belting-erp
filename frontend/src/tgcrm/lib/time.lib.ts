// Vaqt yozuvlari (Telegram uslubida, o'zbekcha). now — test uchun. Mahalliy vaqt zonasi.
import type { Chat } from "@/tgcrm/api";

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const DAYS = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];
const p2 = (n: number) => String(n).padStart(2, "0");

const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysAgo = (d: Date, now: Date) => Math.round((day0(now) - day0(d)) / 86_400_000);

export const clock = (iso: string): string => {
  const d = new Date(iso);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

/** Chat ro'yxati: bugun — 14:05; hafta ichida — Du; shu yil — 12.11; aks holda — 12.11.25 */
export function listTime(iso: string | null, now = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  const ago = daysAgo(d, now);
  if (ago <= 0) return clock(iso);
  if (ago < 7) return DAYS[d.getDay()];
  if (d.getFullYear() === now.getFullYear()) return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}`;
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
}

/** Kun ajratgichi: Bugun, Kecha, 12-noyabr, 12-noyabr 2025 */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const ago = daysAgo(d, now);
  if (ago === 0) return "Bugun";
  if (ago === 1) return "Kecha";
  const s = `${d.getDate()}-${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? s : `${s} ${d.getFullYear()}`;
}

export const sameDay = (a: string, b: string): boolean => day0(new Date(a)) === day0(new Date(b));

const plural = (n: number, w: string) => `${n.toLocaleString("ru-RU").replace(/ /g, " ")} ${w}`;

/** Sarlavha ostidagi holat: onlayn / ko'rindi / a'zolar / bot */
export function statusLine(c: Pick<Chat, "kind" | "online" | "last_seen" | "members" | "is_self" | "deleted">, now = new Date()): string {
  if (c.is_self) return "";
  if (c.kind === "bot") return "bot";
  if (c.kind === "channel") return c.members ? plural(c.members, "obunachi") : "kanal";
  if (c.kind === "group" || c.kind === "supergroup") return c.members ? plural(c.members, "a'zo") : "guruh";
  if (c.deleted) return "";
  if (c.online) return "onlayn";
  if (!c.last_seen) return "yaqinda ko'rindi";
  const d = new Date(c.last_seen);
  const ago = daysAgo(d, now);
  if (ago === 0) return `bugun ${clock(c.last_seen)} da ko'rindi`;
  if (ago === 1) return `kecha ${clock(c.last_seen)} da ko'rindi`;
  return `${dayLabel(c.last_seen, now)} da ko'rindi`;
}

export const TYPING_TEXT: Record<string, string> = {
  typing: "yozmoqda",
  voice: "ovozli xabar yozmoqda",
  video: "video yubormoqda",
  round: "video xabar yozmoqda",
  photo: "rasm yubormoqda",
  file: "fayl yubormoqda",
  sticker: "stiker tanlamoqda",
};

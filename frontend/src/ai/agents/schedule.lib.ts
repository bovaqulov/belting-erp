// Jadval: matnli tavsif, keyingi ishga tushish vaqti (Toshkent, UTC+5), tekshiruv. Sof funksiyalar.
import type { Repeat, Schedule } from "./model";

export const DAY_SHORT = ["Du", "Se", "Cho", "Pa", "Ju", "Sha", "Ya"];
export const REPEAT_NAMES: Record<Repeat, string> = {
  daily: "Har kuni",
  weekly: "Har hafta",
  monthly: "Har oy",
  once: "Bir marta",
};

export function blankSchedule(id: string): Schedule {
  return { id, title: "", instruction: "", repeat: "daily", time: "09:00", days: [1, 2, 3, 4, 5], day: 1, date: "", deliver: "owner", enabled: true };
}

/** "Har kuni 09:00", "Du, Cho, Ju 18:30", "Har oy 5-kuni 10:00", "14.11.2026 09:00" */
export function describe(s: Pick<Schedule, "repeat" | "time" | "days" | "day" | "date">): string {
  switch (s.repeat) {
    case "daily":
      return `Har kuni ${s.time}`;
    case "weekly": {
      const ds = [...s.days].sort((a, b) => a - b);
      if (ds.length === 7) return `Har kuni ${s.time}`;
      if (ds.join() === "1,2,3,4,5") return `Ish kunlari ${s.time}`;
      return `${ds.map((d) => DAY_SHORT[d - 1]).join(", ")} ${s.time}`;
    }
    case "monthly":
      return `Har oy ${s.day}-kuni ${s.time}`;
    case "once": {
      const [y, m, d] = s.date.split("-");
      return s.date ? `${d}.${m}.${y} ${s.time}` : `Sana tanlanmagan`;
    }
  }
}

const TZ = 5 * 60; // Toshkent, daqiqa

/** keyingi ishga tushish (UTC Date) yoki null (o'tib ketgan bir martalik / o'chiq) */
export function nextRun(s: Schedule, now: Date): Date | null {
  if (!s.enabled) return null;
  const [hh, mm] = s.time.split(":").map(Number);
  // "mahalliy" vaqtni UTC kabi hisoblaymiz, oxirida zonani ayiramiz
  const local = new Date(now.getTime() + TZ * 60_000);
  const at = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo, d, hh, mm) - TZ * 60_000);
  if (s.repeat === "once") {
    if (!s.date) return null;
    const [y, m, d] = s.date.split("-").map(Number);
    const t = at(y, m - 1, d);
    return t > now ? t : null;
  }
  for (let i = 0; i < 62; i++) {
    const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + i));
    const wd = ((day.getUTCDay() + 6) % 7) + 1; // 1=Du
    const ok =
      s.repeat === "daily" ||
      (s.repeat === "weekly" && s.days.includes(wd)) ||
      (s.repeat === "monthly" && day.getUTCDate() === s.day);
    if (!ok) continue;
    const t = at(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
    if (t > now) return t;
  }
  return null;
}

/** "bugun 09:00", "ertaga 18:30", "14.11 09:00" (Toshkent) */
export function whenText(t: Date, now: Date): string {
  const loc = (d: Date) => new Date(d.getTime() + TZ * 60_000);
  const a = loc(t);
  const b = loc(now);
  const hm = `${String(a.getUTCHours()).padStart(2, "0")}:${String(a.getUTCMinutes()).padStart(2, "0")}`;
  const dayDiff = Math.round(
    (Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()) - Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())) / 86_400_000,
  );
  if (dayDiff === 0) return `bugun ${hm}`;
  if (dayDiff === 1) return `ertaga ${hm}`;
  return `${String(a.getUTCDate()).padStart(2, "0")}.${String(a.getUTCMonth() + 1).padStart(2, "0")} ${hm}`;
}

export function validateSchedule(s: Schedule): string[] {
  const out: string[] = [];
  if (!s.title.trim()) out.push("Nomini yozing (masalan: Ertalabki savdo hisoboti).");
  if (s.instruction.trim().length < 10) out.push("Ko'rsatma juda qisqa — agent nima qilishi kerakligini yozing.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) out.push("Vaqt HH:MM ko'rinishida bo'lsin.");
  if (s.repeat === "weekly" && !s.days.length) out.push("Kamida bitta kun tanlang.");
  if (s.repeat === "monthly" && (s.day < 1 || s.day > 28)) out.push("Oy kuni 1–28 oralig'ida bo'lsin.");
  if (s.repeat === "once" && !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) out.push("Sanani tanlang.");
  return out;
}
